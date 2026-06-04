/**
 * Stats Cloud Function (PEP-285).
 *
 * recomputeStats — callable CF that pre-computes per-classroom stats docs
 * in the `statsCache` collection. The client reads these docs directly;
 * Firestore rules enforce role-scoped access.
 */

import * as functions from "firebase-functions/v1";
import {db, Timestamp} from "../shared/firebase.js";
import {
  classifyNote,
  getObservationDate,
  buildActivityTiers,
  CACHE_TTL_MS,
} from "./helpers.js";

/**
 * Recompute all per-classroom stats and write to statsCache/.
 *
 * Callable by any authenticated user (superadmin, classroomadmin, teacher).
 * Checks a `_meta` doc for freshness; skips recompute if cache is < TTL old
 * (unless forceRefresh is set).
 *
 * @param {Object} data
 * @param {boolean} [data.forceRefresh] - bypass cache freshness check
 */
export const recomputeStats = functions
  .region("asia-south1")
  .runWith({timeoutSeconds: 120, memory: "512MB"})
  .https.onCall(async (data, context) => {
    // ── Auth gate ──────────────────────────────────────────────────
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be signed in",
      );
    }

    const callerUid = context.auth.uid;
    const callerSnap = await db.collection("users").doc(callerUid).get();
    if (!callerSnap.exists) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "User not found",
      );
    }

    const {role} = callerSnap.data();
    if (!["superadmin", "classroomadmin", "teacher"].includes(role)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Unknown role",
      );
    }

    // ── Cache freshness check ──────────────────────────────────────
    const forceRefresh = data?.forceRefresh === true;
    if (!forceRefresh) {
      const metaSnap = await db.collection("statsCache").doc("_meta").get();
      if (metaSnap.exists) {
        const cachedAt = metaSnap.data()?.cachedAt;
        if (cachedAt) {
          const cachedMs = typeof cachedAt.toDate === "function"
            ? cachedAt.toDate().getTime()
            : cachedAt.seconds ? cachedAt.seconds * 1000 : 0;
          if (Date.now() - cachedMs < CACHE_TTL_MS) {
            return {fresh: true, cachedAt: cachedMs};
          }
        }
      }
    }

    const startMs = Date.now();

    // ── Fetch all source data ──────────────────────────────────────
    const [
      classroomsSnap,
      studentsSnap,
      usersSnap,
      observationsSnap,
      mediaSnap,
    ] = await Promise.all([
      db.collection("classrooms").where("status", "==", "active").get(),
      db.collection("students").get(),
      db.collection("users").get(),
      db.collectionGroup("observations").get(),
      db.collectionGroup("media").get(),
    ]);

    // Parse classrooms
    const classrooms = classroomsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Parse students — index by classroomId
    const allStudents = studentsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    const studentsByClassroom = new Map();
    for (const s of allStudents) {
      if (!s.classroomId) continue;
      if (!studentsByClassroom.has(s.classroomId)) {
        studentsByClassroom.set(s.classroomId, []);
      }
      studentsByClassroom.get(s.classroomId).push(s);
    }

    // Parse users — teachers/admins by ID
    const usersById = new Map();
    for (const doc of usersSnap.docs) {
      const d = doc.data();
      if (d.role === "teacher" || d.role === "superadmin" ||
          d.role === "classroomadmin") {
        usersById.set(doc.id, {
          id: doc.id,
          displayName: d.displayName,
          email: d.email,
          status: d.status || "active",
        });
      }
    }

    // Parse all observations + media into a unified list, indexed by classroomId
    // Each entry gets a classroomId (from doc or via student lookup)
    const studentClassroomMap = new Map();
    for (const s of allStudents) {
      studentClassroomMap.set(s.id, s.classroomId);
    }

    const allObs = [];
    for (const doc of observationsSnap.docs) {
      const d = doc.data();
      const classroomId = d.classroomId ||
        studentClassroomMap.get(d.studentId);
      if (!classroomId) continue;
      allObs.push({...d, id: doc.id, _classroomId: classroomId});
    }
    for (const doc of mediaSnap.docs) {
      const d = doc.data();
      if (d.status !== "ready") continue; // filter in-memory instead of query
      const classroomId = d.classroomId ||
        studentClassroomMap.get(d.studentId);
      if (!classroomId) continue;
      allObs.push({
        ...d,
        id: doc.id,
        type: "media",
        _classroomId: classroomId,
      });
    }

    // Index observations by classroomId and by createdBy (for cross-classroom)
    const obsByClassroom = new Map();
    const obsByCreator = new Map();
    for (const obs of allObs) {
      const cid = obs._classroomId;
      if (!obsByClassroom.has(cid)) obsByClassroom.set(cid, []);
      obsByClassroom.get(cid).push(obs);

      const uid = obs.createdBy;
      if (uid) {
        if (!obsByCreator.has(uid)) obsByCreator.set(uid, []);
        obsByCreator.get(uid).push(obs);
      }
    }

    // ── Compute per-classroom stats ────────────────────────────────
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fortyTwoDaysAgo = new Date(
      now.getTime() - 42 * 24 * 60 * 60 * 1000,
    );

    const batch = db.batch();
    let classroomCount = 0;

    for (const classroom of classrooms) {
      const classroomObs = obsByClassroom.get(classroom.id) || [];
      const classroomStudents = (
        studentsByClassroom.get(classroom.id) || []
      ).filter((s) => (s.status || "active") === "active");

      // Note counts by type
      const noteCounts = {voice: 0, text: 0, lesson: 0, media: 0, total: 0};
      for (const obs of classroomObs) {
        const type = classifyNote(obs);
        if (type in noteCounts) noteCounts[type]++;
        noteCounts.total++;
      }

      // Activity tiers (aggregate + per-type)
      const activity = buildActivityTiers(classroomObs, now);

      // Per-type activity tiers for time-filtered pie chart
      const obsByType = {voice: [], text: [], lesson: [], media: []};
      for (const obs of classroomObs) {
        const t = classifyNote(obs);
        if (t in obsByType) obsByType[t].push(obs);
      }
      const activityByType = {
        voice: buildActivityTiers(obsByType.voice, now),
        text: buildActivityTiers(obsByType.text, now),
        lesson: buildActivityTiers(obsByType.lesson, now),
        media: buildActivityTiers(obsByType.media, now),
      };

      // Teacher stats for this classroom
      const teacherIds = classroom.teacherIds || [];
      const uniqueTeacherIds = [...new Set(teacherIds)];
      const teachers = uniqueTeacherIds.map((tid) => {
        const user = usersById.get(tid) || {
          id: tid,
          displayName: "Unknown",
          email: "",
          status: "active",
        };

        // Count notes by this teacher IN this classroom
        const teacherObsHere = classroomObs.filter(
          (o) => o.createdBy === tid,
        );
        let observations = 0;
        let lessons = 0;
        for (const o of teacherObsHere) {
          if (classifyNote(o) === "lesson") {
            lessons++;
          } else {
            observations++;
          }
        }

        // Cross-classroom: count this teacher's notes in OTHER classrooms
        // filtered by time window (7d and 30d)
        const allTeacherObs = obsByCreator.get(tid) || [];
        let otherNotes7d = 0;
        let otherNotes30d = 0;
        const otherIds7d = new Set();
        const otherIds30d = new Set();
        for (const o of allTeacherObs) {
          if (o._classroomId !== classroom.id) {
            const d = getObservationDate(o);
            if (d >= weekAgo) {
              otherNotes7d++;
              otherIds7d.add(o._classroomId);
            }
            if (d >= thirtyDaysAgo) {
              otherNotes30d++;
              otherIds30d.add(o._classroomId);
            }
          }
        }

        return {
          id: tid,
          name: user.displayName || user.email || "Unknown",
          email: user.email || "",
          status: user.status,
          observations,
          lessons,
          otherNotes7d,
          otherCount7d: otherIds7d.size,
          otherNotes30d,
          otherCount30d: otherIds30d.size,
        };
      });

      // Student stats
      const students = classroomStudents.map((s) => {
        let totalNotes = 0;
        let thisWeekNotes = 0;
        let last42DaysNotes = 0;

        for (const obs of classroomObs) {
          if (obs.studentId !== s.id) continue;
          totalNotes++;
          const d = getObservationDate(obs);
          if (d >= weekAgo) thisWeekNotes++;
          if (d >= fortyTwoDaysAgo) last42DaysNotes++;
        }

        return {
          id: s.id,
          name: s.displayName || s.name || "Unknown Student",
          status: s.status || "active",
          totalNotes,
          thisWeekNotes,
          last42DaysNotes,
        };
      });

      // Write classroom stats doc
      const docRef = db.collection("statsCache")
        .doc(`classroom_${classroom.id}`);
      batch.set(docRef, {
        cachedAt: Timestamp.now(),
        classroomId: classroom.id,
        classroomName: classroom.name || classroom.id,
        branchId: classroom.branchId || null,
        noteCounts,
        activity,
        activityByType,
        studentCount: classroomStudents.length,
        teachers,
        students,
      });

      classroomCount++;
    }

    // Write _meta doc
    batch.set(db.collection("statsCache").doc("_meta"), {
      cachedAt: Timestamp.now(),
      classroomCount,
    });

    await batch.commit();

    const computeTimeMs = Date.now() - startMs;
    console.log(JSON.stringify({
      event: "stats_recompute",
      classroomCount,
      computeTimeMs,
      observationCount: allObs.length,
      callerRole: role,
    }));

    return {fresh: false, classroomCount, computeTimeMs};
  });
