import { useState, useEffect } from 'react';
import { collectionGroup, collection, query, where, getCountFromServer, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Lightweight hook that returns total and last-7-day note counts for a student
 * using Firestore's getCountFromServer (no document data transferred).
 *
 * Counts observations (collectionGroup) + media (subcollection) separately,
 * then sums them.
 */
export default function useStudentNoteCounts(studentId) {
  const [totalNotes, setTotalNotes] = useState(null);
  const [notesLast7Days, setNotesLast7Days] = useState(null);

  useEffect(() => {
    if (!studentId) {
      setTotalNotes(0);
      setNotesLast7Days(0);
      return;
    }

    let cancelled = false;

    const fetchCounts = async () => {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const ts = Timestamp.fromDate(sevenDaysAgo);

        const obsQuery = query(
          collectionGroup(db, 'observations'),
          where('studentId', '==', studentId),
        );
        const mediaQuery = query(
          collection(db, 'students', studentId, 'media'),
        );
        const recentObsQuery = query(
          collectionGroup(db, 'observations'),
          where('studentId', '==', studentId),
          where('observedAt', '>=', ts),
        );
        const recentMediaQuery = query(
          collection(db, 'students', studentId, 'media'),
          where('observedAt', '>=', ts),
        );

        const [obsSnap, mediaSnap, recentObsSnap, recentMediaSnap] = await Promise.all([
          getCountFromServer(obsQuery),
          getCountFromServer(mediaQuery),
          getCountFromServer(recentObsQuery),
          getCountFromServer(recentMediaQuery),
        ]);

        if (!cancelled) {
          setTotalNotes(obsSnap.data().count + mediaSnap.data().count);
          setNotesLast7Days(recentObsSnap.data().count + recentMediaSnap.data().count);
        }
      } catch (err) {
        console.error('[useStudentNoteCounts] count fetch failed', err);
        if (!cancelled) {
          setTotalNotes(0);
          setNotesLast7Days(0);
        }
      }
    };

    fetchCounts();
    return () => { cancelled = true; };
  }, [studentId]);

  return { totalNotes, notesLast7Days, loading: totalNotes === null };
}
