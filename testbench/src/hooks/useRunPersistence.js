/**
 * PEP-223: Run persistence utilities
 *
 * Pure functions for save payload construction, run restoration,
 * and session naming. The React hook (useRunPersistence) wraps these
 * with Firestore calls and state management.
 */
import { createVariant, FRONTIER_MODEL } from "../utils/variantHelpers.js";

// --- Pure functions (tested) ---

export function buildSessionNameField(sessionName) {
  const trimmed = (sessionName || "").trim();
  return trimmed || undefined;
}

export function getRunLabel(run) {
  return run.sessionName?.trim() || run.studentName || "";
}

export function buildSavePayload({ featureId, selectedStudent, variants, conversations, sessionName, kickoffMessage, interviewMode, selectedAreas, user }) {
  const isInterview = featureId === "interview_question_gen";
  const trimmedName = buildSessionNameField(sessionName);

  return {
    feature: featureId,
    studentId: selectedStudent.id,
    studentName: selectedStudent.displayName,
    ...(trimmedName ? { sessionName: trimmedName } : {}),
    variants: variants.map((v, idx) => ({
      name: v.name,
      prompt: {
        systemPrompt: v.systemPrompt,
        ...(v.guidelinesContent ? { guidelinesContent: v.guidelinesContent } : {}),
        model: v.model,
        temperature: v.temperature,
        max_tokens: v.max_tokens,
      },
      output: v.output || "",
      ...(isInterview && conversations[idx] ? { conversation: conversations[idx] } : {}),
      rating: v.rating,
      notes: v.notes,
    })),
    ...(isInterview ? { kickoffMessage } : {}),
    ...(isInterview && interviewMode ? { interviewMode } : {}),
    ...(isInterview && selectedAreas?.length ? { selectedAreas } : {}),
    ranBy: { uid: user?.uid, name: user?.displayName || user?.email },
  };
}

export function restoreVariantsFromRun(run) {
  return (run.variants || []).map((v, i) => ({
    ...createVariant(null, i),
    name: v.name,
    systemPrompt: v.prompt?.systemPrompt || "",
    guidelinesContent: v.prompt?.guidelinesContent || "",
    model: v.prompt?.model || FRONTIER_MODEL,
    temperature: v.prompt?.temperature ?? 0.3,
    max_tokens: v.prompt?.max_tokens || 2000,
    output: v.output || null,
    rating: v.rating ?? 5,
    notes: v.notes || "",
  }));
}

export function restoreConversationsFromRun(run) {
  const convos = {};
  (run.variants || []).forEach((v, i) => {
    if (v.conversation) convos[i] = v.conversation;
  });
  return convos;
}
