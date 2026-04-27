import * as functions from "firebase-functions/v1";
import { db } from "./firebase.js";

const normalizeTimestampValue = (ts) => {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  if (ts instanceof Date) return ts;
  return null;
};

const chooseObservationTimestamp = (obs) => {
  return normalizeTimestampValue(obs?.observedAt) ||
    normalizeTimestampValue(obs?.timestamp) ||
    normalizeTimestampValue(obs?.createdAt) ||
    null;
};

function formatObservationForPrompt(obs) {
  const ts = chooseObservationTimestamp(obs);
  return {
    type: obs.type || "",
    text: obs.text || "",
    lessonTitle: obs.lessonTitle || obs.title || "",
    lessonDescription: obs.lessonDescription || obs.description || "",
    groupComment: obs.groupComment || "",
    studentComment: obs.studentComment || "",
    createdByName: obs.createdByName || obs.teacherName || "",
    observedAt: ts ? ts.toISOString() : null,
    ratings: obs.ratings || obs.dimensionRatings || {},
    dimensionOrder: obs.dimensionOrder || [],
    attendanceStatus: obs.attendanceStatus || "",
  };
}

async function fetchStudentNotesForWindow(studentId, windowDays) {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const notesMap = new Map();
  const studentObsRef = db.collection("students").doc(studentId).collection("observations");

  const collect = async (field) => {
    try {
      const snap = await studentObsRef.where(field, ">=", cutoff).get();
      snap.docs.forEach((doc) => {
        notesMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
    } catch (err) {
      console.warn(`[studentHelpers] query failed for field ${field} student ${studentId}:`, err);
    }
  };

  await collect("observedAt");
  await collect("createdAt");
  await collect("timestamp");

  const notes = Array.from(notesMap.values()).filter((n) => {
    const ts = chooseObservationTimestamp(n);
    return ts && ts >= cutoff;
  });

  notes.sort((a, b) => {
    const ta = chooseObservationTimestamp(a);
    const tb = chooseObservationTimestamp(b);
    return (tb?.getTime() || 0) - (ta?.getTime() || 0);
  });

  return notes;
}

async function fetchStudentInterviews(studentId, windowDays) {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const interviewsRef = db.collection("students").doc(studentId).collection("interviews");

  try {
    const snap = await interviewsRef
      .where("status", "==", "completed")
      .where("conductedAt", ">=", cutoff)
      .orderBy("conductedAt", "desc")
      .get();

    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.warn(`[studentHelpers] interview fetch failed for ${studentId}:`, err);
    return [];
  }
}

function formatDobForContext(dobValue) {
  const dobDate = normalizeTimestampValue(dobValue);
  return dobDate ? dobDate.toISOString().split("T")[0] : "dob unavailable in context";
}

function calculateAgeFromDob(dobValue) {
  const dobDate = normalizeTimestampValue(dobValue);
  if (!dobDate) {
    return "age unavailable";
  }

  const today = new Date();
  const birthDate = new Date(dobDate);

  // Calculate years
  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  let days = today.getDate() - birthDate.getDate();

  // Adjust for negative days
  if (days < 0) {
    months--;
    // Get days in the previous month
    const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    days += lastMonth.getDate();
  }

  // Adjust for negative months
  if (months < 0) {
    years--;
    months += 12;
  }

  // Build age string
  const parts = [];
  if (years > 0) {
    parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  }
  if (months > 0) {
    parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  }
  if (days > 0 || parts.length === 0) {
    parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  }

  return parts.length > 0 ? `${parts.join(" ")} old` : "age unavailable";
}

async function getStudentContext(studentId) {
  try {
    const snap = await db.collection("students").doc(studentId).get();
    if (!snap.exists) {
      return { studentName: "Unknown student", dob: "dob unavailable in context", age: "age unavailable" };
    }
    const data = snap.data() || {};
    const fallbackName = [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
    const studentName = data.displayName || data.name || fallbackName || "Unknown student";
    const dob = formatDobForContext(data.dob);
    const age = calculateAgeFromDob(data.dob);
    return { studentName, dob, age };
  } catch (err) {
    console.warn(`[studentHelpers] failed to fetch student context for ${studentId}:`, err);
    return { studentName: "Unknown student", dob: "dob unavailable in context", age: "age unavailable" };
  }
}

async function getStudentWithProgram(studentId) {
  const studentSnap = await db.collection("students").doc(studentId).get();
  if (!studentSnap.exists) {
    throw new functions.https.HttpsError("not-found", `Student not found: ${studentId}`);
  }
  const studentData = studentSnap.data() || {};
  const classroomId = studentData.classroomId;

  let programId = null;
  if (classroomId) {
    const classroomSnap = await db.collection("classrooms").doc(classroomId).get();
    if (classroomSnap.exists) {
      programId = classroomSnap.data()?.programId || null;
    }
  }

  const fallbackName = [studentData.firstName, studentData.lastName].filter(Boolean).join(" ").trim();
  const studentName = studentData.displayName || studentData.name || fallbackName || "Unknown student";
  const dob = formatDobForContext(studentData.dob);
  const age = calculateAgeFromDob(studentData.dob);

  return { studentName, dob, age, programId, classroomId };
}

export {
  normalizeTimestampValue,
  chooseObservationTimestamp,
  formatObservationForPrompt,
  fetchStudentNotesForWindow,
  fetchStudentInterviews,
  formatDobForContext,
  calculateAgeFromDob,
  getStudentContext,
  getStudentWithProgram,
};
