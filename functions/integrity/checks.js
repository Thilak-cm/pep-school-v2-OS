/**
 * Data integrity checks.
 *
 * Each check is a pure async function that reads Firestore and returns:
 *   { name: string, passed: boolean, details: string }
 *
 * Checks never write — they only read and report.
 */

import { db } from "../shared/firebase.js";

// ── Check 1: studentCount consistency ─────────────────────────────────

export async function checkStudentCounts() {
  const name = "studentCount consistency";

  const classroomsSnap = await db.collection("classrooms").get();
  const studentsSnap = await db.collection("students").get();

  // Count active students per classroom
  const actualCounts = new Map();
  studentsSnap.forEach((doc) => {
    const data = doc.data();
    if ((data.status || "active") === "active" && data.classroomId) {
      actualCounts.set(
        data.classroomId,
        (actualCounts.get(data.classroomId) || 0) + 1,
      );
    }
  });

  const mismatches = [];
  classroomsSnap.forEach((doc) => {
    const data = doc.data();
    const stored = data.studentCount ?? null;
    const actual = actualCounts.get(doc.id) || 0;
    if (stored !== actual) {
      mismatches.push({
        id: doc.id,
        name: data.name || doc.id,
        stored,
        actual,
      });
    }
  });

  if (mismatches.length === 0) {
    return { name, passed: true, details: "All classroom counts match." };
  }

  const lines = mismatches.map(
    (m) => `${m.name}: stored=${m.stored}, actual=${m.actual}`,
  );
  return {
    name,
    passed: false,
    details: `${mismatches.length} mismatch(es):\n${lines.join("\n")}`,
  };
}

// ── Check 2: Orphaned students ────────────────────────────────────────

export async function checkOrphanedStudents() {
  const name = "orphaned students";

  const classroomsSnap = await db.collection("classrooms").select().get();
  const classroomIds = new Set();
  classroomsSnap.forEach((doc) => classroomIds.add(doc.id));

  const studentsSnap = await db.collection("students").get();
  const orphans = [];

  studentsSnap.forEach((doc) => {
    const data = doc.data();
    if (
      (data.status || "active") === "active" &&
      data.classroomId &&
      !classroomIds.has(data.classroomId)
    ) {
      orphans.push({
        id: doc.id,
        name: data.displayName || `${data.firstName || ""} ${data.lastName || ""}`.trim(),
        classroomId: data.classroomId,
      });
    }
  });

  if (orphans.length === 0) {
    return { name, passed: true, details: "No orphaned students found." };
  }

  const lines = orphans.map(
    (o) => `${o.name} (${o.id}) → missing classroom ${o.classroomId}`,
  );
  return {
    name,
    passed: false,
    details: `${orphans.length} orphan(s):\n${lines.join("\n")}`,
  };
}

// ── Check 3: Zombie placements ────────────────────────────────────────

export async function checkZombiePlacements() {
  const name = "zombie placements";

  const studentsSnap = await db.collection("students").get();
  const issues = [];

  // Check a sample — full scan of all placement subcollections is expensive.
  // We check all students but only flag the structural issue.
  const checks = [];
  studentsSnap.forEach((doc) => {
    const data = doc.data();
    const isActive = (data.status || "active") === "active";
    checks.push({ id: doc.id, data, isActive });
  });

  for (const student of checks) {
    const placementsSnap = await db
      .collection("students")
      .doc(student.id)
      .collection("placements")
      .where("endDate", "==", null)
      .get();

    const openCount = placementsSnap.size;
    const studentName =
      student.data.displayName ||
      `${student.data.firstName || ""} ${student.data.lastName || ""}`.trim();

    if (student.isActive && openCount === 0) {
      issues.push(`${studentName} (${student.id}): active but no open placement`);
    } else if (student.isActive && openCount > 1) {
      issues.push(
        `${studentName} (${student.id}): active with ${openCount} open placements`,
      );
    } else if (!student.isActive && openCount > 0) {
      issues.push(
        `${studentName} (${student.id}): inactive but has ${openCount} open placement(s)`,
      );
    }
  }

  if (issues.length === 0) {
    return { name, passed: true, details: "All placements consistent." };
  }

  return {
    name,
    passed: false,
    details: `${issues.length} issue(s):\n${issues.join("\n")}`,
  };
}

// ── Check 4: Teacher-classroom consistency ────────────────────────────

export async function checkTeacherClassroom() {
  const name = "teacher-classroom consistency";

  const classroomsSnap = await db.collection("classrooms").get();

  // Collect all referenced teacher IDs
  const teacherIdSet = new Set();
  const classroomTeachers = []; // { classroomName, teacherId }
  classroomsSnap.forEach((doc) => {
    const data = doc.data();
    const ids = data.teacherIds || [];
    for (const tid of ids) {
      teacherIdSet.add(tid);
      classroomTeachers.push({
        classroomName: data.name || doc.id,
        classroomId: doc.id,
        teacherId: tid,
      });
    }
  });

  if (teacherIdSet.size === 0) {
    return { name, passed: true, details: "No teacher assignments to check." };
  }

  // Batch-fetch all referenced users
  const userDocs = new Map();
  const teacherIds = [...teacherIdSet];
  // Firestore in-query limit is 30, batch if needed
  for (let i = 0; i < teacherIds.length; i += 30) {
    const batch = teacherIds.slice(i, i + 30);
    const snap = await db
      .collection("users")
      .where("__name__", "in", batch)
      .get();
    snap.forEach((doc) => userDocs.set(doc.id, doc.data()));
  }

  const issues = [];
  for (const ct of classroomTeachers) {
    const user = userDocs.get(ct.teacherId);
    if (!user) {
      issues.push(
        `${ct.classroomName}: teacher ${ct.teacherId} does not exist in users`,
      );
    } else if (user.status === "inactive") {
      const uname = user.displayName || user.email || ct.teacherId;
      issues.push(
        `${ct.classroomName}: teacher ${uname} is inactive`,
      );
    }
  }

  if (issues.length === 0) {
    return { name, passed: true, details: "All teacher assignments valid." };
  }

  return {
    name,
    passed: false,
    details: `${issues.length} issue(s):\n${issues.join("\n")}`,
  };
}

// ── Registry ──────────────────────────────────────────────────────────

export const ALL_CHECKS = [
  checkStudentCounts,
  checkOrphanedStudents,
  checkZombiePlacements,
  checkTeacherClassroom,
];
