import { Timestamp } from 'firebase/firestore';

export function baseFixture() {
  return {
    'users/teacherAAuthor': { role: 'teacher' },
    'classrooms/classroomA': {
      teacherIds: ['teacherAAuthor'],
      status: 'active',
    },
    'students/studentA': {
      classroomId: 'classroomA',
      firstName: 'Student',
      lastName: 'A',
      status: 'active',
    },
  };
}

const observedAt = {
  classroomA: Timestamp.fromDate(new Date('2026-01-10T10:00:00.000Z')),
  classroomB: Timestamp.fromDate(new Date('2026-02-10T10:00:00.000Z')),
};

/**
 * A purposeful post-transfer fixture for the timeline authorization contract.
 *
 * studentA currently belongs to classroomB, but retains one historical
 * observation logged in classroomA. studentB remains in classroomA.
 */
export function postTransferTimelineFixture() {
  return {
    'users/teacherAAuthor': { role: 'teacher' },
    'users/teacherAPeer': { role: 'teacher' },
    'users/teacherB': { role: 'teacher' },
    'users/classroomAdminA': {
      role: 'classroomadmin',
      manageableClassrooms: ['classroomA'],
    },
    'users/classroomAdminB': {
      role: 'classroomadmin',
      manageableClassrooms: ['classroomB'],
    },
    'users/superAdmin': { role: 'superadmin' },
    'users/unknownRoleUser': { role: 'unknown' },
    'classrooms/classroomA': {
      name: 'Classroom A',
      teacherIds: ['teacherAAuthor', 'teacherAPeer'],
      status: 'active',
    },
    'classrooms/classroomB': {
      name: 'Classroom B',
      teacherIds: ['teacherB'],
      status: 'active',
    },
    'students/studentA': {
      classroomId: 'classroomB',
      firstName: 'Student',
      lastName: 'A',
      status: 'active',
    },
    'students/studentB': {
      classroomId: 'classroomA',
      firstName: 'Student',
      lastName: 'B',
      status: 'active',
    },
    'students/studentA/observations/observationA': {
      type: 'text',
      studentId: 'studentA',
      classroomId: 'classroomA',
      text: 'Student A observation from classroom A',
      createdBy: 'teacherAAuthor',
      createdAt: observedAt.classroomA,
      observedAt: observedAt.classroomA,
    },
    'students/studentA/observations/observationB': {
      type: 'text',
      studentId: 'studentA',
      classroomId: 'classroomB',
      text: 'Student A observation from classroom B',
      createdBy: 'teacherB',
      createdAt: observedAt.classroomB,
      observedAt: observedAt.classroomB,
    },
    'students/studentB/observations/observationStudentB': {
      type: 'text',
      studentId: 'studentB',
      classroomId: 'classroomA',
      text: 'Student B observation from classroom A',
      createdBy: 'teacherAPeer',
      createdAt: observedAt.classroomA,
      observedAt: observedAt.classroomA,
    },
  };
}

export function observationWriteFixture() {
  const recent = Timestamp.fromMillis(Date.now() - (60 * 60 * 1000));
  const expired = Timestamp.fromMillis(Date.now() - (49 * 60 * 60 * 1000));
  const justInside48Hours = Timestamp.fromMillis(Date.now() - ((48 * 60 - 1) * 60 * 1000));
  const justOutside48Hours = Timestamp.fromMillis(Date.now() - ((48 * 60 + 1) * 60 * 1000));

  return {
    'users/teacherAAuthor': { role: 'teacher' },
    'users/teacherAPeer': { role: 'teacher' },
    'users/teacherB': { role: 'teacher' },
    'users/classroomAdminA': {
      role: 'classroomadmin',
      manageableClassrooms: ['classroomA'],
    },
    'users/classroomAdminB': {
      role: 'classroomadmin',
      manageableClassrooms: ['classroomB'],
    },
    'users/superAdmin': { role: 'superadmin' },
    'users/unknownRoleUser': { role: 'unknown' },
    'classrooms/classroomA': {
      teacherIds: ['teacherAAuthor', 'teacherAPeer'],
      status: 'active',
    },
    'classrooms/classroomB': {
      teacherIds: ['teacherB'],
      status: 'active',
    },
    'students/studentA': {
      classroomId: 'classroomA',
      firstName: 'Student',
      lastName: 'A',
      status: 'active',
    },
    'students/studentB': {
      classroomId: 'classroomB',
      firstName: 'Student',
      lastName: 'B',
      status: 'active',
    },
    'students/studentA/observations/recentText': {
      type: 'text',
      studentId: 'studentA',
      classroomId: 'classroomA',
      text: 'Recent observation',
      createdBy: 'teacherAAuthor',
      createdAt: recent,
      observedAt: recent,
    },
    'students/studentA/observations/expiredText': {
      type: 'text',
      studentId: 'studentA',
      classroomId: 'classroomA',
      text: 'Expired observation',
      createdBy: 'teacherAAuthor',
      createdAt: expired,
      observedAt: expired,
    },
    'students/studentA/observations/inside48HourText': {
      type: 'text',
      studentId: 'studentA',
      classroomId: 'classroomA',
      text: 'Observation just inside the author action window',
      createdBy: 'teacherAAuthor',
      createdAt: justInside48Hours,
      observedAt: justInside48Hours,
    },
    'students/studentA/observations/outside48HourText': {
      type: 'text',
      studentId: 'studentA',
      classroomId: 'classroomA',
      text: 'Observation just outside the author action window',
      createdBy: 'teacherAAuthor',
      createdAt: justOutside48Hours,
      observedAt: justOutside48Hours,
    },
    'students/studentA/observations/lessonA': {
      type: 'lesson',
      studentId: 'studentA',
      classroomId: 'classroomA',
      lessonTitle: 'Lesson A',
      createdBy: 'teacherAAuthor',
      createdAt: recent,
      observedAt: recent,
    },
  };
}

export function transferLifecycleFixture() {
  const createdAt = Timestamp.fromDate(new Date('2026-01-01T08:00:00.000Z'));
  const observedAt = Timestamp.fromDate(new Date('2026-01-10T10:00:00.000Z'));

  return {
    'users/teacherAAuthor': { role: 'teacher' },
    'users/teacherB': { role: 'teacher' },
    'users/classroomAdminA': {
      role: 'classroomadmin',
      manageableClassrooms: ['classroomA'],
    },
    'users/classroomAdminB': {
      role: 'classroomadmin',
      manageableClassrooms: ['classroomB'],
    },
    'users/superAdmin': { role: 'superadmin' },
    'classrooms/classroomA': {
      name: 'Classroom A',
      branchId: 'branchA',
      teacherIds: ['teacherAAuthor'],
      status: 'active',
    },
    'classrooms/classroomB': {
      name: 'Classroom B',
      branchId: 'branchB',
      teacherIds: ['teacherB'],
      status: 'active',
    },
    'students/studentA': {
      classroomId: 'classroomA',
      branchId: 'branchA',
      firstName: 'Student',
      lastName: 'A',
      status: 'active',
      createdAt,
    },
    'students/studentA/placements/2026-01-01__classroomA': {
      classroomId: 'classroomA',
      startDate: '2026-01-01',
      endDate: null,
      status: 'active',
      createdAt,
    },
    'students/studentA/observations/observationA': {
      type: 'text',
      studentId: 'studentA',
      classroomId: 'classroomA',
      text: 'Observation logged before transfer',
      createdBy: 'teacherAAuthor',
      createdAt: observedAt,
      observedAt,
    },
  };
}
