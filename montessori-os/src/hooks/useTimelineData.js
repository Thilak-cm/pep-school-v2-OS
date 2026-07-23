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

import { useState, useEffect, useCallback } from 'react';
import {
  collection, collectionGroup, query, where, orderBy,
  getDocs, getDoc, doc, limit, startAfter,
} from 'firebase/firestore';
import { db } from '../firebase';
import { reportCaughtError } from '../utils/reportCaughtError.js';
import { checkClassroomAccess } from './timelineDataHelpers.js';

const PAGE_SIZE = 20;

// ── Fetchers ─────────────────────────────────────────────────

async function fetchClassroomNotes(classroomId, pageSize, cursor) {
  const constraints = [
    where('classroomId', '==', classroomId),
    orderBy('observedAt', 'desc'),
    limit(pageSize),
  ];
  if (cursor) constraints.push(startAfter(cursor));

  const obsQuery = query(collectionGroup(db, 'observations'), ...constraints);
  const snap = await getDocs(obsQuery);

  return snap.docs.map(d => ({
    id: d.id,
    parentStudentId: d.ref.parent?.parent?.id,
    docPath: d.ref.path,
    ...d.data(),
  }));
}

async function fetchStudentNotes(studentId, pageSize, cursor) {
  const constraints = [
    orderBy('observedAt', 'desc'),
    limit(pageSize),
  ];
  if (cursor) constraints.push(startAfter(cursor));

  const obsQuery = query(
    collection(db, 'students', studentId, 'observations'),
    ...constraints,
  );
  const snap = await getDocs(obsQuery);

  return snap.docs.map(d => ({
    id: d.id,
    studentId,
    ...d.data(),
  }));
}

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
  const [cursor, setCursor] = useState(null); // raw observedAt value from last doc
  const [refreshTick, setRefreshTick] = useState(0);

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
      return;
    }

    let cancelled = false;
    const isRefresh = refreshTick > 0;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    (async () => {
      try {
        if (scope === 'classroom') {
          // Fetch students list
          const studentsSnap = await getDocs(
            query(collection(db, 'students'), where('classroomId', '==', id))
          );
          const classroomStudents = studentsSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(s => (s.status || 'active') === 'active');

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
          const page = await fetchClassroomNotes(id, PAGE_SIZE, null);
          if (cancelled) return;

          setNotes(page);
          setHasMore(page.length >= PAGE_SIZE);
          setCursor(page.length > 0 ? page[page.length - 1].observedAt : null);
        } else {
          // Student scope - first page
          const page = await fetchStudentNotes(id, PAGE_SIZE, null);
          if (cancelled) return;

          setNotes(page);
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
  }, [scope, id, hasAccess, classroom?.teacherIds?.length, refreshTick]);

  // Load more - fetch next page using cursor
  const loadMore = useCallback(async () => {
    if (!id || !hasAccess || !cursor || !hasMore) return;

    try {
      const page = scope === 'classroom'
        ? await fetchClassroomNotes(id, PAGE_SIZE, cursor)
        : await fetchStudentNotes(id, PAGE_SIZE, cursor);

      setNotes(prev => [...prev, ...page]);
      setHasMore(page.length >= PAGE_SIZE);
      setCursor(page.length > 0 ? page[page.length - 1].observedAt : null);
    } catch (err) {
      reportCaughtError(err, 'useTimelineData', `${scope} loadMore`);
    }
  }, [scope, id, hasAccess, cursor, hasMore]);

  // Refresh - reset to page 1
  const refresh = useCallback(() => {
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
    refresh,
    refreshing,
    refreshTick, // exposed so useTimelineStats can piggyback on the same refresh
  };
}
