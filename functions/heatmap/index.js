/**
 * Heatmap cache writer (PEP-303).
 *
 * Builds per-classroom heatmap docs in `statsCache/heatmap_{classroomId}`
 * from weekly_snapshot docs + history subcollections. Called after the
 * scheduled baseball card run completes, and after on-demand regeneration.
 *
 * Doc shape mirrors the client-side roster used by NotificationsPage:
 * {
 *   classroomId, weekKey, cachedAt,
 *   counts: { escalated, steady, improved, total },
 *   roster: [{ studentId, displayName, classroomId, weeks, escalatedThisWeek, improvedThisWeek }]
 * }
 */

import {db, Timestamp, FieldPath} from "../shared/firebase.js";
import {getIstIsoWeekKey, getPastWeekKeys} from "../utils/weekKey.js";

// ── Full rebuild (called after scheduled generateBaseballCards) ─────────────

/**
 * Query all fresh weekly_snapshot docs + 5 weeks of history, group by
 * classroom, and batch-write one statsCache/heatmap_{classroomId} doc per
 * active classroom.
 */
export async function writeHeatmapCache() {
  const weekKey = getIstIsoWeekKey();
  const pastKeys = getPastWeekKeys(5);
  const allWeekKeys = [...pastKeys, weekKey];

  // 1. Fetch all active students grouped by classroom
  const studentsSnap = await db.collection("students")
    .where("status", "==", "active").get();

  const studentsByClassroom = {};
  const studentInfoMap = {};
  for (const sDoc of studentsSnap.docs) {
    const s = sDoc.data() || {};
    const classroomId = s.classroomId || "";
    if (!classroomId) continue;
    const displayName = s.displayName || s.name ||
      `${s.firstName || ""} ${s.lastName || ""}`.trim() || sDoc.id;
    studentInfoMap[sDoc.id] = {displayName, classroomId};
    if (!studentsByClassroom[classroomId]) {
      studentsByClassroom[classroomId] = [];
    }
    studentsByClassroom[classroomId].push(sDoc.id);
  }

  // 2. Fetch current-week snapshots (collectionGroup)
  const snapshotsSnap = await db.collectionGroup("ai_summaries")
    .where("weekKey", "==", weekKey).get();

  const currentWeekMap = {}; // studentId → snapshot data
  for (const d of snapshotsSnap.docs) {
    if (d.id !== "weekly_snapshot") continue;
    const studentId = d.ref.parent?.parent?.id;
    if (!studentId) continue;
    currentWeekMap[studentId] = d.data() || {};
  }

  // 3. Fetch 5 past weeks of history for all students
  const allStudentIds = Object.keys(studentInfoMap);
  const historyMap = {}; // studentId → { weekKey → severity }
  for (const sid of allStudentIds) {
    historyMap[sid] = {};
  }

  // Batch history reads with concurrency to avoid overwhelming Firestore
  const BATCH_SIZE = 50;
  for (let i = 0; i < allStudentIds.length; i += BATCH_SIZE) {
    const batch = allStudentIds.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (sid) => {
      try {
        const histRef = db.collection("students").doc(sid)
          .collection("ai_summaries").doc("weekly_snapshot")
          .collection("history");
        // Firestore 'in' limit is 30; pastKeys is always 5
        const histSnap = await histRef.where(
          FieldPath.documentId(), "in", pastKeys
        ).get();
        for (const hDoc of histSnap.docs) {
          const hData = hDoc.data() || {};
          historyMap[sid][hDoc.id] = hData.status === "no_notes"
            ? null : (hData.severity || "clear");
        }
      } catch {
        // Missing history is expected for new students
      }
    }));
  }

  // 4. Build per-classroom heatmap payloads
  const classroomPayloads = [];

  for (const [classroomId, studentIds] of Object.entries(studentsByClassroom)) {
    const roster = [];

    for (const sid of studentIds) {
      const info = studentInfoMap[sid];
      const currentSnapshot = currentWeekMap[sid] || {};
      const history = historyMap[sid] || {};

      // Build 6-week severity array (oldest → newest)
      const weeks = allWeekKeys.map((wk) => {
        if (wk === weekKey) {
          // Current week from snapshot
          if (currentSnapshot.status === "no_notes") return null;
          return currentSnapshot.severity || null;
        }
        // Past weeks from history
        const sev = history[wk];
        return sev === undefined ? null : sev;
      });

      // Only include students with at least one week of data
      if (weeks.every((w) => w === null)) continue;

      roster.push({
        studentId: sid,
        displayName: info.displayName,
        classroomId,
        weeks,
        escalatedThisWeek: !!currentSnapshot.escalatedThisWeek,
        improvedThisWeek: !!currentSnapshot.improvedThisWeek,
      });
    }

    // Compute counts
    const escalated = roster.filter((r) => r.escalatedThisWeek).length;
    const improved = roster.filter((r) => r.improvedThisWeek).length;
    const steady = roster.length - escalated - improved;

    classroomPayloads.push({
      classroomId,
      weekKey,
      cachedAt: Timestamp.now(),
      counts: {escalated, steady, improved, total: roster.length},
      roster,
    });
  }

  // 5. Batch-write all heatmap docs (flush every 450 to stay under 500 limit)
  const BATCH_LIMIT = 450;
  for (let i = 0; i < classroomPayloads.length; i += BATCH_LIMIT) {
    const chunk = classroomPayloads.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const payload of chunk) {
      const docRef = db.collection("statsCache")
        .doc(`heatmap_${payload.classroomId}`);
      batch.set(docRef, payload);
    }
    // Include meta doc in the first batch
    if (i === 0) {
      batch.set(db.collection("statsCache").doc("heatmap_meta"), {
        cachedAt: Timestamp.now(),
        classroomCount: classroomPayloads.length,
        weekKey,
      });
    }
    await batch.commit();
  }

  console.log(
    `[heatmapCache] wrote ${classroomPayloads.length} classroom ` +
    `heatmap docs for ${weekKey}`
  );
}

// ── Single-student patch (called after on-demand regen) ────────────────────

/**
 * After a single student's weekly_snapshot is regenerated, patch their row
 * in the relevant statsCache/heatmap_{classroomId} doc.
 *
 * @param {string} studentId
 */
export async function patchHeatmapStudent(studentId) {
  // 1. Get student's classroomId + displayName
  const studentSnap = await db.collection("students").doc(studentId).get();
  if (!studentSnap.exists) return;
  const studentData = studentSnap.data() || {};
  const classroomId = studentData.classroomId;
  if (!classroomId) return;
  const displayName = studentData.displayName || studentData.name ||
    `${studentData.firstName || ""} ${studentData.lastName || ""}`.trim() ||
    studentId;

  // 2. Read the heatmap cache doc
  const cacheRef = db.collection("statsCache")
    .doc(`heatmap_${classroomId}`);
  const cacheSnap = await cacheRef.get();
  if (!cacheSnap.exists) {
    // No cache yet — nothing to patch (will be built on next scheduled run)
    return;
  }
  const cacheData = cacheSnap.data() || {};
  const roster = Array.isArray(cacheData.roster) ? [...cacheData.roster] : [];

  // 3. Read the student's fresh weekly_snapshot
  const weekKey = getIstIsoWeekKey();
  const snapshotRef = db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("weekly_snapshot");
  const snapshotSnap = await snapshotRef.get();

  let currentSeverity = null;
  let escalatedThisWeek = false;
  let improvedThisWeek = false;

  if (snapshotSnap.exists) {
    const snapData = snapshotSnap.data() || {};
    if (snapData.weekKey === weekKey && snapData.status !== "no_notes") {
      currentSeverity = snapData.severity || "clear";
      escalatedThisWeek = !!snapData.escalatedThisWeek;
      improvedThisWeek = !!snapData.improvedThisWeek;
    }
  }

  // 4. Update or insert the student's row
  const existingIdx = roster.findIndex((r) => r.studentId === studentId);
  if (existingIdx >= 0) {
    // Patch: update current week (last element) + flags
    const row = {...roster[existingIdx]};
    const weeks = [...(row.weeks || [])];
    weeks[weeks.length - 1] = currentSeverity;
    row.weeks = weeks;
    row.escalatedThisWeek = escalatedThisWeek;
    row.improvedThisWeek = improvedThisWeek;
    row.displayName = displayName;
    roster[existingIdx] = row;
  } else if (currentSeverity !== null) {
    // Insert: build weeks array with nulls for past + current
    const pastKeys = getPastWeekKeys(5);
    const weeks = pastKeys.map(() => null);
    weeks.push(currentSeverity);
    roster.push({
      studentId,
      displayName,
      classroomId,
      weeks,
      escalatedThisWeek,
      improvedThisWeek,
    });
  }

  // 5. Recompute counts
  const escalated = roster.filter((r) => r.escalatedThisWeek).length;
  const improved = roster.filter((r) => r.improvedThisWeek).length;
  const steady = roster.length - escalated - improved;

  await cacheRef.update({
    roster,
    counts: {escalated, steady, improved, total: roster.length},
    cachedAt: Timestamp.now(),
  });

  console.log(
    `[heatmapCache] patched student ${studentId} in heatmap_${classroomId}`
  );
}

