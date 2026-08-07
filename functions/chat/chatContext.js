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

function countFullySerializedItems(items, limit) {
  let length = 1; // Opening array bracket.
  let included = 0;
  for (const item of items) {
    const itemLength = JSON.stringify(item).length;
    const nextLength = length + (included ? 1 : 0) + itemLength + 1;
    if (nextLength > limit) break;
    length = nextLength - 1;
    included += 1;
  }
  return included;
}

function messageTimeValue(message) {
  const value = message.createdAt || message.timestamp || 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return String(value);
}

async function measured(telemetry, name, operation) {
  const end = telemetry?.startStage?.(name) || (() => {});
  try {
    return await operation();
  } finally {
    end();
  }
}

async function queryMessagesByTime(ref, field, limit, telemetry) {
  const snap = await measured(
    telemetry,
    field === "createdAt" ? "history_createdAt_query" : "history_timestamp_query",
    () => ref.orderBy(field, "desc").limit(limit).get(),
  );
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function loadObservationContext({ db, studentId, limit, telemetry }) {
  let query = refStudent(db, studentId)
    .collection("observations")
    .orderBy("observedAt", "desc");
  if (limit !== "all" && Number.isFinite(limit)) query = query.limit(limit);
  const endQuery = telemetry?.startStage?.("observation_query") || (() => {});
  let snap;
  try {
    snap = await query.get();
  } finally {
    endQuery(snap ? { observationsFetched: snap.docs.length } : {});
  }
  const observations = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      type: data.type || "text",
      text: data.text || data.description || "",
      observedAt: data.observedAt || data.createdAt || null,
    };
  });
  const serialized = JSON.stringify(observations);
  const result = trimContext(serialized, MAX_CONTEXT_CHARS);
  const observationsIncluded = serialized.length <= MAX_CONTEXT_CHARS
    ? observations.length
    : countFullySerializedItems(observations, MAX_CONTEXT_CHARS);
  telemetry?.setDimensions?.({
    observationsFetched: observations.length,
    observationsIncluded,
    observationsDiscarded: observations.length - observationsIncluded,
    observationChars: result.length,
    observationTruncationReason: serialized.length > MAX_CONTEXT_CHARS ? "character_limit" : "none",
  });
  return result;
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

Response formatting:
- Use standard Markdown.
- Ordered lists must use \`1.\` markers, never \`1)\`.
- Indent nested bullets under their numbered item.

This conversation is only about ${studentName}.
The app information available to you here belongs only to ${studentName}. You should not choose, guess, or switch to another child.

If a teacher asks you to fetch, compare, analyze, or answer from private app information about another child, say in simple language: "I can only look up ${studentName}'s information here. Please open that child's chat to ask about them." Do not pretend to have fetched another child's information, and do not infer another child's data from ${studentName}'s context.

Use the available information sources when current context is insufficient. Be concise, specific, and grounded in the returned evidence.${soulBlock}`;
}

export async function loadStudentContext({ db, studentId, telemetry }) {
  const studentRef = refStudent(db, studentId);
  const [studentSnap, soulSnap] = await Promise.all([
    measured(telemetry, "student_context_load", () => studentRef.get()),
    measured(telemetry, "soul_context_load", () => studentRef.collection("ai_summaries").doc("soul").get()),
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
  telemetry,
}) {
  const messagesRef = refStudent(db, studentId)
    .collection("chats")
    .doc(chatId)
    .collection("messages");
  // Firestore orderBy excludes documents where the field is absent. Read both
  // generations so timestamp-only legacy transcripts remain visible without a
  // destructive migration.
  const [createdAtMessages, timestampMessages] = await Promise.all([
    queryMessagesByTime(messagesRef, "createdAt", limit, telemetry),
    queryMessagesByTime(messagesRef, "timestamp", limit, telemetry),
  ]);
  const byId = new Map();
  for (const message of [...createdAtMessages, ...timestampMessages]) {
    byId.set(message.id, message);
  }

  const result = [...byId.values()]
    .filter((message) => !excludeMessageIds.has(message.id))
    .filter((message) => ["user", "assistant"].includes(message.role) && typeof message.content === "string")
    .sort((a, b) => {
      const left = messageTimeValue(a);
      const right = messageTimeValue(b);
      return left < right ? -1 : left > right ? 1 : 0;
    })
    .slice(-limit)
    .map((message) => ({ role: message.role, content: trimContext(message.content, 4000) }));
  telemetry?.setDimensions?.({
    historyFetched: createdAtMessages.length + timestampMessages.length,
    historyIncluded: result.length,
    historyChars: result.reduce((total, message) => total + message.content.length, 0),
  });
  return result;
}

export async function buildChatMessages({
  db,
  studentId,
  chatId,
  currentMessage,
  userMessageId,
  basePrompt,
  historyLimit = DEFAULT_HISTORY_LIMIT,
  observationLimit = 20,
  telemetry,
}) {
  const [{ student, soul }, history, observations] = await Promise.all([
    loadStudentContext({ db, studentId, telemetry }),
    loadChatMessages({
      db,
      studentId,
      chatId,
      excludeMessageIds: new Set([userMessageId]),
      limit: historyLimit,
      telemetry,
    }),
    loadObservationContext({ db, studentId, limit: observationLimit, telemetry }),
  ]);

  const endPrompt = telemetry?.startStage?.("prompt_construction") || (() => {});
  const systemPrompt = buildScopedSystemPrompt({ basePrompt, student, soul });
  const observationBlock = observations && observations !== "[]"
    ? `\n\nConfigured recent observation context:\n${observations}`
    : "";

  const messages = [
    { role: "system", content: `${systemPrompt}${observationBlock}` },
    ...history,
    { role: "user", content: currentMessage },
  ];
  const promptChars = messages.reduce((total, message) => total + String(message.content || "").length, 0);
  endPrompt({ promptMessageCount: messages.length, promptChars });
  telemetry?.setDimensions?.({ promptMessageCount: messages.length, promptChars });
  return messages;
}
