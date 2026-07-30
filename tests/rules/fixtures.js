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
