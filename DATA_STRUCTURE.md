# Montessori OS – Firestore Data Model

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
- `students/{studentId}/chats/{chatId}`                // AI chat conversations
- `students/{studentId}/chats/{chatId}/messages/{messageId}` // chat messages
- `students/{studentId}/ai_summaries/soul`             // AI-generated student soul narrative (PEP-149)
- `students/{studentId}/ai_summaries/soul/history/{timestamp}` // weekly soul snapshots
- `students/{studentId}/ai_summaries/guidelines`       // per-student evaluation guide (PEP-149)
- `students/{studentId}/ai_summaries/guidelines/history/{timestamp}` // guideline evolution audit trail
- `students/{studentId}/ai_summaries/report_readiness`  // on-demand observation quality check (PEP-68)
- `students/{studentId}/ai_summaries/report_readiness/history/{timestamp}` // readiness check archive (PEP-233)
- `students/{studentId}/ai_summaries/writing_analysis`  // batch handwriting analysis (PEP-132)
- `students/{studentId}/ai_summaries/open_questions`    // AI-generated interview question bank (PEP-173)
- `students/{studentId}/ai_summaries/weekly_snapshot`   // unified baseball card + signals + missing domains (PEP-229)
- `students/{studentId}/ai_summaries/weekly_snapshot/history/{weekKey}` // weekly snapshot archives
- `feedback/{feedbackId}`
 - `config/{docId}`
- `testbench/{runId}`                                  // prompt test bench run history (PEP-163)

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
  role: 'superadmin' | 'classroomadmin' | 'teacher'; // superadmin is global, classroomadmin is classroom-scoped
  manageableClassrooms?: ClassroomId[];       // required (non-empty) when role == 'classroomadmin'; contains classroom doc IDs (e.g. "allstars", "periwinkle")
  
  // Branch scope
  branchIds?: BranchId[];        // branches this user can access (teachers/coaches can have multiple)
  homeBranchId?: BranchId;       // preferred/default branch for UI selection
  status: 'active' | 'inactive' | 'suspended';
  
  // Lesson shortcuts
  studentAliases?: Record<string, StudentAlias>; // keyed by aliasId
  
  // Pending user flow (ephemeral — removed on migration to real Auth account)
  isPending?: boolean;             // true for users created without an Auth account
  selectedClassrooms?: string[];   // temporary classroom IDs for pending teachers

  // Migration metadata (persists after pending → real migration)
  migratedAt?: Timestamp;          // when the pending user was migrated to a real Auth account
  migratedFrom?: string;           // original pending doc ID (e.g., "pending_anitha_pepschoolv2_com")
  createdBy?: string;              // uid of admin who created the user

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
- Classroom admins MUST have `manageableClassrooms` populated with at least one classroom ID (e.g. `"allstars"`, `"periwinkle"`); UI should block save otherwise. These admins can act on students/placements/observations within those classrooms and invite teachers/students across branches.
- Classroom admins may create/update `users` docs only when `role == 'teacher'`. Attempts to write `role: 'classroomadmin' | 'superadmin'` are rejected unless performed by a super admin.
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
  studentID: string;             // convenience copy of the document ID (e.g., "2025-ADO-001")

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
- `ai_summaries/weekly_snapshot` – unified weekly student snapshot combining baseball card content, behaviour flag signals, and missing domains (PEP-229). Overwritten each weekly batch run; previous snapshot archived to `history/{weekKey}` subcollection before overwrite. On-demand teacher regeneration overwrites without archiving. Shape: `{ summary: string, bullets: string[], redFlag: { severity: string | null, reason: string | null }, coverageGaps: string[], severity: 'clear' | 'low' | 'medium' | 'high', severityScore: number, prevSeverity: string, prevSeverityScore: number, weekKey: string, weekBaselineSeverity: string, weekBaselineSeverityScore: number, escalatedThisWeek: boolean, improvedThisWeek: boolean, noteCount: number, evidenceCount: number, windowDays: number, timezone: string, model: string, temperature: number, generatedAt: Timestamp, lastUpdatedAt: Timestamp, status: 'ok' | 'no_notes', sourceNoteIds: string[], rawContent?: string, migratedAt?: Timestamp }`. Architecture decision: hardcoded doc name (`weekly_snapshot`) over computable weekKey path — every consumer reads at a stable path with zero client-side weekKey computation. Week identity is a field, not the path.
- `ai_summaries/weekly_snapshot/history/{weekKey}` – archived weekly snapshots. Full copy of the previous `weekly_snapshot` doc plus `archivedAt: Timestamp`. Created only by the scheduled Monday batch (`generateBaseballCards`), never by on-demand regeneration. History retained indefinitely; one doc per week per student (no 1MB limit concern). Architecture decision: subcollection over sibling docs — current snapshot reads (every baseball card view) are frequent, history queries (longitudinal analysis by agents/superadmins) are rare. Subcollection keeps these cleanly separated.
- `ai_summaries/{reportDocId}` – AI-generated parent progress reports. Doc ID format: `report_{timestamp}`. Shape: `{ reportText: string, status: 'ok' | 'no_notes', noteCount: number, programId: ProgramId, classroomId: string | null, studentId: string, kind: 'report', sourceNoteIds: string[], dateRangeStart: Timestamp, dateRangeEnd: Timestamp, generatedAt: Timestamp, generatedBy: string, generatedByName?: string, model: string, temperature: number, timezone: string, driveDocId?: string, driveDocLink?: string }`. The `driveDocId` and `driveDocLink` fields are set when the report is exported to Google Drive. Note: `sentimentScore`, `areaBalanceScore`, and `missingInputFlags` were removed in PEP-68 — scoring is now handled by the readiness checker. Pre-PEP-68 reports may still have these fields.
- `ai_summaries/report_readiness` – on-demand observation quality check (PEP-68). Shape: `{ status: 'ok' | 'no_notes', sentimentScore: number | null, areaBalanceScore: number | null, missingInputFlags: string[], noteCount: number, noteCountAtCheck: number, checkedAt: Timestamp, dateRangeStart: Timestamp, dateRangeEnd: Timestamp, programId: string, model: string, generatedBy: string (userId), generatedByName: string | null }`. Cached per student; staleness tracked via `noteCountAtCheck` vs current observation count. On each recheck, the previous doc (if `status: "ok"`) is archived to `report_readiness/history/{timestamp}` before overwrite (PEP-233).
- `ai_summaries/report_readiness/history/{timestamp}` – archived readiness check snapshots (PEP-233). Shape: full copy of the previous `report_readiness` doc contents plus `{ archivedAt: Timestamp, reason: string }`. Only `status: "ok"` docs are archived; `"no_notes"` results are not archived. Created automatically before each recheck overwrites the primary doc.
- `ai_summaries/writing_analysis` – batch handwriting analysis (PEP-132). Overwritten each cycle. Shape: `{ narrative: string, improvements: string[], concerns: string[], recommendations: string[], dimensionRatings: Record<string, { score: number, trend: "improving"|"stable"|"declining", evidence: string }>, sampleCount: number, copiedCount: number, studentAge: { years: number, months: number } | null, generatedAt: Timestamp, sourceMediaIds: string[], model: string, status: "completed" }`. Consumed by the weekly plan generator (PEP-128).
- `ai_summaries/signals` – **DEPRECATED (PEP-229)**: merged into `weekly_snapshot`. Docs may still exist in Firestore until cleanup script runs.
- `ai_summaries/soul` – AI-generated student soul narrative (PEP-149). A free-form markdown document representing the AI's understanding of who this child is. Regenerated weekly from ALL observations and interviews. Shape: `{ content: string (markdown narrative with ## section headers), programId: ProgramId, hasEmergentObservations: boolean, guidelinesSuggestions: Array<{ area: string, discipline: string, rationale: string }> | null, sourceStats: { observationCount: number, interviewCount: number, lastGeneratedAt: Timestamp, lastObservationAt: Timestamp | null, lastInterviewAt: Timestamp | null }, createdAt: Timestamp, updatedAt: Timestamp, updatedBy: string }`. The `guidelinesSuggestions` array contains AI-proposed new skill areas extracted from the soul generation response — consumed by the guideline approval flow (PEP-151). Section headers are informed by the student's guidelines doc, not hardcoded. The `hasEmergentObservations` flag is true when the soul contains non-empty content under `## Emergent Observations` — signals that don't fit existing guidelines categories. Note: the `hasInformationGaps` field was removed in PEP-207 — exploration gaps are now tracked via the `open_questions` doc's `areas` keys.
- `ai_summaries/soul/history/{timestamp}` – Weekly soul snapshots. Shape: `{ content: string, updatedAt: Timestamp, updatedBy: string, reason: string }`. Created automatically before each weekly regeneration — the previous soul is snapshotted before overwrite.
- `ai_summaries/guidelines` – Per-student evaluation guide (PEP-149). Seeded from `config/soul_guidelines_{program}` on first soul generation, then evolves independently per student. The AI agent reads this to know what developmental areas to explore and what benchmarks to look for. Shape: `{ content: string (markdown with ## Discipline, ### Skill Area, - Benchmark structure), programId: ProgramId, seededFrom: string (e.g., "config/soul_guidelines_adolescent"), createdAt: Timestamp, updatedAt: Timestamp, updatedBy: string }`.
- `ai_summaries/guidelines/history/{timestamp}` – Guideline evolution audit trail. Shape: `{ content: string, updatedAt: Timestamp, updatedBy: string, reason: string }`. Tracks agent-proposed or admin edits to the per-student guidelines.
- `ai_summaries/open_questions` – AI-generated bank of open questions for teacher interviews, organized by exploration area (PEP-173, restructured PEP-207). Generated alongside the soul during weekly regeneration — overwritten in place (no history archival; questions are fully regenerated from current context each time). Shape: `{ areas: Record<string, string[]>, programId: ProgramId, updatedBy: string, createdAt: Timestamp, updatedAt: Timestamp }`. The `areas` object maps exploration area names (e.g., "Self-Regulation & Emotional Awareness") to arrays of question strings. Extracted from a JSON `\`\`\`open_questions` fenced block in the soul LLM response. The presence of area keys indicates information gaps — replaces the former `hasInformationGaps` flag on the soul doc. Consumed by the AI interview agent (PEP-172/PEP-176/PEP-208).
- `interviews/{interviewId}` – Immutable interview transcripts (see below).
- `chats/{chatId}` – AI chat conversations per student (see below).
- `chats/{chatId}/messages/{messageId}` – individual messages within a chat (see below).

ID uniqueness note
- If the same classroom slug exists in multiple branches, the `XXX` code may collide across branches. To avoid global ID conflicts in the top-level `students` collection, either:
  - Include a branch code in the ID (e.g., `YYYY-BBB-XXX-NNN` where `BBB` is the branch slug), or
  - Ensure classroom IDs are globally unique across branches and keep the current `YYYY-XXX-NNN` format.
- Access: classroom admins can only create/update/delete students whose `classroomId` is contained in their `manageableClassrooms`. Super admins bypass this check.

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

## 🚩 Signals — DEPRECATED (PEP-229)

> **Merged into `ai_summaries/weekly_snapshot` as of PEP-229.** The standalone `signals` doc is deprecated. All signal fields (severity, redFlag, coverageGaps, escalation tracking) now live in the unified `weekly_snapshot` doc alongside baseball card content. Old `signals` docs may still exist in Firestore until the cleanup script (`scripts/admin/cleanup-old-snapshot-docs.mjs`) is run.
>
> See the `weekly_snapshot` shape in the Student subcollections section above for the full schema.

---

## 🎙️ Interviews (`/students/{studentId}/interviews/{interviewId}`)
Turn-by-turn interview transcripts generated by the AI interview agent (PEP-143). Each doc is a complete session — the agent generates questions one at a time during the live conversation, adapting based on teacher answers. Doc ID format: `interview_{Date.now()}` (e.g., `interview_1713090000000`). The weekly soul rebuild consumes these alongside observations. The interview agent reads recent transcripts at session start to avoid re-asking already-covered areas.

### Session Flow
1. Teacher taps student from pending list → confirmation screen ("~10 mins, don't get pulled away")
2. Cold start (~3-5s): agent loads soul + guidelines + recent interviews + baseball card, generates Q1 with streaming
3. Teacher answers via inline voice STT (WhatsApp-style, Whisper pipeline, minimal cleanup) or typed text
4. Agent generates next question (~1.5-3.5s, streaming) — follows up on same area or switches lanes
5. Repeat until: agent ends after 5+ questions when coverage is sufficient, OR teacher ends after minimum 5 questions or 10 minutes
6. Completion screen with suggested next student; transcript saved

### Schema

```typescript
interface InterviewTranscript {
  teacherId: string;               // uid of the teacher interviewed
  teacherName: string;             // denormalised display name
  classroomId: string;             // classroom context for the interview
  programId: ProgramId;            // program (toddler, primary, elementary, adolescent)
  conductedAt: Timestamp;          // session start — indexed for time-window queries
  completedAt: Timestamp | null;   // session end (null if abandoned)
  status: 'active' | 'completed' | 'abandoned';
  endReason: 'agent_ended' | 'teacher_ended' | 'abandoned' | null;
  questionCount: number;           // total questions asked in the session
  durationMinutes: number | null;  // session duration (null if abandoned mid-session)
  areasCovered: string[];          // guideline ## headers covered — e.g. ["Mathematics", "Sciences & Technology"]

  // Agent's initial exploration plan — generated at cold start, persists as
  // session direction. Logged for auditability and soul rebuild context.
  explorationAreas: ExplorationArea[];

  exchanges: InterviewExchange[];  // ordered Q&A pairs, appended turn by turn
}

interface ExplorationArea {
  area: string;                    // short area name (e.g. "Math independence & self-regulation")
  rationale: string;               // why — what's thin, missing, or worth deepening in the soul
}

interface InterviewExchange {
  questionId: number;              // 1-based within the session
  questionText: string;            // the question generated by the agent
  questionType: 'mcq' | 'open';
  area: string;                    // guideline area (## header) this question targets
  rationale: string;               // agent's reasoning for choosing this question
  thinking: string | null;         // agent's internal chain-of-thought before generating this question (null for Q1). NOT shown to teacher — persisted for debugging + soul rebuild context
  options: string[] | null;        // MCQ choices (null for open)
  selectedOption: number | null;   // MCQ index into options (null for open or unanswered)
  responseText: string | null;     // raw transcribed voice / typed text (null for MCQ-only or unanswered)
  askedAt: Timestamp;              // when the question was presented
  answeredAt: Timestamp | null;    // when the teacher responded (null if unanswered / abandoned)
}
```

### Session Constraints
- **Minimum requirement:** 5 questions OR 10 minutes before teacher can end
- **"End Interview" button:** greyed out until minimum requirement met
- **Agent-initiated end:** agent may end after 5+ questions if coverage is sufficient across areas
- **Latency targets:** Q1 cold-start ~3-5s (behind "Preparing..." screen), Q2+ <3.5s with streaming

### Guidance
- **Append-only:** Firestore rules deny all client-side create/update/delete. Only Cloud Functions (admin SDK) can write.
- **Read access:** `isPrivilegedAdmin() || isTeacher()` — same pattern as `ai_summaries`.
- **Time-window queries:** Use `conductedAt` with a range filter. Composite index defined in `firestore.indexes.json`.
- **Soul rebuild integration:** `generateStudentProfile` fetches completed interviews within the observation window and includes them as a separate context block in the soul LLM prompt.
- **Cross-interview dedup:** The interview agent reads recent transcripts (this week, all teachers) at cold start and avoids re-asking already-covered areas. No pre-generated question lists needed.
- **Area validation:** `area` field values must match ## section headers from the student's `ai_summaries/guidelines` document — not hardcoded dimension keys.

---

## 💬 Chats (`/students/{studentId}/chats/{chatId}`)
AI-powered chat conversations between teachers and a student's context. Each chat is a thread; messages are stored in a subcollection. Soft-deleted chats are cleaned up by a scheduled Cloud Function after 31 days.

```typescript
interface ChatDoc {
  name: string;                     // auto-generated from first message, default "New Chat"
  messageCount: number;             // count of messages in the chat
  lastMessagePreview: string;       // first 100 chars of the latest assistant response

  // Soft delete
  deleted: boolean;                 // false by default; set true on user delete
  deletedAt?: Timestamp;            // set when deleted=true

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Notes
- Chat name is AI-generated from the first user message via `generateChatName()`.
- Soft delete: frontend sets `deleted: true` + `deletedAt`; `cleanupDeletedChats` (monthly scheduled function) hard-deletes chats where `deletedAt` > 31 days ago.
- Listing: queries filter `deleted == false`, ordered by `createdAt` desc.

### Messages (`/students/{studentId}/chats/{chatId}/messages/{messageId}`)
Individual messages within a chat thread.

```typescript
interface MessageDoc {
  role: 'user' | 'assistant';
  content: string;                  // message text (trimmed)
  timestamp: Timestamp;             // when message was created

  // Assistant messages only
  model?: string;                   // LLM model used (e.g., "gpt-4o-mini")

  // User messages only
  authorId?: string;                // uid of the teacher
  authorName?: string;              // display name of the teacher
  cancelledResponseAt?: Timestamp;  // set when user presses Stop — CF skips assistant write
}
```

Notes
- Messages are append-only except for `cancelledResponseAt`, which may be set on a user message after creation (stop button). No other updates or deletes allowed.
- `messageCount` on the parent chat doc is incremented by 2 per exchange (user + assistant).
- When the parent chat is hard-deleted by `cleanupDeletedChats`, all messages are recursively deleted.

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
  handwritten?: boolean;         // VLM classification: true if image contains handwriting (default false)
  curriculumArea?: string | null; // VLM classification: broad Montessori curriculum area (freeform string)
  materialsIdentified?: string[]; // VLM classification: Montessori materials visible in photo (PEP-37, deduplicated at write-time)
  // AI features
  pdfTitle?: string;             // AI-extracted title (PDFs only)
  essence_text?: string;         // AI-extracted essence summary (PDFs only)

  batchId?: string;              // shared across multi-file uploads in one session
  batchAnalyzedAt?: Timestamp;   // set by batchAnalyzeWriting CF when this doc is included in a batch analysis (PEP-132)

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
- `handwritten` and `curriculumArea` are set by the per-photo classification VLM call (gpt-5.4-nano) on every photo upload (PEP-146). Each photo in a batch gets its own independent classification via parallel calls.
- `handwritten` flags photos for downstream batch handwriting analysis at weekly plan generation time (PEP-132). No per-upload handwriting analysis is performed.

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
- Access: classroom admins can create/update/delete observations for students when `classroomId ∈ manageableClassrooms`. Teachers retain current create/read rights scoped by classroom membership; super admins remain unrestricted.

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
- Classroom admin `manageableClassrooms` values are classroom document IDs (e.g. `"allstars"`, `"periwinkle"`), not program document IDs.

---

## ⚙️ Config (`/config/{docId}`)
Central config documents for app-wide settings and AI feature configuration edited by super admins. Since PEP-139, all AI prompts, model settings, and operational params live here — one doc per feature with a 5-minute TTL cache on the client.

Current documents
- `lessonNote` — config for lesson notes UI
- `text_summarizer` — prompts + model config for the Text Cleanup feature
- `voice_transcriber` — context string for Whisper speech-to-text
- `coach_{program}` — per-program Coach nudge configuration (program ∈ toddler | primary | elementary | adolescent)
- `chat_{program}` — per-program AI chat configuration
- `report_{program}` — per-program parent progress report prompts + model config
- `soul_guidelines_{program}` — per-program developmental guidelines markdown (areas, skill areas, benchmarks from report cards)
- `soul_generation` — soul generation instruction prompt + model config (PEP-163). Shape: `{ systemPrompt: string, model: string, temperature: number, max_tokens: number }`. Fallback defaults in `functions/utils/soulHelpers.js:SOUL_DEFAULTS`.
- `readiness_{program}` — per-program report readiness checker prompts + model config
- `baseball_card` — prompts + model config for student baseball card generation
- `photo_classification` — prompts + model config for photo classification (Call 1, gpt-5.4-nano)
- `handwriting_analysis` — prompts + model config for batch writing analysis (PEP-132). Shape: `{ systemPrompt: string, model: string, temperature: number, max_tokens: number, minSamples: number }`. Fallback defaults in `functions/config/handwritingAnalysisFallbacks.js`.
- `telegram_bot` — Telegram bot configuration

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

`config/report_{program}`
```typescript
type ProgramId = ‘toddler’ | ‘primary’ | ‘elementary’ | ‘adolescent’;

interface ReportProgramConfig {
  // Prompts
  staticSystemPrompt: string;      // main system prompt with formatting rules, structure, scoring guidance
  dynamicSystemPrompt?: string;    // optional additional dynamic prompt content
  title: string;
  description: string;

  // Model config
  model: string;                   // e.g., "gpt-5.4"
  max_tokens: number;              // e.g., 4096
  temperature: number;             // e.g., 0.4
  timezone: string;                // e.g., "Asia/Kolkata"

  // Change tracking
  version: number;
  updatedAt: Timestamp;
  updatedBy: string;               // uid
  versions?: Array<{...}>;         // last few snapshots (UI keeps up to 5)
}
```

`config/coach_{program}`
```typescript
type ProgramId = ‘toddler’ | ‘primary’ | ‘elementary’ | ‘adolescent’;

interface CoachProgramConfig {
  // Display metadata
  title: string;                 // e.g., "Coach Prompt (primary)"
  description: string;

  // Feature gate (server + client honor this)
  coach_feature_enable: boolean; // if false → no nudges; note saves as-is
  programId: ProgramId;

  // Configuration
  enabledNudges: Array<’duration’ | ‘modality’ | ‘independence’ | ‘evidence’ | ‘subjective’>;
  disabledNudges: string[];
  maxReturnNudges: number;
  nudgeBlocks: Record<string, string>;
  introBlock: string;
  finalPrompt: string;

  // Model config (PEP-139)
  model: string;                 // e.g., "gpt-5.4"
  temperature: number;           // e.g., 0

  // Change tracking
  updatedAt: Timestamp;
  updatedBy: { uid: string; email: string; name: string };
}
```

`config/baseball_card`
Unified config: prompts + model settings for the baseball card Cloud Function.
```typescript
interface BaseballCardConfig {
  // Prompt fields
  title: string;
  description: string;
  systemPrompt: string;
  version: number;

  // Model config
  model: string;                   // e.g., "gpt-5.4-mini"
  temperature: number;
  max_tokens: number;
  windowDays: number;              // e.g., 42
  timezone: string;                // e.g., "Asia/Kolkata"

  // Change tracking
  updatedAt: Timestamp;
  updatedBy: string;
}
```

`config/telegram_bot`
Configuration for the Telegram bot integration (Coach Pepper on Telegram).

Routing and gating (Coach)
- Client computes selected students’ `programId`(s): if multiple or none → skip Coach (no overlay) and save directly.
- For a single `programId`, client checks `config/coach_{program}.coach_feature_enable`:
  - If `false` or doc missing → skip Coach and save directly.
  - If `true` → call callable `aiCoachReview` with `{ noteText, programId }`.
- Cloud Function requires `programId`/`programIds`:
  - Multiple programs → returns `{ nudges: [] }` (no model call).
  - Reads `config/coach_{program}`; if missing/disabled or `finalPrompt` empty → returns `{ nudges: [] }`.
  - Only calls the model when enabled and properly configured.

Admin UI
- `AICoachEditor` lets super admins pick a program, toggle enable, edit per-program config, and select model/temperature.

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
- `isClassroomAdmin(uid)`: `get(/users/uid).role == 'classroomadmin'`
- `isPrivilegedAdmin(uid)`: `isSuperAdmin(uid) || isClassroomAdmin(uid)`
- `isTeacher(uid)`: `get(/users/uid).role == 'teacher'`
- `managesClassroom(uid, classroomId)`: `isSuperAdmin(uid)` OR (`isClassroomAdmin(uid)` AND `classroomId` in `get(/users/uid).manageableClassrooms`)
- `classroomProgramId(classroomId)`: `get(/classrooms/classroomId).programId`
- `studentClassroomId(studentId)`: `get(/students/studentId).classroomId`
- `studentProgramId(studentId)`: `classroomProgramId(studentClassroomId(studentId))`
- `classroomHasTeacher(classroomId, uid)`: `get(/classrooms/classroomId).teacherIds` contains `uid`
// Branch helpers
- `userBranches(uid)`: `get(/users/uid).branchIds` or `[get(/users/uid).homeBranchId]`
- `userInBranch(uid, branchId)`: `branchId` in `userBranches(uid)` OR `isSuperAdmin(uid)` OR `isClassroomAdmin(uid)`

Branch invariants
- `students/{id}.branchId == classrooms/{classroomId}.branchId`
- `observations/{id}.branchId == students/{studentId}.branchId` at creation time

Reads
- `users`: self-read always; privileged admins can read/query all user docs to manage staffing.
- `classrooms`: super admins and classroom admins can read all classrooms; teachers can read classrooms where `classroomHasTeacher` + `userInBranch`.
- `students`: super admins can read all; classroom admins can read when `managesProgram(classroomProgramId(student.classroomId))`; teachers may read active students when assigned to the classroom + branch.
- `students/{studentId}/placements`: same gating as `students`.
- `observations` (collection group): super admins can read all; classroom admins can read when `managesProgram(classroomProgramId(observation.classroomId))`; teachers follow existing classroom/branch scoping.
- `config`: any authenticated user can read (client fetches AI config + lesson note config); writes restricted to super admins.
- `branches`: any authenticated user can read (UI picker); writes restricted to super admins.
- `programs`: signed-in read for grouping; super admins write.
- `feedback`: user reads own; both admin tiers read all for triage.

Writes – users
- Super admins can create/update/delete any user and assign roles, including editing another admin’s `manageableClassrooms`.
- Classroom admins can create/update `role: 'teacher'` docs (including setting branchIds) but cannot write `role: 'classroomadmin' | 'superadmin'`.

Writes – classrooms/programs/branches/config
- Only super admins (or maintenance scripts running as them) may create/update/delete `classrooms`, `programs`, `branches`, and `config` documents.

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

---

## 🧪 Test Bench (`/testbench/{runId}`)
Purpose: Stores prompt test bench run history — each doc captures a comparison session where a superadmin tested prompt variations against real student data (PEP-163).

```typescript
interface TestBenchRun {
  feature: string;                // e.g., "soul_generation", "handwriting_analysis", "interview_question_gen"
  studentId: string;
  studentName: string;
  sessionName?: string;           // optional user-defined label (PEP-211) — displayed in history when present
  timestamp: Timestamp;
  kickoffMessage?: string;        // interview_question_gen only — first user message to start the interview
  variants: Array<{
    name: string;                 // e.g., "Variant A"
    prompt: {
      systemPrompt: string;
      guidelinesContent?: string; // soul generation only
      model: string;
      temperature: number;
      max_tokens: number;
    };
    output: string;
    conversation?: Array<{        // interview_question_gen only — turn-by-turn conversation history
      type: 'question' | 'answer';
      question?: { text: string; type: string; area: string; options?: string[] };
      answer?: string;
      explorationAreas?: Array<{ area: string; rationale: string }>;
      thinking?: string;
      rawContent?: string;
      meta?: { tokens: number; latencyMs: number };
    }>;
    rating: number;               // 1-10
    notes: string;
  }>;
  ranBy: {
    uid: string;
    name: string;
  };
}
```

Security
- Read + Create: super admins only (`isSuperAdmin()`)
- Update: super admins only, restricted to `sessionName` field (PEP-211)
- Delete: denied
