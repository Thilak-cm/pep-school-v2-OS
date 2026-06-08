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
import { db, Timestamp } from "../shared/firebase.js";
import {
  OPENROUTER_API_KEY,
} from "../shared/openrouter.js";
import { SENDGRID_API_KEY, sendEmail } from "../shared/sendgrid.js";
import { runWithConcurrency } from "../shared/scheduling.js";
import { runAgentLoop } from "../shared/agentLoop.js";
import { DIGEST_TOOLS, ToolGatekeeper, createToolExecutor } from "./tools.js";
import { Langfuse } from "langfuse";

// ── Default system prompts ──────────────────────────────────────────

const DEFAULT_CLASSROOM_PROMPT = `You are a Montessori school assistant generating a weekly classroom digest email for a classroom administrator.

You receive structured data about ONE classroom: teacher activity stats and student note counts for the past 7 days. You also have tools to investigate individual students more deeply.

Your job:
1. Review the stats provided. Identify anomalies — students with sudden drops in notes, teachers with zero activity, students with very low coverage.
2. Use your tools to investigate. Start with fetch_weekly_snapshot for students who look concerning. If a snapshot shows escalation or red flags, dig deeper with fetch_snapshot_history, fetch_soul, or fetch_observations.
3. Once you have enough context, produce a concise, actionable HTML email body.

Guidelines:
- **Red-flagged students must be prominently called out.** Use bold text and warning colors. These are urgent.
- **Escalated students** (medium/high severity) should be highlighted with context on why.
- **Inactive teachers** (zero notes this week) must be named explicitly.
- **Anomalies over time** — if a student went from lots of notes to none, say so. If a teacher's output dropped, flag it.
- **Tone:** Professional but warm. You are a co-pilot for the manager.
- **Format:** Output valid HTML (no <html>/<head>/<body> tags — just inner content). Use inline styles. Mobile-friendly.
- **Do not invent information.** Only reference data you received or fetched via tools.
- **Keep it brief.** Lead with what needs attention. A quiet week gets a short "all clear."`;

const DEFAULT_SUPERADMIN_PROMPT = `You are a Montessori school assistant generating a consolidated weekly digest email for a superadmin who oversees ALL classrooms across the school.

You receive the individual classroom digest summaries that were already generated for each classroom. You also have tools to investigate specific students if needed.

Your job:
1. Synthesize the classroom digests into ONE consolidated email.
2. Highlight the most critical items across all classrooms — red flags, escalations, inactive teachers.
3. Identify cross-classroom patterns if any (e.g., multiple classrooms with inactive teachers, school-wide observation drop).
4. Use tools only if you need to verify something or dig deeper into a specific case.

Guidelines:
- **Lead with the most urgent items** — red flags first, then escalations, then general notes.
- **Group by classroom** but don't just repeat each digest. Summarize and prioritize.
- **Cross-classroom insights** are your unique value — no individual digest has this view.
- **Tone:** Executive summary for leadership. Concise, direct, actionable.
- **Format:** Valid HTML, inline styles, mobile-friendly. No <html>/<head>/<body> tags.
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

export function buildFirstUserMessage(classroomDoc, statsCacheDoc) {
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

  return [
    `# Classroom: ${classroom.name}`,
    `Program: ${classroom.program}`,
    `Teachers: ${classroom.teacherIds.length}`,
    `Students: ${students.length}`,
    "",
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
  };
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
    secrets: [OPENROUTER_API_KEY, SENDGRID_API_KEY],
  })
  .pubsub.schedule("0 18 * * 0") // Sunday 6:00 PM IST
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const langfuse = new Langfuse();
    const trace = langfuse.trace({
      name: "weekly-digest-classrooms",
      metadata: { triggeredAt: new Date().toISOString() },
    });

    try {
      const config = await fetchDigestConfig();
      const weekKey = getWeekKey();

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
        input: { model: config.model, classrooms: classrooms.length, weekKey },
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
          const classroomSpan = trace.span({
            name: `classroom-${classroom.id}`,
            input: { classroomName: classroom.name || classroom.id },
          });

          try {
            const statsDoc = statsDocs.get(classroom.id) || null;
            const userMessage = buildFirstUserMessage(classroom, statsDoc);

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
            const classroomName = classroom.name || classroom.id;
            const subject = hasRedFlags
              ? `⚠️ ${classroomName} — Weekly Digest — Action Required`
              : `${classroomName} — Weekly Digest`;

            for (const email of recipientEmails) {
              await sendEmail({ to: email, subject, html: result.content });
            }

            classroomSpan.end({
              output: {
                status: "sent",
                recipients: recipientEmails.length,
                toolCalls: result.toolCallLog.length,
                iterations: result.iterations,
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
    secrets: [OPENROUTER_API_KEY, SENDGRID_API_KEY],
  })
  .pubsub.schedule("30 18 * * 0") // Sunday 6:30 PM IST (30 min after CF 1)
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const langfuse = new Langfuse();
    const trace = langfuse.trace({
      name: "weekly-digest-superadmin",
      metadata: { triggeredAt: new Date().toISOString() },
    });

    try {
      const config = await fetchDigestConfig();
      const weekKey = getWeekKey();

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
        metadata: { digestCount: digests.length, weekKey },
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

      const userMessage = [
        `# All Classroom Digests for ${weekKey}`,
        `Total classrooms: ${digests.length}`,
        `Classrooms with red flags: ${digests.filter((d) => d.hasRedFlags).length}`,
        "",
        digestSummaries,
        "",
        "Generate a consolidated executive summary email for superadmins. Highlight the most critical items across all classrooms. Identify cross-classroom patterns. Use tools to investigate specific cases if needed.",
      ].join("\n");

      // Agent loop for superadmin digest
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

      for (const email of recipientEmails) {
        await sendEmail({ to: email, subject, html: result.content });
      }

      const summary = {
        sent: recipientEmails.length,
        toolCalls: result.toolCallLog.length,
        iterations: result.iterations,
        weekKey,
      };
      console.log(
        "[weeklyDigestSuperadmin] CF2 complete:",
        JSON.stringify(summary)
      );
      trace.update({ output: summary });
      await langfuse.flushAsync();
      return summary;
    } catch (err) {
      console.error("[weeklyDigestSuperadmin] Fatal error:", err);
      trace.update({ output: err.message, level: "ERROR" });
      await langfuse.flushAsync();
      return null;
    }
  });
