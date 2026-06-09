/**
 * Weekly Classroom Digest Agent (PEP-297).
 *
 * Two-CF architecture:
 *
 * CF 1 — weeklyDigest (Sunday 6:00 PM IST):
 *   For each active classroom, runs a tool-calling agent loop that
 *   receives classroom doc + statsCache as mandatory context, can
 *   tool-call for deeper student data, produces an HTML digest,
 *   stores it in Firestore, then sends emails.
 *
 * CF 2 — weeklyDigestSuperadmin (triggered after CF 1):
 *   Reads all stored classroom digests, runs an agent that can
 *   tool-call for deeper investigation, produces one consolidated
 *   email sent to each active superadmin.
 */

import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import { db, Timestamp } from "../shared/firebase.js";
import {
  OPENROUTER_API_KEY,
} from "../shared/openrouter.js";
import { SENDGRID_API_KEY, sendEmail } from "../shared/sendgrid.js";

const LANGFUSE_SECRET_KEY = defineSecret("LANGFUSE_SECRET_KEY");
const LANGFUSE_PUBLIC_KEY = defineSecret("LANGFUSE_PUBLIC_KEY");
import { runWithConcurrency } from "../shared/scheduling.js";
import { runAgentLoop } from "../shared/agentLoop.js";
import { DIGEST_TOOLS, ToolGatekeeper, createToolExecutor } from "./tools.js";
import { Langfuse } from "langfuse";

// ── Default system prompts ──────────────────────────────────────────

const DEFAULT_CLASSROOM_PROMPT = `You are a Montessori school assistant generating a weekly classroom digest email for a classroom administrator.

You receive structured data about ONE classroom: teacher activity stats, student note counts for the past 7 days, and contextual notes from the school administration providing important background (e.g., teacher roles, school calendar events, known situations). You also have tools to investigate individual students more deeply.

Your job:
1. Review the stats provided and any contextual notes. Identify anomalies — students with sudden drops in notes, teachers with zero activity, students with very low coverage.
2. Use your tools to investigate. Start with fetch_weekly_snapshot for students who look concerning. If a snapshot shows escalation or red flags, dig deeper with fetch_snapshot_history, fetch_soul, or fetch_observations.
3. Once you have enough context, produce a concise, actionable HTML email body.

Output rules:
- **Title:** Use the format "<full month name> Week <number> Digest — <Classroom Name>" as the email heading (e.g., "Month June Week 2 Digest — Periwinkle").
- **No greetings or sign-offs.** Do not start with "Dear Team" or end with "Best regards." Get right into the content.
- **Red-flagged students must be prominently called out.** Use bold text and warning colors. These are urgent.
- **Escalated students** (medium/high severity) should be highlighted with context on why.
- **Inactive teachers** (zero notes this week) must be named explicitly.
- **Anomalies over time** — if a student went from lots of notes to none, say so. If a teacher's output dropped, flag it.
- **Never say "and several others" or "among others."** Always list every student or teacher by name. Be exhaustive and specific.
- **Tone:** Professional but warm. You are a co-pilot for the manager.
- **Format:** Output valid HTML (no <html>/<head>/<body> tags — just inner content). Use inline styles. Centre-aligned, blog-post style layout with max-width 600px. Mobile-friendly.
- **Do not invent information.** Only reference data you received or fetched via tools.
- **Respect contextual notes.** If the notes say a teacher is administrative (not teaching), do not flag them for inactivity. If a school break is mentioned, adjust your analysis accordingly.
- **Keep it brief.** Lead with what needs attention. A quiet week gets a short "all clear."`;

const DEFAULT_SUPERADMIN_PROMPT = `You are a Montessori school assistant generating a consolidated weekly digest email for a superadmin who oversees ALL classrooms across the school.

You receive the individual classroom digest summaries that were already generated for each classroom, plus contextual notes from the school administration providing important background. You also have tools to investigate specific students if needed.

Your job:
1. Synthesize the classroom digests into ONE consolidated email.
2. Highlight the most critical items across all classrooms — red flags, escalations, inactive teachers.
3. Identify cross-classroom patterns if any (e.g., multiple classrooms with inactive teachers, school-wide observation drop).
4. Use tools only if you need to verify something or dig deeper into a specific case.

Output rules:
- **Title:** Use the format "Executive Digest for <full month name> Week <number>" as the email heading (e.g., "Weekly Executive Digest — Month June Week 2").
- **No greetings or sign-offs.** Do not start with "Dear Team" or end with "Best regards." Get right into the content.
- **Lead with the most urgent items** — red flags first, then escalations, then general notes.
- **Group by classroom** but don't just repeat each digest. Summarize and prioritize.
- **Cross-classroom insights** are your unique value — no individual digest has this view.
- **Never say "and several others" or "among others."** Always list every teacher and student by name. Be exhaustive and specific.
- **Tone:** Executive summary for leadership. Concise, direct, actionable.
- **Format:** Valid HTML, inline styles, centre-aligned blog-post style layout with max-width 700px. Mobile-friendly. No <html>/<head>/<body> tags.
- **Respect contextual notes.** If the notes say a teacher is administrative, do not flag them for inactivity. If a school break is mentioned, adjust analysis accordingly.
- **Keep it tight.** This covers ~20 classrooms — be ruthlessly concise.`;

// ── Pure logic (exported for testing) ───────────────────────────────

export function resolveClassroomAdminRecipients(users) {
  return users.filter(
    (u) =>
      u.role === "classroomadmin" &&
      (u.status || "active") === "active" &&
      !u.isPending &&
      Array.isArray(u.manageableClassrooms) &&
      u.manageableClassrooms.length > 0 &&
      u.email
  );
}

export function resolveSuperAdminRecipients(users) {
  return users.filter(
    (u) =>
      u.role === "superadmin" &&
      (u.status || "active") === "active" &&
      !u.isPending &&
      u.email
  );
}

export function resolveSuperAdminOverrides(config, superAdmins) {
  const overrides = config?.superadminClassroomOverrides || {};
  const result = new Map();
  for (const sa of superAdmins) {
    const classrooms = overrides[sa.id];
    if (Array.isArray(classrooms) && classrooms.length > 0) {
      result.set(sa.email, classrooms);
    }
  }
  return result;
}

export function buildFirstUserMessage(classroomDoc, statsCacheDoc, contextualNotes) {
  const classroom = {
    id: classroomDoc.id,
    name: classroomDoc.name || classroomDoc.id,
    program: classroomDoc.program || "unknown",
    teacherIds: classroomDoc.teacherIds || [],
  };

  const teachers = (statsCacheDoc?.teachers || []).map((t) => ({
    name: t.name,
    observations7d: t.observations7d || 0,
    lessons7d: t.lessons7d || 0,
    total7d: (t.observations7d || 0) + (t.lessons7d || 0),
    observations: t.observations || 0,
    lessons: t.lessons || 0,
  }));

  const students = (statsCacheDoc?.students || []).map((s) => ({
    id: s.id,
    name: s.name,
    thisWeekNotes: s.thisWeekNotes || 0,
    last42DaysNotes: s.last42DaysNotes || 0,
    totalNotes: s.totalNotes || 0,
  }));

  const notesSection = contextualNotes
    ? ["## School Contextual Notes", contextualNotes, ""]
    : [];

  return [
    `# Classroom: ${classroom.name}`,
    `Program: ${classroom.program}`,
    `Teachers: ${classroom.teacherIds.length}`,
    `Students: ${students.length}`,
    "",
    ...notesSection,
    "## Teacher Activity (last 7 days)",
    ...teachers.map(
      (t) =>
        `- ${t.name}: ${t.total7d} notes (${t.observations7d} obs, ${t.lessons7d} lessons) | all-time: ${t.observations + t.lessons}`
    ),
    "",
    "## Student Note Counts",
    ...students.map(
      (s) =>
        `- ${s.name} [${s.id}]: this week ${s.thisWeekNotes}, last 42d ${s.last42DaysNotes}, total ${s.totalNotes}`
    ),
    "",
    "Generate a weekly digest email for this classroom. Use the tools available to investigate any anomalies, trends, or students who need attention. Start by checking weekly snapshots for students with low or declining activity.",
  ].join("\n");
}

// ── Firestore helpers ───────────────────────────────────────────────

function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

async function fetchDigestConfig() {
  const snap = await db.collection("config").doc("weekly_digest").get();
  if (!snap.exists) {
    return {
      model: "openai/gpt-4.1-mini",
      temperature: 0.4,
      maxTokens: 4000,
      classroomPrompt: DEFAULT_CLASSROOM_PROMPT,
      superadminPrompt: DEFAULT_SUPERADMIN_PROMPT,
      superadminClassroomOverrides: {},
      contextualNotes: "",
    };
  }
  const d = snap.data();
  return {
    model: d.model || "openai/gpt-4.1-mini",
    temperature: d.temperature ?? 0.4,
    maxTokens: d.max_tokens || 4000,
    classroomPrompt: d.classroomPrompt || DEFAULT_CLASSROOM_PROMPT,
    superadminPrompt: d.superadminPrompt || DEFAULT_SUPERADMIN_PROMPT,
    superadminClassroomOverrides: d.superadminClassroomOverrides || {},
    contextualNotes: d.contextualNotes || "",
    testOverrideEmails: d.testOverrideEmails || null,
  };
}

/**
 * Apply test email override if configured.
 * When testOverrideEmails is set, ALL emails go to those addresses only.
 */
function applyEmailOverride(emails, config) {
  if (Array.isArray(config.testOverrideEmails) && config.testOverrideEmails.length > 0) {
    return config.testOverrideEmails;
  }
  return emails;
}

async function archivePreviousDigest(digestRef, weekKey) {
  const snap = await digestRef.get();
  if (!snap.exists) return;
  const prev = snap.data();
  if (prev.weekKey === weekKey) return; // same week, no archive needed
  await digestRef
    .collection("history")
    .doc(prev.weekKey)
    .set({ ...prev, archivedAt: Timestamp.now() });
}

// ── CF 1: Per-Classroom Digest ──────────────────────────────────────

export const weeklyDigestClassroomAdmin = functions
  .region("asia-south1")
  .runWith({
    timeoutSeconds: 540,
    memory: "1GB",
    secrets: [OPENROUTER_API_KEY, SENDGRID_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY],
  })
  .pubsub.schedule("0 18 * * 0") // Sunday 6:00 PM IST
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const langfuse = new Langfuse();
    const weekKey = getWeekKey();
    const sessionId = `digest-${weekKey}`;

    const trace = langfuse.trace({
      name: "weekly-digest-classrooms",
      sessionId,
      userId: "cron",
      tags: ["feature:digest", "type:classroom"],
      metadata: { triggeredAt: new Date().toISOString(), weekKey },
    });

    try {
      const config = await fetchDigestConfig();

      // Fetch all active classrooms
      const classroomsSnap = await db
        .collection("classrooms")
        .where("status", "==", "active")
        .get();
      const classrooms = classroomsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      trace.span({
        name: "config-loaded",
        input: { model: config.model, classrooms: classrooms.length, weekKey, hasContextualNotes: !!config.contextualNotes },
      });

      // Fetch statsCache for all classrooms
      const statsDocs = new Map();
      const chunks = [];
      const classroomIds = classrooms.map((c) => c.id);
      for (let i = 0; i < classroomIds.length; i += 30) {
        chunks.push(classroomIds.slice(i, i + 30));
      }
      for (const chunk of chunks) {
        const docIds = chunk.map((id) => `classroom_${id}`);
        const snap = await db
          .collection("statsCache")
          .where("__name__", "in", docIds)
          .get();
        for (const doc of snap.docs) {
          const cid =
            doc.data().classroomId || doc.id.replace("classroom_", "");
          statsDocs.set(cid, doc.data());
        }
      }

      // Run agent loop per classroom
      let digestCount = 0;
      let errorCount = 0;

      await runWithConcurrency(
        classrooms,
        async (classroom) => {
          const classroomName = classroom.name || classroom.id;
          const classroomSpan = trace.span({
            name: `classroom-${classroom.id}`,
            metadata: {
              classroomName,
              classroomId: classroom.id,
              program: classroom.program,
              teacherCount: (classroom.teacherIds || []).length,
            },
          });

          try {
            const statsDoc = statsDocs.get(classroom.id) || null;
            const userMessage = buildFirstUserMessage(classroom, statsDoc, config.contextualNotes);

            classroomSpan.update({ input: userMessage });

            const gatekeeper = new ToolGatekeeper();
            const toolExecutor = createToolExecutor(gatekeeper);

            const result = await runAgentLoop({
              messages: [
                { role: "system", content: config.classroomPrompt },
                { role: "user", content: userMessage },
              ],
              tools: DIGEST_TOOLS,
              toolExecutor,
              model: {
                model: config.model,
                temperature: config.temperature,
                maxTokens: config.maxTokens,
              },
              trace: classroomSpan,
            });

            // Determine red flag status from tool call results
            const hasRedFlags = result.toolCallLog.some(
              (tc) =>
                tc.name === "fetch_weekly_snapshot" &&
                tc.result?.redFlag?.severity === "high"
            );

            // Resolve recipients for this classroom
            const usersSnap = await db.collection("users").get();
            const allUsers = usersSnap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            }));
            const admins = resolveClassroomAdminRecipients(allUsers);
            const superAdmins = resolveSuperAdminRecipients(allUsers);
            const overrides = resolveSuperAdminOverrides(config, superAdmins);

            const recipientEmails = [
              ...admins
                .filter((a) => a.manageableClassrooms.includes(classroom.id))
                .map((a) => a.email),
              // Superadmin overrides for this classroom
              ...[...overrides.entries()]
                .filter(([, cids]) => cids.includes(classroom.id))
                .map(([email]) => email),
            ];

            // Archive previous digest, then write new one
            const digestRef = db.doc(
              `classrooms/${classroom.id}/digests/weekly_email`
            );
            await archivePreviousDigest(digestRef, weekKey);
            await digestRef.set({
              weekKey,
              htmlContent: result.content,
              agentModel: config.model,
              generatedAt: Timestamp.now(),
              recipientEmails,
              hasRedFlags,
              toolCallCount: result.toolCallLog.length,
              iterations: result.iterations,
            });

            // Send emails
            const subject = hasRedFlags
              ? `⚠️ ${classroomName} — Weekly Digest — Action Required`
              : `${classroomName} — Weekly Digest`;

            const sendTo = applyEmailOverride(recipientEmails, config);
            const emailResults = [];
            for (const email of sendTo) {
              try {
                await sendEmail({ to: email, subject, html: result.content });
                emailResults.push({ email, status: "sent" });
              } catch (emailErr) {
                emailResults.push({ email, status: "failed", error: emailErr.message });
              }
            }

            classroomSpan.end({
              output: result.content,
              metadata: {
                hasRedFlags,
                toolCalls: result.toolCallLog.length,
                toolsUsed: [...new Set(result.toolCallLog.map((tc) => tc.name))],
                iterations: result.iterations,
                recipients: recipientEmails,
                emailDelivery: emailResults,
              },
            });
            digestCount++;
          } catch (err) {
            console.error(
              `[weeklyDigestClassroomAdmin] Error for ${classroom.id}:`,
              err.message
            );
            classroomSpan.end({ output: err.message, level: "ERROR" });
            errorCount++;
          }
        },
        3 // concurrency limit
      );

      const summary = { digestCount, errorCount, weekKey };
      console.log("[weeklyDigestClassroomAdmin] CF1 complete:", JSON.stringify(summary));
      trace.update({ output: summary });
      await langfuse.flushAsync();
      return summary;
    } catch (err) {
      console.error("[weeklyDigestClassroomAdmin] Fatal error:", err);
      trace.update({ output: err.message, level: "ERROR" });
      await langfuse.flushAsync();
      return null;
    }
  });

// ── CF 2: Superadmin Consolidated Digest ────────────────────────────

export const weeklyDigestSuperadmin = functions
  .region("asia-south1")
  .runWith({
    timeoutSeconds: 540,
    memory: "1GB",
    secrets: [OPENROUTER_API_KEY, SENDGRID_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY],
  })
  .pubsub.schedule("30 18 * * 0") // Sunday 6:30 PM IST (30 min after CF 1)
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const langfuse = new Langfuse();
    const weekKey = getWeekKey();
    const sessionId = `digest-${weekKey}`;

    const trace = langfuse.trace({
      name: "weekly-digest-superadmin",
      sessionId,
      userId: "cron",
      tags: ["feature:digest", "type:superadmin"],
      metadata: { triggeredAt: new Date().toISOString(), weekKey },
    });

    try {
      const config = await fetchDigestConfig();

      // Read all classroom digests written by CF 1
      const classroomsSnap = await db
        .collection("classrooms")
        .where("status", "==", "active")
        .get();
      const classroomIds = classroomsSnap.docs.map((d) => d.id);
      const classroomNames = new Map(
        classroomsSnap.docs.map((d) => [d.id, d.data().name || d.id])
      );

      const digests = [];
      for (const cid of classroomIds) {
        const snap = await db
          .doc(`classrooms/${cid}/digests/weekly_email`)
          .get();
        if (snap.exists && snap.data().weekKey === weekKey) {
          digests.push({
            classroomId: cid,
            classroomName: classroomNames.get(cid) || cid,
            ...snap.data(),
          });
        }
      }

      trace.span({
        name: "digests-loaded",
        metadata: {
          digestCount: digests.length,
          weekKey,
          classroomsWithRedFlags: digests.filter((d) => d.hasRedFlags).map((d) => d.classroomName),
        },
      });

      if (digests.length === 0) {
        console.log("[weeklyDigestSuperadmin] No digests found for", weekKey);
        trace.update({ output: "No digests found" });
        await langfuse.flushAsync();
        return null;
      }

      // Build user message from all classroom digests
      const digestSummaries = digests
        .map(
          (d) =>
            `## ${d.classroomName}${d.hasRedFlags ? " ⚠️ RED FLAGS" : ""}\n\n${d.htmlContent}`
        )
        .join("\n\n---\n\n");

      const notesSection = config.contextualNotes
        ? ["## School Contextual Notes", config.contextualNotes, ""]
        : [];

      const userMessage = [
        `# All Classroom Digests for ${weekKey}`,
        `Total classrooms: ${digests.length}`,
        `Classrooms with red flags: ${digests.filter((d) => d.hasRedFlags).length}`,
        "",
        ...notesSection,
        digestSummaries,
        "",
        "Generate a consolidated executive summary email for superadmins. Highlight the most critical items across all classrooms. Identify cross-classroom patterns. Use tools to investigate specific cases if needed.",
      ].join("\n");

      // Agent loop for superadmin digest
      trace.update({ input: userMessage });

      const gatekeeper = new ToolGatekeeper();
      const toolExecutor = createToolExecutor(gatekeeper);

      const result = await runAgentLoop({
        messages: [
          { role: "system", content: config.superadminPrompt },
          { role: "user", content: userMessage },
        ],
        tools: DIGEST_TOOLS,
        toolExecutor,
        model: {
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        },
        trace,
      });

      // Store superadmin digest
      const digestRef = db.doc(
        "classrooms/_digest_all/digests/weekly_email"
      );
      await archivePreviousDigest(digestRef, weekKey);

      const hasRedFlags = digests.some((d) => d.hasRedFlags);
      const usersSnap = await db.collection("users").get();
      const allUsers = usersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      const superAdmins = resolveSuperAdminRecipients(allUsers);
      const recipientEmails = superAdmins.map((sa) => sa.email);

      await digestRef.set({
        weekKey,
        htmlContent: result.content,
        agentModel: config.model,
        generatedAt: Timestamp.now(),
        recipientEmails,
        hasRedFlags,
        toolCallCount: result.toolCallLog.length,
        iterations: result.iterations,
      });

      // Send emails
      const subject = hasRedFlags
        ? "⚠️ Weekly School Digest — Action Required"
        : "Weekly School Digest";

      const sendTo = applyEmailOverride(recipientEmails, config);
      const emailResults = [];
      for (const email of sendTo) {
        try {
          await sendEmail({ to: email, subject, html: result.content });
          emailResults.push({ email, status: "sent" });
        } catch (emailErr) {
          emailResults.push({ email, status: "failed", error: emailErr.message });
        }
      }

      const summary = {
        sent: recipientEmails.length,
        toolCalls: result.toolCallLog.length,
        toolsUsed: [...new Set(result.toolCallLog.map((tc) => tc.name))],
        iterations: result.iterations,
        weekKey,
        emailDelivery: emailResults,
      };
      console.log(
        "[weeklyDigestSuperadmin] CF2 complete:",
        JSON.stringify(summary)
      );
      trace.update({ output: result.content, metadata: summary });
      await langfuse.flushAsync();
      return summary;
    } catch (err) {
      console.error("[weeklyDigestSuperadmin] Fatal error:", err);
      trace.update({ output: err.message, level: "ERROR" });
      await langfuse.flushAsync();
      return null;
    }
  });

// ── Test Trigger (callable, for e2e testing only) ───────────────────

export const triggerDigestTest = functions
  .region("asia-south1")
  .runWith({
    timeoutSeconds: 540,
    memory: "1GB",
    secrets: [OPENROUTER_API_KEY, SENDGRID_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY],
  })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be signed in");
    }
    // Only superadmins can trigger test
    const callerSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!callerSnap.exists || callerSnap.data().role !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Superadmin only");
    }
    const callerEmail = callerSnap.data().email;

    const config = await fetchDigestConfig();
    // Override emails to only send to the caller
    config.testOverrideEmails = [callerEmail];

    const langfuse = new Langfuse();
    const weekKey = getWeekKey();
    const sessionId = `digest-test-${weekKey}-${Date.now()}`;

    // ── Run CF 1 logic (per-classroom digests) ──────────────────────
    const cf1Trace = langfuse.trace({
      name: "digest-test-classrooms",
      sessionId,
      userId: context.auth.uid,
      tags: ["feature:digest", "type:classroom", "test"],
      metadata: { triggeredBy: context.auth.uid, weekKey },
    });

    // Test mode: only process classrooms specified in data, or default to ["amazing"]
    const testClassroomIds = data?.classrooms || ["amazing"];

    const classroomsSnap = await db
      .collection("classrooms")
      .where("status", "==", "active")
      .get();
    const classrooms = classroomsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => testClassroomIds.includes(c.id));

    // Fetch statsCache
    const statsDocs = new Map();
    const classroomIds = classrooms.map((c) => c.id);
    const chunks = [];
    for (let i = 0; i < classroomIds.length; i += 30) {
      chunks.push(classroomIds.slice(i, i + 30));
    }
    for (const chunk of chunks) {
      const docIds = chunk.map((id) => `classroom_${id}`);
      const snap = await db.collection("statsCache").where("__name__", "in", docIds).get();
      for (const doc of snap.docs) {
        const cid = doc.data().classroomId || doc.id.replace("classroom_", "");
        statsDocs.set(cid, doc.data());
      }
    }

    let cf1Count = 0;
    let cf1Errors = 0;

    // Run sequentially for test (easier to debug)
    for (const classroom of classrooms) {
      const span = cf1Trace.span({ name: `classroom-${classroom.id}` });
      try {
        const statsDoc = statsDocs.get(classroom.id) || null;
        const userMessage = buildFirstUserMessage(classroom, statsDoc, config.contextualNotes);
        const gatekeeper = new ToolGatekeeper();
        const toolExecutor = createToolExecutor(gatekeeper);

        const result = await runAgentLoop({
          messages: [
            { role: "system", content: config.classroomPrompt },
            { role: "user", content: userMessage },
          ],
          tools: DIGEST_TOOLS,
          toolExecutor,
          model: { model: config.model, temperature: config.temperature, maxTokens: config.maxTokens },
          trace: span,
        });

        const hasRedFlags = result.toolCallLog.some(
          (tc) => tc.name === "fetch_weekly_snapshot" && tc.result?.redFlag?.severity === "high"
        );

        // Resolve recipients + override
        const usersSnap = await db.collection("users").get();
        const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const admins = resolveClassroomAdminRecipients(allUsers);
        const superAdmins = resolveSuperAdminRecipients(allUsers);
        const overrides = resolveSuperAdminOverrides(config, superAdmins);
        const recipientEmails = [
          ...admins.filter((a) => a.manageableClassrooms.includes(classroom.id)).map((a) => a.email),
          ...[...overrides.entries()].filter(([, cids]) => cids.includes(classroom.id)).map(([email]) => email),
        ];

        const digestRef = db.doc(`classrooms/${classroom.id}/digests/weekly_email`);
        await archivePreviousDigest(digestRef, weekKey);
        await digestRef.set({
          weekKey,
          htmlContent: result.content,
          agentModel: config.model,
          generatedAt: Timestamp.now(),
          recipientEmails,
          hasRedFlags,
          toolCallCount: result.toolCallLog.length,
          iterations: result.iterations,
        });

        const classroomName = classroom.name || classroom.id;
        const subject = hasRedFlags
          ? `⚠️ ${classroomName} — Weekly Digest — Action Required`
          : `${classroomName} — Weekly Digest`;
        const sendTo = applyEmailOverride(recipientEmails, config);
        for (const email of sendTo) {
          await sendEmail({ to: email, subject, html: result.content });
        }

        span.end({ output: { status: "sent", toolCalls: result.toolCallLog.length } });
        cf1Count++;
      } catch (err) {
        console.error(`[triggerDigestTest] CF1 error for ${classroom.id}:`, err.message);
        span.end({ output: err.message, level: "ERROR" });
        cf1Errors++;
      }
    }

    await langfuse.flushAsync();

    // ── Run CF 2 logic (superadmin consolidated) ────────────────────
    const cf2Trace = langfuse.trace({
      name: "digest-test-superadmin",
      sessionId,
      userId: context.auth.uid,
      tags: ["feature:digest", "type:superadmin", "test"],
      metadata: { triggeredBy: context.auth.uid, weekKey },
    });

    const digests = [];
    const classroomNames = new Map(classrooms.map((c) => [c.id, c.name || c.id]));
    for (const cid of classroomIds) {
      const snap = await db.doc(`classrooms/${cid}/digests/weekly_email`).get();
      if (snap.exists && snap.data().weekKey === weekKey) {
        digests.push({ classroomId: cid, classroomName: classroomNames.get(cid) || cid, ...snap.data() });
      }
    }

    let cf2Result = null;
    if (digests.length > 0) {
      const digestSummaries = digests
        .map((d) => `## ${d.classroomName}${d.hasRedFlags ? " ⚠️ RED FLAGS" : ""}\n\n${d.htmlContent}`)
        .join("\n\n---\n\n");

      const userMessage = [
        `# All Classroom Digests for ${weekKey}`,
        `Total classrooms: ${digests.length}`,
        `Classrooms with red flags: ${digests.filter((d) => d.hasRedFlags).length}`,
        "", digestSummaries, "",
        "Generate a consolidated executive summary email for superadmins. Highlight the most critical items across all classrooms. Identify cross-classroom patterns. Use tools to investigate specific cases if needed.",
      ].join("\n");

      const gatekeeper = new ToolGatekeeper();
      const toolExecutor = createToolExecutor(gatekeeper);

      const result = await runAgentLoop({
        messages: [
          { role: "system", content: config.superadminPrompt },
          { role: "user", content: userMessage },
        ],
        tools: DIGEST_TOOLS,
        toolExecutor,
        model: { model: config.model, temperature: config.temperature, maxTokens: config.maxTokens },
        trace: cf2Trace,
      });

      const hasRedFlags = digests.some((d) => d.hasRedFlags);
      const usersSnap = await db.collection("users").get();
      const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const superAdmins = resolveSuperAdminRecipients(allUsers);
      const recipientEmails = superAdmins.map((sa) => sa.email);

      const digestRef = db.doc("classrooms/_digest_all/digests/weekly_email");
      await archivePreviousDigest(digestRef, weekKey);
      await digestRef.set({
        weekKey,
        htmlContent: result.content,
        agentModel: config.model,
        generatedAt: Timestamp.now(),
        recipientEmails,
        hasRedFlags,
        toolCallCount: result.toolCallLog.length,
        iterations: result.iterations,
      });

      const subject = hasRedFlags
        ? "⚠️ Weekly School Digest — Action Required"
        : "Weekly School Digest";
      const sendTo = applyEmailOverride(recipientEmails, config);
      for (const email of sendTo) {
        await sendEmail({ to: email, subject, html: result.content });
      }

      cf2Result = { sent: sendTo.length, toolCalls: result.toolCallLog.length };
    }

    cf2Trace.update({ output: cf2Result || "No digests to consolidate" });
    await langfuse.flushAsync();

    return {
      cf1: { classrooms: cf1Count, errors: cf1Errors },
      cf2: cf2Result,
      weekKey,
    };
  });
