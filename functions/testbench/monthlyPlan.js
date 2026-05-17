/**
 * Test Bench: Monthly Plan generation with caller-supplied prompt (PEP-235).
 *
 * Fetches student data, 4 months of observations, and writing analysis,
 * then calls the LLM via OpenRouter to generate a structured monthly plan.
 */
import * as functions from "firebase-functions/v1";
import { db } from "../shared/firebase.js";
import { buildChatBody } from "../shared/openai.js";
import { OPENROUTER_ENDPOINT } from "../shared/openrouter.js";
import { calculateAge } from "../utils/handwritingAnalysisHelpers.js";
import { getModelSupportsJson } from "../config/testBenchModels.js";

/**
 * Serialize a single observation into a text line for the prompt.
 */
export function serializeObservation(obs) {
  const date = obs.observedAt?.toDate?.()
    ?? (obs.observedAt ? new Date(obs.observedAt) : null);
  const dateStr = date ? date.toISOString().slice(0, 10) : "unknown date";
  const type = obs.type || "text";

  const parts = [`[${dateStr}] (${type})`];

  if (type === "lesson") {
    if (obs.lessonTitle) parts.push(obs.lessonTitle);
    if (obs.lessonDescription) parts.push(`— ${obs.lessonDescription}`);
    if (obs.ratings) {
      const ratingStr = Object.entries(obs.ratings)
        .map(([dim, val]) => `${dim}: ${val}`)
        .join(", ");
      if (ratingStr) parts.push(`[Ratings: ${ratingStr}]`);
    }
    if (obs.studentComment) parts.push(`Teacher comment: ${obs.studentComment}`);
    if (obs.groupComment) parts.push(`Group comment: ${obs.groupComment}`);
  } else {
    if (obs.text) parts.push(obs.text);
  }

  if (obs.createdByName) parts.push(`(by ${obs.createdByName})`);

  return parts.join(" ");
}

/**
 * Serialize a media doc into a text line for the prompt.
 */
export function serializeMedia(media) {
  const date = media.observedAt?.toDate?.()
    ?? (media.observedAt ? new Date(media.observedAt) : null);
  const dateStr = date ? date.toISOString().slice(0, 10) : "unknown date";
  const kind = media.mediaKind || "photo";

  const parts = [`[${dateStr}] (media/${kind})`];
  if (media.curriculumArea) parts.push(`[${media.curriculumArea}]`);
  if (media.teacherComment) parts.push(media.teacherComment);
  if (media.createdByName) parts.push(`(by ${media.createdByName})`);

  return parts.join(" ");
}

/**
 * Format writing analysis document into prompt text.
 */
export function formatWritingAnalysis(analysis) {
  if (!analysis) return "No writing analysis available for this student.";

  const parts = [];
  if (analysis.narrative) parts.push(analysis.narrative);

  if (analysis.dimensionRatings) {
    parts.push("\nDimension Ratings:");
    for (const [dim, info] of Object.entries(analysis.dimensionRatings)) {
      const score = info.score != null ? `${info.score}/5` : "n/a";
      const trend = info.trend || "unknown";
      parts.push(`  ${dim}: ${score} (${trend})${info.evidence ? ` — ${info.evidence}` : ""}`);
    }
  }

  if (analysis.improvements?.length) {
    parts.push(`\nImprovements: ${analysis.improvements.join("; ")}`);
  }
  if (analysis.concerns?.length) {
    parts.push(`Concerns: ${analysis.concerns.join("; ")}`);
  }
  if (analysis.recommendations?.length) {
    parts.push(`Recommendations: ${analysis.recommendations.join("; ")}`);
  }

  return parts.join("\n");
}

export async function testBenchMonthlyPlan({ studentId, systemPrompt, model, temperature, maxTokens, apiKey }) {
  // 1. Fetch student doc
  const studentSnap = await db.collection("students").doc(studentId).get();
  if (!studentSnap.exists) {
    throw new functions.https.HttpsError("not-found", `Student ${studentId} not found`);
  }
  const studentData = studentSnap.data();
  const dob = studentData.dateOfBirth?.toDate?.()
    ?? (studentData.dateOfBirth ? new Date(studentData.dateOfBirth) : null);
  const now = new Date();
  const age = calculateAge(dob, now);
  const ageStr = age ? `${age.years}y ${age.months}m` : "unknown age";
  const programId = studentData.programId || "unknown";

  // 2. Fetch observations, media, and writing analysis in parallel
  const fourMonthsAgo = new Date(now);
  fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);

  const [obsSnap, mediaSnap, writingSnap] = await Promise.all([
    db.collection("students").doc(studentId)
      .collection("observations")
      .where("observedAt", ">=", fourMonthsAgo)
      .orderBy("observedAt", "desc")
      .get(),
    db.collection("students").doc(studentId)
      .collection("media")
      .where("observedAt", ">=", fourMonthsAgo)
      .orderBy("observedAt", "desc")
      .get(),
    db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("writing_analysis").get(),
  ]);

  const observations = obsSnap.docs.map((d) => d.data());
  const mediaDocs = mediaSnap.docs.map((d) => d.data());
  const writingAnalysis = writingSnap.exists ? writingSnap.data() : null;

  // 4. Build user prompt
  const targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const userPromptParts = [
    `Student: ${studentData.displayName || studentId}`,
    `Student ID: ${studentId}`,
    `Age: ${ageStr}`,
    `Program: ${programId}`,
    `Target Month: ${targetMonth}`,
    "",
    "=== Writing Analysis ===",
    formatWritingAnalysis(writingAnalysis),
    "",
    `=== Observations (${observations.length} notes, most recent first) ===`,
  ];

  for (const obs of observations) {
    userPromptParts.push(serializeObservation(obs));
  }

  if (observations.length === 0) {
    userPromptParts.push("(No observations found in the last 4 months)");
  }

  userPromptParts.push("");
  userPromptParts.push(`=== Media Notes (${mediaDocs.length} items, most recent first) ===`);
  for (const media of mediaDocs) {
    userPromptParts.push(serializeMedia(media));
  }
  if (mediaDocs.length === 0) {
    userPromptParts.push("(No media notes found in the last 4 months)");
  }

  const userPrompt = userPromptParts.join("\n");

  // 5. Call LLM via OpenRouter
  const supportsJson = getModelSupportsJson(model);
  const body = buildChatBody({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    max_completion_tokens: maxTokens,
    ...(supportsJson ? { response_format: { type: "json_object" } } : {}),
  });

  let response;
  try {
    response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[testBenchMonthlyPlan] network error", err);
    throw new functions.https.HttpsError("unavailable", "AI service unavailable: " + (err.message || "network error"));
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new functions.https.HttpsError("internal", `LLM error: ${response.status} — ${errText?.slice?.(0, 200)}`);
  }

  const json = await response.json().catch(() => {
    throw new functions.https.HttpsError("internal", "LLM returned non-JSON response");
  });
  const rawContent = json?.choices?.[0]?.message?.content?.trim();
  const totalTokens = json?.usage?.total_tokens || 0;

  console.log(`[testBenchMonthlyPlan] ${studentId}: ${observations.length} obs, ${mediaDocs.length} media, ${totalTokens} tokens`);

  return { output: rawContent || "(empty response)", totalTokens };
}
