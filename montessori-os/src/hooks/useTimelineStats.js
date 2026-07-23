/**
 * useTimelineStats - read pre-computed stats from statsCache (#221 Sprint 2).
 *
 * Replaces in-memory derivation of perStudentCounts / totalNotes / notesLast7Days
 * with a single getDoc on statsCache/classroom_{classroomId}. Decoupled from
 * paginated note fetching so counts stay accurate regardless of how many notes
 * are loaded in memory.
 */

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { sumLast7Days, findStudentStats } from './timelineStatsHelpers.js';

// ── Hook ────────────────────────────────────────────────────

/**
 * @param {Object} params
 * @param {'classroom'|'student'} params.scope
 * @param {string} params.classroomId
 * @param {string} [params.studentId] - required for student scope
 * @param {number} [params.refreshTick] - increment to re-fetch
 */
export default function useTimelineStats({ scope, classroomId, studentId, refreshTick = 0 }) {
  const [notesOverall, setNotesOverall] = useState(0);
  const [notesPast7Days, setNotesPast7Days] = useState(0);
  const [studentCount, setStudentCount] = useState(0);
  const [studentStats, setStudentStats] = useState(null); // Map<studentId, {totalMentions, thisWeekMentions}>
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!classroomId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'statsCache', `classroom_${classroomId}`));
        if (cancelled) return;

        if (!snap.exists()) {
          setNotesOverall(0);
          setNotesPast7Days(0);
          setStudentCount(0);
          setStudentStats(new Map());
          return;
        }

        const data = snap.data();

        if (scope === 'classroom') {
          setNotesOverall(data.effortCounts?.total || 0);
          setNotesPast7Days(sumLast7Days(data.effortActivity?.daily));
          setStudentCount(data.studentCount || 0);

          // Build per-student stats Map for ClassroomStudentCard
          const statsMap = new Map();
          if (Array.isArray(data.students)) {
            for (const s of data.students) {
              statsMap.set(s.id, {
                totalMentions: s.totalMentions || 0,
                thisWeekMentions: s.thisWeekMentions || 0,
              });
            }
          }
          setStudentStats(statsMap);
        } else {
          // Student scope
          const stats = findStudentStats(data.students, studentId);
          setNotesOverall(stats.totalMentions);
          setNotesPast7Days(stats.thisWeekMentions);
        }
      } catch {
        if (!cancelled) {
          setNotesOverall(0);
          setNotesPast7Days(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [scope, classroomId, studentId, refreshTick]);

  return { notesOverall, notesPast7Days, studentCount, studentStats, loading };
}
