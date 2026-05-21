import { useState, useEffect, useMemo } from 'react';
import { collectionGroup, collection, query, where, getCountFromServer, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { reportCaughtError } from '../utils/reportCaughtError.js';

/**
 * Batch hook: fetches total + last-7-day note counts for an array of students
 * using Firestore's getCountFromServer (no document data transferred).
 *
 * Returns { counts: Map<studentId, {totalNotes, notesLast7Days}>, loading }.
 */
export default function useStudentNoteCounts(studentIds) {
  const [counts, setCounts] = useState(new Map());
  const [loading, setLoading] = useState(true);

  // Stable dependency: avoid refetching when the array reference changes but contents don't
  const idsKey = useMemo(
    () => (studentIds?.length ? [...studentIds].sort().join(',') : ''),
    [studentIds],
  );

  useEffect(() => {
    if (!idsKey) {
      setCounts(new Map());
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const ids = idsKey.split(',');

    const fetchAll = async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const ts = Timestamp.fromDate(sevenDaysAgo);
      const result = new Map();

      await Promise.all(ids.map(async (studentId) => {
        try {
          const [obsSnap, mediaSnap, recentObsSnap, recentMediaSnap] = await Promise.all([
            getCountFromServer(query(
              collectionGroup(db, 'observations'),
              where('studentId', '==', studentId),
            )),
            getCountFromServer(query(
              collection(db, 'students', studentId, 'media'),
            )),
            getCountFromServer(query(
              collectionGroup(db, 'observations'),
              where('studentId', '==', studentId),
              where('observedAt', '>=', ts),
            )),
            getCountFromServer(query(
              collection(db, 'students', studentId, 'media'),
              where('observedAt', '>=', ts),
            )),
          ]);
          result.set(studentId, {
            totalNotes: obsSnap.data().count + mediaSnap.data().count,
            notesLast7Days: recentObsSnap.data().count + recentMediaSnap.data().count,
          });
        } catch (err) {
          reportCaughtError(err, 'useStudentNoteCounts', 'fetchCounts');
          result.set(studentId, { totalNotes: 0, notesLast7Days: 0 });
        }
      }));

      if (!cancelled) {
        setCounts(result);
        setLoading(false);
      }
    };

    fetchAll().catch((err) => {
      reportCaughtError(err, 'useStudentNoteCounts', 'fetchAll');
      if (!cancelled) {
        setCounts(new Map());
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [idsKey]);

  return { counts, loading };
}
