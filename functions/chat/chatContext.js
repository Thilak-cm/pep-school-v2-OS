const DEFAULT_HISTORY_LIMIT = 12;
const MAX_CONTEXT_CHARS = 12000;

function refStudent(db, studentId) {
  return db.collection("students").doc(studentId);
}

function trimContext(text, limit = MAX_CONTEXT_CHARS) {
  const value = String(text || "").trim();
  if (value.length <= limit) return value;
  return value.slice(0, limit);
}

function messageTimeValue(message) {
  const value = message.createdAt || message.timestamp || 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return String(value);
}

export function buildScopedSystemPrompt({
  basePrompt,
  student,
  soul = "",
}) {
  const studentName = student?.name || student?.firstName || "this student";
  const soulBlock = soul
    ? `\n\nCurrent student soul narrative:\n${trimContext(soul)}`
    : "";

  return `Communication style:
- Write for teachers in simple, warm, non-technical English.
- Keep the tone practical and calm. Avoid sounding like a policy notice.
- Do not use technical words like "scoped", "backend", "schema", "tool", "function", or "prompt" in replies to teachers.
- If you cannot help with a request, explain it plainly and offer the next helpful step.

${basePrompt}

This conversation is only about ${studentName}.
The app information available to you here belongs only to ${studentName}. You should not choose, guess, or switch to another child.

If a teacher asks you to fetch, compare, analyze, or answer from private app information about another child, say in simple language: "I can only look up ${studentName}'s information here. Please open that child's chat to ask about them." Do not pretend to have fetched another child's information, and do not infer another child's data from ${studentName}'s context.

Use the available information sources when current context is insufficient. Be concise, specific, and grounded in the returned evidence.${soulBlock}`;
}

export async function loadStudentContext({ db, studentId }) {
  const studentRef = refStudent(db, studentId);
  const [studentSnap, soulSnap] = await Promise.all([
    studentRef.get(),
    studentRef.collection("ai_summaries").doc("soul").get(),
  ]);
  const student = studentSnap.exists ? studentSnap.data() || {} : {};
  const soul = soulSnap.exists ? (soulSnap.data()?.content || "") : "";
  return { student, soul };
}

export async function loadChatMessages({
  db,
  studentId,
  chatId,
  excludeMessageIds = new Set(),
  limit = DEFAULT_HISTORY_LIMIT,
}) {
  const snap = await refStudent(db, studentId)
    .collection("chats")
    .doc(chatId)
    .collection("messages")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snap.docs
    .filter((doc) => !excludeMessageIds.has(doc.id))
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((message) => ["user", "assistant"].includes(message.role) && typeof message.content === "string")
    .sort((a, b) => {
      const left = messageTimeValue(a);
      const right = messageTimeValue(b);
      return left < right ? -1 : left > right ? 1 : 0;
    })
    .map((message) => ({ role: message.role, content: trimContext(message.content, 4000) }));
}

export async function buildChatMessages({
  db,
  studentId,
  chatId,
  currentMessage,
  userMessageId,
  basePrompt,
  historyLimit = DEFAULT_HISTORY_LIMIT,
}) {
  const [{ student, soul }, history] = await Promise.all([
    loadStudentContext({ db, studentId }),
    loadChatMessages({
      db,
      studentId,
      chatId,
      excludeMessageIds: new Set([userMessageId]),
      limit: historyLimit,
    }),
  ]);

  return [
    { role: "system", content: buildScopedSystemPrompt({ basePrompt, student, soul }) },
    ...history,
    { role: "user", content: currentMessage },
  ];
}
