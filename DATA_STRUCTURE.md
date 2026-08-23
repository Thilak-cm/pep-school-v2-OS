# Montessori OS – Firestore Data Model

## 🎯 Goals
- Minimize friction for teachers to add notes to assigned students
- Scale to many classrooms/students with fast timelines and analytics
- Document the Firestore schema, relationships, and data invariants

---

## Access control and screen behavior

Access patterns, role permissions, and the functional definitions of access-controlled screens intentionally live outside this schema document.

See [Pep OS Access-Control Policy](docs/security/access-control-policy.md).

---

## 📚 Collections Overview
- `branches/{branchId}`
- `programs/{programId}`
- `users/{uid}`
- `classrooms/{classroomId}`
- `students/{studentId}`
- `students/{studentId}/observations/{observationId}`  // collection group: `observations` (includes media docs with type: 'media' since #221)
- `students/{studentId}/media/{mediaId}`               // DEPRECATED (#221) - retained for rollback, no longer read/written
- `students/{studentId}/chats/{chatId}`                // AI chat conversations
- `students/{studentId}/chats/{chatId}/messages/{messageId}` // chat messages
- `students/{studentId}/chats/{chatId}/turns/{turnId}` // chat execution lifecycle state
- `students/{studentId}/ai_summaries/soul`             // AI-generated student soul narrative (PEP-149)
- `students/{studentId}/ai_summaries/soul/history/{timestamp}` // weekly soul snapshots
- `students/{studentId}/ai_summaries/guidelines`       // per-student evaluation guide (PEP-149)
- `students/{studentId}/ai_summaries/guidelines/history/{timestamp}` // guideline evolution audit trail
- `students/{studentId}/ai_summaries/term_report_readiness`  // on-demand observation quality check for term reports (PEP-68, #152)
- `students/{studentId}/ai_summaries/term_report_readiness/history/{timestamp}` // readiness check archive (PEP-233)
- `students/{studentId}/ai_summaries/baseline_report_readiness`  // on-demand observation quality check for baseline reports (#152)
- `students/{studentId}/ai_summaries/baseline_report_readiness/history/{timestamp}` // readiness check archive
- `students/{studentId}/ai_summaries/writing_analysis`  // per-program writing analysis (PEP-132, PEP-263)
- `students/{studentId}/ai_summaries/writing_analysis/history/{isoTimestamp}` // writing analysis archives (PEP-263)
- `students/{studentId}/ai_summaries/open_questions`    // AI-generated interview question bank (PEP-173)
- `students/{studentId}/ai_summaries/open_questions/history/{updatedAt_millis}` // open questions archives (#215)
- `students/{studentId}/ai_summaries/monthly_plan`      // AI-generated monthly plan (PEP-260)
- `students/{studentId}/ai_summaries/monthly_plan/monthly_plan_feedback/{autoId}` // admin feedback on plans (PEP-282)
- `students/{studentId}/ai_summaries/monthly_plan/history/{YYYY-MM}_{timestamp}` // monthly plan archives (PEP-260)
- `students/{studentId}/ai_summaries/weekly_snapshot`   // unified baseball card + signals + missing domains (PEP-229)
- `students/{studentId}/ai_summaries/weekly_snapshot/history/{weekKey}` // weekly snapshot archives
- `alerts/{alertId}`                                    // universal alert bus for DIP + Alerts page (PEP-296)
- `feedback/{feedbackId}`
 - `config/{docId}`
- `classrooms/{classroomId}/digests/weekly_email`     // weekly digest email content (PEP-297)
- `classrooms/{classroomId}/digests/weekly_email/history/{weekKey}` // digest archives
- `testbench/settings`                                 // test bench feature registry, defaults, global config
- `testbench/settings/access/{uid}`                    // per-teacher test bench feature grants (PEP-224)
- `testbench/settings/runs/{runId}`                    // prompt test bench run history (PEP-163)
- `brain/{program}`                                    // knowledge base parent docs: school-wide, primary, elementary, adolescent (#157)
- `brain/{program}/files/{docId}`                      // knowledge/prompt/config file docs synced from repo brain/ folder (#157)

Notes:
- We intentionally defer tags, attendance, and assessments. Add later without breaking this core.
- Observation docs are fan-out per student (for group notes, write one doc per student). This makes student timelines trivial and admin analytics fast via collection group queries.

Branch model overview
- Add a first-class `branchId` dimension to core docs (users, classrooms, students, observations) to isolate data per campus/center.
- `branches` is a lightweight metadata collection; you created four empty docs already: `hsr`, `whitefield`, `varthur`, `kokapet`.
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

  // Authorization data
  role: 'superadmin' | 'classroomadmin' | 'teacher';
  manageableClassrooms?: ClassroomId[];       // classroom document IDs; required and non-empty for classroomadmin
  
  // Branch scope
  branchIds?: BranchId[];
  homeBranchId?: BranchId;       // preferred/default branch for UI selection
  status: 'active' | 'inactive' | 'suspended';
  inactivatedAt?: Timestamp;     // set when status changes to 'inactive' via UI removal (PEP-250)
  
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
- Classroom admins MUST have `manageableClassrooms` populated with at least one classroom ID (e.g. `"allstars"`, `"periwinkle"`).
- Coaches/specialists: can be represented as `role: 'teacher'` with multiple `branchIds` until finer-grained roles are introduced.
- `studentAliases` is optional and only loaded for teachers that create personal student groups for faster lesson-note selection (see below).

### Student aliases (per user)
```typescript
interface StudentAlias {
  id: string;                    // convenience copy of the key from studentAliases.{id}
  name: string;                  // unique per user; shown in search
  description?: string;          // optional helper text
  studentIds: string[];          // student document IDs
  createdAt: Timestamp;          // server time
  updatedAt: Timestamp;          // server time
}
```
Guidance
- Store aliases directly on each user doc under `studentAliases.{aliasId}` so reads stay on the same document as the profile; expect <25 aliases per teacher.
- Alias IDs follow `alias_<slug>`; enforce uniqueness per user (UI lowercases + slugs names before writes). The `name` must be unique to keep search results deterministic.
- Alias search results should list matching students first and then any alias chips containing those students. Selecting an alias expands to the familiar `ClassroomStudentPicker` list; all students start selected/present, and teachers uncheck out-of-scope students.
- Aliases are stored per user and are not shared.

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
  deletedStudentCount?: number;  // count of soft-deleted (inactive) students (PEP-250)

  // Google Drive export (PEP-61)
  driveFolderId?: string;        // Google Drive folder ID for report exports (set on first export)

  // Metadata
  createdAt: Timestamp;          // server time
  updatedAt: Timestamp;          // server time
  createdBy: string;             // uid
}
```
Guidance
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

### 📧 Classroom Digests (`/classrooms/{classroomId}/digests/weekly_email`) (PEP-297)
Purpose: Weekly AI-generated classroom digest emails. CF1 (`weeklyDigestClassroomAdmin`) writes one digest per active classroom each Sunday. CF2 (`weeklyDigestSuperadmin`) writes a consolidated digest at `classrooms/_digest_all/digests/weekly_email`. Previous digests archived to `history/{weekKey}` before overwrite.

```typescript
interface WeeklyDigest {
  weekKey: string;               // ISO week key, e.g. "2026-W23"
  htmlContent: string;           // full HTML email body generated by agent
  agentModel: string;            // e.g. "google/gemini-2.5-flash"
  generatedAt: Timestamp;
  recipientEmails: string[];     // resolved email addresses that received this digest
  hasRedFlags: boolean;          // true if any student had redFlag or escalatedThisWeek
  toolCallCount: number;         // number of tool calls the agent made
  iterations: number;            // agent loop iterations
}
```

History archive: `/classrooms/{classroomId}/digests/weekly_email/history/{weekKey}` — full copy of the digest + `archivedAt: Timestamp`.

Special paths:
- `classrooms/_digest_all/digests/weekly_email` — superadmin consolidated digest (synthetic classroom ID)

Access policy: See [Pep OS Access-Control Policy](docs/security/access-control-policy.md).

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

  // Soft-delete fields (PEP-250)
  inactivatedAt?: Timestamp;     // set when status changes to 'inactive' via UI removal
  deletionRequestedBy?: string;  // uid of admin who initiated removal

  dateOfBirth?: Timestamp;
  studentID: string;             // convenience copy of the document ID (e.g., "2025-ADO-001")

  // Parent contacts (PEP-247)
  parent1Name: string;           // required on creation
  parent1Email: string;          // required on creation; validated email format
  parent1Phone?: string;         // optional
  parent2Name?: string;          // optional
  parent2Email?: string;         // optional; validated email format when provided
  parent2Phone?: string;         // optional

  // Metadata
  createdAt: Timestamp;          // server time
  updatedAt: Timestamp;          // server time
  createdBy: string;             // uid
}
```
Guidance
- Queries commonly include `classroomId` and `status`.
- If a student moves classrooms, update `classroomId` and adjust `studentCount` in both rooms server-side.
 - When a student transfers across branches, update `branchId` to the new classroom's branch; historical observations remain under their original `branchId` for analytics integrity.
 - Student IDs follow `YYYY-XXX-NNN` where:
   - `YYYY` is the current year at creation time (e.g., 2026)
  - `XXX` is a three-letter classroom code derived from the classroom document ID (slug), uppercased and padded
  - `NNN` is a zero-padded index per classroom and year starting from 001
  - The index resets each new year per classroom. On create, clients compute the next index by scanning existing IDs for the same classroom and year, then attempt to write `students/{studentId}`. If a collision occurs, recompute and retry once.

Subcollections
- `placements/{placementId}` – classroom history per student (see above).
- `observations/{observationId}` – per-student notes (text/voice/lesson). Shape: `{ type: 'text' | 'voice' | 'lesson', text: string, studentId: string, classroomId: string, createdBy: string (uid), createdByName: string, createdByEmail: string, observedAt: Timestamp, createdAt: Timestamp, updatedAt: Timestamp, groupId?: string, durationSec?: number, coach?: { status: string, reason: string, nudgesShown: Array, selections?: Record<string, string> }, lessonTitle?: string }`. The `classroomId` field is denormalized from the student's classroom at write time; enables direct collection group queries by classroom. The `groupId` field links fan-out docs from a single multi-student observation.
- `media/{mediaId}` – uploaded photo/video/PDF files attached to observations (see below).
- `ai_summaries/weekly_snapshot` – unified weekly student snapshot combining baseball card content, behaviour flag signals, and missing domains (PEP-229). Overwritten each weekly batch run; previous snapshot archived to `history/{weekKey}` subcollection before overwrite. On-demand regeneration snapshots the previous state into an `edits` array before overwriting, providing a within-week audit trail. Shape: `{ summary: string, bullets: string[], redFlag: { severity: string | null, reason: string | null }, coverageGaps: string[], severity: 'clear' | 'low' | 'medium' | 'high', severityScore: number, prevSeverity: string, prevSeverityScore: number, weekKey: string, weekBaselineSeverity: string, weekBaselineSeverityScore: number, escalatedThisWeek: boolean, improvedThisWeek: boolean, noteCount: number, evidenceCount: number, windowDays: number, timezone: string, model: string, temperature: number, generatedAt: Timestamp, lastUpdatedAt: Timestamp, status: 'ok' | 'no_notes', sourceNoteIds: string[], rawContent?: string, migratedAt?: Timestamp, regeneratedBy: { uid: string, displayName: string | null, role: string } | null, edits: Array<{ severity: string | null, severityScore: number | null, summary: string, redFlag: { severity: string | null, reason: string | null }, coverageGaps: string[], regeneratedBy: { uid: string, displayName: string | null, role: string } | null, generatedAt: Timestamp | null, replacedAt: Timestamp }> }`. `regeneratedBy` is set on manual regens (null for batch runs). `edits` accumulates previous states within the week — each entry captures the snapshot that was replaced. The batch run archives the full doc (including `edits`) to `history/{weekKey}` and resets `edits` to `[]`. Architecture decision: hardcoded doc name (`weekly_snapshot`) over computable weekKey path — every consumer reads at a stable path with zero client-side weekKey computation. Week identity is a field, not the path.
- `ai_summaries/weekly_snapshot/history/{weekKey}` – archived weekly snapshots. Full copy of the previous `weekly_snapshot` doc plus `archivedAt: Timestamp`. Created only by the scheduled Monday batch (`generateBaseballCards`), never by on-demand regeneration. History retained indefinitely; one doc per week per student (no 1MB limit concern). Architecture decision: subcollection over sibling docs — current snapshot reads are frequent while longitudinal history queries are rare. Subcollection keeps these cleanly separated.
- `ai_summaries/{reportDocId}` – AI-generated parent progress reports. Doc ID format: `report_{timestamp}` (term) or `baseline_report_{month}_{year}_{hash}` (baseline). Shape: `{ reportText: string, status: 'ok' | 'no_notes', noteCount: number, reportType: 'term' | 'baseline', programId: ProgramId, classroomId: string | null, studentId: string, kind: 'report', sourceNoteIds: string[], dateRangeStart: Timestamp, dateRangeEnd: Timestamp, generatedAt: Timestamp, generatedBy: string, generatedByName?: string, model: string, temperature: number, timezone: string, driveDocId?: string, driveDocLink?: string, reportEval?: { sentimentScore: number | null, sentimentLabel: string | null, areaBalanceScore: number | null, areaBalanceLabel: string | null, missingInputFlags: string[], scoreRationale: { sentiment: string, areaBalance: string } } }`. The `reportType` field was added in PEP-325; `'monthly'` was renamed to `'baseline'` in #152 — legacy docs with `'monthly'` are normalized to `'baseline'` at read time. The `reportEval` nested object is set on baseline reports by the independent judge at export time (#152); term reports get scores via the readiness checker instead. The `driveDocId` and `driveDocLink` fields are set when the report is exported to Google Drive.
- `ai_summaries/{type}_report_readiness` – on-demand observation quality check, fanned out per report type: `term_report_readiness` or `baseline_report_readiness` (PEP-68, #152). Shape: `{ status: 'ok' | 'no_notes', sentimentScore: number | null, areaBalanceScore: number | null, missingInputFlags: string[], noteCount: number, noteCountAtCheck: number, checkedAt: Timestamp, dateRangeStart: Timestamp, dateRangeEnd: Timestamp, programId: string, model: string, generatedBy: string (userId), generatedByName: string | null }`. Cached per student per report type; staleness tracked via `noteCountAtCheck` vs current observation count. On each recheck, the previous doc (if `status: "ok"`) is archived to `{type}_report_readiness/history/{timestamp}` before overwrite (PEP-233). Legacy docs at `report_readiness` (pre-#152) should be migrated to `term_report_readiness` via `scripts/admin/migrate-readiness-docs.mjs`.
- `ai_summaries/{type}_report_readiness/history/{timestamp}` – archived readiness check snapshots (PEP-233). Shape: full copy of the previous readiness doc contents plus `{ archivedAt: Timestamp, reason: string }`. Only `status: "ok"` docs are archived; `"no_notes"` results are not archived. Created automatically before each recheck overwrites the primary doc.
- `ai_summaries/writing_analysis` – per-program writing analysis (PEP-132, PEP-263). Config resolved via `config/writing_analysis_{programId}`. Overwritten each cycle; previous doc archived to `history/` subcollection on weekly scheduled runs only (not on-demand callable). Shape: `{ narrative: string, improvements: string[], concerns: string[], recommendations: Array<{ area: string, action: string, montessoriApproach: string, rationale: string, priority: number }> | string[], dimensionRatings: Record<string, { score: number, trend: "improving"|"stable"|"declining", evidence: string }>, sampleCount: number, copiedCount: number, studentAge: { years: number, months: number } | null, generatedAt: Timestamp, sourceMediaIds: string[], model: string, programId: string | null, status: "completed", ...programSpecificFields }`. Program-specific fields (e.g., `stageSummary`, `motorHandwritingAnalysis`, `languageCompositionAnalysis`, `confidence`) are preserved via spread from the VLM response. Consumed by the weekly plan generator (PEP-128).
- `ai_summaries/writing_analysis/history/{isoTimestamp}` – archived writing analysis snapshots (PEP-263). Shape: full copy of previous `writing_analysis` doc plus `{ archivedAt: Timestamp }`. Created automatically before each weekly scheduled regeneration — on-demand callable does NOT archive.
- `ai_summaries/monthly_plan` – AI-generated monthly plan for toddler and primary students (PEP-260). Generated on demand via the `generateMonthlyPlan` callable. Overwritten each generation; previous plan archived to `history/` subcollection before overwrite. Config resolved via `config/monthly_plan`. Shape: `{ studentId: string, studentName: string, age: string, month: string (YYYY-MM), planningMode: "observationBased" | "coldStart", dataSufficiency: { meaningfulObservationCount: number, summary: string }, dataWindow: { from: string, to: string, observationCount: number }, affinities: string[], sections: Array<{ name: string, position: number, monthlyAim: string, items: Array<{ work: string, basis: "observed" | "ageBenchmark" | "diagnostic" | "conditional", why: string, hook: string, offer: string, next: string, watch: string }> }>, generatedAt: string (ISO), generatedBy: string (uid) | 'system:batchCron', generatedByName: string, model: string, totalTokens: number, status: 'generated', driveDocId?: string, driveDocLink?: string, driveChecklistId?: string, driveChecklistLink?: string, driveExportedAt?: string (ISO), driveExportedBy?: string (uid) | 'system:batchCron' }`. `planningMode` and `dataSufficiency` added in PEP-280 for cold-start classification — the LLM classifies based on observation count and joining date. `basis` field expanded to include `ageBenchmark` for age-appropriate recommendations (PEP-280). Drive fields are populated by `exportMonthlyPlanToDrive` or the batch cron (PEP-279).
- `ai_summaries/monthly_plan/monthly_plan_feedback/{autoId}` – admin feedback on monthly plans (PEP-282). Append-only — each submission creates a new doc. Shape: `{ difficulty?: "too_easy" | "about_right" | "too_tough", pace?: "too_slow" | "good_pace" | "too_fast", section: "General" | "Language" | "Sensorial" | "Math" | "Practical Life" | "Grace & Courtesy", text?: string, planMonth: string (YYYY-MM) | null, createdBy: string (uid), createdByName: string, createdAt: Timestamp (serverTimestamp) }`. At least one of `difficulty`, `pace`, or `text` is present (validated client-side). Not yet consumed by plan generation CF — future integration planned.
- `ai_summaries/monthly_plan/history/{YYYY-MM}_{timestamp}` – archived monthly plan snapshots (PEP-260). Shape: full copy of the previous `monthly_plan` doc plus `{ archivedAt: string (ISO), archivedReason: string }`. History key includes both the plan month and a timestamp to avoid collisions on same-month regeneration.
- `ai_summaries/signals` – **DEPRECATED (PEP-229)**: merged into `weekly_snapshot`. Docs may still exist in Firestore until cleanup script runs.
- `ai_summaries/soul` – AI-generated student soul narrative (PEP-149). A free-form markdown document representing the AI's understanding of who this child is. Regenerated weekly from ALL observations and interviews. Shape: `{ content: string (markdown narrative with ## section headers), programId: ProgramId, hasEmergentObservations: boolean, guidelinesSuggestions: Array<{ area: string, discipline: string, rationale: string }> | null, sourceStats: { observationCount: number, interviewCount: number, lastGeneratedAt: Timestamp, lastObservationAt: Timestamp | null, lastInterviewAt: Timestamp | null }, createdAt: Timestamp, updatedAt: Timestamp, updatedBy: string }`. The `guidelinesSuggestions` array contains AI-proposed new skill areas extracted from the soul generation response — consumed by the guideline approval flow (PEP-151). Section headers are informed by the student's guidelines doc, not hardcoded. The `hasEmergentObservations` flag is true when the soul contains non-empty content under `## Emergent Observations` — signals that don't fit existing guidelines categories. Note: the `hasInformationGaps` field was removed in PEP-207 — exploration gaps are now tracked via the `open_questions` doc's `areas` keys.
- `ai_summaries/soul/history/{timestamp}` – Weekly soul snapshots. Shape: `{ content: string, updatedAt: Timestamp, updatedBy: string, reason: string }`. Created automatically before each weekly regeneration — the previous soul is snapshotted before overwrite.
- `ai_summaries/guidelines` – Per-student evaluation guide (PEP-149). Seeded from `config/soul_guidelines_{program}` on first soul generation, then evolves independently per student. The AI agent reads this to know what developmental areas to explore and what benchmarks to look for. Shape: `{ content: string (markdown with ## Discipline, ### Skill Area, - Benchmark structure), programId: ProgramId, seededFrom: string (e.g., "config/soul_guidelines_adolescent"), createdAt: Timestamp, updatedAt: Timestamp, updatedBy: string }`.
- `ai_summaries/guidelines/history/{timestamp}` – Guideline evolution audit trail. Shape: `{ content: string, updatedAt: Timestamp, updatedBy: string, reason: string }`. Tracks agent-proposed or admin edits to the per-student guidelines.
- `ai_summaries/open_questions` – AI-generated bank of open questions for teacher interviews, organized by exploration area (PEP-173, restructured PEP-207, multi-POV #216). Generated alongside the soul during monthly regeneration - old doc archived to `history/` subcollection before overwrite (#215). `updatedAt` millis serves as the version token for stale-write detection. Shape: `{ areas: Record<string, Array<{ question: string, answers: Array<{ answeredAt: Timestamp, method: "voice" | "text" | "manual", observationId: string | null, answeredBy: { uid: string, name: string } }> }>>, programId: ProgramId, classroomId: string, updatedBy: string, updatedAt: Timestamp }`. Each question has an `answers` array supporting multiple teacher perspectives (#216). The CF writes all questions with `answers: []`; teachers append answers via the Question Deck or AddNoteModal. Answered status derived from `answers.length > 0`. Legacy docs from #144 may still have flat fields (`status`, `answeredAt`, `method`, `observationId`, `answeredBy`) - the frontend normalizes these to the `answers` array shape at read time. Area names are LLM-generated and unique per student (6-11 areas, 8-10 questions each). Monthly regeneration replaces the entire doc - no cross-version answer carry-forward. Consumed by the Question Deck UI and the AI interview agent (PEP-172/PEP-176/PEP-208).
- `ai_summaries/open_questions/history/{updatedAt_millis}` – archived open questions snapshots (#215). Shape: full copy of the previous `open_questions` doc plus `{ archivedAt: Timestamp, archivedBy: "cloud-function:soul-generate" }`. Created automatically before each monthly regeneration overwrites the primary doc. History doc ID is the `updatedAt` millis of the archived doc. Observation docs reference this version via `openQuestion.version` (string of millis).
- `interviews/{interviewId}` – Immutable interview transcripts (see below).
- `chats/{chatId}` – AI chat conversations per student (see below).
- `chats/{chatId}/messages/{messageId}` – individual messages within a chat (see below).

ID uniqueness note
- If the same classroom slug exists in multiple branches, the `XXX` code may collide across branches. To avoid global ID conflicts in the top-level `students` collection, either:
  - Include a branch code in the ID (e.g., `YYYY-BBB-XXX-NNN` where `BBB` is the branch slug), or
  - Ensure classroom IDs are globally unique across branches and keep the current `YYYY-XXX-NNN` format.
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

  // Optional convenience fields
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
- **Append-only:** Interview transcripts are not changed after creation.
- **Time-window queries:** Use `conductedAt` with a range filter. Composite index defined in `firestore.indexes.json`.
- **Soul rebuild integration:** `generateStudentProfile` fetches completed interviews within the observation window and includes them as a separate context block in the soul LLM prompt.
- **Cross-interview dedup:** The interview agent reads recent transcripts (this week, all teachers) at cold start and avoids re-asking already-covered areas. No pre-generated question lists needed.
- **Area validation:** `area` field values must match ## section headers from the student's `ai_summaries/guidelines` document — not hardcoded dimension keys.

---

## 💬 Chats (`/students/{studentId}/chats/{chatId}`)
AI-powered chat conversations between teachers and a student's context. Each chat is a thread. The browser may optimistically render new chats/messages, but `childChatStream` is the source of truth for creating transcript messages and turn lifecycle docs. Soft-deleted chats are cleaned up by a scheduled Cloud Function after 31 days.

```typescript
interface ChatDoc {
  studentId: string;                 // equals parent {studentId}
  classroomId: string | null;        // denorm for trace/debug context
  createdBy: string;                 // uid that created the chat
  visibility: 'classroom';           // shared by authorized teachers in the student's classroom
  name: string;                     // sanitized first user message, truncated to 60 characters
  messageCount: number;             // count of messages in the chat
  lastMessagePreview: string;       // first 100 chars of the latest assistant response
  activeTurnId?: string | null;      // running turn marker, cleared on terminal states
  lastTurnStatus?: 'persisting' | 'running' | 'completed' | 'interrupted' | 'failed';
  lastErrorCode?: string;             // latest failed turn's stable server error code
  langfuseTraceId?: string;          // latest trace id; each turn uses runId as trace id

  // Soft delete
  deleted: boolean;                 // false by default; set true on user delete
  deletedAt?: Timestamp;            // set when deleted=true

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Notes
- Chat creation and transcript writes happen in `childChatStream` via Admin SDK after auth and student access checks. Clients do not create chat, message, or turn docs directly.
- Chat rename and soft delete are the only client-side chat doc mutations. They are allowed only for the chat creator or a privileged admin.
- Soft delete: frontend sets `deleted: true` + `deletedAt`; `cleanupDeletedChats` (monthly scheduled function) hard-deletes chats where `deletedAt` > 31 days ago.
- Listing: queries filter `deleted == false`, ordered by `createdAt` desc.

### Messages (`/students/{studentId}/chats/{chatId}/messages/{messageId}`)
Individual transcript messages within a chat thread. Message docs are append-only and written by `childChatStream`.

```typescript
interface MessageDoc {
  role: 'user' | 'assistant';
  content: string;                  // message text (trimmed)
  createdAt: Timestamp;             // when message was created
  timestamp?: Timestamp;            // legacy creation field; readers support either timestamp field
  turnId: string;                   // associated turn lifecycle doc
  status: 'complete' | 'interrupted' | 'failed';

  // Assistant messages only
  runId?: string;                   // Langfuse trace id for this assistant run
  model?: string;                   // LLM model used (e.g., "gpt-4o-mini")
  finishReason?: 'stop' | 'client_disconnect' | 'error' | string;
  retry?: {                         // failed/interrupted response retry identity
    chatId: string;
    turnId: string;
    userMessageId: string;
  };

  // User messages only
  authorId?: string;                // uid of the teacher
  authorName?: string;              // display name of the teacher
}
```

Notes
- Server atomically writes the chat, user message, and `persisting` turn before resolving model config, provider credentials, or Langfuse. Provider/config failures therefore remain durable terminal turn records.
- Legacy messages containing only `timestamp` remain readable; no destructive timestamp migration is required.
- Individual model tokens are not written to Firestore.
- If a user stops streaming or navigates away, the assistant message is saved with `status: 'interrupted'` and `finishReason: 'client_disconnect'`.
- A `failed` attempt that produced no model content, or an `interrupted` attempt with no prefix, is recorded only in its turn doc; no empty assistant message is created. Readers listen to turns and attach the durable retry action to the matching user message. Completed responses and non-empty interrupted prefixes remain assistant message docs.
- `messageCount` on the parent chat doc is incremented by completed server writes.
- When the parent chat is hard-deleted by `cleanupDeletedChats`, all messages are recursively deleted.

### Turns (`/students/{studentId}/chats/{chatId}/turns/{turnId}`)
Execution state for one user-message-to-assistant-response run. These docs are written only by `childChatStream`; clients may read them for status/debug UI.

```typescript
interface TurnDoc {
  runId: string;                    // Langfuse trace id
  userMessageId: string;
  assistantMessageId?: string;
  idempotencyKey: string;           // `${chatId}:${userMessageId}` logical user-message identity
  status: 'persisting' | 'running' | 'completed' | 'interrupted' | 'failed';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  finishReason?: string;
  errorCode?: string;
  model?: string;                   // latest attempt's model (compatibility projection)
  langfuseTraceId?: string;         // latest attempt's trace (compatibility projection)
  attempts: Array<{
    runId: string;
    assistantMessageId: string;
    status: 'persisting' | 'running' | 'completed' | 'interrupted' | 'failed';
    createdAt: Timestamp;
    updatedAt: Timestamp;
    startedAt?: Timestamp | null;
    completedAt?: Timestamp | null;
    finishReason?: string | null;
    errorCode?: string | null;
    model?: string | null;
    langfuseTraceId?: string | null;
  }>;                               // append-only execution history across retries
}
```

Tool and trace notes
- Chat tools are read-only and student-scoped. The model does not receive `studentId` or `chatId` in tool schemas; the backend injects those values after generation so hallucinated IDs cannot redirect tool reads.
- Reusing a turn ID with different logical message identity is rejected. An exact active or terminal replay reads existing state without rewriting it; a retry reuses `chatId`, `turnId`, and `userMessageId`, creates only a new `runId`, and appends an attempt without duplicating the user message or overwriting prior execution/trace history.
- Every OpenRouter model execution requires a Langfuse trace. Trace close/flush failures are isolated from Firestore terminalization.
- If the model emits multiple tool calls in the same assistant turn, the Cloud Function executes them concurrently and appends results back to the model in original tool-call order.
- Detailed tool-call observability belongs in Langfuse. Firestore keeps only transcript, turn state, and a trace id link.

---

## 📎 Media (merged into `/students/{studentId}/observations/{mediaId}` - #221)
Per-student uploaded files (photos, videos, PDFs). One media doc per file per student; multi-student uploads fan out like observations. As of #221, media docs live in the `observations` subcollection with `type: 'media'`. The old `/students/{studentId}/media/` subcollection is retained for rollback safety but is no longer read or written by any code. Storage paths are unchanged (`students/{studentId}/media/{mediaId}/original.webp`).

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
  imageEdited?: boolean;         // true when final uploaded photo pixels differ from the selected image (default false)
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
- `imageEdited` is true only when the final uploaded photo pixels differ from the initially selected image; missing legacy values are treated as `false`.
- `handwritten` and `curriculumArea` are set by the per-photo classification VLM call (gpt-5.4-nano) on every photo upload (PEP-146). Each photo in a batch gets its own independent classification via parallel calls.
- `handwritten` flags photos for downstream batch handwriting analysis at weekly plan generation time (PEP-132). No per-upload handwriting analysis is performed.

---

## 📝 Observations (`/students/{studentId}/observations/{observationId}`)
Collection group name: `observations`
```typescript
interface Observation {
  // Identity
  studentId: string;             // must equal parent {studentId}
  classroomId: string;           // denorm for queries; equals student's classroomId at creation
  branchId: BranchId;            // denorm for analytics; equals student's branch at creation
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

Observation timestamp compatibility:
- Observations have no legacy `timestamp` field. Readers use `observedAt` as the
  event time and may fall back to `createdAt` when `observedAt` is absent.
- The separate optional `timestamp` field on legacy Coach Pepper chat messages
  is unrelated and remains supported by chat transcript readers.

Why fan-out per student?
- Student timeline = 1 query
- Classroom, teacher, and admin analytics = collection group queries
- No need for `array-contains` workarounds or cross-document joins

Group notes (groupId)
- When creating a note for multiple students, generate a single `groupId` and include it in all observation documents created for that note
- Format: `group_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` (e.g., `group_lx1234_abc5`)
- All observation documents sharing the same `groupId` represent the same note assigned to different students
- UI uses `groupId` to group and display multi-student notes in condensed format (e.g., "Student A, Student B + X more")
- Notes without `groupId` (single-student notes or legacy notes) display individually
- For lesson notes: `groupId` is set when `lessonMode === 'group'`; individual lesson notes do not have `groupId`

Branch transfer behavior
- Existing observations retain their original `branchId` when a student transfers to another branch. New observations pick up the student's current branch.

Access policy: See [Pep OS Access-Control Policy](docs/security/access-control-policy.md).

---

## 💬 Feedback (`/feedback/{feedbackId}`)
```typescript
interface Feedback {
  // User Information
  userId: string;                // must equal request.auth.uid
  userEmail: string;             // cached for admin review
  userRole: 'superadmin' | 'admin' | 'teacher';
  userDisplayName: string;       // cached for admin review
  userClassrooms: string[];      // classroom IDs captured when feedback was submitted
  
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
- Status workflow: new → reviewed → implemented/declined
- Keep feedback global (not branch-scoped) per product decision.

Access policy: See [Pep OS Access-Control Policy](docs/security/access-control-policy.md).

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
Central config documents for app-wide settings and AI feature configuration. Since PEP-139, all AI prompts, model settings, and operational params live here — one doc per feature with a 5-minute TTL cache on the client.

Current documents
- `lessonNote` — config for lesson notes UI
- `text_summarizer` — prompts + model config for the Text Cleanup feature
- `voice_transcriber` — context string for Whisper speech-to-text
- `coach_{program}` — per-program Coach nudge configuration (program ∈ toddler | primary | elementary | adolescent)
- `chat_{program}` — per-program AI chat configuration. Shape: `{ systemPrompt: string, model: string, temperature: number, max_tokens: number, chatMessageLimit: number, observationWindowDays: number, allowedTools: string[] }`. `observationWindowDays` controls the date window for observations included in server-built chat context.
- `report_{program}` — per-program parent progress report prompts + model config
- `soul_guidelines_{program}` — per-program developmental guidelines markdown (areas, skill areas, benchmarks from report cards). Shape: `{ markdown: string, programId: ProgramId, benchmarkCount: number, updatedBy: string, updatedAt: Timestamp }`.
- `soul_generation_{program}` — program-specific soul generation instruction prompt + model config (PEP-163). Doc IDs: `soul_generation_toddler`, `soul_generation_primary`, `soul_generation_elementary`, `soul_generation_adolescent`. Shape: `{ systemPrompt: string, model: string, temperature: number, max_tokens: number, description?: string }`. The production soul generator reads this first, then falls back to legacy `config/soul_generation`, then to hardcoded defaults in `functions/utils/soulHelpers.js:SOUL_DEFAULTS`. Prompt templates may use `{{guidelinesContent}}` or `${guidelinesContent}` as the guidelines placeholder.
- `soul_generation` — legacy generic soul generation instruction prompt + model config (PEP-163). Shape: `{ systemPrompt: string, model: string, temperature: number, max_tokens: number }`. Used only when the matching `soul_generation_{program}` doc is missing.
- `readiness_{program}` — per-program report readiness checker prompts + model config
- `baseball_card_{program}` — per-program prompts + model config for student baseball card generation (PEP-132). One doc per program: `baseball_card_primary`, `baseball_card_toddler`, `baseball_card_elementary`, `baseball_card_adolescent`. Each contains program-specific curriculum domains baked into the system prompt.
- `photo_classification` — prompts + model config for photo classification (Call 1, gpt-5.4-nano)
- `writing_analysis_{programId}` — per-program prompts + model config for writing analysis (PEP-132, PEP-263). Doc IDs: `writing_analysis_primary`, `writing_analysis_elementary`, `writing_analysis_toddler`, `writing_analysis_adolescent`. Shape: `{ systemPrompt: string, model: string, temperature: number, max_tokens: number, minSamples: number, description: string, programId: ProgramId, createdAt: Timestamp, updatedAt: Timestamp }`. Fallback defaults in `functions/config/handwritingAnalysisFallbacks.js`. Legacy `handwriting_analysis` doc deleted by seeding script.
- `interview_question_gen` — interview agent turn-by-turn prompt template with placeholders for student-specific data. Shape: `{ systemPrompt: string, model: string, temperature: number, max_tokens: number, description: string, createdAt: Timestamp, updatedAt: Timestamp }`. Not read by any production CF at runtime — serves as the default config source for the prompt test bench only.
- `monthly_plan` — prompts + model config for monthly plan generation (PEP-260). Shape: `{ systemPrompt: string, model: string, temperature: number, max_tokens: number, description: string, createdAt: Timestamp, updatedAt: Timestamp }`. Seeded by `scripts/admin/seed-monthly-plan-config.mjs`.
- `telegram_bot` — Telegram bot configuration. Shape: `{ alertChatIds: number[] }`. `alertChatIds` lists Telegram chat IDs that receive daily data integrity check alerts from the `dataIntegrityChecks` scheduled CF (#161). Seeded by `scripts/admin/seed-telegram-alert-chatid.mjs`.
- `weekly_digest` — weekly digest agent config (PEP-297). Shape: `{ classroomPrompt: string, superadminPrompt: string, model: string, temperature: number, max_tokens: number, allowedTools: string[], allowedToolScopes: string[], contextualNotes: string[], superadminClassroomOverrides: Record<string, string[]>, testOverrideEmails: string[], enableTestTrigger: boolean }`. Seeded by `scripts/admin/seed-digest-config.mjs`. `contextualNotes` managed via PEP-324 UI editor. `testOverrideEmails` and `enableTestTrigger` are dev/test infrastructure.

### Coach Pepper prompt stack (#239)

```text
OPENROUTER REQUEST
|
+-- SYSTEM MESSAGE
|   |
|   +-- 1. ROLE AND PURPOSE                    [Firestore systemPrompt]
|   +-- 2. COACHING INSTRUCTIONS               [Firestore systemPrompt]
|   +-- 3. RESPONSE FORMAT                     [Firestore systemPrompt]
|   +-- 4. STUDENT BOUNDARY                    [Firestore systemPrompt]
|   +-- 5. EVIDENCE RULES                      [Firestore systemPrompt]
|   +-- 6. AUTHORITATIVE STUDENT PROFILE       [Firestore data -> template variable]
|   +-- 7. DEVELOPMENT SUMMARY                 [Firestore data -> template variable]
|   `-- 8. RECENT OBSERVATIONS                 [Firestore data -> template variable]
|
+-- RECENT CHAT HISTORY                        [Separate messages]
+-- CURRENT TEACHER MESSAGE                    [User message]
`-- AVAILABLE TOOLS                            [Top-level API tools]
```

All prompt prose lives in the per-program Firestore `systemPrompt` template. Code validates the template and renders Firestore-backed variables; an equivalent hardcoded template exists only as an observable fallback when the Firestore template is unavailable or invalid.

**Promotion metadata (PEP-326):** Config docs promoted via the test bench `promoteTestBenchConfig` CF gain these additional fields: `_promotionHistory: Array<{ snapshot: Record<string, any>, replacedAt: Timestamp, replacedBy: { uid: string, name: string }, promotedFromRun: string | null, featureId: string }>` (capped at 10 entries, most recent first), `updatedAt: Timestamp`, `updatedBy: "testbench:{uid}"`. These fields are added via `set({ merge: true })` and do not affect production config consumers. Promotable docs: `writing_analysis_{programId}`, `soul_generation`, `soul_guidelines_{programId}`, `monthly_plan`, `weekly_digest`, `term_report_{programId}`, `baseline_report_{programId}`.

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

Access policy: See [Pep OS Access-Control Policy](docs/security/access-control-policy.md).

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

`config/baseball_card_{program}` (e.g., `baseball_card_primary`, `baseball_card_elementary`)
Per-program config: prompts + model settings for the baseball card Cloud Function (PEP-132). Each program has its own doc with curriculum-specific domains baked into the system prompt.
```typescript
interface BaseballCardConfig {
  // Prompt fields
  title: string;
  description: string;
  systemPrompt: string;            // program-specific domains baked in
  version: number;
  programId: ProgramId;

  // Model config
  model: string;                   // e.g., "gpt-5.4-mini"
  temperature: number;
  max_tokens: number;
  windowDays: number;              // e.g., 42
  timezone: string;                // e.g., "Asia/Kolkata"

  // Provenance
  createdAt: string;               // ISO timestamp
  createdBy: string;               // e.g., "seed-baseball-card-configs.mjs (PEP-132)"
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
- `AICoachEditor` provides the UI for selecting a program, toggling enablement, editing per-program config, and selecting model/temperature.

---

## 🧠 Brain — Knowledge Base (`/brain/{program}`) (#157)
Purpose: unified knowledge base for all LLM pipelines — knowledge, prompts, and model config per program. Source of truth is the repo's `brain/` folder; synced to Firestore via `npm run push-brain` (admin script, Admin SDK). Cloud Functions read it through `functions/shared/brain.js:readBrain()` with a per-program 5-min TTL cache. Long-term this collection supersedes the per-feature `config/*` docs (migration is a separate issue).

Parent docs: `school-wide`, `primary`, `elementary`, `adolescent`. Note: there is no `toddler` doc — toddler is merged into `primary` (`readBrain` normalizes the programId).

```typescript
// /brain/{program}
interface BrainProgramDoc {
  name: string;                       // "Primary", "School-wide", ...
  description: string;
  includesPrograms: ProgramId[];      // primary: ['toddler', 'primary']
  updatedAt: Timestamp;               // last sync
  lastSyncedByName: string;           // from git config user.name
  lastSyncedByEmail: string;          // from git config user.email (no auth uid exists under Admin SDK)
  docCount: number;                   // files subcollection size
  pipelineIds: string[];              // pipelines present, e.g. ['coach', 'weekly-snapshot', ...]
}

// /brain/{program}/files/{docId}
// docId flattens the folder path: 'teacher-facing--coach--prompt', 'nomenclature'
interface BrainFileDoc {
  content: string;                    // raw file string (markdown or JSON)
  config?: Record<string, any>;       // parsed JSON — only on type 'config'; must contain `model`
  type: 'config' | 'prompt' | 'knowledge';
  pipeline: string | null;            // null = program/audience-level knowledge
  audience: 'teacher-facing' | 'parent-facing' | null;
  filename: string;                   // 'prompt.md'
  path: string;                       // 'primary/teacher-facing/coach/prompt.md'
  updatedAt: Timestamp;
  checksum: string;                   // SHA-256 of raw content — sync skips unchanged files
}
```

Read pattern (four layers, assembled in memory from ONE subcollection fetch per program):
1. school-wide knowledge → 2. program knowledge (`pipeline == null, audience == null`) → 3. audience knowledge (`pipeline == null, audience == X`) → 4. pipeline content (`pipeline == X`: config + prompt + knowledge). Exceptions: `text-summarizer` and `voice-transcriber` read school-wide only.

Access policy: See [Pep OS Access-Control Policy](docs/security/access-control-policy.md).

MCP tools: `list_brain`, `get_brain_file`.

---

## 📇 Indexes
- `classrooms`
  - `branchId ASC, status ASC`
- `students`
  - `branchId ASC, classroomId ASC, status ASC`
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

## Access patterns and security policy

See [Pep OS Access-Control Policy](docs/security/access-control-policy.md).

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
- For `users` with role `teacher`, set `branchIds` based on assigned classrooms; optionally set `homeBranchId` for other roles.
- Validate schema invariants and fix mismatches after backfill.

---

## 🔔 Alerts (`/alerts/{alertId}`)
Purpose: Universal alert bus for the Dynamic Island Pill (DIP) and Alerts page (PEP-296). Alert docs may originate from Cloud Functions, the frontend, or future agents. The DIP subscribes in realtime to docs with `dip: true`; the Alerts page reads the full collection.

Doc IDs: Deterministic for CF-produced alerts to prevent duplicates on retries (e.g., `cf:interviewCap:teacherUid:2026-W23`). Auto-generated for frontend-created alerts (broadcasts).

```typescript
interface AlertDoc {
  // Bus contract — required on every alert
  type: 'redFlag' | 'interview' | 'broadcast' | 'system' | 'agent';
  dip: boolean;                    // true = surfaces in Dynamic Island Pill
  priority: number;                // DIP carousel sort order (lower = more urgent)
  source: string;                  // producer ID (e.g., "cf:interviewScheduler", "admin:broadcast")
  payload: Record<string, any>;    // type-specific raw data (see below)
  createdAt: Timestamp;
  createdBy: string;               // uid or system identifier

  // Targeting — who sees this alert
  targetRoles: string[];           // [] = all roles
  targetClassrooms: string[];      // [] = all classrooms
  targetTeachers: string[];        // [] = all matching roles

  // Lifecycle
  dismissedBy: Record<string, Timestamp>;  // { [uid]: Timestamp } — per-user ack
  expiresAt: Timestamp | null;     // auto-hide after this time; null = auto-expiry via autoExpireBroadcast CF
  startsAt: Timestamp | null;      // schedule for later (null = publish immediately; DIP skips if startsAt > now)
  reach: number;                   // resolved audience count at publish time (denominator for ack progress)

  // Broadcast subtype (PEP-323)
  broadcastKind?: 'ack' | 'poll';  // defaults to 'ack' when missing (backward-compatible)
  poll?: {                         // present only when broadcastKind === 'poll'
    question: string;
    options: { id: string; label: string }[];
    multiSelect: boolean;
    allowOther: boolean;
  };
  responses?: Record<string, {     // present only when broadcastKind === 'poll'; { [uid]: vote }
    choices: string[];             // selected option IDs
    text?: string;                 // free-text "Other" response
    ts: Timestamp;
  }>;
}
```

Type-specific payloads:
- `interview`: `{ studentName, interviewTime, classroomName, prepStatus, studentId }`
- `broadcast`: `{ label, title, subtitle, ctaLabel, message, senderName, audience }` (poll broadcasts also have top-level `broadcastKind`, `poll`, `responses` fields)
- `system`: `{ message, severity, detail }`
- `agent`: `{ message, detail }`

Display contract: NOT stored in Firestore. The DIP component transforms `type` + `payload` into display fields (`label`, `title`, `subtitle`, `ctaLabel`, etc.) at read time via `transformForDisplay()`. This allows display changes via frontend deploy without data migration.

Access policy: See [Pep OS Access-Control Policy](docs/security/access-control-policy.md).

Lifecycle: `autoExpireBroadcast` sets `expiresAt: now()` when `dismissedBy` count reaches `reach`, then creates a `broadcast-complete:` system alert with a 30-day TTL.

---

## 📊 Stats Cache (`/statsCache/{docId}`)
Purpose: Pre-computed per-classroom stats and heatmap cache written by Cloud Functions (`updateStatsDelta` and weekly `reconcileStats` PEP-285, `writeHeatmapCache` PEP-303). Doc ID conventions: `classroom_{id}` for stats, `heatmap_{id}` for heatmap cache, `_meta` / `heatmap_meta` for freshness sentinels.

### Meta doc (`/statsCache/_meta`)
```typescript
interface StatsMetaDoc {
  cachedAt: Timestamp;        // when CF last ran
  classroomCount: number;     // number of classroom docs written
  deltaCursor: {               // ordered ingestion checkpoint; intentionally uses createdAt, not observedAt
    createdAt: Timestamp;
    documentPath: string;
  } | null;
  deltaGeneration: number;     // fencing token; newer runs invalidate older publishers
  deltaRunId: string | null;
  deltaRunStatus: "running" | "completed" | "failed";
  deltaLeaseUntilMs: number | null;
  deltaUpdatedAt: Timestamp;
  lastFullReconciliationAt: Timestamp;
}
```

### Classroom doc (`/statsCache/classroom_{classroomId}`)
```typescript
interface StatsClassroomDoc {
  cachedAt: Timestamp;
  classroomId: string;
  classroomName: string;
  branchId: string | null;

  effortCounts: {               // deduped by groupId — group note = 1 act
    voice: number;
    text: number;
    lesson: number;
    media: number;
    total: number;
  };

  effortActivity: {             // deduped aggregate activity tiers
    daily: Record<string, number>;   // "YYYY-MM-DD" → count, last 30 days
    weekly: Record<string, number>;  // "YYYY-Www" → count, last 12 weeks
    monthly: Record<string, number>; // "YYYY-MM" → count, last 12 months
  };

  effortActivityByType: {       // deduped per-type activity tiers
    voice: { daily: Record<string, number>; weekly: Record<string, number>; monthly: Record<string, number>; };
    text:  { daily: Record<string, number>; weekly: Record<string, number>; monthly: Record<string, number>; };
    lesson:{ daily: Record<string, number>; weekly: Record<string, number>; monthly: Record<string, number>; };
    media: { daily: Record<string, number>; weekly: Record<string, number>; monthly: Record<string, number>; };
  };

  studentCount: number;

  teachers: Array<{             // all counts deduped by groupId
    id: string;
    name: string;
    email: string;
    status: string;
    observations: number;       // voice + text in THIS classroom
    lessons: number;            // lessons in THIS classroom
    media: number;              // media in THIS classroom
    handwritten: number;        // handwritten subset of media
    observations7d: number;
    lessons7d: number;
    media7d: number;
    handwritten7d: number;
    observations30d: number;
    lessons30d: number;
    media30d: number;
    handwritten30d: number;
    otherNotes7d: number;       // deduped notes in OTHER classrooms (7d)
    otherCount7d: number;       // number of other classrooms (7d)
    otherNotes30d: number;      // deduped notes in OTHER classrooms (30d)
    otherCount30d: number;      // number of other classrooms (30d)
  }>;

  students: Array<{             // per-student fan-out (NOT deduped)
    id: string;
    name: string;
    status: string;
    totalMentions: number;
    thisWeekMentions: number;
    last14DaysMentions: number;  // trailing 2-week count — used by digest agent for negligence detection
    last42DaysMentions: number;
    mediaMentions: number;
    mediaThisWeek: number;
    mediaLast14Days: number;
    mediaLast42Days: number;
    handwrittenMentions: number;
    handwrittenThisWeek: number;
    handwrittenLast14Days: number;
    handwrittenLast42Days: number;
  }>;
}
```

### Heatmap doc (`/statsCache/heatmap_{classroomId}`) — PEP-303
```typescript
interface HeatmapCacheDoc {
  classroomId: string;
  weekKey: string;              // e.g. "2026-W23"
  cachedAt: Timestamp;
  counts: {
    escalated: number;
    steady: number;
    improved: number;
    total: number;
  };
  roster: Array<{
    studentId: string;
    displayName: string;
    classroomId: string;
    weeks: Array<string | null>; // 6-element array (oldest → newest), severity or null
    escalatedThisWeek: boolean;
    improvedThisWeek: boolean;
  }>;
}
```

### Heatmap meta doc (`/statsCache/heatmap_meta`) — PEP-303
```typescript
interface HeatmapMetaDoc {
  cachedAt: Timestamp;
  classroomCount: number;
  weekKey: string;
}
```
Note: `heatmap_meta` is not read by client code and exists for operational diagnostics.

Access policy: See [Pep OS Access-Control Policy](docs/security/access-control-policy.md).

---

## ✅ Rationale
- Fan-out per student + collection group queries balances write cost (bounded by class size) with extremely fast reads
- Denormalized `classroomId` and `branchId` on observations support efficient queries
- Cached creator name/email prevents n+1 user lookups in UI and reports
- Feedback is stored as a global user-input channel

---

## 🧪 Test Bench (`/testbench/settings`)
Purpose: Anchor doc for all test bench data. Holds feature registry, defaults, and global config. Subcollections hold access grants and run history.

```typescript
interface TestBenchSettings {
  features: Record<string, {
    label: string;                // display name, e.g., "Soul Generation"
    enabled: boolean;
  }>;
  defaults: {
    model: string;                // e.g., "gpt-5.4"
    temperature: number;
    max_tokens: number;
  };
}
```

Access policy: See [Pep OS Access-Control Policy](docs/security/access-control-policy.md).

---

### 🔑 Test Bench Access (`/testbench/settings/access/{uid}`)
Purpose: Per-user feature grants for specific test bench features (PEP-224).

```typescript
interface TestBenchAccess {
  allowedFeatures: string[];    // e.g., ["handwriting_analysis", "interview_question_gen"]
  grantedBy: string;            // superadmin uid who last modified the grant
  name: string;                 // cached teacher display name
  email: string;                // cached teacher email
  updatedAt: Timestamp;
}
```

Access policy: See [Pep OS Access-Control Policy](docs/security/access-control-policy.md).

---

### 🧪 Test Bench Runs (`/testbench/settings/runs/{runId}`)
Purpose: Stores prompt test bench run history — each doc captures a comparison session where a user tested prompt variations against real student data (PEP-163, PEP-224).

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

Access policy: See [Pep OS Access-Control Policy](docs/security/access-control-policy.md).
