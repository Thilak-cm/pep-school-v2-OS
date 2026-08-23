import { buildStudentProfile, renderSystemPrompt } from "./promptAssembly.js";

const DEFAULT_HISTORY_LIMIT = 12;

function refStudent(db, studentId) {
  return db.collection("students").doc(studentId);
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

export async function loadObservationContext({ db, studentId, limit, windowDays = null, telemetry }) {
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
  const cutoff = Number.isFinite(windowDays)
    ? Date.now() - windowDays * 24 * 60 * 60 * 1000
    : null;
  const observations = snap.docs.filter((doc) => {
    const data = doc.data() || {};
    return data.type !== "assessment" && !data.assessmentKind;
  }).map((doc) => {
    const data = doc.data() || {};
    return {
      type: data.type || "text",
      text: data.text || data.description || "",
      observedAt: data.observedAt || data.createdAt || null,
    };
  }).filter((observation) => {
    if (cutoff === null || !observation.observedAt) return true;
    const value = typeof observation.observedAt.toMillis === "function"
      ? observation.observedAt.toMillis()
      : new Date(observation.observedAt).getTime();
    return !Number.isFinite(value) || value >= cutoff;
  });
  const serialized = JSON.stringify(observations);
  telemetry?.setDimensions?.({
    observationsFetched: observations.length,
    observationsIncluded: observations.length,
    observationsDiscarded: 0,
    observationChars: serialized.length,
    observationTruncationReason: "none",
  });
  return serialized;
}

export function buildScopedSystemPrompt({
  configuredSystemPrompt,
  basePrompt,
  student,
  soul = "",
  classroomName,
  programName,
  observationWindowDays = 30,
  recentObservations = "No recent observations are available.",
  now,
}) {
  const template = configuredSystemPrompt || basePrompt;
  const studentName = student?.displayName || student?.name
    || [student?.firstName, student?.lastName].filter(Boolean).join(" ").trim()
    || "this student";
  return renderSystemPrompt(template, {
    studentName,
    studentProfile: buildStudentProfile({
      ...student,
      classroomName,
      programName,
    }, now || new Date()),
    developmentSummary: String(soul || "No development summary is available.").trim(),
    recentObservations,
    observationWindowDays,
  });
}

export async function loadStudentContext({ db, studentId, telemetry }) {
  const studentRef = refStudent(db, studentId);
  const studentSnap = await measured(telemetry, "student_context_load", () => studentRef.get());
  const student = studentSnap.exists ? studentSnap.data() || {} : {};
  const classroomSnap = student.classroomId
    ? await measured(telemetry, "classroom_context_load", () => db.collection("classrooms").doc(student.classroomId).get())
    : null;
  const [soulSnap] = await Promise.all([
    measured(telemetry, "soul_context_load", () => studentRef.collection("ai_summaries").doc("soul").get()),
  ]);
  const soul = soulSnap.exists ? (soulSnap.data()?.content || "") : "";
  const classroom = classroomSnap?.exists ? classroomSnap.data() || {} : null;
  if (!classroom?.name && student.classroomId) {
    throw new Error("Authoritative classroom data is unavailable");
  }
  if (student.classroomId && !classroom.programId) {
    throw new Error("Authoritative classroom program is unavailable");
  }
  return {
    student,
    soul,
    classroomName: classroom?.name || classroom?.displayName || null,
    programName: classroom?.programName || classroom?.programId || null,
  };
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
    .map((message) => ({ role: message.role, content: message.content.trim() }));
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
  observationWindowDays = 30,
  telemetry,
}) {
  const [{ student, soul, classroomName, programName }, history, observations] = await Promise.all([
    loadStudentContext({ db, studentId, telemetry }),
    loadChatMessages({
      db,
      studentId,
      chatId,
      excludeMessageIds: new Set([userMessageId]),
      limit: historyLimit,
      telemetry,
    }),
    loadObservationContext({ db, studentId, limit: "all", windowDays: observationWindowDays, telemetry }),
  ]);

  const endPrompt = telemetry?.startStage?.("prompt_construction") || (() => {});
  const systemPrompt = buildScopedSystemPrompt({
    configuredSystemPrompt: basePrompt,
    student,
    soul,
    classroomName,
    programName,
    observationWindowDays,
    recentObservations: observations && observations !== "[]"
      ? observations
      : "No recent observations are available.",
  });

  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: currentMessage },
  ];
  const promptChars = messages.reduce((total, message) => total + String(message.content || "").length, 0);
  endPrompt({ promptMessageCount: messages.length, promptChars });
  telemetry?.setDimensions?.({ promptMessageCount: messages.length, promptChars });
  return messages;
}
