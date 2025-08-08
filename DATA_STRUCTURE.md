# Montessori OS – Firestore Data Model (Focused v1)

## 🎯 Goals
- Minimize friction for teachers to add notes to assigned students
- Scale to many classrooms/students with fast timelines and analytics
- Keep rules simple, safe, and performant in Firestore

---

## 📚 Collections Overview
- `users/{uid}`
- `classrooms/{classroomId}`
- `students/{studentId}`
- `students/{studentId}/observations/{observationId}` (collection group: `observations`)

Notes:
- We intentionally defer tags, attendance, and assessments. Add later without breaking this core.
- Observation docs are fan-out per student (for group notes, write one doc per student). This makes student timelines trivial and admin analytics fast via collection group queries.

---

## 👤 Users (`/users/{uid}`)
```typescript
interface User {
  // Identity
  displayName: string;
  email: string;
  photoURL?: string;

  // Access
  role: 'admin' | 'teacher';
  status: 'active' | 'inactive' | 'suspended';
  
  // Metadata
  createdAt: Timestamp; // server time
  updatedAt: Timestamp; // server time
  lastLoginAt?: Timestamp;
}
```
Guidance
- Use document ID as the Auth UID; do not duplicate as a field.
- Roles live here and are read by rules; no custom claims required.

---

## 🏫 Classrooms (`/classrooms/{classroomId}`)
```typescript
interface Classroom {
  name: string;                  // "Room 3"
  ageGroup: 'toddler' | 'primary' | 'elementary' | 'adolescence';
  status: 'active' | 'inactive' | 'archived';
  
  teacherIds: string[];          // UIDs assigned to this classroom
  
  // Server-maintained summary
  studentCount: number;          // count of active students
  
  // Metadata
  createdAt: Timestamp;          // server time
  updatedAt: Timestamp;          // server time
  createdBy: string;             // uid
}
```
Guidance
- `teacherIds` is the source of truth for teacher access in rules.
- Maintain `studentCount` via backend trigger on student create/delete/move.

---

## 👶 Students (`/students/{studentId}`)
```typescript
interface Student {
  firstName: string;
  lastName: string;
  displayName: string;           // convenience: "First Last"

  classroomId: string;           // reference by ID to classrooms/{classroomId}

  status: 'active' | 'inactive' | 'graduated' | 'transferred' | 'withdrawn';
  isActive: boolean;             // mirrors status == 'active' for fast filters

  dateOfBirth?: Timestamp;
  
  // Metadata
  createdAt: Timestamp;          // server time
  updatedAt: Timestamp;          // server time
  createdBy: string;             // uid
}
```
Guidance
- Queries commonly include `classroomId` and `isActive`.
- If a student moves classrooms, update `classroomId` and adjust `studentCount` in both rooms server-side.

---

## 📝 Observations (`/students/{studentId}/observations/{observationId}`)
Collection group name: `observations`
```typescript
interface Observation {
  // Identity
  studentId: string;             // must equal parent {studentId}
  classroomId: string;           // denorm for queries/rules; must equal student's classroomId
  groupId?: string;              // shared id across fan-out docs for a multi-student note
  
  // Content
  type: 'text' | 'voice';        // core types for v1
  text?: string;
  audioUrl?: string;
  durationSec?: number;
  sttConfidence?: number;

  // Timestamps
  observedAt: Timestamp;         // when the observation happened
  createdAt: Timestamp;          // server time
  updatedAt: Timestamp;          // server time

  // Creator
  createdBy: string;             // uid
  createdByName?: string;        // cached for UX
  createdByEmail?: string;       // cached for UX
}
```
Why fan-out per student?
- Student timeline = 1 query
- Classroom, teacher, and admin analytics = collection group queries
- No need for `array-contains` tricks or cross-doc joins in rules

---

## 🔎 Core Query Patterns
- Teacher’s classrooms: `classrooms` where `teacherIds` array-contains `uid`
- Students in a classroom: `students` where `classroomId == X` and `isActive == true`
- Student timeline: `students/{sid}/observations` order by `observedAt` desc
- Classroom timeline: collection group `observations` where `classroomId == X` order by `observedAt` desc
- Teacher’s notes: collection group `observations` where `createdBy == uid` order by `observedAt` desc
- Admin analytics: collection group `observations` filter by `classroomId`, `createdBy`, and `observedAt` range

---

## 📇 Indexes
- `students`
  - `classroomId ASC, isActive ASC`
- collection group `observations`
  - `classroomId ASC, observedAt DESC`
  - `createdBy ASC, observedAt DESC`
  - optionally `groupId ASC, observedAt DESC`

---

## 🔒 Security Rules – Hooks
Helper checks (pseudocode names):
- `isAdmin(uid)`: `get(/users/uid).role == 'admin'`
- `isTeacher(uid)`: `get(/users/uid).role == 'teacher'`
- `classroomHasTeacher(classroomId, uid)`: `get(/classrooms/classroomId).teacherIds` contains `uid`
- `studentClassroomId(studentId)`: `get(/students/studentId).classroomId`

Reads
- `users`: user reads own; admin reads all
- `classrooms`: admin all; teacher if `classroomHasTeacher(id, uid)`
- `students`: admin all; teacher if `classroomHasTeacher(student.classroomId, uid)`
- `observations` (collection group): admin all; teacher if `classroomHasTeacher(classroomId, uid)`

Creates – observations
- Allow if teacher AND all of the following:
  - `createdBy == request.auth.uid`
  - `studentId == path.studentId`
  - `classroomId == studentClassroomId(studentId)`
  - `createdAt`/`updatedAt` set to `request.time` (server), `observedAt` provided by client

Updates/Deletes – observations
- Admin only (matches current behavior). If enabling teacher edits later, restrict mutable fields and preserve ownership/IDs.

Field immutability (on update)
- `studentId`, `classroomId`, `createdBy`, `createdAt`, `observedAt` unchanged

---

## 🛠 Backend Maintenance (recommended)
- Maintain `classrooms.studentCount` via triggers on student create/update/delete
- If needed later: sharded counters for classroom/teacher observation counts
- For group notes, generate a `groupId` once and fan-out to all targeted students

---

## ✅ Rationale
- Fan-out per student + collection group queries balances write cost (bounded by class size) with extremely fast reads
- Single source of truth for access (`classrooms.teacherIds`) keeps rules simple and auditable
- Denormalized `classroomId` on observations avoids extra reads in queries and security rules
- Cached creator name/email prevents n+1 user lookups in UI and reports


