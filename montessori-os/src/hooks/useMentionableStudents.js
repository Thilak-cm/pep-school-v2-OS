import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const normalizeClassroomId = (student) => {
  const raw = student?.classroomId;
  if (!raw) return null;
  if (typeof raw === 'object' && raw.id) return raw.id;
  if (typeof raw === 'string') {
    return raw.includes('/') ? raw.split('/').pop() : raw;
  }
  return raw || null;
};

const buildNameFields = (student) => {
  const full = student?.displayName
    || student?.name
    || [student?.firstName, student?.lastName].filter(Boolean).join(' ')
    || 'Unnamed Student';
  const parts = full.split(' ').filter(Boolean);
  const firstName = student?.firstName || parts[0] || full;
  const lastName = student?.lastName || parts.slice(1).join(' ') || '';
  return { fullName: full, firstName, lastName };
};

/**
 * Returns mentionable students filtered by the user's role:
 * - Teachers: only students in classrooms they are assigned to.
 * - Admins: all students.
 */
export default function useMentionableStudents({ currentUser, userRole }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!currentUser?.uid) {
        setStudents([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        let allowedClassroomIds = null;
        let classroomNameById = {};

        if (userRole === 'teacher') {
          const classroomsQuery = query(
            collection(db, 'classrooms'),
            where('teacherIds', 'array-contains', currentUser.uid)
          );
          const classroomsSnap = await getDocs(classroomsQuery);
          const activeRooms = classroomsSnap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((c) => (c.status || 'active') !== 'archived');
          allowedClassroomIds = new Set(activeRooms.map((c) => c.id));
          classroomNameById = Object.fromEntries(activeRooms.map((c) => [c.id, c.name || '']));
        } else {
          // Admins/program admins: fetch active classrooms to show names
          const allClassroomsSnap = await getDocs(query(collection(db, 'classrooms'), where('status', '==', 'active')));
          classroomNameById = Object.fromEntries(
            allClassroomsSnap.docs.map((doc) => [doc.id, (doc.data() || {}).name || ''])
          );
        }

        const studentsSnap = await getDocs(collection(db, 'students'));
        let list = studentsSnap.docs.map((d) => {
          const data = d.data() || {};
          const classroomId = normalizeClassroomId(data);
          const names = buildNameFields(data);
          const classroomName = classroomNameById[classroomId] || '';
          return {
            id: d.id,
            ...data,
            classroomId,
            classroomName,
            classroom_name: classroomName,
            ...names,
          };
        });

        if (allowedClassroomIds) {
          list = list.filter((stu) => allowedClassroomIds.has(stu.classroomId));
        }

        list.sort((a, b) => a.fullName.localeCompare(b.fullName));
        if (mounted) setStudents(list);
      } catch (_err) {
        if (mounted) setError('Unable to load students for mentions.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [currentUser?.uid, userRole]);

  const byId = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s])),
    [students]
  );

  return { students, studentsById: byId, loading, error };
}
