const MAX_MESSAGE_LENGTH = 20_000;

export function parseChatRequest(body = {}) {
  const required = ["studentId", "chatId", "turnId", "runId", "userMessageId"];
  for (const field of required) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      throw new Error(`${field} is required`);
    }
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) throw new Error("message is required");
  if (message.length > MAX_MESSAGE_LENGTH) throw new Error("message is too long");

  return {
    studentId: body.studentId.trim(),
    chatId: body.chatId.trim(),
    turnId: body.turnId.trim(),
    runId: body.runId.trim(),
    userMessageId: body.userMessageId.trim(),
    message,
  };
}

export { MAX_MESSAGE_LENGTH };
