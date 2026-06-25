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
import { createLangfuse } from "../shared/langfuse.js";

// ── Default system prompts ──────────────────────────────────────────

const DEFAULT_CLASSROOM_PROMPT = `You are an experienced Montessori consultant advising a classroom head on where to focus their attention this week.

You receive structured data about ONE classroom: teacher activity stats, student note counts, each student's weekly AI snapshot (behavioral summary, severity, red flags, escalation status, coverage gaps), and contextual notes providing school-specific background. You also have tools to investigate individual students more deeply.

Your job:
1. Internalize the contextual notes silently — they are background knowledge, not content for the digest. People and situations described there (admin staff, school breaks, ramping classrooms) should be omitted entirely. Do not mention them, do not explain their exclusion, do not narrate adjustments you are making.
2. Analyze the weekly snapshots, stats, and coverage gaps. Identify who needs attention, what curriculum areas are neglected, and what's changing week-over-week.
3. For students who need deeper investigation (escalated, red-flagged, or showing anomalies), use tools like fetch_snapshot_history, fetch_soul, or fetch_observations. Do not call fetch_weekly_snapshot — that data is already in the input.
4. Produce a concise, actionable HTML email digest.

## Content structure (use this order)

**1. Urgent — needs action this week**
ONLY students with high severity or who escalated to red-flag status this week. This section should be short — typically 0–3 students. For each one: what is happening (in plain language, not severity labels), why it matters developmentally, and a specific suggested action (e.g., "schedule a parent conversation," "adjust the work plan to include more supervised practical life," "pair with a calmer peer during group work"). If no students meet this threshold, skip this section entirely.

**2. Watch — trending concerns**
Students with low or medium severity, those whose severity increased this week, or who show emerging patterns (declining notes, narrowing curriculum engagement). Brief — one line per student with what to watch for.

**3. Curriculum blind spots**
Aggregate coverage gaps across the classroom. Don't list per-student gaps — synthesize: "Sensorial is the least-documented area — 8 students have no Sensorial observations in 42 days. Consider scheduling group presentations this week." Make it a planning nudge, not a data dump.

**4. Bright spots**
Students who improved this week, strong documentation from specific teachers, or positive developmental milestones from the snapshots. Reinforcement matters — keep it brief but specific.

**5. Teacher documentation**
Only if there's something actionable. If all teachers are active, say nothing. Name inactive teachers with a gentle nudge. Do not create a leaderboard of note counts.

## Writing rules

- **Every item must answer "what should I do about this?"** If you can't suggest an action, the item probably doesn't belong in the digest.
- **Do not restate raw numbers the reader can look up.** "Priya's documentation dropped sharply" is useful. "Priya had 2 notes this week vs 15 last week" is a stat restatement. You may cite numbers occasionally when the contrast is striking and supports your analysis, but never as the lead.
- **Never say "and several others" or "among others."** List every relevant name.
- **Omit sections that have nothing to report.** If there are no urgent items, skip that section entirely — do not write "No urgent items this week."
- **Quiet weeks should still offer value.** Suggest proactive focus areas: curriculum gaps to address, students who haven't been observed recently, opportunities to check in on improving students.
- **Do not invent information.** Only reference data you received or fetched via tools.

## Format

- **Title:** "<full month name> Week <number> Digest — <Classroom Name>" (e.g., "June Week 2 Digest — Periwinkle").
- **No greetings or sign-offs.** Get right into the content.
- **Tone:** Warm, practical, collegial — like a trusted co-teacher sharing notes over coffee.
- **HTML:** Valid inner HTML only (no <html>/<head>/<body> tags). Inline styles, centre-aligned, max-width 600px, mobile-friendly. Use bold and color (#b22222) for urgent items.`;

const DEFAULT_SUPERADMIN_PROMPT = `You are an experienced Montessori school consultant preparing a weekly executive briefing for school leadership.

You receive the individual classroom digest emails that were already generated, plus contextual notes providing school-specific background. You also have tools to investigate specific students if needed.

Your job:
1. Internalize the contextual notes silently — they are background knowledge. People and situations described there should be omitted entirely from your output.
2. Synthesize the classroom digests into ONE consolidated briefing. Do not repeat or summarize each classroom — extract what leadership needs to know.
3. Surface cross-classroom patterns — these are your unique value. No individual digest has this view.
4. Use tools only if you need to verify something or dig deeper into a specific case.

## Content structure (use this order)

**1. Critical interventions needed**
Students with red flags or escalations across any classroom. Name the student, the classroom, what's happening, and what action is recommended. These should jump off the page.

**2. Cross-classroom patterns**
Systemic observations that span multiple classrooms: documentation drops across several teachers, curriculum areas neglected school-wide, seasonal patterns. This is the insight only a school-wide view can provide.

**3. Classrooms needing attention**
Classrooms with notable issues — high concentration of concerns, documentation gaps, or unusual patterns. One brief paragraph per classroom, only for classrooms that need leadership awareness. Skip classrooms where things are running smoothly.

**4. Bright spots**
Improvements, strong documentation, positive developmental milestones. Brief but specific — reinforcement from leadership is powerful.

## Writing rules

- **Every item must be actionable.** If leadership can't do anything about it, omit it.
- **Do not restate what the classroom digests already say.** Synthesize, don't summarize.
- **Never say "and several others."** List every relevant name.
- **Omit sections with nothing to report.**
- **Do not invent information.** Only reference data from classroom digests or fetched via tools.

## Format

- **Title:** "Executive Digest — <full month name> Week <number>" (e.g., "Executive Digest — June Week 2").
- **No greetings or sign-offs.**
- **Tone:** Direct, concise, executive-friendly — a busy school head should get the picture in 2 minutes.
- **HTML:** Valid inner HTML only (no <html>/<head>/<body> tags). Inline styles, centre-aligned, max-width 700px, mobile-friendly. Bold and color (#b22222) for critical items.
- **Ruthlessly concise.** This covers ~20 classrooms — prioritize, don't enumerate.`;

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

export function buildFirstUserMessage(classroomDoc, statsCacheDoc, contextualNotes, snapshotsMap = null) {
  const classroom = {
    id: classroomDoc.id,
    name: classroomDoc.name || classroomDoc.id,
    program: classroomDoc.programId || "unknown",
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

  const snapshotSection = ["## Weekly Snapshots"];
  if (snapshotsMap && snapshotsMap.size > 0) {
    for (const student of students) {
      const snap = snapshotsMap.get(student.id);
      if (snap) {
        const severity = snap.severity || "none";
        const escalated = snap.escalatedThisWeek ? " | ESCALATED" : "";
        const improved = snap.improvedThisWeek ? " | improved" : "";
        const redFlag = snap.redFlag ? ` | RED FLAG: ${snap.redFlag.severity} — ${snap.redFlag.reason}` : "";
        const gaps = snap.coverageGaps?.length ? ` | gaps: ${snap.coverageGaps.join(", ")}` : "";
        snapshotSection.push(`### ${student.name} [${student.id}] — severity: ${severity}${escalated}${improved}${redFlag}${gaps}`);
        if (snap.summary) snapshotSection.push(snap.summary);
        snapshotSection.push("");
      }
    }
  } else {
    snapshotSection.push("No weekly snapshots available for this classroom.");
    snapshotSection.push("");
  }

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
    ...snapshotSection,
    "Generate a weekly digest email for this classroom.",
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
      model: "openai/gpt-5.5",
      temperature: 0.4,
      maxTokens: 8000,
      classroomPrompt: DEFAULT_CLASSROOM_PROMPT,
      superadminPrompt: DEFAULT_SUPERADMIN_PROMPT,
      superadminClassroomOverrides: {},
      contextualNotes: "",
    };
  }
  const d = snap.data();
  return {
    model: d.model || "openai/gpt-5.5",
    temperature: d.temperature ?? 0.4,
    maxTokens: d.max_tokens || 4000,
    classroomPrompt: d.classroomPrompt || DEFAULT_CLASSROOM_PROMPT,
    superadminPrompt: d.superadminPrompt || DEFAULT_SUPERADMIN_PROMPT,
    superadminClassroomOverrides: d.superadminClassroomOverrides || {},
    contextualNotes: d.contextualNotes || "",
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
    secrets: [OPENROUTER_API_KEY, SENDGRID_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY],
  })
  .pubsub.schedule("0 18 * * 0") // Sunday 6:00 PM IST
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const langfuse = createLangfuse();
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

      // Pre-fetch all users once (avoid N queries inside concurrency loop)
      const usersSnap = await db.collection("users").get();
      const allUsers = usersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      const admins = resolveClassroomAdminRecipients(allUsers);
      const superAdmins = resolveSuperAdminRecipients(allUsers);
      const overrides = resolveSuperAdminOverrides(config, superAdmins);

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
              program: classroom.programId,
              teacherCount: (classroom.teacherIds || []).length,
            },
          });

          try {
            const statsDoc = statsDocs.get(classroom.id) || null;

            // Pre-load weekly snapshots for all students in this classroom
            const studentIds = (statsDoc?.students || []).map((s) => s.id);
            const snapshotsMap = new Map();
            if (studentIds.length > 0) {
              const refs = studentIds.map((id) =>
                db.doc(`students/${id}/ai_summaries/weekly_snapshot`)
              );
              const snapDocs = await db.getAll(...refs);
              for (const snapDoc of snapDocs) {
                if (snapDoc.exists) {
                  const studentId = snapDoc.ref.parent.parent.id;
                  snapshotsMap.set(studentId, snapDoc.data());
                }
              }
            }

            const userMessage = buildFirstUserMessage(classroom, statsDoc, config.contextualNotes, snapshotsMap);

            classroomSpan.update({ input: userMessage });

            // Pre-seed prerequisite gate for preloaded snapshots
            const preloadedPrereqs = new Map();
            for (const sid of snapshotsMap.keys()) {
              preloadedPrereqs.set(`fetch_weekly_snapshot:${sid}`, true);
            }

            const gatekeeper = new ToolGatekeeper();
            const toolExecutor = createToolExecutor(gatekeeper, { preloadedPrereqs });

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

            // Determine red flag status from preloaded snapshots + any tool call results
            const hasRedFlags =
              [...snapshotsMap.values()].some(
                (s) => s.redFlag || s.escalatedThisWeek === true
              ) ||
              result.toolCallLog.some(
                (tc) =>
                  tc.name === "fetch_weekly_snapshot" &&
                  (tc.result?.redFlag || tc.result?.escalatedThisWeek === true)
              );

            // Resolve recipients for this classroom (users pre-fetched above)
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

            const emailResults = [];
            for (const email of recipientEmails) {
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
  // Offset from CF1 (18:00). Fixed gap — not guaranteed to run after CF1 finishes.
  // For reliable sequencing, see Pub/Sub handoff issue.
  .pubsub.schedule("45 18 * * 0") // Sunday 6:45 PM IST (45 min after CF 1)
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const langfuse = createLangfuse();
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

      if (digests.length < classroomIds.length) {
        const digestClassroomIds = new Set(digests.map((d) => d.classroomId));
        const missingIds = classroomIds.filter((id) => !digestClassroomIds.has(id));
        console.warn(
          `[weeklyDigestSuperadmin] CF2: found ${digests.length}/${classroomIds.length} digests. Missing: ${missingIds.join(", ")}`
        );
      }

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

      const emailResults = [];
      for (const email of recipientEmails) {
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
    const config = await fetchDigestConfig();

    // Read test-specific fields directly from Firestore
    const digestConfigSnap = await db.collection("config").doc("weekly_digest").get();
    const digestConfigData = digestConfigSnap.exists ? digestConfigSnap.data() : {};
    if (!digestConfigData.enableTestTrigger) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Test trigger is disabled in config. Set enableTestTrigger: true in config/weekly_digest to enable."
      );
    }
    const testOverrideEmails = digestConfigData.testOverrideEmails?.length
      ? digestConfigData.testOverrideEmails
      : [callerSnap.data().email];

    const langfuse = createLangfuse();
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

    // Pre-fetch all users once (avoid N queries inside loop)
    const testUsersSnap = await db.collection("users").get();
    const testAllUsers = testUsersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const testAdmins = resolveClassroomAdminRecipients(testAllUsers);
    const testSuperAdmins = resolveSuperAdminRecipients(testAllUsers);
    const testOverrides = resolveSuperAdminOverrides(config, testSuperAdmins);

    let cf1Count = 0;
    let cf1Errors = 0;

    // Run sequentially for test (easier to debug)
    for (const classroom of classrooms) {
      const span = cf1Trace.span({ name: `classroom-${classroom.id}` });
      try {
        const statsDoc = statsDocs.get(classroom.id) || null;

        // Pre-load weekly snapshots for all students in this classroom
        const studentIds = (statsDoc?.students || []).map((s) => s.id);
        const snapshotsMap = new Map();
        if (studentIds.length > 0) {
          const refs = studentIds.map((id) =>
            db.doc(`students/${id}/ai_summaries/weekly_snapshot`)
          );
          const snapDocs = await db.getAll(...refs);
          for (const snapDoc of snapDocs) {
            if (snapDoc.exists) {
              const studentId = snapDoc.ref.parent.parent.id;
              snapshotsMap.set(studentId, snapDoc.data());
            }
          }
        }

        const userMessage = buildFirstUserMessage(classroom, statsDoc, config.contextualNotes, snapshotsMap);

        // Pre-seed prerequisite gate for preloaded snapshots
        const preloadedPrereqs = new Map();
        for (const sid of snapshotsMap.keys()) {
          preloadedPrereqs.set(`fetch_weekly_snapshot:${sid}`, true);
        }

        const gatekeeper = new ToolGatekeeper();
        const toolExecutor = createToolExecutor(gatekeeper, { preloadedPrereqs });

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

        const hasRedFlags =
          [...snapshotsMap.values()].some(
            (s) => s.redFlag || s.escalatedThisWeek === true
          ) ||
          result.toolCallLog.some(
            (tc) => tc.name === "fetch_weekly_snapshot" && (tc.result?.redFlag || tc.result?.escalatedThisWeek === true)
          );

        // Resolve recipients + override (users pre-fetched above)
        const recipientEmails = [
          ...testAdmins.filter((a) => a.manageableClassrooms.includes(classroom.id)).map((a) => a.email),
          ...[...testOverrides.entries()].filter(([, cids]) => cids.includes(classroom.id)).map(([email]) => email),
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
        for (const email of testOverrideEmails) {
          try {
            await sendEmail({ to: email, subject, html: result.content });
          } catch (emailErr) {
            console.error(`[triggerDigestTest] CF1 email failed for ${email}:`, emailErr.message);
          }
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
      const emailResults = [];
      for (const email of testOverrideEmails) {
        try {
          await sendEmail({ to: email, subject, html: result.content });
          emailResults.push({ email, status: "sent" });
        } catch (emailErr) {
          emailResults.push({ email, status: "failed", error: emailErr.message });
        }
      }

      cf2Result = { sent: testOverrideEmails.length, toolCalls: result.toolCallLog.length, emailDelivery: emailResults };
    }

    cf2Trace.update({ output: cf2Result || "No digests to consolidate" });
    await langfuse.flushAsync();

    return {
      cf1: { classrooms: cf1Count, errors: cf1Errors },
      cf2: cf2Result,
      weekKey,
    };
  });
