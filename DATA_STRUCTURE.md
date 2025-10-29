# Montessori OS – Firestore Data Model (Focused v1)

## 🎯 Goals
- Minimize friction for teachers to add notes to assigned students
- Scale to many classrooms/students with fast timelines and analytics
- Keep rules simple, safe, and performant in Firestore

---

## 📚 Collections Overview
- `branches/{branchId}`
- `programs/{programId}`
- `users/{uid}`
- `classrooms/{classroomId}`
- `students/{studentId}`
- `students/{studentId}/observations/{observationId}`  // collection group: `observations`
- `feedback/{feedbackId}`
- `ai_prompts/{docId}`

Notes:
- We intentionally defer tags, attendance, and assessments. Add later without breaking this core.
- Observation docs are fan-out per student (for group notes, write one doc per student). This makes student timelines trivial and admin analytics fast via collection group queries.

Branch model overview
- Add a first-class `branchId` dimension to core docs (users, classrooms, students, observations) to isolate data per campus/center.
- `branches` is a lightweight metadata collection; you created four empty docs already: `hsr`, `whitefield`, `varthur`, `hyderabad`.
- Admins are global; teachers/staff are scoped to one or more branches via `branchIds`.
- Programs are global at `/programs/{programId}`.

```typescript
// Shared types
type BranchId = 'hsr' | 'whitefield' | 'varthur' | 'hyderabad';
type ProgramId = 'toddler' | 'primary' | 'elementary' | 'adolescent';
```

---

## 🌿 Branches (`/branches/{branchId}`)
Purpose: Metadata and feature toggles per physical branch. Docs may be empty; fields below are optional and can be added over time.

```typescript
interface BranchDoc {
  // Display
  id: BranchId;                  // document ID (e.g., 'hsr')
  name?: string;                 // e.g., 'HSR'
  status?: 'active' | 'inactive';
  order?: number;                // for UI sorting
  color?: string;                // e.g., '#4f46e5'
  timezone?: string;            // IANA, e.g., 'Asia/Kolkata'

  // Optional toggles / metadata
  featureFlags?: string[];

  // Audit
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
```
Guidance
- Keep docs simple; the presence of a doc is enough to list a branch.
- Use slugs `hsr`, `whitefield`, `varthur`, `hyderabad` as document IDs.
- UI: show the currently selected branch in Profile; admins choose a branch on entry before landing.

---

## 👤 Users (`/users/{uid}`)
```typescript
interface User {
  // Identity
  displayName: string;
  email: string;
  photoURL?: string;

  // Access
  role: 'admin' | 'teacher';     // admins are global; teachers are branch-scoped
  
  // Branch scope
  branchIds?: BranchId[];        // branches this user can access (teachers/coaches can have multiple)
  homeBranchId?: BranchId;       // preferred/default branch for UI selection
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
- Admins: global by default (ignore branchIds for access control, but you may store `homeBranchId` to preselect UI branch).
- Coaches/specialists: can be represented as `role: 'teacher'` with multiple `branchIds` until finer-grained roles are introduced.

---

## 🏫 Classrooms (`/classrooms/{classroomId}`)
```typescript
interface Classroom {
  name: string;                  // "Room 3"
  // Renamed from ageGroup → programId
  programId: 'toddler' | 'primary' | 'elementary' | 'adolescent';
  status: 'active' | 'inactive' | 'archived';
  
  branchId: BranchId;            // exactly one branch per classroom
  
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
- Classroom IDs must be globally unique across branches if kept at the collection root. If you plan to reuse names/IDs per branch, generate unique IDs (e.g., prefix with branch slug) and store human-friendly names separately.

Migration notes
- The previous field `ageGroup` is replaced by `programId`.
- Valid values: `toddler`, `primary`, `elementary`, `adolescent`.
- Recommended descriptions per program:
  - Adolescent: Age range 12–14 yo (Grades 6–8)
  - Elementary: Age range 6–11 yo (Grades 1–5)
  - Primary: Age range 3–6 yo
  - Toddler: Age range <3 yo

Environments → current classrooms
- adolescent (grades 6–8 · 12–14 yo): allstars
- elementary (grades 1–5 · 6–11 yo): amazing, power
- primary (3–6 yo): plumeria, periwinkle, gulmohar
- toddler (<3 yo): parijat

These are captured in the `programs` collection (see below), with each program document listing its classroom document paths.

---

## 👶 Students (`/students/{studentId}`)
```typescript
interface Student {
  firstName: string;
  lastName: string;
  displayName: string;           // convenience: "First Last"

  classroomId: string;           // reference by ID to classrooms/{classroomId}
  branchId: BranchId;            // denorm; must equal the classroom's branchId

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
 - When a student transfers across branches, update `branchId` to the new classroom's branch; historical observations remain under their original `branchId` for analytics integrity.
 - Student IDs follow `YYYY-XXX-NNN` where:
   - `YYYY` is the current year at creation time (e.g., 2026)
   - `XXX` is a three-letter classroom code derived from the classroom document ID (slug), uppercased and padded
   - `NNN` is a zero-padded index per classroom and year starting from 001
   - The index resets each new year per classroom. On create, clients compute the next index by scanning existing IDs for the same classroom and year, then attempt to write `students/{studentId}`. If a collision occurs, recompute and retry once.

ID uniqueness note
- If the same classroom slug exists in multiple branches, the `XXX` code may collide across branches. To avoid global ID conflicts in the top-level `students` collection, either:
  - Include a branch code in the ID (e.g., `YYYY-BBB-XXX-NNN` where `BBB` is the branch slug), or
  - Ensure classroom IDs are globally unique across branches and keep the current `YYYY-XXX-NNN` format.

---

## 📝 Observations (`/students/{studentId}/observations/{observationId}`)
Collection group name: `observations`
```typescript
interface Observation {
  // Identity
  studentId: string;             // must equal parent {studentId}
  classroomId: string;           // denorm for queries/rules; must equal student's classroomId
  branchId: BranchId;            // denorm for rules and analytics; equals the student's branch at time of creation
  groupId?: string;              // shared id across fan-out docs for a multi-student note
  
  // Content
  type: 'text' | 'voice';        // core types for v1
  text: string;
  durationSec?: number;
  sttConfidence?: number;

  // 🆕 Coach (GPT review result + telemetry; no schema/prompt version fields)
  coach: {
    status: 'ok' | 'timeout' | 'error';
    reason?: 'none' | 'rate_limit' | 'parse_error' | 'net_timeout' | 'server_error';

    // Nudges actually shown (max 2), in shown order (priority-driven)
    nudgesShown?: Array<{
      id: 'duration' | 'modality' | 'independence' | 'evidence' | 'subjective';
      confidence?: number;       // 0..1 (logged only)
    }>;

    // Teacher selections → appended to text (append-only)
    selections?: {
      duration_range?: '<5m' | '5–10m' | '10–20m' | '20m+';
      modality?: 'Material' | 'Pen & paper' | 'Mental';
      independence?: 'Independent' | 'Peer pair' | 'Small group' | 'Teacher-guided';

      // Evidence pairing: if either is set, require both; render as X/Y
      evidence_attempts?: number;
      evidence_correct?: number;
      evidence_quote?: string;

      // Optional one-line objective rewrite offered by Coach and accepted by teacher
      objective_line?: string;

      // (Future) If material confirm chip is added later
      inferred_material?: string | null;
    };
  };

  // 🆕 Quality proxy
  starScore?: number;            // integer 1–5

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

Branch transfer behavior
- Existing observations retain their original `branchId` when a student transfers to another branch. New observations pick up the student's current branch.

---

## 💬 Feedback (`/feedback/{feedbackId}`)
```typescript
interface Feedback {
  // User Information
  userId: string;                // must equal request.auth.uid
  userEmail: string;             // cached for admin review
  userRole: 'admin' | 'teacher';
  userDisplayName: string;       // cached for admin review
  userClassrooms: string[];      // classroom IDs user has access to
  
  // Content
  message: string;               // required feedback text
  category?: 'bug' | 'feature' | 'ui-ux' | 'performance' | 'general';
  
  // Metadata
  timestamp: Timestamp;          // when feedback was submitted
  appVersion: string;            // app version for debugging
  userAgent: string;             // browser/device info for debugging
  
  // Admin Management
  status: 'new' | 'reviewed' | 'implemented' | 'declined';
  adminNotes?: string;           // private admin notes
  updatedAt?: Timestamp;         // when status was last updated
  lastReviewedBy?: string;       // admin UID who last reviewed
  lastReviewedAt?: Timestamp;    // when last reviewed
}
```
Guidance
- All users can create feedback; only admins can update/delete
- `userId` must match `request.auth.uid` for security
- Status workflow: new → reviewed → implemented/declined
- Admin notes are private and only visible to admins
- Keep feedback global (not branch-scoped) per product decision.

---

## 🧭 Programs (`/programs/{programId}`)
Program documents represent Montessori environments and list the classrooms belonging to each program. Seeded/managed by admin scripts.

```typescript
type ProgramId = 'adolescent' | 'elementary' | 'primary' | 'toddler';

interface ProgramDoc {
  classrooms: string[]; // e.g., ["classrooms/allstars", "classrooms/amazing"]
  updatedAt: Timestamp; // server time
}
```

Notes
- Document IDs are fixed to the four environments above.
- `classrooms` stores document-path strings (not DocumentReference) for portability with admin scripts and simple reads.
- Populated by `scripts/admin/seed-programs.js`, which scans `classrooms` by `programId` and writes `programs/{programId}`.
- Client UI reads this collection to group classrooms by program on the Classrooms list.

---

## 🤖 AI Prompts (`/ai_prompts/{docId}`)
Centralized prompts for AI features with simple version history. Read by clients at runtime with a 5‑minute TTL cache; writes restricted to admins.

Documents
- `text_summarizer` — prompts for the Text Cleanup feature
- `voice_transcriber` — context string for Whisper speech‑to‑text

ai_prompts/text_summarizer
```typescript
interface TextSummarizerDoc {
  // Display metadata
  title: string;                 // e.g., "Text Cleanup (Observation Notes)"
  description: string;           // e.g., "Prompts used to clean up observation notes via AI."

  // Prompts used by src/textCleanup.js
  systemPrompt: string;          // system role content guiding the model
  userPrompt: string;            // supports ${tone} and ${text} template vars

  // Change tracking (managed by admin UI)
  version: number;               // monotonically increasing
  updatedAt: Timestamp;          // server time
  updatedBy: { uid: string; email: string; name: string };
  seed?: boolean;                // true if populated by seed script
  versions?: Array<{
    version: number;
    systemPrompt?: string;
    userPrompt?: string;
    updatedAt: Timestamp;
    updatedBy: { uid: string; email: string; name: string };
    changeNote?: string;
  }>;                            // last few snapshots (UI keeps up to 5)
}
```
Example current values
- title: "Text Cleanup (Observation Notes)"
- description: "Prompts used to clean up observation notes via AI."
- systemPrompt: "You are an assistant that cleans up Montessori observation notes. Goals: fix capitalization, grammar, and punctuation; group into clear short paragraphs (1–3 sentences each); use succinct hyphen bullets only when listing actions or next steps; keep tone neutral and observational. Rules: - Preserve all factual content, names, and dates; do not add or infer details. - Sentence case capitalization; correct accidental ALL CAPS (keep acronyms like IEP, ESL). - Ensure consistent spacing and final punctuation for sentences. - Keep it parent- and teacher-friendly; avoid clinical jargon. - Output plain text with line breaks (no headings, no markdown formatting beyond simple "- " bullets). - Return only the refined note text, with clean, readable structure."
- userPrompt: "Please clean up the following observation. Density: ${tone}. --- ${text} ---"
- version: 1
- updatedAt: <Timestamp>
- updatedBy: { uid, email, name }
- seed: true

ai_prompts/voice_transcriber
```typescript
interface VoiceTranscriberDoc {
  // Display metadata
  title: string;                 // e.g., "Voice Transcriber Context"
  description: string;           // e.g., "Context string provided to the STT engine to bias educational content."

  // Prompt used by src/whisperSTT.js (sent to Whisper as `prompt`)
  contextPrompt: string;

  // Change tracking (managed by admin UI)
  version: number;               // monotonically increasing
  updatedAt: Timestamp;          // server time
  updatedBy: { uid: string; email: string; name: string };
  seed?: boolean;                // true if populated by seed script
  versions?: Array<{
    version: number;
    contextPrompt?: string;
    updatedAt: Timestamp;
    updatedBy: { uid: string; email: string; name: string };
    changeNote?: string;
  }>;                            // last few snapshots (UI keeps up to 5)
}
```
Example current values
- title: "Voice Transcriber Context"
- description: "Context string provided to the STT engine to bias educational content."
- contextPrompt: "This is a Montessori teacher recording educational observations about student learning and development. Content includes Montessori methodology, curriculum areas, student names, developmental milestones, and classroom activities."
- version: 1
- updatedAt: <Timestamp>
- updatedBy: { uid, email, name }
- seed: true

Client usage
- `src/services/promptProvider.js` reads `ai_prompts` with a 5‑minute TTL cache.
- `src/textCleanup.js` uses `systemPrompt` and `userPrompt`; falls back to baked‑in defaults on fetch failure.
- `src/whisperSTT.js` uses `contextPrompt`; falls back to a safe default on fetch failure.
- Admins manage these via `AICapabilitiesPage` (`/aiPrompts`) with edit, save, and one‑click revert (maintains `versions`).

Security
- Reads: any authenticated user (rules allow read on `ai_prompts/*`).
- Writes: admins only.

---

## 🔎 Core Query Patterns
- Branch listing (for UI): list `branches` (all docs)
- Teacher’s classrooms (by branch): `classrooms` where `branchId == B` AND `teacherIds` array-contains `uid`
- Students in a classroom: `students` where `branchId == B` AND `classroomId == X` AND `isActive == true`
- Student timeline: `students/{studentId}/observations` order by `observedAt` desc
- Classroom timeline: collection group `observations` where `branchId == B` AND `classroomId == X` order by `observedAt` desc
- Teacher’s notes: collection group `observations` where `branchId == B` AND `createdBy == uid` order by `observedAt` desc
- Admin analytics: collection group `observations` filter by `branchId`, `classroomId`, `createdBy`, and `observedAt` range
- User feedback: `feedback` where `userId == uid` order by `timestamp` desc
- Admin feedback management: `feedback` order by `timestamp` desc (all feedback)

---

## 📇 Indexes
- `classrooms`
  - `branchId ASC, status ASC`
- `students`
  - `branchId ASC, classroomId ASC, isActive ASC`
- collection group `observations`
  - `branchId ASC, observedAt DESC`
  - `branchId ASC, createdBy ASC, observedAt DESC`
  - `classroomId ASC, observedAt DESC`
  - optionally `groupId ASC, observedAt DESC`
- `feedback`
  - `userId ASC, timestamp DESC`
  - `status ASC, timestamp DESC`
  - `category ASC, timestamp DESC`

---

## 🔒 Security Rules – Hooks
Helper checks (pseudocode names):
- `isAdmin(uid)`: `get(/users/uid).role == 'admin'`
- `isTeacher(uid)`: `get(/users/uid).role == 'teacher'`
- `classroomHasTeacher(classroomId, uid)`: `get(/classrooms/classroomId).teacherIds` contains `uid`
- `studentClassroomId(studentId)`: `get(/students/studentId).classroomId`
// Branch helpers
- `userBranches(uid)`: `get(/users/uid).branchIds` or `[get(/users/uid).homeBranchId]`
- `userInBranch(uid, branchId)`: `branchId` in `userBranches(uid)` OR `isAdmin(uid)`

Branch invariants
- `students/{id}.branchId == classrooms/{classroomId}.branchId`
- `observations/{id}.branchId == students/{studentId}.branchId` at creation time

Reads
- `users`: user reads own; admin reads all
- `classrooms`: admin all; teacher if `classroomHasTeacher(id, uid)` AND `userInBranch(uid, classroom.branchId)`
- `students`: admin all; teacher if `classroomHasTeacher(student.classroomId, uid)` AND `userInBranch(uid, student.branchId)`
- `observations` (collection group): admin all; teacher if `classroomHasTeacher(classroomId, uid)` AND `userInBranch(uid, observation.branchId)`
- `ai_prompts`: any authenticated user (client fetch)
- `branches`: any authenticated user can read (for UI selection; writes admin-only)
- `programs`: signed-in read; admin write

Creates – observations
- Allow if teacher AND all of the following:
  - `createdBy == request.auth.uid`
  - `studentId == path.studentId`
  - `classroomId == studentClassroomId(studentId)`
  - `branchId == get(/students/studentId).branchId`
  - `createdAt`/`updatedAt` set to `request.time` (server), `observedAt` provided by client

Updates/Deletes – observations
- Admin only (matches current behavior). If enabling teacher edits later, restrict mutable fields and preserve ownership/IDs.

Field immutability (on update)
- `studentId`, `classroomId`, `branchId`, `createdBy`, `createdAt`, `observedAt` unchanged

---

## 🔒 Security Rules – Feedback
Reads
- `feedback`: user reads own; admin reads all

Creates
- Allow if authenticated AND `userId == request.auth.uid`

Updates/Deletes
- Admin only (status management and admin notes)

Field immutability (on update)
- `userId`, `userEmail`, `userRole`, `userDisplayName`, `userClassrooms`, `message`, `category`, `timestamp`, `appVersion`, `userAgent` unchanged
- Only `status`, `adminNotes`, `updatedAt`, `lastReviewedBy`, `lastReviewedAt` can be modified

---

## 🛠 Backend Maintenance (recommended)
- Maintain `classrooms.studentCount` via triggers on student create/update/delete
- Keep `programs/*` refreshed using `scripts/admin/seed-programs.js` after classroom changes
- If needed later: sharded counters for classroom/teacher observation counts
- For group notes, generate a `groupId` once and fan-out to all targeted students

Migration/backfill (branches)
- Add `branchId: 'hsr'` to all existing `classrooms`, `students`, and `observations`.
- For `users` with role `teacher`, set `branchIds` based on assigned classrooms; for admins, optionally set `homeBranchId`.
- Validate invariants and fix mismatches before enabling rules.

---

## ✅ Rationale
- Fan-out per student + collection group queries balances write cost (bounded by class size) with extremely fast reads
- Single source of truth for access (`classrooms.teacherIds`) keeps rules simple and auditable
- Denormalized `classroomId` and `branchId` on observations avoids extra reads in queries and security rules
- Cached creator name/email prevents n+1 user lookups in UI and reports
- Feedback system provides user input channel while maintaining security through user ownership and admin-only management
