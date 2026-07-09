/**
 * Firestore trigger: maintain classrooms.studentCount on every student
 * create/update/delete, and close active placements on inactivation.
 *
 * Uses a count query (not increment) so the value self-heals on every
 * invocation - even if prior writes drifted or the trigger fires twice,
 * the result converges to truth.
 */

import * as functions from "firebase-functions/v1";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../shared/firebase.js";

/**
 * Recount active students for a classroom and write studentCount.
 * @param {string} classroomId
 */
async function recountStudents(classroomId) {
  const classroomRef = db.collection("classrooms").doc(classroomId);
  const classroomSnap = await classroomRef.get();
  if (!classroomSnap.exists) {
    console.warn(
      `[studentCount] Classroom ${classroomId} does not exist, skipping`,
    );
    return;
  }

  const studentsSnap = await db
    .collection("students")
    .where("classroomId", "==", classroomId)
    .where("status", "==", "active")
    .get();

  const count = studentsSnap.size;
  await classroomRef.update({
    studentCount: count,
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log(`[studentCount] ${classroomId} → ${count}`);
}

/**
 * Close all open placements for a student (set endDate to today).
 * Called when a student is inactivated (soft-deleted).
 * @param {string} studentId
 */
async function closeOpenPlacements(studentId) {
  const placementsSnap = await db
    .collection("students")
    .doc(studentId)
    .collection("placements")
    .where("endDate", "==", null)
    .get();

  if (placementsSnap.empty) return;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const batch = db.batch();
  placementsSnap.forEach((doc) => {
    batch.update(doc.ref, {
      endDate: today,
      status: "ended",
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();

  console.log(
    `[studentCount] Closed ${placementsSnap.size} open placement(s) for ${studentId}`,
  );
}

export const onStudentWrite = functions
  .region("asia-south1")
  .firestore.document("students/{studentId}")
  .onWrite(async (change) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;

    const beforeClassroom = before?.classroomId || null;
    const afterClassroom = after?.classroomId || null;
    const beforeStatus = before?.status || "active";
    const afterStatus = after?.status || "active";

    // Collect unique classroom IDs that need recounting
    const classroomsToRecount = new Set();

    if (beforeClassroom) {
      classroomsToRecount.add(beforeClassroom);
    }
    if (afterClassroom) {
      classroomsToRecount.add(afterClassroom);
    }

    // Optimization: skip if nothing relevant changed on update
    if (before && after) {
      const classroomChanged = beforeClassroom !== afterClassroom;
      const statusChanged = beforeStatus !== afterStatus;
      if (!classroomChanged && !statusChanged) {
        return null;
      }
    }

    // Close open placements when student is inactivated
    if (before && after && beforeStatus === "active" && afterStatus !== "active") {
      await closeOpenPlacements(change.after.id);
    }

    // Recount all affected classrooms in parallel
    const promises = [...classroomsToRecount].map((id) => recountStudents(id));
    await Promise.all(promises);

    return null;
  });
