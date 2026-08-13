const REQUIRED_PROMPT_VARIABLES = [
  "studentName",
  "studentProfile",
  "developmentSummary",
  "recentObservations",
  "observationWindowDays",
];

const BLOCK_VARIABLES = new Set([
  "studentProfile",
  "developmentSummary",
  "recentObservations",
  "observationWindowDays",
]);

function variableNames(template) {
  return [...String(template || "").matchAll(/{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g)]
    .map((match) => match[1]);
}

export function validateSystemPromptTemplate(template) {
  if (typeof template !== "string" || !template.trim()) {
    return { valid: false, error: "systemPrompt is missing" };
  }
  const names = variableNames(template);
  const unsupported = names.filter((name) => !REQUIRED_PROMPT_VARIABLES.includes(name));
  if (unsupported.length) {
    return { valid: false, error: `systemPrompt contains unsupported variables: ${unsupported.join(", ")}` };
  }
  const missing = REQUIRED_PROMPT_VARIABLES.filter((name) => !names.includes(name));
  if (missing.length) {
    return { valid: false, error: `systemPrompt is missing variables: ${missing.join(", ")}` };
  }
  const repeatedBlocks = [...BLOCK_VARIABLES].filter((name) => names.filter((item) => item === name).length !== 1);
  if (repeatedBlocks.length) {
    return { valid: false, error: `systemPrompt block variables must occur exactly once: ${repeatedBlocks.join(", ")}` };
  }
  const unresolved = String(template).replace(/{{\s*[A-Za-z][A-Za-z0-9_]*\s*}}/g, "");
  if (/{{|}}/.test(unresolved)) {
    return { valid: false, error: "systemPrompt contains unresolved variables" };
  }
  return { valid: true };
}

export function renderSystemPrompt(template, values) {
  const validation = validateSystemPromptTemplate(template);
  if (!validation.valid) throw new Error(validation.error);
  return String(template).replace(/{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g, (_, name) => {
    if (values[name] === undefined || values[name] === null) {
      throw new Error(`Missing system prompt value: ${name}`);
    }
    return String(values[name]);
  });
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (Number.isFinite(value.seconds)) return new Date(value.seconds * 1000);
  return null;
}

function dateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, Number(value)]));
}

function elapsed(startValue, now, timeZone = "Asia/Kolkata") {
  const start = toDate(startValue);
  if (!start) return "unavailable";
  const from = dateParts(start, timeZone);
  const to = dateParts(now, timeZone);
  let years = to.year - from.year;
  let months = to.month - from.month;
  if (to.day < from.day) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return "unavailable";
  if (years === 0 && months === 0) {
    const days = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86400000));
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  const result = [];
  if (years) result.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months) result.push(`${months} ${months === 1 ? "month" : "months"}`);
  return result.join(", ");
}

export function buildStudentProfile(student = {}, now = new Date(), timeZone = "Asia/Kolkata") {
  const name = student.displayName || student.name || [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || "unavailable";
  return [
    `Name: ${name}`,
    `Age: ${elapsed(student.dateOfBirth, now, timeZone)}`,
    `Classroom: ${student.classroomName || "unavailable"}`,
    `Program: ${student.programName || "unavailable"}`,
    `Time at Pep: ${elapsed(student.createdAt, now, timeZone)}`,
  ].join("\n");
}

export { REQUIRED_PROMPT_VARIABLES };
