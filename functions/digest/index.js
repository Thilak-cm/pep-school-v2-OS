/**
 * Weekly Classroom Digest Agent (PEP-297).
 *
 * Scheduled CF that:
 *  1. Triggers recomputeStats for fresh teacher activity data
 *  2. Resolves classroomadmin recipients
 *  3. Assembles per-classroom data (escalations + teacher activity)
 *  4. Calls LLM via OpenRouter to generate contextual digest narrative
 *  5. Sends email via SendGrid
 *  6. Traces everything to Langfuse
 */

import * as functions from "firebase-functions/v1";
import { db } from "../shared/firebase.js";
import {
  OPENROUTER_API_KEY,
  getOpenRouterKey,
  OPENROUTER_ENDPOINT,
} from "../shared/openrouter.js";
import { buildChatBody } from "../shared/openai.js";
import { SENDGRID_API_KEY, sendEmail } from "../shared/sendgrid.js";
import { runWithConcurrency } from "../shared/scheduling.js";
import { Langfuse } from "langfuse";

// ── Pure logic (exported for testing) ───────────────────────────────

/**
 * Resolve digest recipients from user docs.
 * Returns active classroomadmins with non-empty manageableClassrooms.
 */
export function resolveRecipients(users) {
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

/**
 * Assemble per-classroom digest data from statsCache + escalations.
 */
export function assembleClassroomData(
  classroomId,
  statsCacheDoc,
  escalations
) {
  const teachers = (statsCacheDoc?.teachers || []).map((t) => ({
    name: t.name,
    observations7d: t.observations7d || 0,
    lessons7d: t.lessons7d || 0,
    total7d: (t.observations7d || 0) + (t.lessons7d || 0),
  }));

  const escalatedStudents = escalations
    .filter(
      (e) =>
        e.escalatedThisWeek === true ||
        e.severity === "high" ||
        e.severity === "medium"
    )
    .map((e) => ({
      studentName: e.studentName || e.studentId,
      severity: e.severity,
      isRedFlag: e.redFlag?.severity === "high",
      redFlagReason: e.redFlag?.reason || null,
      coverageGaps: e.coverageGaps || [],
    }))
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2, clear: 3 };
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    });

  return {
    classroomId,
    classroomName: statsCacheDoc?.classroomName || classroomId,
    teachers,
    escalatedStudents,
    hasRedFlags: escalatedStudents.some((s) => s.isRedFlag),
  };
}

/**
 * Build the user message for the digest agent from assembled data.
 */
export function buildAgentContext(classroomDataList) {
  const sections = classroomDataList.map((cd) => {
    const teacherLines = cd.teachers
      .map(
        (t) =>
          `  - ${t.name}: ${t.total7d} notes (${t.observations7d} obs, ${t.lessons7d} lessons)`
      )
      .join("\n");

    const escalationLines =
      cd.escalatedStudents.length === 0
        ? "  None"
        : cd.escalatedStudents
          .map((s) => {
            let line = `  - ${s.studentName} [${s.severity.toUpperCase()}]`;
            if (s.isRedFlag) {
              line += ` ⚠️ RED FLAG: ${s.redFlagReason || "no reason given"}`;
            }
            if (s.coverageGaps.length) {
              line += ` (gaps: ${s.coverageGaps.join(", ")})`;
            }
            return line;
          })
          .join("\n");

    return [
      `## ${cd.classroomName}`,
      "",
      "Teacher Activity (last 7 days):",
      teacherLines,
      "",
      "Student Escalations:",
      escalationLines,
    ].join("\n");
  });

  return sections.join("\n\n---\n\n");
}

// ── Firestore data fetching ─────────────────────────────────────────

async function fetchDigestConfig() {
  const snap = await db.collection("config").doc("weekly_digest").get();
  if (!snap.exists) {
    return {
      model: "openai/gpt-4.1-mini",
      temperature: 0.4,
      maxTokens: 2000,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
    };
  }
  const d = snap.data();
  return {
    model: d.model || "openai/gpt-4.1-mini",
    temperature: d.temperature ?? 0.4,
    maxTokens: d.max_tokens || 2000,
    systemPrompt: d.systemPrompt || DEFAULT_SYSTEM_PROMPT,
  };
}

async function fetchClassroomAdminRecipients() {
  const snap = await db
    .collection("users")
    .where("role", "==", "classroomadmin")
    .where("status", "==", "active")
    .get();
  return resolveRecipients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

async function fetchSuperAdminRecipients() {
  const snap = await db
    .collection("users")
    .where("role", "==", "superadmin")
    .where("status", "==", "active")
    .get();
  return snap.docs
    .filter((d) => {
      const data = d.data();
      return data.email && !data.isPending;
    })
    .map((d) => ({ id: d.id, ...d.data() }));
}

async function fetchStatsCacheDocs(classroomIds) {
  const docs = new Map();
  // Firestore `in` queries limited to 30 — batch if needed
  const chunks = [];
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
      const cid = doc.data().classroomId || doc.id.replace("classroom_", "");
      docs.set(cid, doc.data());
    }
  }
  return docs;
}

async function fetchEscalations(classroomIds, studentClassroomMap) {
  // Fetch all weekly_snapshot docs via collection group
  const snap = await db.collectionGroup("ai_summaries").get();
  const escalations = new Map(); // classroomId → escalation[]

  for (const cid of classroomIds) {
    escalations.set(cid, []);
  }

  for (const doc of snap.docs) {
    if (doc.id !== "weekly_snapshot") continue;
    const d = doc.data();
    // Extract studentId from path: students/{studentId}/ai_summaries/weekly_snapshot
    const studentId = doc.ref.parent.parent?.id;
    if (!studentId) continue;
    const classroomId = studentClassroomMap.get(studentId);
    if (!classroomId || !escalations.has(classroomId)) continue;

    escalations.get(classroomId).push({
      studentId,
      studentName: d.studentName || studentId,
      severity: d.severity || "clear",
      escalatedThisWeek: d.escalatedThisWeek || false,
      redFlag: d.redFlag || null,
      coverageGaps: d.coverageGaps || [],
    });
  }

  return escalations;
}

async function fetchStudentClassroomMap(classroomIds) {
  const map = new Map();
  for (const cid of classroomIds) {
    const snap = await db
      .collection("students")
      .where("classroomId", "==", cid)
      .where("status", "==", "active")
      .get();
    for (const doc of snap.docs) {
      map.set(doc.id, cid);
    }
  }
  return map;
}

// ── LLM call ────────────────────────────────────────────────────────

async function generateDigestEmail(
  systemPrompt,
  agentContext,
  config,
  trace
) {
  const apiKey = getOpenRouterKey();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const generation = trace.generation({
    name: "digest-llm-call",
    model: config.model,
    input: { systemPrompt, agentContext },
  });

  const body = buildChatBody({
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: agentContext },
    ],
    temperature: config.temperature,
    max_completion_tokens: config.maxTokens,
  });

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    generation.end({ output: errText, level: "ERROR" });
    throw new Error(`LLM error: ${response.status} — ${errText?.slice?.(0, 200)}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    generation.end({ output: "empty response", level: "ERROR" });
    throw new Error("LLM returned no content");
  }

  generation.end({
    output: content,
    usage: {
      input: json?.usage?.prompt_tokens,
      output: json?.usage?.completion_tokens,
    },
  });

  return content;
}

// ── Default system prompt ───────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are a Montessori school assistant generating a weekly classroom digest email for school administrators.

You will receive structured data about one or more classrooms including:
- Teacher note-taking activity for the past 7 days (observation counts and lesson note counts)
- Student escalations (behavioral flags with severity levels)

Your job is to produce a concise, actionable HTML email body. Guidelines:

1. **Red-flagged students must be prominently called out.** Use bold text, warning colors, or visual emphasis. These are urgent and must not be missed.
2. **Escalated students (medium/high severity) should be highlighted.** Group by classroom, sorted by severity.
3. **Teacher activity:** Note who has been active and who hasn't. If a teacher has zero notes, call this out explicitly — the admin may want to follow up.
4. **Tone:** Professional but warm. You are a co-pilot for the manager, not a cold report generator. Be concise and actionable.
5. **Structure:** Use your judgment based on the data. A classroom where everything is fine gets a brief note. A classroom with 3 red flags and inactive teachers gets detailed attention.
6. **Format:** Output valid HTML suitable for email (no <html>, <head>, or <body> tags — just the inner content). Use inline styles for emphasis. Keep it mobile-friendly.
7. **Do not invent information.** Only reference data provided to you.
8. **Keep it brief.** Admins are busy. Lead with what needs attention.`;

// ── Scheduled Cloud Function ────────────────────────────────────────

export const weeklyDigest = functions
  .region("asia-south1")
  .runWith({
    timeoutSeconds: 540,
    memory: "512MB",
    secrets: [OPENROUTER_API_KEY, SENDGRID_API_KEY],
  })
  .pubsub.schedule("0 18 * * 0") // Sunday 6:00 PM IST
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const langfuse = new Langfuse();

    const trace = langfuse.trace({
      name: "weekly-digest",
      metadata: { triggeredAt: new Date().toISOString() },
    });

    try {
      // 1. Fetch config
      const config = await fetchDigestConfig();
      trace.span({ name: "config-loaded", input: {
        model: config.model,
        temperature: config.temperature,
      }});

      // 2. Resolve recipients (both roles)
      const [classroomAdmins, superAdmins] = await Promise.all([
        fetchClassroomAdminRecipients(),
        fetchSuperAdminRecipients(),
      ]);
      trace.span({
        name: "recipients-resolved",
        metadata: {
          classroomAdmins: classroomAdmins.length,
          superAdmins: superAdmins.length,
        },
      });

      if (classroomAdmins.length === 0 && superAdmins.length === 0) {
        console.log("[weeklyDigest] No recipients found, skipping.");
        trace.update({ output: "No recipients" });
        await langfuse.flushAsync();
        return null;
      }

      // 3. Collect all unique classrooms across all recipients
      const adminClassroomIds = [
        ...new Set(classroomAdmins.flatMap((r) => r.manageableClassrooms)),
      ];
      // Superadmins need ALL active classrooms
      const allClassroomsSnap = await db
        .collection("classrooms")
        .where("status", "==", "active")
        .get();
      const allClassroomIds = [
        ...new Set([
          ...adminClassroomIds,
          ...allClassroomsSnap.docs.map((d) => d.id),
        ]),
      ];

      // 4. Fetch data
      const dataSpan = trace.span({ name: "data-assembly" });
      const studentClassroomMap =
        await fetchStudentClassroomMap(allClassroomIds);
      const [statsDocs, escalationsByClassroom] = await Promise.all([
        fetchStatsCacheDocs(allClassroomIds),
        fetchEscalations(allClassroomIds, studentClassroomMap),
      ]);
      dataSpan.end();

      let sentCount = 0;
      let errorCount = 0;

      // Helper: generate + send one digest email
      const sendDigest = async (email, classroomIds, label, parentSpan) => {
        const span = parentSpan.span({
          name: label,
          input: { classrooms: classroomIds },
        });
        try {
          const classroomDataList = classroomIds.map((cid) =>
            assembleClassroomData(
              cid,
              statsDocs.get(cid) || null,
              escalationsByClassroom.get(cid) || []
            )
          );
          const agentContext = buildAgentContext(classroomDataList);
          const emailBody = await generateDigestEmail(
            config.systemPrompt,
            agentContext,
            config,
            span
          );
          const hasAnyRedFlags = classroomDataList.some(
            (cd) => cd.hasRedFlags
          );
          const classroomName = classroomDataList.length === 1
            ? classroomDataList[0].classroomName
            : null;
          const subject = hasAnyRedFlags
            ? classroomName
              ? `⚠️ ${classroomName} — Weekly Digest — Action Required`
              : "⚠️ Weekly Classroom Digest — Action Required"
            : classroomName
              ? `${classroomName} — Weekly Digest`
              : "Weekly Classroom Digest";

          await sendEmail({ to: email, subject, html: emailBody });
          span.end({ output: "sent" });
          sentCount++;
        } catch (err) {
          console.error(`[weeklyDigest] Error for ${email} (${label}):`, err.message);
          span.end({ output: err.message, level: "ERROR" });
          errorCount++;
        }
      };

      // 5. Classroomadmins: one email PER classroom
      const adminJobs = [];
      for (const admin of classroomAdmins) {
        for (const cid of admin.manageableClassrooms) {
          adminJobs.push({ email: admin.email, classroomIds: [cid], label: `admin-${admin.email}-${cid}` });
        }
      }
      const adminSpan = trace.span({ name: "classroomadmin-digests", metadata: { jobCount: adminJobs.length } });
      await runWithConcurrency(
        adminJobs,
        (job) => sendDigest(job.email, job.classroomIds, job.label, adminSpan),
        3
      );
      adminSpan.end();

      // 6. Superadmins: one consolidated email with ALL classrooms
      const allActiveClassroomIds = allClassroomsSnap.docs.map((d) => d.id);
      const superSpan = trace.span({ name: "superadmin-digests", metadata: { count: superAdmins.length } });
      await runWithConcurrency(
        superAdmins,
        (sa) => sendDigest(sa.email, allActiveClassroomIds, `super-${sa.email}`, superSpan),
        3
      );
      superSpan.end();

      const summary = {
        sentCount,
        errorCount,
        classroomAdminEmails: adminJobs.length,
        superAdminEmails: superAdmins.length,
      };
      console.log("[weeklyDigest] Complete:", JSON.stringify(summary));
      trace.update({ output: summary });
      await langfuse.flushAsync();
      return summary;
    } catch (err) {
      console.error("[weeklyDigest] Fatal error:", err);
      trace.update({ output: err.message, level: "ERROR" });
      await langfuse.flushAsync();
      return null;
    }
  });
