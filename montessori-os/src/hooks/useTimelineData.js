/**
 * useTimelineData — shared data hook for ClassroomTimeline and StudentTimeline (#128).
 *
 * Replaces separate onSnapshot + cursor-pagination logic with a single getDocs fetch
 * of all notes into memory. UI-only pagination via displayLimit slicing.
 *
 * Two scopes:
 *   - classroom: 3 collectionGroup queries (observations, media, ai_summaries) by classroomId
 *   - student:   3 direct subcollection queries under students/{studentId}
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection, collectionGroup, query, where, orderBy,
  getDocs, getDoc, doc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { reportCaughtError } from '../utils/reportCaughtError.js';
import { toDate } from '../components/classroomTimelineUtils.js';
import { mergeAndDedupe, computePerStudentCounts, checkClassroomAccess } from './timelineDataHelpers.js';

const PAGE_SIZE = 20;

// ── Report doc shape normalizer ──────────────────────────────

function normalizeReportDoc(docSnap, studentId, studentName) {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    type: 'report',
    studentId,
    studentName: studentName || 'Unknown Student',
    observedAt: data.generatedAt || null,
    createdBy: data.generatedBy || null,
    generatedByName: data.generatedByName || null,
    noteCount: data.noteCount || 0,
    reportText: data.reportText || '',
    missingInputFlags: data.missingInputFlags || [],
    driveDocLink: data.driveDocLink || null,
    status: data.status || 'ok',
    reportType: data.reportType || 'term',
    dateRangeStart: data.dateRangeStart || null,
    dateRangeEnd: data.dateRangeEnd || null,
    classroomId: data.classroomId || null,
    kind: data.kind || null,
  };
}

// ── Fetchers ─────────────────────────────────────────────────

async function fetchClassroomData(classroomId, students) {
  const obsQuery = query(
    collectionGroup(db, 'observations'),
    where('classroomId', '==', classroomId),
    orderBy('observedAt', 'desc'),
  );

  const mediaQuery = query(
    collectionGroup(db, 'media'),
    where('classroomId', '==', classroomId),
    orderBy('observedAt', 'desc'),
  );

  const reportsQuery = query(
    collectionGroup(db, 'ai_summaries'),
    where('classroomId', '==', classroomId),
    where('kind', '==', 'report'),
    orderBy('generatedAt', 'desc'),
  );

  const [obsSnap, mediaSnap, reportsSnap] = await Promise.all([
    getDocs(obsQuery),
    getDocs(mediaQuery),
    getDocs(reportsQuery).catch(() => ({ docs: [] })), // fallback if index not yet deployed
  ]);

  const observations = obsSnap.docs.map(d => ({
    id: d.id,
    parentStudentId: d.ref.parent?.parent?.id,
    docPath: d.ref.path,
    ...d.data(),
  }));

  const media = mediaSnap.docs.map(d => ({
    id: d.id,
    parentStudentId: d.ref.parent?.parent?.id,
    docPath: d.ref.path,
    ...d.data(),
  }));

  // Build student name lookup for reports
  const studentNameMap = new Map();
  for (const s of (students || [])) {
    studentNameMap.set(s.id, s.displayName || s.firstName || 'Unknown Student');
  }

  const reports = reportsSnap.docs
    .filter(d => /^report_\d/.test(d.id) && (d.data().status || 'ok') === 'ok')
    .map(d => normalizeReportDoc(d, d.ref.parent?.parent?.id, studentNameMap.get(d.ref.parent?.parent?.id)));

  return { observations, media, reports };
}

async function fetchStudentData(studentId) {
  const obsQuery = query(
    collection(db, 'students', studentId, 'observations'),
    orderBy('observedAt', 'desc'),
  );

  const mediaQuery = query(
    collection(db, 'students', studentId, 'media'),
    orderBy('observedAt', 'desc'),
  );

  const reportsQuery = collection(db, 'students', studentId, 'ai_summaries');

  const [obsSnap, mediaSnap, reportsSnap] = await Promise.all([
    getDocs(obsQuery),
    getDocs(mediaQuery),
    getDocs(reportsQuery),
  ]);

  const observations = obsSnap.docs.map(d => ({
    id: d.id,
    studentId,
    ...d.data(),
  }));

  const media = mediaSnap.docs.map(d => ({
    id: d.id,
    studentId,
    ...d.data(),
  }));

  const reports = reportsSnap.docs
    .filter(d => /^report_\d/.test(d.id) && (d.data().status || 'ok') === 'ok')
    .map(d => normalizeReportDoc(d, studentId));

  return { observations, media, reports };
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
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
  // Access check (classroom scope only)
  const hasAccess = scope === 'student' || !id
    ? true
    : checkClassroomAccess(userRole, manageableClassrooms, id);

  useEffect(() => {
    if (!id || !hasAccess) {
      setNotes([]);
      setStudents([]);
      setTeachers([]);
      setDisplayLimit(PAGE_SIZE);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setDisplayLimit(PAGE_SIZE);

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

          // Fetch all notes
          const { observations, media, reports } = await fetchClassroomData(id, classroomStudents);
          if (cancelled) return;

          const merged = mergeAndDedupe(observations, media, reports);
          setNotes(merged);
        } else {
          // Student scope
          const { observations, media, reports } = await fetchStudentData(id);
          if (cancelled) return;

          const merged = mergeAndDedupe(observations, media, reports);
          setNotes(merged);
        }
      } catch (err) {
        reportCaughtError(err, 'useTimelineData', `${scope} fetch`);
        if (!cancelled) setNotes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [scope, id, hasAccess, classroom?.teacherIds?.length]);

  // Per-student counts derived from in-memory notes
  const perStudentCounts = useMemo(
    () => computePerStudentCounts(notes),
    [notes],
  );

  // UI-only pagination
  const hasMore = displayLimit < notes.length;
  const showMore = useCallback(() => {
    setDisplayLimit(prev => prev + PAGE_SIZE);
  }, []);

  // Inject a newly saved note into the in-memory array (for #129)
  const injectNote = useCallback((noteData) => {
    setNotes(prev => {
      const updated = [noteData, ...prev.filter(n => n.id !== noteData.id)];
      updated.sort((a, b) => {
        const dateA = toDate(a.observedAt) || new Date(0);
        const dateB = toDate(b.observedAt) || new Date(0);
        return dateB - dateA;
      });
      return updated;
    });
  }, []);

  return {
    notes,
    students,
    teachers,
    loading,
    hasAccess,
    displayLimit,
    hasMore,
    showMore,
    injectNote,
    perStudentCounts,
  };
}
