/**
 * PEP-223: Interview session utilities
 *
 * Pure functions for interview message construction, question counting,
 * and timing. The React hook (useInterviewSession) wraps these with
 * state management and Cloud Function calls.
 */

export function buildMessageHistory(turns, kickoffMessage) {
  const messages = [{ role: "user", content: kickoffMessage }];
  for (const turn of turns) {
    if (turn.type === "question") {
      messages.push({ role: "assistant", content: turn.rawContent });
    } else if (turn.type === "answer") {
      messages.push({ role: "user", content: turn.answer });
    }
  }
  return messages;
}

export function getQuestionCount(turns) {
  if (!turns) return 0;
  return turns.filter((t) => t.type === "question").length;
}

export function serializeConversations(conversations) {
  return JSON.stringify(conversations, null, 2);
}

export function getElapsedMinutes(startTime) {
  if (!startTime) return 0;
  return Math.round(((Date.now() - startTime) / 60000) * 10) / 10;
}
