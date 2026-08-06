# Pep OS Access-Control Policy

This document is the plain-English source of truth for who should be able to access data in Pep OS and what each access-controlled part of the app is meant to do.

The intended product behavior comes first. The frontend, Firebase rules, and other implementation details should follow the behavior defined here.

This document is intentionally small and will grow as access behavior is clarified. An area not yet described here has not yet been explicitly defined.

## Roles

### Teacher

A teacher has access to a classroom when their user ID is included in that classroom's `teacherIds`.

### Classroom admin

A classroom admin has access to a classroom when that classroom is included in their `manageableClassrooms`.

### Super admin

A super admin has school-wide access. This broader access does not change what a screen means or which records belong on that screen.

## Classroom timeline

A classroom timeline shows observations that were logged in that classroom.

An observation's `classroomId` records the classroom where the observation was logged. It is historical information. Transferring a student to another classroom does not change the `classroomId` on their existing observations.

A user may open a classroom timeline only when they currently have access to that classroom. The timeline must not include observations logged in other classrooms.

## Student timeline

A student timeline shows the student's complete observation history, including observations logged in previous classrooms.

A user may open a student timeline only when they currently have access to that student through the student's current classroom.

When a student transfers to a new classroom:

- Staff with access to the new classroom can see the student's complete timeline, including observations from previous classrooms.
- Staff who no longer have access to the student cannot open the student's timeline.
- The previous classroom's timeline continues to show observations logged while the student belonged to that classroom.
- New observations appear in the new classroom's timeline, not the previous classroom's timeline.

## Authorship and read access

Authorship does not override current access.

Creating an observation does not give its author permanent permission to read it. If the author later loses access to the relevant classroom or student, authorship alone must not preserve read access.
