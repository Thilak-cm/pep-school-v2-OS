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

## Classroom directory and classroom access

Active classroom documents are internal staff directory metadata. Any authenticated user with a recognized staff role may read this metadata, even for classrooms they are not assigned to or responsible for.

Reading classroom metadata does not grant access to the classroom. Access to its students, observations, reports, media, and other student-facing data is controlled separately.

## Student access

Student records are not a school-wide staff directory.

A teacher may read a student record only when the student currently belongs to one of the teacher's assigned classrooms. A classroom admin may read a student record only when the student's current classroom is one of their manageable classrooms. A super admin may read any student record.

Student access follows the student's current `classroomId`. Authorship of an observation does not preserve access to the student after the student transfers to another classroom.

## Student transfers

A classroom admin may move a student into a classroom they manage. The classroom admin responsible only for the student's current classroom may not move the student into a classroom they do not manage. Teachers may not transfer students. A super admin may transfer any student.

A transfer changes the student's current `classroomId`, creates or updates the placement history, and updates the relevant classroom counts. Existing observations are not rewritten: each keeps the `classroomId` where it was logged.

Transfer behavior is tested as an explicit lifecycle: the pre-transfer state is verified first, the transfer operation is verified separately, and the post-transfer state is verified only after the operation succeeds.

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

## Media reads

A user may open a media file when they are allowed to read its associated observation through either an authorized classroom timeline or an authorized student timeline.

After a student transfers, staff with access to the previous classroom may continue opening media attached to observations logged in that classroom. Staff with access to the student's current classroom may open media across the student's complete observation history. Access through the previous classroom does not grant access to media from observations logged after the transfer.

Knowing or guessing a Storage path must not bypass these access rules.

## Creating observations

A teacher may create text, voice, lesson, and media observations for students who currently belong to one of the teacher's assigned classrooms. A classroom admin may do the same for students in their manageable classrooms. A super admin may create observations for any student.

The observation's parent student ID and `studentId` must match. Its `classroomId` must match the student's current classroom when the observation is created. Its `createdBy` must match the authenticated user, including when the creator is an admin.

For a multi-student note, every per-student observation must independently satisfy these rules.

## Lesson links

Lesson links are collaborative relationship metadata.

Any user who currently has access to a student may add or remove lesson relationships on that student's observations, regardless of who created the observations or how old they are.

This narrow update permission applies only when the changed fields are limited to:

- `linkedLessonObservationId`
- `linkedObservations`

If any other field changes in the same request, the request must satisfy the normal observation-editing policy.

## Editing observations

A teacher may edit an observation only when they currently have access to the student, they authored the observation, and the observation is within the 48-hour editing window.

Authorship alone is not sufficient. A teacher who loses access to a student cannot continue editing that student's observations, even when they are the author and the 48-hour window has not expired.

A classroom admin may edit observations for students who currently belong to one of their manageable classrooms, regardless of author or observation age. A super admin may edit any observation.

The lesson-link fields follow the separate narrow rule above.

## Deleting observations

A teacher may delete an observation only when they currently have access to the student, they authored the observation, and the observation is within the 48-hour editing window.

Authorship alone is not sufficient. A teacher who loses access to a student cannot delete that student's observations, even when they are the author and the 48-hour window has not expired.

A classroom admin may delete observations for students who currently belong to one of their manageable classrooms, regardless of author or observation age. A super admin may delete any observation.

Deleting a media observation may require deleting both its Firestore observation document and its Storage object. The same authorization relationship must protect both resources.
