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
