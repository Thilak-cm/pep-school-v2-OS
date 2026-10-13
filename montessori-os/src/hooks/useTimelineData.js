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
  getDocs, getCountFromServer, getDoc, doc, limit, startAfter,
} from 'firebase/firestore';
import { db } from '../firebase';
import { createTimelineQueries } from '../../../shared/firebase/timelineQueries.js';
import { reportCaughtError } from '../utils/reportCaughtError.js';
import { checkClassroomAccess } from './timelineDataHelpers.js';

const PAGE_SIZE = 20;

const {
  fetchActiveClassroomStudents,
  fetchClassroomBatchObservations,
  fetchClassroomTimelineNotes,
  fetchFilteredCount,
  fetchStudentTimelineNotes,
  fetchStudentBatchObservations,
} = createTimelineQueries({
  db,
  firestore: {
    collection,
    collectionGroup,
    getCountFromServer,
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
 * @param {Object|null} [params.committedFilters] - server-side filters from useObservationFilters
 */
export default function useTimelineData({ scope, id, classroom, userRole, manageableClassrooms, committedFilters = null }) {
  const [notes, setNotes] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Cursor stores the last DocumentSnapshot for startAfter pagination.
  // Using snapshots instead of raw observedAt values eliminates the
  // identical-timestamp skip edge case at page boundaries.
  const [cursor, setCursor] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [filteredStats, setFilteredStats] = useState(null);
  const [filterError, setFilterError] = useState(null);
  const [filterLoading, setFilterLoading] = useState(false);
  const fetchedBatchIdsRef = useRef(new Set());
  // Snapshot of browse-mode state, captured before the first filtered fetch.
  // restoreBrowseCache() restores this instantly (no refetch) on Clear All.
  const browseCacheRef = useRef(null);

  /**
   * Post-filter hydrated batch siblings against active server filters.
   * Siblings fetched by batchId may not match the committed filter criteria
   * (e.g., different type or author). Filter them out so they don't leak
   * into filtered results.
   */
  const hydrateMediaBatches = useCallback(async (ownerId, page, serverFilters = null) => {
    if (!ownerId) return page;
    const batchIds = [...new Set(page.map((note) => note.batchId).filter(Boolean))]
      .filter((batchId) => !fetchedBatchIdsRef.current.has(batchId));
    if (!batchIds.length) return page;
    batchIds.forEach((batchId) => fetchedBatchIdsRef.current.add(batchId));
    const results = await Promise.allSettled(
      batchIds.map((batchId) => scope === 'classroom'
        ? fetchClassroomBatchObservations({ classroomId: ownerId, batchId })
        : fetchStudentBatchObservations({ studentId: ownerId, batchId })),
    );
    let additions = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled') additions.push(...result.value);
      else reportCaughtError(result.reason, 'useTimelineData', 'media batch siblings fetch');
    });
    // Post-filter siblings against active server filters so non-matching
    // notes don't leak into filtered results
    if (serverFilters) {
      additions = additions.filter((note) => {
        if (serverFilters.authors?.length && !serverFilters.authors.includes(note.createdBy)) return false;
        if (serverFilters.types?.length && !serverFilters.types.includes(note.type)) return false;
        return true;
      });
    }
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

  /**
   * Core fetch function used by both initial load and filter changes.
   * Fetches page 1 (optionally filtered) + count aggregation when filtered.
   */
  const fetchPage1 = useCallback(async (serverFilters) => {
    const fetchArgs = scope === 'classroom'
      ? { classroomId: id, pageSize: PAGE_SIZE, filters: serverFilters }
      : { studentId: id, pageSize: PAGE_SIZE, filters: serverFilters };
    const result = scope === 'classroom'
      ? await fetchClassroomTimelineNotes(fetchArgs)
      : await fetchStudentTimelineNotes(fetchArgs);

    // Fire count() alongside page 1 when filtered (same try/catch - fail together)
    let stats = null;
    if (serverFilters) {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const hasDateRange = serverFilters.dateFrom || serverFilters.dateTo;
      const countFilters = hasDateRange
        ? { ...serverFilters }
        : { ...serverFilters, dateFrom: sevenDaysAgo };
      const count = await fetchFilteredCount({ scope, id, filters: countFilters });
      stats = {
        count,
        label: hasDateRange ? `${count} notes in selected range` : `${count} notes in past 7 days`,
      };
    }

    return { result, stats };
  }, [scope, id]);

  // Initial fetch + refresh (triggered by refreshTick)
  useEffect(() => {
    if (!id || !hasAccess) {
      setNotes([]);
      setStudents([]);
      setTeachers([]);
      setLoading(false);
      setHasMore(false);
      setFilteredStats(null);
      fetchedBatchIdsRef.current.clear();
      return;
    }

    let cancelled = false;
    const isRefresh = refreshTick > 0;
    if (isRefresh) {
      setRefreshing(true);
      fetchedBatchIdsRef.current.clear();
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

          // Fetch first page of notes (browse mode - no filters on initial load)
          const { result, stats } = await fetchPage1(null);
          if (cancelled) return;

          const hydratedPage = await hydrateMediaBatches(id, result.notes);
          if (cancelled) return;
          setNotes(hydratedPage);
          setHasMore(result.notes.length >= PAGE_SIZE);
          setCursor(result.lastDocSnapshot);
          setFilteredStats(stats);
        } else {
          // Student scope - first page
          const { result, stats } = await fetchPage1(null);
          if (cancelled) return;

          const hydratedPage = await hydrateMediaBatches(id, result.notes);
          if (cancelled) return;
          setNotes(hydratedPage);
          setHasMore(result.notes.length >= PAGE_SIZE);
          setCursor(result.lastDocSnapshot);
          setFilteredStats(stats);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, id, hasAccess, classroom?.teacherIds?.length, refreshTick, hydrateMediaBatches, fetchPage1]);

  // Filtered fetch - triggered when committedFilters changes
  useEffect(() => {
    if (!id || !hasAccess || !committedFilters) return;

    let cancelled = false;
    setFilterLoading(true);
    setFilterError(null);
    fetchedBatchIdsRef.current.clear();

    // Snapshot browse state before first filtered fetch
    if (!browseCacheRef.current) {
      browseCacheRef.current = { notes, cursor, hasMore };
    }

    (async () => {
      try {
        const { result, stats } = await fetchPage1(committedFilters);
        if (cancelled) return;

        const hydratedPage = await hydrateMediaBatches(id, result.notes, committedFilters);
        if (cancelled) return;
        setNotes(hydratedPage);
        setHasMore(result.notes.length >= PAGE_SIZE);
        setCursor(result.lastDocSnapshot);
        setFilteredStats(stats);
      } catch (err) {
        reportCaughtError(err, 'useTimelineData', `${scope} filtered fetch`);
        if (!cancelled) {
          setFilterError('Something went wrong. Tap to retry.');
        }
      } finally {
        if (!cancelled) setFilterLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedFilters]);

  // Load more - fetch next page using document-snapshot cursor
  const loadMore = useCallback(async () => {
    if (!id || !hasAccess || !cursor || !hasMore || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const fetchArgs = scope === 'classroom'
        ? { classroomId: id, pageSize: PAGE_SIZE, cursor, filters: committedFilters }
        : { studentId: id, pageSize: PAGE_SIZE, cursor, filters: committedFilters };
      const result = scope === 'classroom'
        ? await fetchClassroomTimelineNotes(fetchArgs)
        : await fetchStudentTimelineNotes(fetchArgs);

      const hydratedPage = await hydrateMediaBatches(id, result.notes, committedFilters);
      setNotes(prev => {
        const byId = new Map(prev.map((note) => [note.id, note]));
        hydratedPage.forEach((note) => byId.set(note.id, note));
        return [...byId.values()].sort((a, b) => {
          const aTime = a.observedAt?.toMillis?.() || a.observedAt?.seconds * 1000 || 0;
          const bTime = b.observedAt?.toMillis?.() || b.observedAt?.seconds * 1000 || 0;
          return bTime - aTime;
        });
      });
      setHasMore(result.notes.length >= PAGE_SIZE);
      setCursor(result.lastDocSnapshot);
    } catch (err) {
      reportCaughtError(err, 'useTimelineData', `${scope} loadMore`);
    } finally {
      setIsLoadingMore(false);
    }
  }, [scope, id, hasAccess, cursor, hasMore, isLoadingMore, committedFilters, hydrateMediaBatches]);

  /**
   * Restore cached browse-mode pages. Called on Clear All when committed
   * filters were active. Instant restoration - no refetch. Teachers use
   * the explicit Refresh button for freshness (Decision 6).
   */
  const restoreBrowseCache = useCallback(() => {
    if (browseCacheRef.current) {
      setNotes(browseCacheRef.current.notes);
      setCursor(browseCacheRef.current.cursor);
      setHasMore(browseCacheRef.current.hasMore);
      browseCacheRef.current = null;
    }
    setFilteredStats(null);
    setFilterError(null);
  }, []);

  // Refresh - reset to page 1
  const refresh = useCallback(() => {
    browseCacheRef.current = null;
    setHasMore(true);
    setCursor(null);
    setFilteredStats(null);
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
    filterLoading,
    filteredStats,
    filterError,
    restoreBrowseCache,
  };
}
