# Montessori OS – Firestore Data Model (Focused v1)

## 🎯 Goals
- Minimize friction for teachers to add notes to assigned students
- Scale to many classrooms/students with fast timelines and analytics
- Keep rules simple, safe, and performant in Firestore

---

## 👥 Roles & access tiers
- **Super admins** – current global admins. Full CRUD everywhere (users/programs/branches/AI prompts/classrooms/students/placements/observations/feedback). They can promote/demote other admins, edit `manageableClassrooms`, and use any cross-program tooling.
- **Classroom admins** – classroom-scoped operators. They read `classrooms`, `branches`, and `feedback`, and can write student-facing data only within the classrooms in their `manageableClassrooms` list: CRUD students, placements, observations, and teacher/student user docs. They cannot touch AI prompts nor promote other admins.
- **Teachers** – unchanged. Classroom-scoped contributors who create observations for assigned classrooms and manage their own profiles.

---

## 📚 Collections Overview
- `branches/{branchId}`
- `programs/{programId}`
- `users/{uid}`
- `classrooms/{classroomId}`
- `students/{studentId}`
- `students/{studentId}/observations/{observationId}`  // collection group: `observations`
- `students/{studentId}/media/{mediaId}`               // uploaded photos, videos, PDFs
- `feedback/{feedbackId}`
- `ai_prompts/{docId}`
 - `config/{docId}`

Notes:
- We intentionally defer tags, attendance, and assessments. Add later without breaking this core.
- Observation docs are fan-out per student (for group notes, write one doc per student). This makes student timelines trivial and admin analytics fast via collection group queries.

Branch model overview
- Add a first-class `branchId` dimension to core docs (users, classrooms, students, observations) to isolate data per campus/center.
- `branches` is a lightweight metadata collection; you created four empty docs already: `hsr`, `whitefield`, `varthur`, `kokapet`.
- Admins are global; teachers/staff are scoped to one or more branches via `branchIds`.
- Programs are global at `/programs/{programId}`.

```typescript
// Shared types
type BranchId = 'hsr' | 'whitefield' | 'varthur' | 'kokapet';
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

  // Classrooms
  classrooms?: string[];         // array of classroom document IDs belonging to this branch
                                 // e.g., ['adolescent', 'allstars', 'amazing'] for 'hsr'

  // Optional toggles / metadata
  featureFlags?: string[];

  // Audit
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
```
Guidance
- Keep docs simple; the presence of a doc is enough to list a branch.
- Use slugs `hsr`, `whitefield`, `varthur`, `kokapet` as document IDs.
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
  role: 'superadmin' | 'admin' | 'teacher'; // superadmin is global, admin is program-scoped
  manageableClassrooms?: ProgramId[];         // required (non-empty) when role == 'admin'
  
  // Branch scope
  branchIds?: BranchId[];        // branches this user can access (teachers/coaches can have multiple)
  homeBranchId?: BranchId;       // preferred/default branch for UI selection
  status: 'active' | 'inactive' | 'suspended';
  
  // Lesson shortcuts
  studentAliases?: Record<string, StudentAlias>; // keyed by aliasId
  
  // Metadata
  createdAt: Timestamp; // server time
  updatedAt: Timestamp; // server time
  lastLoginAt?: Timestamp;
}
```
Guidance
- Use document ID as the Auth UID; do not duplicate as a field.
- Roles live here and are read by rules; no custom claims required.
- Super admins ignore `manageableClassrooms`/`branchIds` for access control but can edit any admin’s `manageableClassrooms` list.
- Classroom admins MUST have `manageableClassrooms` populated with at least one `ProgramId`; UI should block save otherwise. These admins can act on students/placements/observations within those programs and invite teachers/students across branches.
- Classroom admins may create/update `users` docs only when `role == 'teacher'`. Attempts to write `role: 'admin' | 'superadmin'` are rejected unless performed by a super admin.
- Coaches/specialists: can be represented as `role: 'teacher'` with multiple `branchIds` until finer-grained roles are introduced.
- `studentAliases` is optional and only loaded for teachers that create personal student groups for faster lesson-note selection (see below).

### Student aliases (per user)
```typescript
interface StudentAlias {
  id: string;                    // convenience copy of the key from studentAliases.{id}
  name: string;                  // unique per user; shown in search
  description?: string;          // optional helper text
  studentIds: string[];          // UIDs of students across any classroom the teacher can access
  createdAt: Timestamp;          // server time
  updatedAt: Timestamp;          // server time
}
```
Guidance
- Store aliases directly on each user doc under `studentAliases.{aliasId}` so reads stay on the same document as the profile; expect <25 aliases per teacher.
- Alias IDs follow `alias_<slug>`; enforce uniqueness per user (UI lowercases + slugs names before writes). The `name` must be unique to keep search results deterministic.
- Teachers can include students from multiple classrooms they have access to. When logging a lesson tied to a single classroom, show all alias members but disable checkboxes for students outside the selected classroom so teachers understand the mismatch.
- Alias search results should list matching students first and then any alias chips containing those students. Selecting an alias expands to the familiar `ClassroomStudentPicker` list; all students start selected/present, and teachers uncheck out-of-scope students.
- CRUD is entirely user-scoped: no sharing yet. Security rules only allow owners (or admins editing on their behalf) to manage their own aliases.

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

  // Google Drive export (PEP-61)
  driveFolderId?: string;        // Google Drive folder ID for report exports (set on first export)

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

Subcollections
- `placements/{placementId}` – classroom history per student (see above).
- `observations/{observationId}` – per-student notes (text/voice/lesson).
- `media/{mediaId}` – uploaded photo/video/PDF files attached to observations (see below).
- `ai_summaries/baseball_card` – latest "Coach Pepper's summary" (overwritten daily). Shape: `{ bullets: string[], lessonSummary: string, noteCount: number, windowDays: number, timezone: string, model: string, temperature: number, promptVersion?: number, generatedAt: Timestamp, status?: 'ok' | 'no_notes', sourceNoteIds?: string[] }`.
- `ai_summaries/{reportDocId}` – AI-generated parent progress reports. Shape: `{ reportText: string, sentimentScore?: number, areaBalanceScore?: number, missingInputFlags?: string[], startDate: Timestamp, endDate: Timestamp, generatedAt: Timestamp, model: string, temperature: number, timezone: string, driveDocId?: string, driveDocLink?: string }`. The `driveDocId` and `driveDocLink` fields are set when the report is exported to Google Drive via the `exportReportToDrive` or `exportClassroomReportsToDrive` Cloud Functions.

ID uniqueness note
- If the same classroom slug exists in multiple branches, the `XXX` code may collide across branches. To avoid global ID conflicts in the top-level `students` collection, either:
  - Include a branch code in the ID (e.g., `YYYY-BBB-XXX-NNN` where `BBB` is the branch slug), or
  - Ensure classroom IDs are globally unique across branches and keep the current `YYYY-XXX-NNN` format.
- Access: classroom admins can only create/update/delete students whose `classroomId` resolves to a `programId` contained in their `manageableClassrooms`. Super admins bypass this check.

---

## 📦 Placements (history) (`/students/{studentId}/placements/{placementId}`)
Purpose: Keep an append-only history of which classroom a student belonged to over time, while `students/{id}.classroomId` remains the canonical current classroom.

Key points
- One active placement at a time (the doc with `endDate == null`).
- End-date inclusive semantics. The next placement starts on `previous.endDate + 1 day` (IST calendar day boundaries at 00:00 IST).
- Deterministic placementId naming for readability and idempotency: `YYYY-MM-DD__<classroomId>` where the date is the placement `startDate`.

Schema
```typescript
interface PlacementDoc {
  classroomId: string;        // classroom ID at the time
  startDate: string;          // 'YYYY-MM-DD' (IST), inclusive
  endDate: string | null;     // 'YYYY-MM-DD' (IST), inclusive; null = ongoing
  note?: string;              // optional free-text reason/comment

  // Optional convenience (not required by rules; keep if helpful)
  status?: 'active' | 'ended';
  createdAt?: Timestamp;      // server time (if set by scripts)
  createdByUid?: string;      // uid who created the doc
  updatedAt?: Timestamp;      // server time (if set by scripts)
}
```

Placement ID
- `placementId = ${startDate}__${classroomId}` (e.g., `2020-01-01__parijat`).
- Example graduation (Parijat → Periwinkle for Devisha):
  - Before: students/devishaYadav.classroomId = `parijat`
  - placements/`2020-01-01__parijat`: `{ startDate: '2020-01-01', endDate: null }`
  - Graduate with last day in Parijat: `2025-06-09`
    - Update placements/`2020-01-01__parijat`.endDate = `2025-06-09`
    - Create placements/`2025-06-10__periwinkle` with `{ startDate: '2025-06-10', endDate: null }`
    - Update students/devishaYadav.classroomId = `periwinkle`

Graduation write (per student, single transaction/batch)
- Inputs: `effectiveLastDay` (YYYY-MM-DD IST), `toClassroomId`, optional `note`.
- Steps:
  - Close current active placement: set `endDate = effectiveLastDay`.
  - Create new placement: `startDate = addOneDay(effectiveLastDay)`, `endDate = null`, `note` if provided.
  - Update `students/{id}.classroomId = toClassroomId`.

Invariants (client-enforced)
- Exactly one placement with `endDate == null` per student.
- No overlaps; new.startDate = prev.endDate + 1 day (IST).
- If `endDate` present, `startDate <= endDate`.

Query notes
- Current classroom: read from `students/{id}.classroomId`.
- History UI: list `/students/{id}/placements` ordered by `startDate` descending.
- Access: classroom admins may edit placements only when the underlying student’s classroom belongs to one of their `manageableClassrooms`. Super admins can edit any placement.

Indexes (optional, future)
- Collection group `placements`: composite on `classroomId ASC, startDate DESC` for classroom history.
- If needed: `classroomId ASC, endDate ASC` to find students active on a given day.

Backfill (one-time)
- For each student that has a `classroomId` and no placements:
  - Create placements/`2020-01-01__<classroomId>` with `{ startDate: '2020-01-01', endDate: null }`.
  - Do NOT add `currentPlacement` to the student; `classroomId` remains the source of truth for current.

---

## 📎 Media (`/students/{studentId}/media/{mediaId}`)
Per-student uploaded files (photos, videos, PDFs). One media doc per file per student; multi-student uploads fan out like observations.

```typescript
interface MediaDoc {
  studentId: string;             // must equal parent {studentId}
  classroomId: string;           // denorm; equals student's classroomId
  type: 'media';                 // constant
  mediaKind: 'photo' | 'video' | 'pdf';
  status: 'pending_upload' | 'uploaded' | 'error';

  media: Array<{
    storagePath: string;         // e.g., "students/{studentId}/media/{mediaId}/original.webp"
    contentType: string;         // MIME type
    sizeBytes: number;
    displayName?: string;
    originalName?: string;
    width?: number;              // photos only
    height?: number;             // photos only
  }>;

  // Teacher annotations
  teacherComment?: string;       // optional free-text caption

  // Per-image metadata (photos only)
  copied?: boolean;              // Teacher-set: true if student work is copied (default false)
  handwritten?: boolean;         // VLM-inferred: true if image contains handwriting (default false)
                                 // Set by Cloud Function `detectHandwritingVLM`

  // AI features
  pdfTitle?: string;             // AI-extracted title (PDFs only)
  essence_text?: string;         // AI-extracted essence summary (PDFs only)

  batchId?: string;              // shared across multi-file uploads in one session

  // Timestamps & creator
  observedAt: Timestamp;         // server time
  createdAt: Timestamp;          // server time
  updatedAt: Timestamp;          // server time
  createdBy: string;             // uid
  createdByName: string;
  createdByEmail: string;
}
```

Notes
- Media ID format: `media_<itemId>` where `itemId` is generated client-side.
- Photos are converted to WebP client-side before upload.
- `copied` is a teacher-set boolean toggle per photo (default `false`). Set during media upload.
- `handwritten` is a VLM-inferred boolean per photo (default `false`). Set automatically by the `detectHandwritingVLM` Cloud Function after photo upload. Both fields feed into the monthly writing snapshot job.

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
                                   // Format: `group_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
                                   // Set when creating notes for multiple students (text/voice/lesson notes)
                                   // All copies of the same note share the same groupId
                                   // Used in UI to group and display multi-student notes in condensed format
                                   // Optional: single-student notes and legacy notes may not have this field
  
  // Content
  type: 'text' | 'voice' | 'lesson';
  text?: string;                 // free text for text/voice notes
  durationSec?: number;          // voice notes only
  sttConfidence?: number;        // voice notes only
  lessonTitle?: string;          // lesson notes
  lessonDescription?: string;    // lesson notes
  groupComment?: string;         // lesson notes
  programId?: ProgramId;         // lesson notes – derived from classroom
  dimensionOrder?: string[];     // lesson notes – ordered list of dimension names
  groupDefaults?: Record<string, 'yes' | 'partial' | 'no' | 'na'>; // lesson notes – initial ratings
  ratings?: Record<string, 'yes' | 'partial' | 'no' | 'na'>;       // lesson notes – per student after overrides
  studentComment?: string;       // lesson notes – optional per-student comment
  attendanceStatus?: 'present' | 'absent'; // lesson notes

  // 🆕 Coach (GPT review result + telemetry; no schema/prompt version fields) — text/voice notes
  coach?: {
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

Group notes (groupId)
- When creating a note for multiple students, generate a single `groupId` and include it in all observation documents created for that note
- Format: `group_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` (e.g., `group_lx1234_abc5`)
- All observation documents sharing the same `groupId` represent the same note assigned to different students
- UI uses `groupId` to group and display multi-student notes in condensed format (e.g., "Student A, Student B + X more")
- Notes without `groupId` (single-student notes or legacy notes) display individually
- For lesson notes: `groupId` is set when `lessonMode === 'group'`; individual lesson notes do not have `groupId`

Branch transfer behavior
- Existing observations retain their original `branchId` when a student transfers to another branch. New observations pick up the student's current branch.
- Access: classroom admins can create/update/delete observations for students when `classroom.programId ∈ manageableClassrooms`. Teachers retain current create/read rights scoped by classroom membership; super admins remain unrestricted.

---

## 💬 Feedback (`/feedback/{feedbackId}`)
```typescript
interface Feedback {
  // User Information
  userId: string;                // must equal request.auth.uid
  userEmail: string;             // cached for admin review
  userRole: 'superadmin' | 'admin' | 'teacher';
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
- All users can create feedback; super admins manage status + notes, while classroom admins have read-only access to all feedback.
- `userId` must match `request.auth.uid` for security
- Status workflow: new → reviewed → implemented/declined
- Admin notes are private and only visible to admins (read) and super admins (write)
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
- Classroom admin `manageableClassrooms` values must match these document IDs.

---

## 🤖 AI Prompts (`/ai_prompts/{docId}`)
Centralized prompts for AI features with simple version history. Read by clients at runtime with a 5‑minute TTL cache; writes restricted to super admins.

Documents
- `text_summarizer` — prompts for the Text Cleanup feature
- `voice_transcriber` — context string for Whisper speech‑to‑text
- `coach_{program}` — per‑program configuration for the Coach feature where `program` ∈ `toddler | primary | elementary | adolescent`

ai_prompts/text_summarizer
```typescript
interface TextSummarizerDoc {
  // Display metadata
  title: string;                 // e.g., "Text Cleanup (Observation Notes)"
  description: string;           // e.g., "Prompts used to clean up observation notes via AI."

  // Prompts used by src/textCleanup.js
  systemPrompt: string;          // system role content guiding the model
  userPrompt: string;            // supports ${tone} and ${text} template vars

  // Change tracking (managed by super admin UI)
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

  // Change tracking (managed by super admin UI)
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
- Super admins manage these via `AICapabilitiesPage` (`/aiPrompts`) with edit, save, and one-click revert (maintains `versions`).

Security
- Reads: any authenticated user (rules allow read on `ai_prompts/*`).
- Writes: super admins only.

---

## ⚙️ Config (`/config/{docId}`)
Central config documents for app-wide settings edited by super admins.

Current documents
- `lessonNote` — config for lesson notes UI.

`config/lessonNote`
```typescript
interface LessonNoteConfig {
  // Lesson title suggestions per program
  lesson_toddler_titles: string[];
  lesson_primary_titles: string[];
  lesson_elementary_titles: string[];
  lesson_adolescent_titles: string[];

  // Program-specific lesson dimensions
  lesson_toddler_dimensions: string[];    // non-empty
  lesson_primary_dimensions: string[];    // non-empty
  lesson_elementary_dimensions: string[]; // non-empty
  lesson_adolescent_dimensions: string[]; // non-empty
}
```

Notes
- Titles: used as suggestion lists for new lesson notes. Currently only `toddler` and `primary` use suggestions; elementary/adolescent titles are reserved for future use.
- Dimensions: define the rating rows shown when creating new lesson notes; existing observations keep their original `dimensionOrder` and `ratings`.

Security
- Reads: any authenticated user (`isSignedIn()`).
- Writes: super admins only (`isSuperAdmin()`), with rules enforcing non-empty dimension arrays when present on `config/lessonNote`.

ai_prompts/coach_{program}
```typescript
type ProgramId = 'toddler' | 'primary' | 'elementary' | 'adolescent';

interface CoachProgramDoc {
  // Display metadata
  title: string;                 // e.g., "Coach Prompt (primary)"
  description: string;           // e.g., "Select which nudges Coach can suggest."

  // Feature gate (server + client honor this)
  coach_feature_enable: boolean; // if false → no nudges; note saves as-is
  programId: ProgramId;          // redundancy for clarity

  // Configuration
  enabledNudges: Array<'duration' | 'modality' | 'independence' | 'evidence' | 'subjective'>;
  disabledNudges: string[];      // derived in UI: all minus enabled
  maxReturnNudges: number;       // server caps return count
  nudgeBlocks: Record<string, string>; // per-nudge prompt blocks
  introBlock: string;            // intro/system preface
  finalPrompt: string;           // composed prompt used by the model

  // Change tracking (managed by super admin UI)
  updatedAt: Timestamp;          // server time
  updatedBy: { uid: string; email: string; name: string };
}
```

Routing and gating
- Client computes selected students’ `programId`(s): if multiple or none → skip Coach (no overlay) and save directly.
- For a single `programId`, client checks `ai_prompts/coach_{program}.coach_feature_enable`:
  - If `false` or doc missing → skip Coach and save directly.
  - If `true` → call callable `aiCoachReview` with `{ noteText, programId }`.
- Cloud Function requires `programId`/`programIds`:
  - Multiple programs → returns `{ nudges: [] }` (no model call).
  - Reads `ai_prompts/coach_{program}`; if missing/disabled or `finalPrompt` empty → returns `{ nudges: [] }`.
  - Only calls the model when enabled and properly configured.

Admin UI
- `AICoachEditor` lets super admins pick a program, toggle enable, and edit per-program config. Test runs pass the selected `programId` to the server.

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
  - `groupId ASC, observedAt DESC` (for grouping multi-student notes in UI)
- `feedback`
  - `userId ASC, timestamp DESC`
  - `status ASC, timestamp DESC`
  - `category ASC, timestamp DESC`

---

## 🔒 Security Rules – Hooks
Helper checks (pseudocode names):
- `isSuperAdmin(uid)`: `get(/users/uid).role == 'superadmin'`
- `isProgramAdmin(uid)`: `get(/users/uid).role == 'admin'`
- `isPrivilegedAdmin(uid)`: `isSuperAdmin(uid) || isProgramAdmin(uid)`
- `isTeacher(uid)`: `get(/users/uid).role == 'teacher'`
- `managesProgram(uid, programId)`: `isSuperAdmin(uid)` OR (`isProgramAdmin(uid)` AND `programId` in `get(/users/uid).manageableClassrooms`)
- `classroomProgramId(classroomId)`: `get(/classrooms/classroomId).programId`
- `studentClassroomId(studentId)`: `get(/students/studentId).classroomId`
- `studentProgramId(studentId)`: `classroomProgramId(studentClassroomId(studentId))`
- `classroomHasTeacher(classroomId, uid)`: `get(/classrooms/classroomId).teacherIds` contains `uid`
// Branch helpers
- `userBranches(uid)`: `get(/users/uid).branchIds` or `[get(/users/uid).homeBranchId]`
- `userInBranch(uid, branchId)`: `branchId` in `userBranches(uid)` OR `isSuperAdmin(uid)` OR `isProgramAdmin(uid)`

Branch invariants
- `students/{id}.branchId == classrooms/{classroomId}.branchId`
- `observations/{id}.branchId == students/{studentId}.branchId` at creation time

Reads
- `users`: self-read always; privileged admins can read/query all user docs to manage staffing.
- `classrooms`: super admins and classroom admins can read all classrooms; teachers can read classrooms where `classroomHasTeacher` + `userInBranch`.
- `students`: super admins can read all; classroom admins can read when `managesProgram(classroomProgramId(student.classroomId))`; teachers may read active students when assigned to the classroom + branch.
- `students/{studentId}/placements`: same gating as `students`.
- `observations` (collection group): super admins can read all; classroom admins can read when `managesProgram(classroomProgramId(observation.classroomId))`; teachers follow existing classroom/branch scoping.
- `ai_prompts`: any authenticated user (client fetch).
- `branches`: any authenticated user can read (UI picker); writes restricted to super admins.
- `programs`: signed-in read for grouping; super admins write.
- `feedback`: user reads own; both admin tiers read all for triage.

Writes – users
- Super admins can create/update/delete any user and assign roles, including editing another admin’s `manageableClassrooms`.
- Classroom admins can create/update `role: 'teacher'` docs (including setting branchIds) but cannot write `role: 'admin' | 'superadmin'`.

Writes – classrooms/programs/branches/ai_prompts
- Only super admins (or maintenance scripts running as them) may create/update/delete `classrooms`, `programs`, `branches`, and `ai_prompts` documents.

Writes – students
- Super admins can CRUD any student.
- Classroom admins can CRUD students when `managesProgram(classroomProgramId(request.resource.data.classroomId))` (and matching existing docs on update/delete).
- Teachers do not write students.

Writes – placements
- Same gating as students: super admins always; classroom admins when `managesProgram(studentProgramId(studentId))`.

Creates – observations
- Teachers: allowed when (existing constraints) `createdBy == request.auth.uid`, path `studentId` matches payload, `classroomId` equals the student’s classroom, `branchId` matches the student, and timestamps follow the contract.
- Privileged admins: super admins bypass program checks; classroom admins must satisfy `managesProgram(studentProgramId(studentId))` for the student being written.

Updates/Deletes – observations
- Super admins: unrestricted.
- Classroom admins: allowed when `managesProgram(studentProgramId(studentId))`.
- Teachers: may update limited metadata (as in rules) or delete their own notes when `createdBy == request.auth.uid` (or legacy `teacherId`).

Field immutability (on update)
- `studentId`, `classroomId`, `branchId`, `createdBy`, `createdAt`, `observedAt` unchanged

---

## 🔒 Security Rules – Feedback
Reads
- `feedback`: user reads own; program + super admins read all

Creates
- Allow if authenticated AND `userId == request.auth.uid`

Updates/Deletes
- Super admins only (status management and admin notes)

Field immutability (on update)
- `userId`, `userEmail`, `userRole`, `userDisplayName`, `userClassrooms`, `message`, `category`, `timestamp`, `appVersion`, `userAgent` unchanged
- Only `status`, `adminNotes`, `updatedAt`, `lastReviewedBy`, `lastReviewedAt` can be modified

---

## 🛠 Backend Maintenance (recommended)
- Maintain `classrooms.studentCount` via triggers on student create/update/delete
- Keep `programs/*` refreshed using `scripts/admin/seed-programs.js` after classroom changes
- If needed later: sharded counters for classroom/teacher observation counts
- For group notes, generate a `groupId` once and fan-out to all targeted students:
  - Generate `groupId` before creating observation documents: `group_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  - Include the same `groupId` in all observation documents created for that multi-student note
  - For text/voice notes: set `groupId` when `selectedStudents.length > 1`
  - For lesson notes: set `groupId` when `lessonMode === 'group'`

Migration/backfill (branches)
- Add `branchId: 'hsr'` to all existing `classrooms`, `students`, and `observations`.
- For `users` with role `teacher`, set `branchIds` based on assigned classrooms; for admins (super + program), optionally set `homeBranchId`.
- Validate invariants and fix mismatches before enabling rules.

---

## ✅ Rationale
- Fan-out per student + collection group queries balances write cost (bounded by class size) with extremely fast reads
- Single source of truth for access (`classrooms.teacherIds`) keeps rules simple and auditable
- Denormalized `classroomId` and `branchId` on observations avoids extra reads in queries and security rules
- Cached creator name/email prevents n+1 user lookups in UI and reports
- Feedback system provides user input channel while maintaining security through user ownership and super-admin-only moderation
