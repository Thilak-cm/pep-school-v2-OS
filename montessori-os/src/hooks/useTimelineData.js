/**
 * useTimelineData - paginated timeline data hook (#221 Sprint 2).
 *
 * Cursor-based Firestore pagination (PAGE_SIZE per page) with refresh.
 * Single observations collection (media merged in Sprint 1).
 * Reports dropped from timeline - ai_summaries no longer fetched.
 *
 * Two scopes:
 *   - classroom: collectionGroup query by classroomId
 *   - student:   direct subcollection query under students/{studentId}
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, collectionGroup, query, where, orderBy,
  getDocs, getDoc, doc, limit, startAfter,
} from 'firebase/firestore';
import { db } from '../firebase';
import { createTimelineQueries } from '../../../shared/firebase/timelineQueries.js';
import { reportCaughtError } from '../utils/reportCaughtError.js';
import { checkClassroomAccess } from './timelineDataHelpers.js';

const PAGE_SIZE = 20;

const {
  fetchActiveClassroomStudents,
  fetchClassroomTimelineNotes,
  fetchStudentTimelineNotes,
  fetchStudentBatchObservations,
} = createTimelineQueries({
  db,
  firestore: {
    collection,
    collectionGroup,
    getDocs,
    limit,
    orderBy,
    query,
    startAfter,
    where,
  },
});

// ── Main hook ────────────────────────────────────────────────

/**
 * @param {Object} params
 * @param {'classroom'|'student'} params.scope
 * @param {string} params.id - classroomId or studentId depending on scope
 * @param {Object} [params.classroom] - classroom object (for classroom scope: teachers, students fetch)
 * @param {string} [params.userRole] - 'superadmin' | 'classroomadmin' | 'teacher'
 * @param {string[]} [params.manageableClassrooms] - for classroomadmin scoping
 */
export default function useTimelineData({ scope, id, classroom, userRole, manageableClassrooms }) {
  const [notes, setNotes] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Cursor stores raw observedAt value from last doc. Edge case: if two docs share
  // the exact same observedAt timestamp at a page boundary, one may be skipped.
  // A fully deterministic fix requires adding orderBy(documentId()) as a tiebreaker,
  // which needs composite index changes for collectionGroup queries. Low probability
  // in practice - users can refresh to see any skipped doc.
  const [cursor, setCursor] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const fetchedBatchIdsRef = useRef(new Set());

  const hydrateStudentBatch = useCallback(async (studentId, page) => {
    if (scope !== 'student' || !studentId) return page;
    const batchIds = [...new Set(page.map((note) => note.batchId).filter(Boolean))]
      .filter((batchId) => !fetchedBatchIdsRef.current.has(batchId));
    if (!batchIds.length) return page;
    batchIds.forEach((batchId) => fetchedBatchIdsRef.current.add(batchId));
    const results = await Promise.allSettled(
      batchIds.map((batchId) => fetchStudentBatchObservations({ studentId, batchId })),
    );
    const additions = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled') additions.push(...result.value);
      else reportCaughtError(result.reason, 'useTimelineData', 'student batch siblings fetch');
    });
    const byId = new Map(page.map((note) => [note.id, note]));
    additions.forEach((note) => byId.set(note.id, note));
    return [...byId.values()].sort((a, b) => {
      const aTime = a.observedAt?.toMillis?.() || a.observedAt?.seconds * 1000 || 0;
      const bTime = b.observedAt?.toMillis?.() || b.observedAt?.seconds * 1000 || 0;
      return bTime - aTime;
    });
  }, [scope]);

  // Access check (classroom scope only)
  const hasAccess = scope === 'student' || !id
    ? true
    : checkClassroomAccess(userRole, manageableClassrooms, id);

  // Initial fetch + refresh (triggered by refreshTick)
  useEffect(() => {
    if (!id || !hasAccess) {
      setNotes([]);
      setStudents([]);
      setTeachers([]);
      setLoading(false);
      setHasMore(false);
      fetchedBatchIdsRef.current.clear();
      return;
    }

    let cancelled = false;
    const isRefresh = refreshTick > 0;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setNotes([]);
      fetchedBatchIdsRef.current.clear();
    }

    (async () => {
      try {
        if (scope === 'classroom') {
          // Fetch students list
          const classroomStudents = await fetchActiveClassroomStudents(id);

          if (cancelled) return;
          setStudents(classroomStudents);

          // Fetch teachers from classroom.teacherIds
          if (classroom?.teacherIds?.length) {
            const teacherPromises = classroom.teacherIds.map(async (tid) => {
              try {
                const teacherDoc = await getDoc(doc(db, 'users', tid));
                return teacherDoc.exists() ? { id: tid, ...teacherDoc.data() } : null;
              } catch { return null; }
            });
            const classroomTeachers = (await Promise.all(teacherPromises)).filter(Boolean);
            if (!cancelled) setTeachers(classroomTeachers);
          }

          // Fetch first page of notes
          const page = await fetchClassroomTimelineNotes({
            classroomId: id,
            pageSize: PAGE_SIZE,
          });
          if (cancelled) return;

          const hydratedPage = await hydrateStudentBatch(id, page);
          if (cancelled) return;
          setNotes(hydratedPage);
          setHasMore(page.length >= PAGE_SIZE);
          setCursor(page.length > 0 ? page[page.length - 1].observedAt : null);
        } else {
          // Student scope - first page
          const page = await fetchStudentTimelineNotes({
            studentId: id,
            pageSize: PAGE_SIZE,
          });
          if (cancelled) return;

          const hydratedPage = await hydrateStudentBatch(id, page);
          if (cancelled) return;
          setNotes(hydratedPage);
          setHasMore(page.length >= PAGE_SIZE);
          setCursor(page.length > 0 ? page[page.length - 1].observedAt : null);
        }
      } catch (err) {
        reportCaughtError(err, 'useTimelineData', `${scope} fetch`);
        if (!cancelled) {
          setNotes([]);
          setHasMore(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [scope, id, hasAccess, classroom?.teacherIds?.length, refreshTick, hydrateStudentBatch]);

  // Load more - fetch next page using cursor
  const loadMore = useCallback(async () => {
    if (!id || !hasAccess || !cursor || !hasMore || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const page = scope === 'classroom'
        ? await fetchClassroomTimelineNotes({
          classroomId: id,
          pageSize: PAGE_SIZE,
          cursor,
        })
        : await fetchStudentTimelineNotes({
          studentId: id,
          pageSize: PAGE_SIZE,
          cursor,
        });

      const hydratedPage = await hydrateStudentBatch(id, page);
      setNotes(prev => {
        const byId = new Map(prev.map((note) => [note.id, note]));
        hydratedPage.forEach((note) => byId.set(note.id, note));
        return [...byId.values()].sort((a, b) => {
          const aTime = a.observedAt?.toMillis?.() || a.observedAt?.seconds * 1000 || 0;
          const bTime = b.observedAt?.toMillis?.() || b.observedAt?.seconds * 1000 || 0;
          return bTime - aTime;
        });
      });
      setHasMore(page.length >= PAGE_SIZE);
      setCursor(page.length > 0 ? page[page.length - 1].observedAt : null);
    } catch (err) {
      reportCaughtError(err, 'useTimelineData', `${scope} loadMore`);
    } finally {
      setIsLoadingMore(false);
    }
  }, [scope, id, hasAccess, cursor, hasMore, isLoadingMore, hydrateStudentBatch]);

  // Refresh - reset to page 1
  const refresh = useCallback(() => {
    setHasMore(true);
    setCursor(null);
    setRefreshTick(t => t + 1);
  }, []);

  return {
    notes,
    students,
    teachers,
    loading,
    hasAccess,
    hasMore,
    loadMore,
    isLoadingMore,
    refresh,
    refreshing,
    refreshTick, // exposed so useTimelineStats can piggyback on the same refresh
  };
}
