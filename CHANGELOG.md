# Changelog

# 10.11.0 — 2026-04-23

### Added
- Batch writing analysis Cloud Function — accumulates unprocessed handwritten media docs per student and runs a combined VLM analysis producing rubric ratings, narrative summary, trends, and recommendations (PEP-132)
- Configurable minimum sample threshold via Firestore `config/handwriting_analysis` doc with 5-min TTL cache (PEP-132)
- Longitudinal context — previous analysis is injected into the prompt so the VLM can detect trajectory changes across cycles (PEP-132)
- Admin test script for end-to-end local testing with dry-run support (PEP-132)
- Composite Firestore index for `media` subcollection (handwritten + status + observedAt) (PEP-132)

# 10.10.0 — 2026-04-22

### Added
- Soul narrative system — replaces structured per-dimension profiles with a free-form markdown soul doc per student, regenerated weekly from all observations and interviews (PEP-149)
- Per-student guidelines doc seeded from program-level soul templates (toddler, primary, elementary, adolescent), evolves independently per student (PEP-149)
- Soul history snapshots — previous soul is archived before each weekly regeneration (PEP-149)
- Structured guidelines suggestions — soul generation extracts AI-proposed new skill areas for the guideline approval flow (PEP-149)
- Soul template seed script and four program-level template files sourced from Rahul's report card benchmarks (PEP-149)

### Changed
- `generateStudentProfile` and `backfillStudentProfiles` Cloud Functions refactored from dimension-based profile writes to soul/guidelines generation (PEP-149)
- Admin test script now fetches interviews alongside observations for full-parity soul generation (PEP-149)
- Firestore security rules: added history subcollection (superadmin-only), removed deprecated `ai_prompts` and `profile` rules (PEP-149)

### Removed
- `profileConstants.js` dimension definitions, `profileHelpers.js` structured parsing, and associated tests — replaced by `soulHelpers.js` (PEP-149)

# 10.9.1 — 2026-04-22

### Fixed
- Stop button in student chat now truly cancels the AI response — writes `cancelledResponseAt` to the user message doc so the Cloud Function skips the assistant write (PEP-96)
- Client-side `stoppedRef` suppression prevents late-arriving assistant messages from rendering after Stop is pressed (PEP-96)
- "Response interrupted" label shown below the user message when a response is cancelled (PEP-96)
- Removed misleading "response may still arrive" warning — stop means stop (PEP-96)

# 10.9.0 — 2026-04-19

### Added
- Interviews footer tab — scaffold page showing upcoming and completed interview cards with student info, alert flags, and relative timestamps (PEP-11)
- `formatLastInterviewed` guards for future dates and invalid ISO strings (PEP-11)

### Changed
- Renamed "Notifications" footer tab to "Alerts" (PEP-11)
- Per-photo VLM classification — each photo in a batch now gets its own independent curriculum area and handwritten flag via parallel nano calls, replacing the single-classification-for-all approach (PEP-146)
- Call 2 (handwriting analysis) removed from upload-time pipeline — handwriting intelligence deferred to batch analysis at weekly plan generation (PEP-146)
- Student timeline batch groups now show multiple curriculum area chips (one per unique area) instead of copying from the first photo (PEP-146)
- Media doc schema simplified: `description` and `handwritingAnalysis` fields no longer written at upload time (PEP-146)

### Fixed
- Dead student context Firestore fetch removed from photo analysis flow — eliminated unnecessary read latency (PEP-146)
- Student picker now shows "(only 1 student per photo note)" label when maxSelectable limit is reached (PEP-146)

# 10.8.0 — 2026-04-15

### Changed
- Two-step photo VLM pipeline — cheap classification call (gpt-5.4-nano) on every photo for curriculum tags and description, expensive handwriting analysis call (gpt-5.4) only when handwriting is detected (PEP-131)
- Flat media doc schema replaces nested `photoAnalysis` object with top-level `handwritten`, `curriculumArea`, `description`, and `handwritingAnalysis` fields (PEP-131)
- Student timeline lightbox now displays per-dimension handwriting scores (1-5) with notes alongside developmental observations (PEP-131)

### Fixed
- VLM JSON parse errors now throw descriptive `HttpsError` instead of raw `SyntaxError` (PEP-131)

# 10.7.0 — 2026-04-15

### Added
- Interview transcript storage schema — immutable `interviews` subcollection under students with append-only Firestore security rules, composite index, and DATA_STRUCTURE.md documentation (PEP-142)
- Profile generation now consumes interview transcripts alongside observations — server-side status filtering, formatted interview context for LLM, SOURCE_INTERVIEW tracking (PEP-142)
- Interview helper tests (6 tests) and security rule specs (2 specs) for interview transcript access control (PEP-142)
- Curriculum area chips and truncated AI description on StudentTimeline and ClassroomTimeline media cards, with full photo analysis detail in the expanded preview dialog (PEP-33)
- Curriculum area filter dimension in FilterPanel — multi-select chip group filters media observations by curriculum area while passing through unanalyzed media (PEP-33)
- Media doc fetching in ClassroomTimeline via collectionGroup query with new composite Firestore index (PEP-33)

### Changed
- Question generation script updated to use profile gaps field for targeted interview question selection (PEP-142)

### Fixed
- Batch-grouped media preview dialog now falls back to the batch group's photoAnalysis when the individual doc lacks it (PEP-33)
- ClassroomTimeline async IIFE wrapped in try/finally to prevent loading spinner from hanging on fetch errors (PEP-33)

# 10.6.0 — 2026-04-14

### Added
- Interview question generation prototype — standalone script reads student profile dimensions and baseball card from Firestore, calls OpenAI to generate 7 targeted MCQ/open-ended interview questions with coverage report (PEP-140)

### Fixed
- Null guard on OpenAI response content to prevent confusing errors on unexpected API response shapes (PEP-140)

# 10.5.1 — 2026-04-14

### Changed
- Consolidated all `ai_prompts` docs into `config` collection — each AI feature now has a single config doc with prompts, model, temperature, and operational params (PEP-139)
- Dynamic model selection dropdowns added to Coach, Text Cleanup, and Baseball Card editors (PEP-139)
- Cloud Functions read model/temperature from Firestore config docs with fallback to hardcoded constants (PEP-139)
- MCP server tools consolidated: `get_ai_config`/`list_ai_configs` removed, `get_config`/`list_config` now serve all config docs (PEP-139)

### Removed
- `ai_prompts` Firestore security rules (collection no longer referenced in code) (PEP-139)
- Baseball Card playground section from admin UI (PEP-139)
- Stale seed scripts: `seed-profile-prompts`, `seed-readiness-prompts`, `seed-profile-dimensions` (PEP-139)

### Fixed
- Scroll-wheel no longer changes number input values across all admin editors (PEP-139)

# 10.5.0 — 2026-04-13

### Added
- Rich AI photo analysis — photos of student work are automatically analyzed by VLM returning curriculum area, handwritten detection, AI-generated description, materials identified, and developmental notes (PEP-32)
- Cloud Function `analyzePhotoVLM` with structured JSON output, student age context, and Firestore-managed prompt with hardcoded fallback (PEP-32)
- Photo card UI redesign — 4:3 aspect ratio, overlay pill toggle for Own work/Copied, curriculum and handwritten chips, editable AI description (PEP-32)
- `photoAnalysis` parser with comprehensive validation, safe defaults for malformed VLM responses, and `teacherEdited` tracking (PEP-32)
- Seed script for `ai_prompts/photo_analysis_vlm` prompt management (PEP-32)

### Changed
- Photo notes restricted to single student per upload for age-contextualized VLM analysis; multi-student deferred to PEP-138 (PEP-32)
- Action buttons (polish/dictate) moved below text fields instead of inside endAdornment for better mobile layout (PEP-32)

### Fixed
- Image payload validation on VLM callable — enforces max 10 images and 10 MB total size (PEP-32)
- `resetMediaState` now clears photo analysis loading state to prevent stale analysis blocks (PEP-32)

# 10.4.0 — 2026-04-07

### Added
- Report-generated markers on student timelines — compact card showing report icon, date, generator name, and note count; tapping opens ReportPreviewDialog (PEP-82)
- Grouped report markers on classroom timelines — reports grouped by calendar date with expandable student dropdown, each opening the student's report preview (PEP-82)
- Cloud Function `writeReportDoc` now enriches report docs with `studentId`, `classroomId`, and `kind: 'report'` fields for timeline queries (PEP-82)
- `observationUtils` extended with 'report' type for icon and label support (PEP-82)
- Student profile model: per-dimension AI-generated narrative profiles stored at `students/{studentId}/profile/{dimensionId}` with structured signals (confidence, evidence count, trend) and version history subcollection (PEP-124)
- `generateStudentProfile` Cloud Function for single-student profile generation from observations using GPT-5.4 (PEP-124)
- `backfillStudentProfiles` Cloud Function with `startAfter`/`batchSize` pagination for bulk profile seeding across all active students (PEP-124)
- Per-program dimension config at `config/profile_dimensions_{program}` with seed script for toddler, primary, elementary, and adolescent programs (PEP-124)
- Per-program profile generation prompts at `ai_prompts/profile_{program}` with seed script (PEP-124)
- Firestore security rules for profile subcollection: superadmin read, Cloud Functions write via admin SDK (PEP-124)
- Security rule spec tests for profile and history subcollection access control (PEP-124)

### Fixed
- Report markers exempt from timeline type filters — reports always visible regardless of active filters (PEP-82)
- Report items excluded from observation export count and pipeline (PEP-82)
- Firestore Timestamp handling in ReportPreviewDialog for `.toDate()` objects (PEP-82)
- IST-aware date grouping for classroom report markers (PEP-82)

# 10.3.0 — 2026-04-04

### Added
- Report readiness checker: standalone Cloud Function `checkReportReadiness` evaluates observation quality before report generation, giving teachers visibility into data gaps (PEP-68)
- Per-program readiness evaluator prompts for adolescent, elementary, primary, and toddler programs with domain-specific scoring rubrics (PEP-68)
- Readiness results cached at `students/{studentId}/ai_summaries/report_readiness` with staleness tracking (PEP-68)
- "Report Readiness" panel on ReportsPage showing sentiment/balance scores, missing data flags, and note count (PEP-68)
- Staleness indicator: "X new notes since the last report" on the readiness panel (PEP-68)
- Seed script for readiness evaluator prompts and migration script to strip scoring from report prompts (PEP-68)

### Changed
- Report generation prompts no longer include scoring rubrics — scoring is handled by the readiness checker (PEP-68)
- `parseReportResponse` returns only `{ reportText }`; downstream consumers (CSV, Drive export) read scores from the cached readiness doc (PEP-68)
- Removed `FeatureTag` component and `featureFlags.js` — unused feature flag infrastructure cleaned up


# 10.2.0 — 2026-03-30

### Added
- "Context Window" editor UI for report prompts — split system prompt into static and dynamic sections with accordion layout, line counts, and collapsed previews (PEP-105)
- Version history with revert support for report prompt fields, following the existing AI tool editor pattern (PEP-105)
- User Message section showing auto-injected student context and observations info blocks (PEP-105)
- Migration script for renaming `systemPrompt` → `staticSystemPrompt` + `dynamicSystemPrompt` in Firestore `ai_prompts/report_*` docs (PEP-105)

### Changed
- `generateStudentReport` Cloud Function now assembles system message from static + dynamic prompts via `assembleReportSystemContent` helper (PEP-105)
- Preview/playground sends both prompt fields as overrides, bypassing server-side cache for immediate feedback (PEP-105)

# 10.1.0 — 2026-03-25

### Added
- "Tag Lesson Note" support for media observations — teachers can tag photos, videos, and PDFs with lesson notes, matching the existing text/voice tagging UX (PEP-58)
- Lesson tag chips displayed on media cards in the student timeline (PEP-58)

# 10.0.1 — 2026-03-24

### Removed
- Dead bulk report generation code: `StudentList.jsx` component, `generateClassroomReports` and `exportClassroomReportsToDrive` Cloud Functions, `REPORT_BULK_CONCURRENCY` constant, and bulk UI in `ReportGenerateDialog` (PEP-115)

# 10.0.0 — 2026-03-24

### Added
- Telegram bot webhook foundation: `telegramWebhook` Cloud Function receives Telegram POSTs, verifies webhook secret header, checks sender against Firestore whitelist, and echoes authorized messages back (PEP-109)
- grammy framework integration for Telegram Bot API interactions (PEP-109)
- One-time setup script (`scripts/admin/setup-telegram-bot.mjs`) registers webhook URL with Telegram and seeds `config/telegram_bot` Firestore doc with allowed user IDs (PEP-109)

# 9.10.1 — 2026-03-16

### Fixed
- Client-side timeouts on all 10 Cloud Function calls now match server-side timeouts, preventing premature "deadline-exceeded" errors (PEP-89)
- Friendly error messages replace raw error codes across all Cloud Function call sites — timeout and generic errors (PEP-89)
- Report Generate dialog stays open on error so the user can adjust dates and retry without re-navigating (PEP-89)

# 9.10.0 — 2026-03-10

### Added
- Quality flags on report cards: sentiment score and area balance score as colored chips (green/yellow/red) with expandable missing data details (PEP-87)
- Data completeness chip on report cards: "Complete" (green) or "Missing data" (amber) with expandable flag list (PEP-87)
- Author display name shown on each report card with teacher emoji (PEP-87)
- "Author" column added to both summary and archive CSV exports (PEP-87)

### Changed
- `generatedByName` stored alongside `generatedBy` at report generation time — no extra Firestore reads at render (PEP-87)

# 9.9.0 — 2026-03-09

### Added
- Report save & Drive export now runs in the background via SaveQueueService instead of blocking the UI (PEP-81)
- In-progress export indicator on ReportsPage while background exports are running (PEP-81)
- Success toast with "View" action that navigates to and auto-opens the finished report (PEP-81)
- Error toast with "Retry" action for failed exports, using SaveQueue retry logic with max 3 attempts (PEP-81)

# 9.8.6 — 2026-03-09

### Fixed
- Classroomadmin Google Drive permissions now compare `manageableClassrooms` against classroom IDs instead of program IDs, fixing incorrect folder access grants/revocations (PEP-86)

# 9.8.5 — 2026-03-09

### Added
- Classroom name and term prepended to CSV report filenames: `{Classroom} | March 2026 | Report Consolidation Summary.csv` (PEP-83)
- Append-only archive CSV alongside summary CSV — accumulates all report rows as a historical audit trail (PEP-83)
- Legacy `Report Consolidation Summary.csv` files auto-renamed to new format on first access (PEP-83)

### Changed
- Report deletions only remove from summary CSV; archive rows are preserved as immutable history (PEP-83)

# 9.8.4 — 2026-03-08

### Added
- Cascading branch/program/classroom filters on bulk CSV upload page — branch narrows programs, program narrows classrooms (PEP-80)
- Classroom multi-select via autocomplete replaces single classroom dropdown; at least one classroom required before student matching (PEP-80)
- Editable default date picker for CSV rows without dates (PEP-80)
- Matched students now display their classroom name for disambiguation (PEP-80)

# 9.8.3 — 2026-03-08

### Changed
- Default report start date changed from November 1st to October 15th to align with term 2 start (PEP-78)
- Reports card on student dashboard now visible only to superadmins (PEP-78)

# 9.8.2 — 2026-03-08

### Fixed
- Report end date is now inclusive: observations on the last day of a date range are no longer excluded from generated reports (PEP-77)
- Report date picker switched from manual dd/mm/yyyy text input to native date picker with range validation (PEP-77)

### Added
- Date boundary regression tests for report generation and export filtering (PEP-77)

# 9.8.1 — 2026-03-07

### Changed
- Google Doc report metadata line now shows start date in DD/MM/YYYY format with "to date" text, and academic year moved to pipe 4 (PEP-76)
- Report logo increased from 80x80 to 200x200 PT in exported Google Docs (PEP-76)
- Entire exported report document now uses Roboto font (PEP-76)

### Fixed
- Classroom admin report permissions now check classroomId directly instead of resolving programId, aligning with Firestore security rules (PEP-76)

# 9.8.0 — 2026-03-06

### Added
- Drive folder permissions now mirror in-app access: teachers, classroom admins, and superadmins automatically receive editor access on classroom-level Google Drive folders (PEP-69)
- Firestore triggers sync Drive permissions when classroom teacher assignments, user roles, or manageable programs change (PEP-69)
- Bulk sync callable for superadmins to backfill Drive permissions across all existing classroom folders (PEP-69)
- Reports page now accessible to all roles (teachers, classroom admins, superadmins) instead of superadmin-only (PEP-69)
- Draft report flow: generate a report preview before committing to Firestore, with option to discard or save & export to Drive (PEP-69)
- Classroom admins can now delete reports for students in their managed programs (PEP-69)

### Changed
- Report generation uses dry-run mode to return preview data without persisting, allowing discard before export (PEP-69)
- Export to Drive now accepts draft report payloads in addition to existing Firestore report references (PEP-69)

# 9.7.4 — 2026-03-06

### Changed
- ClassroomTimeline now fetches 20 observations per batch with Firestore cursor-based pagination instead of 50, with a "Show 20 More" button to load additional pages (PEP-28)
- StudentTimeline now fetches 20 observations initially via real-time listener, with cursor-based "Show 20 More" for older notes (PEP-28)
- UsersAccessPage displays 10 users per tab with "Show 10 More" buttons; limits reset automatically when search or filters change (PEP-28)

### Fixed
- ClassroomTimeline onSnapshot now merges fresh notes with previously loaded pages instead of discarding them (PEP-28)
- ClassroomTimeline resets pagination cursors and exhaustion state when the student list changes, preventing stale markers and wasted Firestore reads (PEP-28)
- ClassroomTimeline filters out removed students' notes from the merged timeline (PEP-28)
- StudentTimeline displaced observations at the snapshot page boundary are moved to olderObs instead of silently disappearing (PEP-28)
- StudentTimeline recentObs is cleared on student change, preventing briefly stale data from the previous student (PEP-28)
- Fixed operator precedence bug in date-sort expressions across both timelines (PEP-28)

# 9.7.3 — 2026-03-06

### Changed
- Google Doc report exports now match the reference template: PEP logo, navy blue student name heading, pink metadata line with program/academic year, styled section headings, dark grey justified body text, proper spacing (PEP-73)
- Missing input flags in report preview now display as a compact chip-button with expandable popover instead of stacked alerts (PEP-73)

### Fixed
- Google Doc export logo URL updated to use GCS direct URL (PNG format) — fixes 403 error from Google Docs API when inserting inline image (PEP-73)
- Orphaned empty Google Docs are now automatically trashed if content insertion fails during export (PEP-73)

# 9.7.2 — 2026-03-06

### Fixed
- Observations (voice, text, lesson) now appear correctly on the classroom timeline in the default unfiltered view (PEP-74)
- Timeline pagination merges grouped and ungrouped notes by date before limiting, preventing newer notes from being pushed off the first page by older grouped items

# 9.7.1 — 2026-03-06

### Fixed
- ChildChat stale closure bug: assistant "thinking" indicator now clears reliably when response arrives (PEP-27)
- Defensive 30-second timeout prevents stuck spinner when backend errors silently (PEP-27)
- OpenAI API calls now use `max_completion_tokens` and strip unsupported params for reasoning models (PEP-27)

### Changed
- ChildChat UI polished to ChatGPT-level quality: modern message bubbles (16px radius), generous spacing, simplified typing indicator with bouncing dots (PEP-27)
- Timestamps and copy buttons now show on hover/tap instead of always visible (PEP-27)
- Scroll-to-bottom floating button appears when user scrolls up in conversation (PEP-27)
- Stop button replaces mic/send while waiting for AI response (PEP-27)
- Chat components extracted into reusable `chat/` module (MessageBubble, TypingIndicator, ScrollToBottomFab, formatMessage, chatUtils) (PEP-27)

# 9.7.0 — 2026-03-05

### Changed
- Migrated all AI features from GPT-4o/4o-mini to GPT-5 family models (gpt-5.2 and gpt-5-mini) (PEP-75)
- Centralized model configuration into a single modelConstants module for all AI features
- Model selection fields across config editors (Baseball Card, Chat, Reports) now use dropdown pickers with all available GPT-5 models

# 9.6.3 — 2026-03-05

### Removed
- Performance summary card from Notifications page (already present in Stats > Students tab) — eliminates duplicate Firestore queries for students, classrooms, and observations

# 9.6.2 — 2026-03-05

### Fixed
- Classroom admin teacher query now scoped to managed classrooms at the Firestore query level, not just client-side filtering (PEP-23)
- Classroom admins can now view other classroom admins who manage overlapping classrooms (view-only, no edit access) (PEP-23)

# 9.6.1 — 2026-03-05

### Fixed
- Classroom admins on Users & Access page now only see and act on teachers assigned to their manageable classrooms (PEP-48)
- Promote-teacher-to-admin flow routed through server-side validation instead of direct Firestore write (PEP-48)
- Delete and manage-classrooms actions gated to in-scope teachers for classroom admins (PEP-48)
- firstName/lastName fallback for migrated users in promote/edit Cloud Function calls (PEP-48)

# 9.6.0 — 2026-03-03

### Added
- CSV bulk upload for historical lessons and observations (superadmin-only, on Settings page) (PEP-45)
- Fuzzy student name matching with supervised review step for CSV imports (PEP-45)
- Duplicate detection with warnings for bulk-uploaded records (PEP-45)
- Coach Pepper chat access for teachers (PEP-53)
- Baseball card regeneration for all user roles (PEP-50)
- Lesson note tagging opened to all users (PEP-51)

### Changed
- Firestore rules now allow 'text' observation type for CSV-imported observations (PEP-45)
- Bulk upload moved from Config page to Settings page (PEP-45)

### Fixed
- CSV type column normalized to lowercase for reliable routing (PEP-45)

# 9.4.0 — 2026-03-02

### Added
- Report Generation config page: model settings (model, temperature, max tokens, timezone) read/write to `/config/report_generation` Firestore doc (PEP-67)
- Per-program prompt editor with template variable chips and edit/preview toggle for adolescent and elementary programs (PEP-67)
- Report playground: select a student, override config values, preview report output without saving via `previewStudentReport` Cloud Function (PEP-67)
- `mergeReportConfig` helper with 36 unit tests covering config merge chain, prompt overrides, and input validation (PEP-67)

### Changed
- `generateStudentReport` Cloud Function reads model settings from Firestore config doc instead of hardcoded defaults (PEP-67)

# 9.3.1 — 2026-03-01

### Added
- Superadmin report deletion: delete icon on each report row, confirmation dialog, cascading deletion of Firestore doc + Google Drive doc + CSV summary row (PEP-66)
- `deleteStudentReport` Cloud Function with superadmin-only enforcement (PEP-66)
- `removeCsvRow` helper with 5 unit tests and `trashDriveFile` Drive helper (PEP-66)
- Toast notifications on report deletion success/failure (PEP-66)

# 9.3.0 — 2026-03-01

### Added
- Dedicated Reports card on Student Dashboard with navigation to a full Reports page (PEP-64)
- Reports page: list of past reports with dates, view any report, generate new reports (PEP-64)
- `buildReportList` utility with 7 unit tests for Firestore doc normalization and sorting (PEP-64)

### Changed
- Report generation moved out of Weekly Snapshot card into its own Reports page (PEP-64)

# 9.2.0 — 2026-02-28

### Added
- Google Drive export: "Export to Drive" button on report preview creates a formatted Google Doc in a per-classroom Drive folder hierarchy (Branch → Program → Classroom → Student) (PEP-61)
- Bulk export: "Export All to Drive" button after bulk report generation exports all reports with concurrency control (PEP-61)
- Per-classroom summary CSV in the classroom Drive folder with scores, metadata, and Google Doc links — auto-updated on each export (PEP-61)
- Report versioning: re-exports create "Progress Report v2", "v3", etc. while preserving prior docs (PEP-61)
- Drive helper utilities with 15 unit tests: folder creation, doc versioning, CSV parsing/serialization (PEP-61)

# 9.1.0 — 2026-02-28

### Added
- "Generate Report" button on Student Dashboard for triggering AI parent report generation (PEP-60)
- Date range picker dialog with dd/mm/yyyy Indian format and Nov 1 academic year default (PEP-60)
- In-app report preview dialog with ## section headings and ### sub-heading rendering (PEP-60)
- Bulk-select mode on StudentList: checkboxes, select all/deselect, batch report generation with progress indicator (PEP-60)
- Report utility functions with 17 unit tests: date range calculation, markdown section parsing, sub-heading splitting (PEP-60)
- Firebase Functions emulator auto-connect in dev mode for local Cloud Function testing

# 9.0.0 — 2026-02-27

### Added
- AI report generation pipeline: `generateStudentReport` and `generateClassroomReports` Cloud Functions for GPT-4o parent-facing progress reports (PEP-59)
- Program-specific report prompts: Adolescent (v7.1) and Elementary (v2.1) with structured scoring (sentiment balance, area balance, missing input flags)
- Date-range-scoped observation fetching for report generation (academic year default: Nov 1 → now)
- Bulk report generation with concurrency control and per-student progress tracking
- Report helper utilities with 15 unit tests (date range, response parsing, prompt resolution)
- Prompt seeding script for `ai_prompts` collection (`seed-report-prompts.mjs`)
- Monthly writing snapshot async job: scheduled Cloud Function aggregates `handwritten=true` media notes per student and runs bundled VLM analysis for developmental writing insights (PEP-47)
- On-demand `regenerateWritingSnapshotForStudent` callable for teachers/admins to refresh a student's writing snapshot mid-month (PEP-47)
- Superadmin-only `previewWritingSnapshot` callable for dry-run testing (PEP-47)
- IST month-key utilities (`getIstMonthKey`, `getMonthWindowDates`) with 10 tests (PEP-47)
- Pure writing snapshot helpers (`filterWritingSamples`, `formatWritingSampleLabel`, `determineSnapshotStatus`, `parseWritingSnapshotResponse`) with 23 tests (PEP-47)

# 8.6.0 — 2026-02-28

### Added
- Per-image `copied` boolean field on media notes with inline MUI Switch toggle per photo thumbnail (PEP-43).
- Per-image `handwritten` boolean field auto-detected via VLM on photo upload (PEP-43).
- New `detectHandwritingVLM` Cloud Function using gpt-4o-mini vision for focused handwriting YES/NO inference (PEP-43).
- Extracted `buildMediaDocData` utility for testable media doc construction with 6 new tests.

### Changed
- Replaced `analyzePhotoVLM` Cloud Function with `detectHandwritingVLM` — drops general image analysis in favor of focused handwriting detection (PEP-43).
- Removed all `photoAnalysis` / "Image Analysis" references from AddNoteModal, StudentTimeline, and data schema (PEP-43).

# 8.5.3 — 2026-02-27

### Added
- New `/refine-linear-issue` skill: refine existing Linear issues with full context loading, clarifying questions, and polished descriptions.

### Changed
- Replaced `/create-linear-issue` with `/refine-linear-issue` (creation handled by `/draft-linear-issues`, refinement is now a dedicated skill).
- Updated `/draft-linear-issues` references to point to `/refine-linear-issue`.

# 8.5.2 — 2026-02-27

### Added
- New `/draft-linear-issues` skill: batch-triage meeting notes into lightweight Linear Backlog issues with one-at-a-time Create/Skip/Edit walk-through.

### Changed
- `/create-linear-issue` now detects and refines draft-sourced issues (preserves meeting context, loads deep-dives, upgrades Backlog → Todo).

# 8.5.1 — 2026-02-27

### Fixed
- Lint: eliminated all ESLint errors across the frontend (313 errors → 0).
- Security: scoped classroomadmin media deletion to managed classrooms only (PEP-24).
- Timeline: batched media URL requests for faster StudentTimeline loads (PEP-29).
- Timeline: rendered media thumbnails progressively instead of blocking on all URLs (PEP-29).
- Error handling: surfaced silent catches in observation save paths (PEP-26).

### Changed
- Refactored out dead reassignment handlers in StudentTimeline (PEP-25).
- Split `/wrapup-issue` skill into separate wrapup and `/merge-issue` skills.
- `/wrapup-issue` now audits the diff against the Linear issue for under-delivery and scope creep.
- `/wrapup-issue` now nudges the user to run `/version-update` after completion.
- CI: test workflows now run on pushes to any branch, not just `dev`.

### Added
- New `/version-update` skill: automates version bump, changelog generation, commit, and push.

# 8.5.0 — 2026-02-14

### Added
- Background save completion notifications: users now get a final “saved” toast when queued note/media/lesson saves finish processing.

### Changed
- Save UX now prioritizes instant workflow continuation: submit actions show an in-progress notification and immediately close/return so teachers can start the next capture without waiting.
- StudentTimeline no longer shows the queue status/retry card; save progress is communicated through notifications only.

# 8.4.1 — 2026-02-14

### Fixed
- Storage rules: unblocked classroomadmin media access (read, upload, delete) by eliminating a third cross-service `firestore.get()` lookup (`studentClassroomId`) that exceeded the Storage rules evaluation budget, causing blanket 403s. Classroom scoping is now deferred to Firestore rules.

# 8.4.0 — 2026-02-14

### Added
- StudentTimeline: inline media thumbnail carousel in the main timeline feed for media notes, including photo/video previews and horizontal swipe/scroll browsing.
- StudentTimeline: tapping a timeline media thumbnail now opens the media directly in fullscreen preview.

### Changed
- StudentTimeline: “Swipe to browse” helper text now appears only for media groups with 4 or more items.
- StudentTimeline: media URL prefetch now resolves all media items in a note/group instead of only the first file.
- AddNoteModal: broadened image detection to support extension-based matching (including HEIC/HEIF) in addition to MIME checks.
- AddNoteModal: media uploads now retry with longer exponential backoff and jitter to better handle transient storage rule propagation/network timing.
- AddNoteModal: permission-related upload failure messaging now points users to retry shortly while checks sync.

### Fixed
- StudentTimeline: media notes now reliably load on first timeline open by unifying media reads to the student-scoped `students/{studentId}/media` source and removing duplicate listener desync.
- AddNoteModal: failed uploads now persist failed media state (`status: failed`, error code/message) instead of silently deleting the media doc, improving timeline status visibility.

# 8.3.3 — 2026-02-11

### Fixed
- Firestore: added missing collection group rule for `media`, fixing grey images for teachers in student timeline.
- StudentTimeline: fixed race condition where duplicate `setMediaDocs` calls prevented media text from appearing on first load.

### Changed
- StudentTimeline: media notes now use primary text color instead of grey for better visibility.
- StudentTimeline: teacher comments shown with 💬 emoji in timeline and expanded media dialog.
- Admin scripts: switched from service account JSON to `applicationDefault()` credentials for improved security.

# 8.3.2 — 2026-02-10

### Added
- StudentTimeline: media viewer now supports multi-select with a sticky bulk delete bar.
- StudentTimeline: media entries can show teacher comments beneath the upload summary.

### Changed
- StudentTimeline: media notes are merged into the main timeline feed (collectionGroup media read).
- StudentTimeline: media timeline rows now aggregate by `batchId` for cleaner upload summaries.
- StudentTimeline: media viewer no longer shows per-item delete buttons; delete is available in the expanded view only.
- StudentTimeline: media upload summaries now read “{Teacher} added X photos + Y videos on {date}”.

# 8.3.1 — 2026-02-07

### Added
- Media upload: new per-student `media` collection with multi-file photo/video uploads, per-file docs, and background upload flow with success/failure notifications.
- Media timeline: media viewer now reads from the dedicated media collection and opens directly from “View Media” notifications.

### Changed
- Media delete confirmation: simplified copy and removed storage/path details from the dialog.
- Media uploader: cleaned up selection UI (no file names in tiles, no extra strip), and removed blocking upload modal.
- Storage + Firestore rules and media finalize now target `students/{studentId}/media/{mediaId}` paths.


# 8.3.0 — 2026-02-07

### Added
- StudentTimeline: unified timeline now shows media uploads inline as text entries with uploader and timestamp.
- StudentTimeline: note-type chips now mirror Add Note modal icons (text, voice, lesson) with monochrome styling.
- StudentTimeline: media button opens a dedicated media viewer with Photos/Videos and Docs tabs.

### Changed
- StudentTimeline: removed tabs to show a single grouped timeline (Today / Last 7 Days / Beyond) mixing observations, lesson notes, and media.
- StudentTimeline: lesson notes render as minimal cards (author, title, optional student comment, date) while keeping the existing expansion dialog.
- FilterPanel: note type filters now include Media and are no longer locked to tabs.

# 8.2.0 — 2026-02-06

### Added
- StatsPage Teachers tab: classroom selector with scoped counts and a “counts for this classroom only” hint.
- StatsPage Teachers tab: “Also contributed Y notes to X other classrooms” indicator for multi-class teachers.

### Changed
- StatsPage Teachers tab: simplified layout to a single classroom-scoped list (removed program accordion grouping).
- StatsPage Classrooms/Teachers tabs: time period toggle labels now read “Last 7 days” and “Last 30 days”.

### Fixed
- StatsPage Teachers tab: teacher counts are now scoped to the selected classroom to prevent cross-classroom duplication.

# 8.1.2 — 2026-02-06

### Added
- StatsPage Classrooms tab: branch selector for admins and a 1W/1M time toggle for classroom charts.
- StatsPage Teachers tab: program dividers for classroom groups and a 1W/1M time toggle for teacher activity.

### Changed
- StatsPage: removed global filters and simplified the Students tab to a top students list.
- StatsPage: classroom/teacher activity now reflects the selected 1W/1M window.

### Fixed
- StatsPage: classrooms now load more reliably (fallback when `status` is missing) and are always available for teacher grouping.

# 8.1.1 — 2026-02-05

### Changed
- StatsPage Teachers tab: merged voice/text counts into a single Observations chip and added Lesson Notes count for the last 14 days.

### Fixed
- StatsPage: invalidated cached stats missing the new teacher note split fields to prevent stale/zero counts.

# 8.1.0 — 2026-02-04

### Added
- Unified Export Notes page: choose a student (overrides classrooms) or multi-select classrooms, then export via the shared ExportWizard with note kind and date filtering.
- Role-scoped loading for classrooms/students mirrors StudentTimeline permissions (teachers: assigned; classroom admins: manageableClassrooms; super admins: all), and exports flow through `executeExportJob` with classroom grouping preserved.

### Changed
- App wiring now passes `userRole` and `manageableClassrooms` into the export page while keeping the existing classroomNotesReview route name.
- ExportWizard “To” date placeholder now reads “Up to today” instead of showing the current date.

# 8.0.1 — 2026-01-31

### Fixed
- Media notes: improved iOS photo compression with extra downscaling so large photos consistently fit under the 2MB limit.

### Changed
- Media notes: PDF upload card now shows a single Coach Pepper scan state with a small spinner while title/essence are generated.
- Media notes: selected photo/video/PDF cards now include a small upload icon and “tap to upload another” hint for easy replacement.
- Student picker: search input now looks like a rounded search bar with a magnifying glass and scrolling placeholder text.

# 8.0.0 — 2026-01-31

### Added
- Media notes end-to-end: teachers can create photo, mp4 video, and PDF observations; photos auto-compress to WebP, PDFs get title + essence suggestions via new callable functions, and a Storage finalize trigger records authoritative metadata and marks notes ready.
- Media timeline: new Media tab with Photos/Videos grid and Docs list, showing pending placeholders, ready items with download URLs, and failed status messaging. Media creation flow now matches other note UIs with footer actions and inline progress.

### Changed
- Security hardening: Firestore rules now validate media doc shape, enforce a 24h delete window for teacher-authored media, and keep updates create/delete-only; Storage rules align to the deterministic storagePath, strict content-type/extension checks, and 2MB cap for photos.
- UI consistency: Media filters now include media type in queries, ensuring media notes appear on the correct student timeline; cleaned up helper text and layout parity with text/voice note creation.

# 7.3.2 — 2026-01-30

### Added
- Lesson Notes: per-field mic dictation for Short Description, Group Comment (group mode), and per-student comment fields using the existing voice recorder flow.

### Changed
- Lesson Notes: mic button styling is more visible on text fields.

# 7.3.1 — 2026-01-30

### Added
- PerformanceSummaryCard: classroom selector to filter the 42-day performance summary per classroom on NotificationsPage and StatsPage.

### Changed
- PerformanceSummaryCard: loading state now only replaces the pie chart area, keeping the header, selector, and legend visible.
- PerformanceSummaryCard: loading copy updated to Coach Pepper themed messaging.

# 7.3.0 — 2026-01-18

### Fixed
- NotificationsPage: Performance Summary now loads instantly on subsequent visits by adding caching layer. First load still fetches from Firestore, but subsequent loads within 24 hours use cached data, matching the fast loading behavior of StatsPage.

### Changed
- StatsPage: Removed "View Baseball Card" button from student card modal. Student cards now only show the "View Dashboard" button for a cleaner interface.
- PerformanceSummaryCard: Simplified UI to match note distribution pattern. Removed extra info (title, subtitle, descriptions, total notes, average notes), now shows clean donut chart with center text "total students X" and simple legend below with each color showing type and value.
- StatsPage: Improved student search functionality. Removed grey placeholder card, changed from fuzzy search to exact substring matching (case-insensitive), shows student card immediately on match with basic details (name, notes this week, total notes) and "View Dashboard" button.
- PerformanceSummaryCard: Added "Teacher Performance Summary" title inside the card, matching the style and placement of "Student Signals Breakdown" card on NotificationsPage.

# 7.2.6 — 2026-01-17

### Fixed
- Classroom admin stats page: resolved issue where stats showed all zeros due to stale localStorage cache. Added cache invalidation logic that detects when cached observations are empty but cached students are non-empty (indicating stale cache from previous index/permission failures) and automatically clears the observations+stats cache to force fresh Firestore queries.
- Classroom admin scoping: normalized `manageableClassrooms` IDs in App.jsx to handle both full paths (e.g., "classrooms/abc") and plain IDs, ensuring classroom-admin queries match Firestore document IDs correctly.

# 7.2.5 — 2026-01-08

### Added
- BaseballCardSnapshotCard: shared weekly snapshot card shell with optional footer slot for actions.
- NotificationsPage: regenerate confirmation dialog now matches the StudentDashboard flow.

### Changed
- StudentDashboard: weekly snapshot now uses the shared snapshot card layout for consistent structure.
- NotificationsPage: snapshot modal now uses the shared card, with footer buttons rendered inside the card.
- NotificationsPage: snapshot modal overlay is transparent (no extra panel) and the card height is increased to fill more vertical space.
- StudentDashboard/NotificationsPage: coverage button color/label now prioritize language/math gaps with concise “Language/Math + X more” messaging.

# 7.2.4 — 2026-01-08

### Changed
- SettingsPage: app version badge now appears here; removed from ProfilePage.
- VersionBadge: removed the divider styling above the app version.
- NotificationsPage: removed the severity breakdown donut chart so the behavioral flags are the primary focus.
- AppHeader: hide back button on Notifications screen.

# 7.2.3 — 2026-01-08

### Changed
- NotificationsPage: moved Behavioral Flag Breakdown header below the severity chart and removed the top summary cards.
- NotificationsPage: accordion headers now include escalation/open/improved icons and pill-style styling without top divider lines.

# 7.2.1 — 2026-01-08

### Added
- Expandable baseball card in NotificationsPage: clicking any student card opens a modal showing the full baseball card summary with all features (severity flags, coverage status, regenerate functionality).
- Modal footer actions: three-button footer in baseball card modal with "View Dashboard" (navigates to student dashboard), "Regenerate" (superadmin-only), and "Close" buttons.
- Scroll fade effect: gradient fade at bottom of scrollable baseball card content to indicate more content is available below.

### Changed
- NotificationsPage modal UI: removed outer card wrapper for cleaner, more spacious layout; title format changed to "{Student Name}'s Snapshot" with "Snapshot" on second line to accommodate flag icon.
- Baseball card loading state: replaced skeleton loaders with Coach Pepper-themed loading indicator ("Coach Pepper is preparing [Student Name]'s snapshot...").
- NotificationsPage: removed Add Note floating action button from notifications screen.
- Lesson Notes save button UX: save button is now always clickable (except during save operation) instead of being disabled when validation fails; clicking with incomplete information shows specific warning notifications indicating what needs to be completed.
- Lesson Notes validation messages: improved validation messages to be more specific and actionable, with different messages for individual vs group modes and clearer guidance on missing requirements (lesson title, classroom, students, dimension ratings).
- Lesson Notes group mode: fixed validation to allow saving in group mode when defaults are complete, even without explicit overrides for each student (students inherit defaults).

### Technical
- Baseball card data loading: implemented per-student caching and lazy loading when cards are expanded; accordion behavior ensures only one card expanded at a time.
- Modal state management: added comprehensive state tracking for expanded student, baseball card data, loading states, errors, and regeneration status per student.

# 7.2.0 — 2026-01-08

### Added
- Weekly escalation notifications system: tracks student severity transitions (clear→low/medium/high) on a per-week basis using ISO week keys (Asia/Kolkata timezone).
- Bell badge in AppFooter: superadmin-only notification count showing number of students whose severity escalated during the current week (capped at 99+).
- Inbox-style NotificationsPage: organized into three sections — "Escalated (This Week)" (actionable list), "Still Open (No Change)" (collapsed by default), and "Improved (This Week)" (collapsed by default).
- Week-based severity tracking: backend signals doc now stores `weekKey`, `weekBaselineSeverity`, `severityScore`, `prevSeverity`, `escalatedThisWeek`, `improvedThisWeek`, and `evidenceCount` fields for transition detection.
- Classroom grouping: notifications grouped by classroom with severity-first, then evidence-count sorting within each group.
- WeekKey utilities: shared `getIstIsoWeekKey()` helper in both frontend (`montessori-os/src/utils/weekKey.js`) and backend (`functions/utils/weekKey.js`) for consistent week boundary calculation.

### Changed
- NotificationsPage: refactored from card-per-student display to inbox-style sections with classroom grouping and priority-based sorting.
- Signals generation: baseball card pipeline now applies week rollover logic — when week changes, baseline is set from previous severity and transition flags reset; within the same week, flags latch to track any escalation/improvement.
- Caching strategy: notifications cache now keyed by `uid + weekKey` so data refreshes automatically on week rollover.
- AppFooter: added real-time badge count query using collectionGroup for `ai_summaries` filtered by current weekKey and escalatedThisWeek flag.

### Technical
- Firestore indexes: added collection group index for `ai_summaries` queries combining `weekKey` and `escalatedThisWeek` boolean filters.
- Week rollover logic: idempotent per student per week — multiple baseball card runs within the same ISO week don't double-count escalations.
- Severity scoring: numeric severity scores (0=clear, 1=low, 2=medium, 3=high) enable deterministic comparison and sorting.
- Evidence count: used as secondary sort key within same severity level to prioritize students with more supporting observations.

# 7.1.1 — 2026-01-07

### Added
- Baseball Card: student context in summaries (name, DOB), shared fallback prompt, and runtime prompt substitution for student focus.

### Changed
- ClassroomTimeline: lesson summary rendering can optionally include student comments.
- NotificationsPage: caching of notifications data with improved loading states; layout refines feature pill to styled Box.

# 7.1.0 — 2026-01-06

### Added
- Firestore collection group rule for `ai_summaries` so signals can be queried safely across students by privileged admins and teachers.

### Changed
- Notifications page now treats `null` severity as a green “Clear” flag and shows a four-lane, equal-width segmented pill with per-category counts (High/Medium/Low/Clear).
- Simplified the notifications header chips, removed redundant captions, and tightened the superadmin-only view to focus on the new flag distribution.

### Fixed
- Resolved “Missing or insufficient permissions” when loading signals by aligning client queries with the new collection group rule.

# 7.0.1 — 2025-12-19

### Fixed
- Fixed AppHeader and AppFooter positioning: Both components now remain fixed at the top and bottom of the screen respectively, staying visible while scrolling. Header changed from `sticky` to `fixed` positioning with proper centering to align with the app container. Added safe area inset support for mobile devices.

# 7.0.0 — 2025-12-19

### Added
- Multi-chat support: Students can now have multiple isolated chat conversations with Coach Pepper using the schema `students/{id}/chats/{chatId}/messages/{messageId}`.
- Chat management UI: Fixed floating bubble-style chat selector header with dropdown, inline editing, and delete functionality.
- AI-generated chat names: Chat names are automatically generated from the first user message using OpenAI, with fallback to "New Chat".
- Markdown formatting: Chat messages now support markdown formatting including bold text (`**text**`) and numbered lists.
- Chat Command Centre: New configuration interface for managing AI chat settings per program, accessible from AI Tools.
- Chat loading states: Coach Pepper-themed loading indicators when fetching chats and processing messages.

### Changed
- Chat creation flow: Chats are now only created when the user sends their first message (not automatically on page load).
- Chat selector UI: Moved edit/delete buttons to individual dropdown rows; replaced with Add button in main bubble.
- Chat display: Current chat is hidden from dropdown list; quotes are stripped from chat names in display.
- Chat loading: Improved backend query handling with fallback to in-memory sorting when Firestore composite index is missing.
- Message input: Enhanced floating bubble styling for consistency with chat selector.
- Chat selector positioning: Added proper spacing between app header and fixed chat selector bubble.

### Fixed
- Resolved chat loading issue where existing chats weren't displaying due to missing Firestore composite index.
- Fixed quote display issue where quotes appeared in untoggled chat selector bubble.
- Improved chat selector dropdown behavior to prevent closing when clicking edit/delete buttons.
- Enhanced chat loading UX to show loading indicator while fetching chats instead of immediately showing empty state.
- Enhanced error handling for chat operations with better user feedback.

# 6.0.4 — 2025-12-16

### Added
- Confetti animation celebration when Coach Pepper identifies a note as perfect (no nudges needed).
- Success message display ("Coach Pepper thinks this is a perfect note!") with graceful auto-save after 2.5 seconds.

### Fixed
- Resolved UX issue where the Coach review page would flash briefly and disappear when no nudges were returned, causing confusion. Now shows a positive success state with confetti animation before gracefully closing.

# 6.0.3 — 2025-12-15

### Added
- Lesson notes can now be edited via Note Expansion, rerouting to the Lesson Notes page with prefilled data, locked student selection, and an edit-mode chip; authors-only edit control.

### Changed
- Student views (timeline and note expansion) no longer show group defaults for lesson notes.
- ClassroomList search now uses simple substring matching instead of fuzzy search.
- Dashboard/prompt tweaks: bottom-placed Save button for Baseball Card config, updated subtitles, and disabled save until changes exist.
- Playground output favors raw LLM content with wrapping; stats card click now navigates reliably.

# 6.0.2 — 2025-12-14

### Changed
- Baseball Card config UI simplified: removed the top model/config summary card, moved the Save action to the page footer, and the prompt card stands alone.
- Playground UX: student selection is now a dropdown, model is read-only, timezone is hidden, and the run summary callout shows the exact student/window days used.
- Playground output shows raw LLM response with wrapping to avoid horizontal scroll; structured JSON remains as a fallback only.
- Backend baseball-card generation now uses a shared `runBaseballCards` helper for both the weekly scheduled job and the single-student preview callable.

# 6.0.1 — 2025-12-14

### Changed
- Classroom admins can now increment classroom `studentCount` during student adds (Firestore rules update), unblocking roster creation without superadmin help.
- Observation badges unified to a single “Observation” tag and clipboard buttons removed across timelines and dialogs; grouped/lesson cards now use neutral styling.
- Lesson Notes auto-prefill classroom/student when launched from context (classroom timeline, student dashboard/timeline) and force individual mode when a student is known; reassign/delete actions align with consistent sizing.
- Timelines display tagged lesson notes inline with their actual titles for text/voice observations.

### Fixed
- Resolved missing icon import crash on student timeline and alignment jitter for stacked action buttons in Note expansion.

# 6.0.0 — 2025-12-12

### Added
- Nightly “Baseball Card” AI summary for each active student (6-week window by default) using Firestore observations + OpenAI, writing to `students/{id}/ai_summaries/baseball_card`.
- Superadmin Baseball Card config under AI Tools with prompt editor, model info strip, editable window size, and seed script `scripts/admin/seed-baseball-card.js`.
- Student Dashboard card for Coach Pepper’s summary with empty/no-notes/error states and feedback deep link; Firestore rules and data docs updated for `ai_summaries`.

### Changed
- Baseball Card config UI aligned with other AI tool editors (read-only model/temperature/max tokens, edit toggle, removed version/reset controls) and navigation/back handling from AI Tools.

# 5.10.1 — 2025-12-09

### Changed
- Grouped classroom note dialog now shows student “View Dashboard” buttons inline on each student card (no accordion dropdown) and keeps delete controls restricted to admin roles.
- Lesson title dropdown and lesson note student lists share a prominent always-visible scrollbar (black thumb, thicker track) with a five-item viewport for easier scrolling.

### Fixed
- Lesson note student checkboxes now toggle when clicking anywhere on the student row, including directly on the checkbox.

# 5.10.0 — 2025-12-09

### Changed
- Student dashboard now uses two actionable cards (Timeline, Statistics) with arrow affordances; timeline card opens the unified student timeline and the app header reads `<StudentName>'s Timeline`.
- Student timeline UX updated to mirror UsersAccess tabs: filter/export controls on the top row, tabs for Observations vs Lesson Notes, and cleaned summary layout.
- Exports simplified with a scope menu (observations / lesson notes / both), preserving filters and admin format selection; timeline export counts now respect the chosen scope.
- Consolidated export utilities into `utils/export.js`, carrying lesson-aware text formatting and preserving note newlines; removed legacy export modules.

### Fixed
- Resolved timeline crash from missing Card import and removed duplicate dividers in the student timeline summary area.

## 5.9.0 — 2025-12-08

### Added
- Firestore-backed lesson note configuration at `config/lessonNote` with per-program lesson titles and dimensions, and a seed script `scripts/admin/seed-lesson-note-config.js` that populates Montessori material titles and default dimension sets.
- Superadmin-only Config area with `ConfigHomePage` and `LessonNoteConfigEditor`, including tabbed program selector, collapsible Dimensions/Titles panels, per-item delete confirmation dialog, and Coach Pepper–style loading and toasts via `useNotify`.

### Changed
- Lesson Notes now load dimensions and toddler/primary lesson title suggestions from `config/lessonNote`, using a Fuse.js-backed MUI Autocomplete for suggestions and a “Custom title” chip when teachers use freeform titles.
- Toddler program dimensions are initialized and validated against the dedicated toddler defaults instead of piggybacking on primary, ensuring correct dimension rows for toddler observations.
- Global Add Note FAB is hidden on all Config screens so configuration flows stay focused and free from note-creation affordances.

## 5.8.0 — 2025-12-07

### Changed
- Replaced program-scoped admins with classroom-scoped `classroomadmin` role using `manageableClassrooms`; removed program-based gating across rules, backend, and UI (lists, timelines, stats, users & access).
- Dropped reliance on `programs` collection for admin scoping and updated role labels/guardrails to block empty classroom scopes.

### Added
- Admin utility script `scripts/admin/convert-user-to-classroom-admin.js` to promote a user and set `manageableClassrooms`.

## 5.7.2 — 2025-12-07

### Fixed
- Grouped classroom notes now drop `groupId` when only one student remains and render as individual notes; single-note and grouped deletions trigger a timeline refresh for up-to-date data.
- Mention dropdown now anchors under the `@` caret, stays compact/touch-scrollable, and caret scrolling keeps the active line within the 25–75% viewport band so the keyboard doesn’t hide it.

## 5.7.1 — 2025-12-07

### Changed
- All loading/buffer states now speak in Coach Pepper’s voice across the app (classrooms, timelines, stats, feedback, lesson notes, aliases, admin tools, etc.) including the main Stats page spinner.

## 5.7.0 — 2025-12-07

### Changed
- Coach Pepper now lives as a dedicated final step after recipients instead of a popup/overlay, inheriting the same header/back/close behavior.
- Coach loading buffer is inline on the final step with progressive “analyzing” messaging instead of a separate overlay.
- Coach nudge UI spacing tightened: compact padding, slimmer chips/inputs, and bottom actions aligned side-by-side.
- Observation detail dialog now uses a pen icon in the title bar for editing and moves the copy-to-clipboard and close controls into a compact top-right cluster.
- Tagged lesson notes display as bordered pill buttons, with a dedicated `Edit` control that opens a shared lesson-tag dialog used across Add Note and the note expansion view.

### Added
- Coach requests cache per note/recipients combo so returning without edits reuses nudges; edits invalidate and rerun automatically.
- Mention picker dropdown highlights the active option in bold for easier keyboard selection.
- Inline mentions in the observation textbox now render in bold to visually confirm tagged students.
- Added a NewFeaturePill callout above the “Write your observation” text input highlighting the new `@` mention shortcut.
- Lesson note tagging now supports linking a single text/voice observation to multiple lesson notes via a reusable `LessonNoteTagDialog` component.
- Tag edit dialog offers ClassroomStudentPicker-style selection cards for lesson notes plus an explicit Save action that applies all changes atomically.
- Backlinks between observations and lesson notes are maintained for all linked lessons, updating `linkedObservations` on add and remove.

### Technical
- `linkedLessonObservationId` is now treated as an array of lesson note IDs (while retaining the same field name), with normalization to support existing single-string documents.
- Centralized tag-selection UI into `LessonNoteTagDialog` so future UX tweaks apply to both Add Note flows and the expansion dialog.

## 5.6.1 — 2025-12-06

### Added
- Text note mentions: type `@` to search students (scoped by role) and drop their full name inline, then auto-select those students on the recipients step with deduping.
- Inline mention UX keeps cursor after the inserted name and preserves existing text, making multi-student tagging a quick shortcut.

## 5.5.0 — 2025-12-02

### Changed
- Scoped classroom admins to their `manageableClassrooms` across ClassroomList, ClassroomTimeline, Users & Access, and Stats; surfaced hard errors when scopes are missing.
- Updated Firestore rules to let classroom admins manage `teacherIds` on classrooms they own and to authorize observation reads by `studentId` or `classroomId`.
- Stats now batches observation reads by student for classroom admins and filters classrooms/teachers/students to allowed programs.
- Recharts containers now guard on mount and enforce minimum sizing to eliminate zero-dimension warnings.
- Notification stack now renders in a portal with fixed positioning below the app header and a raised z-index, ensuring toasts stay visible above dialogs/popups and while scrolled.

### Fixed
- Program admins hitting `permission-denied` on observations and stats due to missing `studentId` authorization in collection-group rules.
- Runtime crash from uninitialized program scope in ClassroomTimeline.
- MUI Grid v2 warnings by replacing deprecated Grid usage in StatsPage.

### Added
- Lesson note tagging for text/voice notes with single-student guard, dialog search, and linked lesson metadata in timelines and detail views.

### Improved
- Tagging UX: checkbox selection, tagged lesson chip with label, search results capped and scrollable, and inline counts of available lesson notes.
- Notifications now remind users to select a student before tagging; tag button stays enabled to surface guidance instead of greying out.
- Observation detail dialog shows linked lesson title as a clickable link with a link icon.

### Technical
- Added forward/backlink persistence between observations and lesson notes plus Firestore rule allowance for updating `linkedObservations`.

## 5.4.1 — 2025-11-22

### Changed
- Grouped lesson notes: Show only group defaults in normal card view and expanded dialog top section (removed individual ratings from main display)
- Grouped lesson notes: Converted student list in expanded dialog to expandable accordions showing custom ratings per student
- Grouped lesson notes: Added "View Dashboard" button in each student dropdown for navigation to individual student timelines
- Grouped lesson notes: Added "Custom" badge indicator on students with ratings that differ from group defaults

### Removed
- Removed all 'present' attendance status tags/chips from lesson note displays across ClassroomTimeline, NoteExpansionDialog, and StudentTimeline components

### Added
- Group defaults display in both normal card view and expanded dialog view for grouped lesson notes
- Expandable student dropdowns in GroupedNoteDialog showing individual custom ratings with visual distinction
- Visual indicator (dashed border) for group default chips to distinguish from individual ratings
- "Uses group defaults" message when student ratings match group defaults

## 5.4.0 — 2025-11-21

### Changed
- Lesson Notes: Moved classroom dropdown to second field position (right after individual-group toggle), shifting lesson title and subsequent fields down one position for better workflow.
- Lesson Notes: Group comment field now only appears in group mode (hidden in individual mode) since individual notes don't need shared comments.
- Lesson Notes: Individual tweaks section shows group defaults as pre-selected in group mode (so teachers can see baseline ratings and override as needed), but shows no pre-selected defaults in individual mode.

### Fixed
- User migration: Implemented server-side user migration via Cloud Function to handle pending users and existing users with mismatched UIDs
- Firebase Admin SDK: Fixed `exists` property usage (changed from method call `exists()` to property access `exists`)
- Access Denied issue: Users with Firestore documents but no Firebase Auth accounts can now sign in successfully
- Migration flow: Client-side migration replaced with Cloud Function call to avoid Firestore rules permission issues

### Added
- `migratePendingUser` Cloud Function: Handles automatic migration of user documents when users sign in with Google
- Migration support for both pending users (`pending_xxx`) and existing users with mismatched UIDs
- Comprehensive error handling and logging for migration process
- Deploy scripts to package.json (`deploy`, `deploy:functions`, `deploy:hosting`, `deploy:firestore`)

### Improved
- Lesson Notes: Ensured consistent UI styling for rating buttons between group defaults and individual tweaks sections for visual consistency.
- User onboarding: Seamless migration flow that automatically handles users created before Auth account exists
- Error handling: Better error messages and logging for debugging migration issues

## 5.3.0 — 2025-11-18

### Added
- Per-user student aliases with full CRUD UI, navigation entry, and classroom-scoped expansion in lesson notes.

### Changed
- Lesson Notes flow now stacks sections with gated progression: auto classroom pick for single-class teachers, search disabled until classroom is chosen, group mode requires explicit “Done selecting students,” and save is gated until tweaks are reachable.
- Group/individual toggle defaults by program mix and never auto-flips after user input; individual mode enforces single-student selection and disables aliases.
- Consolidated rating UI (Yes/Partially/No/N/A) into a single compact row reused across group defaults and per-student tweaks, with consistent button sizing for small screens.
- Lesson notes page renders full-width, removes redundant back controls, and keeps individual tweaks scrollable for large rosters.

### Fixed
- Prevents multi-class alias leakage in individual mode and keeps alias checkboxes disabled when single-student selection is required.
- Rating buttons in individual tweaks section now display on a single row with compact sizing to match group defaults layout.
- Removed redundant "Back to setup" button from group defaults section for cleaner UI.

### Changed
- Lesson note button in Add Note modal is now disabled and greyed out for non-superadmin users, with visual indicators (reduced opacity, disabled cursor, greyed icon/text).
- Removed grey Paper container wrapper and helper text around student search bar in lesson notes for cleaner, more streamlined interface.

## 5.2.0 — 2025-11-15

### Improved
- Stats dashboard now caches Firestore-derived aggregates in `localStorage` for 15 minutes per user/filter combo, dramatically reducing repeat load times.
- Cached payloads hydrate classrooms/teachers/students/branches instantly on revisit while still refetching automatically after the TTL expires.
- Added defensive cache read/write helpers so stale entries are ignored and errors never block the page.

## 5.1.0 — 2025-01-15

### Changed
- Lesson Notes navigation: removed back button from header, moved "Discard Progress" button to bottom navigation area
- Renamed "Discard Progress" to "Discard All Progress" for clarity
- Back button now appears conditionally: shown on steps 2-4, hidden on step 1 (Lesson Context)
- Removed "Add Lesson Note" header component with MenuBook icon from all wizard steps
- Added visible scrollable container (Paper with border) around student list on step 2 to make scrolling area obvious
- Auto-scroll to top when navigating between steps (Next/Back buttons)

### Improved
- Better navigation UX: all navigation controls consolidated at bottom of wizard
- Clearer visual hierarchy: removed redundant headers, improved step focus
- Enhanced scrollability: student list now has clear visual boundary indicating scrollable area
- Smoother step transitions: automatic scroll-to-top ensures users start at top of each new step

## 5.0.0 — 2025-11-14

### Added
- Lesson Notes PRD and implementation plan docs describing the structured capture flow.
- Full Lesson Note wizard in `AddNoteModal` with classroom-scoped roster selection, present/absent tracking, dimension defaults/exceptions, and batch Firestore writes (one note per student).
- `lessonNoteConstraints` module housing dimension/rating constants plus helper utilities shared by UI surfaces.
- Lesson note rendering across student/classroom timelines and NoteExpansionDialog, including chips for dimension results, attendance badges, and per-student comments.
- Student Dashboard now surfaces two actionable cards (“Text & Voice Notes” and “Lesson Notes”) that deep link into filtered timelines.

### Changed
- Timeline filters honour the entry point: note-type filters are locked (and buttons greyed out) when navigating from either dashboard card, with a third Lesson Notes button added to the filter panel.
- Student timeline export chip counters and empty states now reflect the active note-type filter, keeping counts consistent with filtered views.
- Lesson note selection UI improvements: roster cards show attendance chips even when deselected, cards toggle on full-row tap, and summary shows `Present: X/Y`.

## 4.8.1 — 2025-11-13

### Added
- Greyed-out 'Lesson Note' option in Add Note modal with MenuBook icon (coming soon feature)
- Migration script `scripts/admin/remove-appversion-from-feedback.js` to remove `appVersion` field from existing feedback documents

### Changed
- Removed "What type of note do you want to add?" heading from Add Note modal for cleaner UI
- Removed `appVersion` field from feedback creation in FeedbackPage component

### Technical
- Migration script successfully removed `appVersion` from 24 existing feedback documents
- Script supports `--dry-run` flag for safe preview before execution

## 4.8.0 — 2025-11-13

### Added
- Student placements history: `students/{id}/placements/{YYYY-MM-DD__classroomId}` with end-date inclusive semantics (IST) and optional note.
- Firestore security rules for placements: teachers/admins can read; admins only can write with field validation.
- Backfill script `scripts/admin/backfill-placements.js` to create initial active placements from `students.classroomId`.
- Graduate Students admin page: multi-select by classroom, search bar, Selected/Unselected filter, sticky action bar, backdrop progress message, and success toasts via `useNotify`.

### Changed
- Navigation: moved “Graduate Students” entry under Users & Access; added screen header title and hid Add Note FAB on this screen.
- Documentation: updated DATA_STRUCTURE.md with Placements section and invariants.

## 4.7.0 — 2025-01-30

### Added
- Branch selector dropdown in Classroom tab (admin only) for filtering classroom statistics by branch
- Firestore security rules for branches collection (read access for signed-in users, write access for admins)
- Enhanced tooltip in histogram showing percentage and target numbers (e.g., "30.6% of target (30/98)")

### Changed
- Classroom tab now filters classrooms by branch using branches collection's classrooms array
- Histogram displays only "This Week" bars (removed Target bars for cleaner visualization)
- Improved dropdown typography and styling for better UX and readability
- Branch filtering uses branch document's classrooms array instead of classroom.branchId field

### Removed
- Individual classroom detail cards from Classroom tab (kept only histogram for cleaner interface)
- Target column from histogram chart

### Improved
- Branch selector visibility and accessibility for admin users
- Histogram tooltip provides more context with both percentage and actual numbers
- Cleaner Classroom tab interface focused on histogram visualization
- Better branch filtering logic that handles both full paths and IDs from branch documents

### Technical
- Added branches collection fetching in StatsPage useEffect hook
- Implemented branch-based filtering in ClassroomComparisonChart component
- Updated Firestore rules to allow authenticated users to read branches collection
- Enhanced dropdown styling with proper font sizes, weights, and hover states

### Result
- Admins can now filter classroom statistics by branch, showing focused histograms per branch
- Teachers see all their accessible classrooms without branch filtering (maintains existing behavior)
- Cleaner, more focused Classroom tab with histogram-only view
- Better data visualization with improved tooltip information

## 4.6.1 — 2025-01-30

### Added
- Delete user functionality for teachers, admins, and students in Users & Access page
- Action dialog that appears when clicking on any user row with two action buttons:
  - "Manage Classroom Access" (enabled for teachers only, opens existing manage dialog)
  - "Delete User" (available for all user types)
- Delete confirmation dialog with:
  - Warning message about irreversible action
  - User details display (name, email)
  - Context-specific warnings (classroom removal, student count impact)
  - Protection to prevent deleting current logged-in user
- Proper cleanup logic for user deletion:
  - Teachers: Remove from all assigned classrooms' teacherIds arrays
  - Students: Decrement classroom studentCount atomically using `increment(-1)`
  - Admins: Delete user document from Firestore

### Changed
- Removed three-dot menu buttons from user list items
- Replaced menu-based approach with cleaner click-to-action flow
- User rows now open action dialog on click instead of directly opening manage/info dialogs

### Improved
- Better user experience with immediate access to both manage and delete operations
- Optimistic local state updates after successful deletions
- Comprehensive error handling and success notifications
- Cleaner UI without menu clutter

## 4.6.0 — 2025-01-30

Coach nudge UI/UX improvements and validation enhancements.

### Added
- Add `---` divider separator in enhanced notes to allow parsing original vs enhanced content when retrieving from Firebase
- Redesigned evidence input with intuitive `__/__` format (correct/attempts) with clearer visual layout
- Auto-clear validation errors when evidence fields become valid during input
- Disable "Apply and Save" button until at least one enhancement is selected
- Visual disabled state for all coach configuration options when coach is disabled
- Per‑program Coach configuration docs at `ai_prompts/coach_{program}` with `coach_feature_enable` gate (`toddler | primary | elementary | adolescent`)
- AICoachEditor: Program selector and per‑program enable toggle; Test Run now sends `programId`
- Admin scripts: `scripts/admin/seed-coach-programs.js` (seed per‑program docs) and `scripts/admin/sync-coach-programs.js` (copy/enable across programs); npm tasks added

### Changed
- Evidence display combined into single line format: "Evidence: X/Y correct - quote" (replaces duplicate separate lines)
- Validation errors now only show after save button click, not during typing
- Evidence input fields: correct field before `/`, attempts field after `/` for intuitive ratio display
- Program dropdown remains enabled even when coach is disabled for program switching
- Cloud Function `aiCoachReview` now requires `programId/programIds` and routes to `ai_prompts/coach_{program}`; legacy `ai_prompts/coach` fallback removed
- AICoachEditor recomposes and saves `finalPrompt` + `introBlock` from enabled nudges and `nudgeBlocks` on Save, so Firestore prompt reflects toggles

### Fixed
- Evidence validation prevents saving when only one field is filled or correct exceeds attempts
- Validation state properly tracks save attempts and clears when fields become valid
- AddNote flow: preserve `programId` across Coach run (stop clearing ref in `resetCoach()`), preventing responses with `maxReturnNudges: 0`

### Improved
- Better user feedback with disabled states and validation timing
- More intuitive evidence input that clearly shows the ratio format
- Cleaner enhanced note display without duplicate evidence lines
- Enhanced note structure allows easy parsing to separate original from enhanced content
- Client gating for Add Note (text and voice):
  - If multiple programs selected or program disabled → skip analyzing overlay and save directly
  - Only call Coach when exactly one enabled program; request includes `programId`
- Editor/test: clearer message when program is disabled (no misleading “observation looks complete”)

## 4.5.0 — 2025-10-29

Coach flow revamp and constants unification.

- Unify Coach model constants across FE/BE via root shim `scripts/config/coachConstants.js` re-exporting `functions/config/coachConstants.js`.
- Vite dev config allows importing from repo root/functions to support shared constants.
- Fix callable payload: send `noteText` to `aiCoachReview` (was `note_text`).
- Run Coach on Save for both Text and Voice notes (post-transcription) with timeout-safe fallback to save as-is.
- Align observation schema to DATA_STRUCTURE.md: `durationSec` for voice, drop `tags`, `editCount`, `sttAlternatives`, `sttProvider`; keep `sttConfidence`, `createdBy*`.
- UI sorts nudges by PRD priority; microcopy from static UI constants; hide reason/confidence in teacher flow.
- Persist Coach telemetry: `status`, `reason`, `nudgesShown` (even on skip), and `selections` when applied.
- Remove client-only MAX_NUDGES clamp; UI defensively caps to backend `maxReturnNudges` when provided.


All notable changes to the Montessori Observation Hub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.4.0] - 2025-10-29

### Added
- AI Coach Review Cloud Function (`aiCoachReview`) with OpenAI integration reading `finalPrompt` from Firestore and returning minimal `{ id, reason, confidence }` nudge objects.
- Admin test run in `AICoachEditor` with formatted cards and a Raw JSON toggle.

### Changed
- Consolidated Coach constants; backend imports from `functions/config/coachConstants.js` and frontend from `scripts/config/coachConstants.js`.
- Push script now includes allowedIds in the template for clarity and consistency with the Python playground.
- Removed verbose debugging logs added during investigation from both frontend editor and `aiCoachReview` implementation.

### Fixed
- ESM import error during deploy by using explicit extension in Cloud Functions import path.

---

## [4.3.4] - 2025-10-29

### Added
- Complete rebuild of AICoachEditor component with full Firestore integration
- Manual save workflow: Save and Cancel buttons (replaced auto-save)
- Save confirmation notifications via useNotify hook (success/error messages)
- Maximum Return Nudges input field with validation (capped at total number of nudges)
- Collapsible sections for introBlock, nudgeBlocks, and finalPrompt display
- Visual nudge indicators: green filled chips for enabled, red outlined with strikethrough for disabled

### Changed
- AICoachEditor now loads coach prompt configuration from Firestore (`ai_prompts/coach`) on mount
- Save button only enables when there are unsaved changes
- Cancel button (red) resets to original saved state
- Enabled nudge blocks count in header only updates after save (not on toggle)
- Updated to MUI v7 syntax: replaced deprecated `inputProps` with `slotProps` for TextField

### Improved
- User experience: manual save gives users control over when changes are persisted
- Visual feedback: clear distinction between enabled/disabled nudges with color and strikethrough
- Change tracking: buttons properly reflect unsaved state before committing to Firestore

## [4.3.3] - 2025-10-29

### Added
- Admin script `scripts/pushCoachPrompt.js` to programmatically push/update coach prompt configuration to Firestore
- Script replicates `coach_playground.py` `get_system_prompt()` logic exactly for consistency across implementations
- Dynamically composes `finalPrompt` from enabled nudges and nudgeBlocks to match Python playground behavior

### Scripts
- `pushCoachPrompt.js`: Syncs coach configuration to `ai_prompts/coach` document with proper prompt structure
- Handles all Firestore fields: enabledNudges, disabledNudges, nudgeBlocks, introBlock, finalPrompt, etc.
- Uses Firebase Admin SDK with service account authentication
- Supports both creating new documents and updating existing ones

## [4.3.2] - 2025-01-21

### Changed
- AI Coach Editor: replaced verbose prompt preview with collapsible accordion UI for cleaner information architecture
- AI Coach Editor: moved save button to top of page, right under nudge toggles for better UX
- AI Coach Editor: nudges state now pulls from Firebase as source of truth (initializes as empty array)
- Landing Page: removed "Bulk Upload Roster" and "Search & Filter Notes" placeholder cards

### Improved
- AI Coach Editor: formatted test run results to display detected nudges in user-friendly cards
  - Shows nudge type with green chip
  - Displays confidence percentage badge
  - Shows nudge reason in clean card layout
  - Includes collapsible raw JSON view for debugging
- AI Coach Editor: "Final Composed Prompt" section now expanded by default with indigo theme
- AI Coach Editor: shows red error alert when all nudges are disabled (instead of blue info)
- AI Coach Editor: hides Test Run section when all nudges are disabled

### Removed
- AI Coach Editor: removed "change note" optional field from save dialog
- Landing Page: removed unused feature placeholder cards

## [4.3.1] - 2025-10-21

### Changed
- Coach (Cloud Function): reads `finalPrompt` and `effectiveEnabled` from Firestore on every call (removed TTL/caching to avoid stale prompts). Falls back to built‑in default if `finalPrompt` is missing; skips LLM if `finalPrompt` is empty.
- Coach (Cloud Function): filters LLM nudges to enabled ids only; added detailed logs of system prompt, user message, and request body for debugging.

### UI/Editor
- Coach Editor now composes and saves `finalPrompt` + `effectiveEnabled`; “Final Prompt” preview reflects the stored value.

### Scripts
- `seed-coach-prompt.js` updated to write `finalPrompt` and `effectiveEnabled`.

## [4.3.0] - 2025-10-21

### Changed
- Coach (Cloud Function): `aiCoachReview` uses a minimal GPT schema `{ id, reason, confidence }`, returns `schemaVersion: 2`, and composes the system prompt from Firestore (`ai_prompts/coach`) using modular fields (`introLines`, `howToLines`, `nudgeBlocks`, `examples`, `priorityOrder`).
- Coach (Cloud Function): skips the LLM call entirely when no effective enabled nudges are configured (fast‑path save).
- Removed legacy `coachSystemPrompt` helper; prompt is now fully Firestore‑driven with a 5‑minute TTL cache and hardcoded fallback.
- Client: coach request/response streamlined — minimal ingress `{ note_text }`; enrichment (chips, microcopy) happens client‑side; context derivation removed from Add Note flow.

### UI/UX
- Coach Editor (admin): preview restructured into sections — Intro, How To, Nudge Blocks (all shown; disabled greyed), and Example (expanded). Displays the Final composed prompt exactly as sent to GPT.
- Coach Editor allows zero enabled nudges; when none enabled, the preview indicates Coach is disabled and test run is disabled.
- Editor now saves `disabledNudges` explicitly (complement of `enabledNudges`).

### Scripts
- Added `scripts/admin/seed-coach-prompt.js` to seed/update the modular `ai_prompts/coach` document.
- NPM tasks: `seed:coach`, `seed:coach:push`.

### Dev
- Updated client tests/schema for the minimal nudge shape; parser sanitizes and enriches locally.

## [4.2.1] - 2025-10-20

### Fixed
- Coach Editor: Firestore save error caused by `serverTimestamp()` inside arrays. Writes now keep `updatedAt` at the top level and avoid array transforms.

### Changed
- Coach Editor: removed version history UI and associated writes for a simpler `ai_prompts/coach` document.
- Added console error logging (load/save/test) to surface detailed failure reasons in DevTools.

### Scripts
- Added `scripts/admin/remove-coach-versions.js` to delete the legacy `versions` field from `ai_prompts/coach`.

## [4.1.0] - 2025-10-20

### UI/UX
- Replaced tabbed “AI Capabilities” screen with card-based “AI Home”.
- Added separate editor screens: “Text Cleanup Editor” and “Voice Transcriber Editor”.
- Navigation mirrors “Users & Access”: AI Home → Editors with back to AI Home; titles updated accordingly.
- Landing page card renamed to “AI Home” with updated description.

### Backend
- Cloud Functions now read Text Cleanup and Voice Transcriber prompts from Firestore (`ai_prompts/*`) with a 5‑minute TTL cache.
- Added `forceRefresh` option to `aiTextCleanup`, `aiWhisperTranscribe`, and `aiWhisperTranslate` to bypass cache after UI edits.
- Client Text Cleanup test run calls now use `forceRefresh` for immediate prompt changes.

### Security
- Admin-only access preserved for AI Home and both editors.

## [4.2.0] - 2025-10-20

### UI/UX
- AI Home: new “Coach” card and admin-only “Coach Editor”.
- Coach Editor lets admins toggle which nudges are enabled (duration, modality, independence, evidence, subjective), provides versioned history with revert, a rendered system prompt preview, and a test run panel.

### Backend
- Added Firestore-backed Coach config at `ai_prompts/coach` with TTL caching and versioning; disabled nudges are fully omitted from the system prompt (allowed ids, chips, microcopy list).
- `aiCoachReview` now reads Coach config, supports `forceRefresh`, and returns `promptVersion` tied to the config version.

### Security
- Admin-only access for Coach Editor; no analytics logging for test runs.

## [4.1.0] - 2025-10-20

### Coach (Server Intelligence + Robust UX)
- Added callable `aiCoachReview` and integrated server-driven nudges for Coach.
- Dialog opens only after nudges are available (no flicker); removed modal auto‑skip scaffolding.
- New analyzing overlay during fetch with progressive messages (0s/5s/10s) and 10s fail‑closed path that saves as‑is.
- Appends and structured fields are applied only on explicit Apply; no metadata-based auto‑append.

### Security/Infra
- All AI calls run on Cloud Functions; no browser‑side OpenAI usage. OpenAI key pulled from `functions.config().openai.key`.
- Maintains short TTL caches on functions to reduce Firestore reads for prompts.

### Developer
- Functions code uses `firebase-functions/v1` compat import for `region().https.onCall()` with ESM.
- Whisper STT and Text Cleanup already run via callables; this release consolidates Coach flow and stabilizes UX.

## [3.11.0] - 2025-10-20

### Security/Infra
- Moved all OpenAI calls off the browser to Cloud Functions.
  - New callables: `aiTextCleanup`, `aiWhisperTranscribe`, `aiWhisperTranslate`.
  - Server reads prompts from `ai_prompts/*` with a 5‑minute TTL cache.
  - OpenAI key pulled from `functions.config().openai.key` (no key in client).
- Removed all local client fallbacks for cleanup to ensure transparency when AI is unavailable.

### UI/UX
- Classroom List: grouped by `programs/*` with subtle section dividers; alphabetical program ordering.
- Fixed React hook‑order error in `ClassroomList.jsx` by rendering inline loading state (no early return before hooks).

### Data/Rules/Docs
- `DATA_STRUCTURE.md`: added `programs` collection schema and per‑document field breakdown for `ai_prompts/text_summarizer` and `ai_prompts/voice_transcriber`.
- Firestore rules: allow signed‑in reads for `programs/*`; writes admin‑only.

### Developer
- Functions import switched to `firebase-functions/v1` to use `region().https.onCall()` with ESM.

### Ops
- To configure: `firebase functions:config:set openai.key="<YOUR_KEY>"` and deploy functions.

## [3.10.1] - 2025-10-20

### Changed
- classroomList.jsx now segregates classrooms based on programs pulled from firestore

### Added
- read access for programs/ to all users and write access to admins

## [3.10.0] - 2025-10-20

### Added
- Migration scripts
  - `scripts/admin/rename-classroom.js`: safely rename a classroom document (adolescent → allstars), update all affected students and observations, and archive the old document.
  - `scripts/admin/migrate-program-field.js`: replace legacy `ageGroup` with `programId` and append canonical age ranges to `description`.
  - `scripts/admin/check-program-field.js`: verify migration health (missing programId, lingering ageGroup, and optional student-count verification).
  - `scripts/admin/recount-student-counts.js`: reconcile `classrooms.studentCount` with actual student documents.
  - NPM tasks wired: `migrate:rename-classroom`, `migrate:program`, `check:program`, `fix:studentCounts`.

### Changed
- Data model: `ageGroup` → `programId` with canonical values `toddler | primary | elementary | adolescent`; updated DATA_STRUCTURE.md with migration notes and age ranges.
- Frontend now hides archived classrooms everywhere (lists, filters, pickers) and admin queries fetch only `status == 'active'` classrooms.
- Seeding utility `scripts/admin/upsert-students.js` now writes `programId` and normalized `teacherIds`.

### Fixed
- UsersAccessPage: creating a student now atomically increments the classroom's `studentCount` within the same transaction and updates the UI optimistically.
- Repair utility (`fix:studentCounts`) to correct existing count mismatches.

### Ops
- Documented migration order and verification steps; tools are idempotent and safe to dry-run before applying.

## [3.9.0] - 2025-10-17

### Added
- Admin-only "AI Capabilities" page to manage prompts used by AI features (Text Cleanup and Voice Transcriber).
- Read-only formatted view with Edit toggle; Change note on save; version history (keeps last 5) with one-click Revert.
- Test Run panel for Text Cleanup; tone selector positioned beneath the User Prompt; prominent Test Run heading.
- Save/Cancel actions moved to the bottom of the editor for better UX on mobile scroll.

### Changed
- Text Cleanup and Whisper STT now fetch prompts from Firestore (`ai_prompts`) with a 5-minute TTL cache and safe fallbacks to baked-in defaults.
- Landing page: new admin card "AI Capabilities"; new `aiPrompts` route gated to admins.

### Security
- Firestore rules for `ai_prompts`: reads allowed for authenticated users; writes restricted to admins.

### Ops
- Seed script `scripts/seed_ai_prompts.mjs` to populate initial prompt documents (`text_summarizer`, `voice_transcriber`).

## [3.8.2] - 2025-10-10

### Added
- Stats → Teachers: search bar with fuzzy matching and alphabetical ordering by first name.
- Stats → Teachers: Manage Users–style filters — status chips (All/Active/Inactive), "No Classrooms" toggle, and a Classrooms selector dialog.

### Changed

## [3.8.1] - 2025-10-08
### Added
- Manage Users → Teachers: quick filters for status (All / Active / Inactive) and a “No Classrooms” filter.

### Changed
- Teachers list redesign: tap-to-manage list items (avatar + chevron) replace per-row Manage buttons.
- Classroom chips capped to 3 with "+N more" overflow; “No classrooms” shown when empty.
- “Add Teacher” is a full-width primary button beneath search/filters.

### Fixed
- Firestore rules now clearly allow admins to query `users`; removed ambiguous collection-level match, resolving Missing/Insufficient permissions when loading teachers.

### Technical
- Lazy-load teachers only when opening Manage → Teachers and suppress errors on the home/cards view.

## [3.8.0] - 2025-10-08

### Added
- Users & Access page with card-based IA: “Add Users” and “Manage Users”.
- Manage Users → Teachers tab: search, view classroom chips, and edit access via batch updates (`arrayUnion`/`arrayRemove`).

### Changed
- Replaced legacy Add User screen with the new Users & Access flow; updated App title and landing card label accordingly.
- Improved Teachers list UI: moved “Add Teacher” button below the search field for clearer layout.
- Lazy-load teachers only when opening Manage → Teachers to avoid noisy errors on the home/cards view.

### Removed
- Deleted obsolete `montessori-os/src/components/AddUserPage.jsx`.

### Fixed
- Eliminated spurious “Failed to fetch teachers” alert on the Users & Access home by deferring the query until needed.

## [3.7.2] - 2025-10-07

### Fixed
- Activity Trend number now reflects the selected period (1D/1W/1M/3M/6M/1Y) instead of always showing last 7 days.

### Changed
- Replaced the large 2x2 navigation cards with a compact Tabs header (Overview, Classrooms, Teachers, Students).
- Swapped the period toggle buttons for a minimal dropdown placed at the top‑right of the Activity Trend card.

### Removed
- Performance Targets header box removed from the Stats page.

## [3.7.1] - 2025-10-02

### Removed
- Language picker and language filter across the app.

### Changed
- Voice labels simplified to “Voice Note” (removed language-specific labels).
- Note details and Stats no longer reference spoken language.

### Technical
- Purged `filters.languages` and related logic; removed `languageName` helpers.
- Retained STT `languageCode` hints internally only (no UI exposure).

## [3.7.0] - 2025-10-02

### Added
- Confirm-on-exit flow for Add Note with dirty checks: prompts on backdrop click, ESC, close (X), and Back actions. Adds browser leave-site warning when there is progress.

### Changed
- Voice Recorder integration: when the exit prompt appears during recording, auto‑pause the recording and show an inline paused notice in the recorder panel only (no message in the confirm dialog). Discard cancels recording without creating a blob/transcription.

### Technical
- Dirty rules: Text (any character typed), Voice (recording started, audio blob/transcript, or edit mode), Recipients (always considered in progress).
- Wiring between `AddNoteModal` and `VoiceRecorder` via `onDirtyChange` and `exposeControls`; adds a discard path that skips transcription.

## [3.6.0] - 2025-10-02

### Added
- Voice Recorder: Pause and Resume controls during recording using the MediaRecorder API (with capability checks). The timer now pauses/resumes alongside recording so the 5‑minute auto‑stop applies to active recording time only.

### Changed
- Voice Recorder: recording action label shortened from "Stop Recording" to "Stop" for simpler, media‑style controls.
- When paused, the recording indicator turns grey and the 15‑second pre‑limit warning is hidden until recording resumes.

### Notes
- No schema or API changes. Transcription flow and MIME type selection remain unchanged.

## [3.5.5] - 2025-09-29

### Changed
- Stop writing legacy flags on new observations: no longer persist `isDraft`, `isPrivate`, or `isStarred` on note creation. Aligns with admin cleanup to keep schemas consistent.
- “View Note” actions in notifications now navigate to the student’s Timeline (all notes), not the Dashboard.
- Titles clarified: Student Dashboard header shows "<Full Name>'s Dashboard"; Timeline header shows "<Full Name> Timeline".

### Fixed
- Admin seeding script no longer writes legacy flags to observations.

## [3.5.4] - 2025-09-29

### Fixed
- Note deletion now removes the actual document by resolving its true parent path from collection group snapshots.
- Note reassignment moves the document to the new student's subcollection and updates `studentId`/`classroomId`, then deletes the source.

### Changed
- “View Student Timeline” from note dialog opens the student’s Notes page directly.
- “View Note” deep-link loads full student profile and sets the header to “<FirstName>’s Dashboard” for clarity.
- Recipients step shows “Selected Students (N): name, name…” above the search field; removed the count chip and the bottom chip list.

### Added
- Reassign success notification includes the target student’s name and shows for 6s; “View Note” action jumps to that student’s Notes.
- Undoing delete shows a brief confirmation banner “Undo Note Deletion Successful” (2s).

## [3.5.3] - 2025-09-29

### Added
- “View Note” action on success notifications for note creation and reassignment; deep‑links to the student’s Notes via a global `navigateToStudentNotes` event handled in `App.jsx`.

### Changed
- Reassign flow: grey‑out and disable the current owner in the student picker with an explanatory note; confirmation dialog now shows the target student’s name (not an ID).

### Fixed
- Dialog heading semantics: avoid nested headings by rendering `DialogTitle` as a `div` and moving the `h2` to inner `Typography` (resolves hydration warnings).

## [3.5.2] - 2025-09-28

### Added
- new pill feature shown for voice note (new language: malayalam)
- stats page pie chart now shows percentage of notes within corresponding pie of the plot

## [3.5.1] - 2025-09-24

### Added
- Admin scripts: unified CLI for creating Admin/Teacher/Student in `scripts/admin/create-user.js` with top-level role selection.
- Safety: strict YES confirmation step for all user types, including standalone `add-student.js`.

### Changed
- Add User page UI polish:
  - Removed inner white tile/header and duplicate back button (app header controls navigation).
  - Replaced role chips with a three-tab selector (icons + sliding underline) matching the Notes/Students style.
- Firebase Admin init is now guarded to avoid double initialization across scripts.

### Fixed
- Resolved missing module error by ensuring `scripts/admin/add-student.js` is present and exported for reuse.

---

## [3.5.0] - 2025-09-23

### Added
- Unified Add User page (admin‑only) to create Admin, Teacher, or Student from one screen.
- Cloud Functions: `createAuthUserAndProfile`, `updateUserProfileIfExists` for Auth + Firestore user management (admin‑only, no role changes).
- Student creation: optional DOB; optional guardian info (name/relationship/phone as all‑or‑none); duplicate warning by name + classroom.
- Student IDs follow `YYYY-XXX-NNN` (classroom slug code), index resets per year; transaction write with simple retry.

### Changed
- Landing card renamed to "Add User" and opens the unified page.
- Success UX: removed green success banner; student toast simplified to “Student <name> has been added to the roster!”.

## [3.4.2] - 2025-09-14

### Changed
- Add Note: top-left back arrow added to both Text and Voice input steps; aligned with the title line to save vertical space.
- Recipients (Text note): compact mobile layout — removed "Next: Select Recipients" divider and the "Select classroom(s) and student(s)" heading.
- Search: removed "Quick Search" heading; the pill now shows a single grey inline label "Quick search for student or classroom".
- Selected count chip made smaller and right-aligned to reduce clutter on phones.

### Technical
- `AddNoteModal.jsx`: inline back button positioning for Text step; plumb `onBack` to `VoiceRecorder`.
- `VoiceRecorder.jsx`: supports optional `onBack`; renders back arrow at top-left of the recorder card.
- `ClassroomStudentPicker.jsx`: removed extra dividers/headings; converted search helper text to an inline placeholder overlay.

## [3.4.1] - 2025-09-13

### Added
- Student Timeline: summary line above notes showing "X notes overall | Y notes in last 7 days".
- Student Timeline: time dividers matching classroom (Today, Last 7 Days, Beyond 7 Days).

### Changed
- Classroom Timeline: show only 10 most recent notes by default; add "Show 10 More" pagination (+10 each click).
- Divider label: rename "Beyond" to "Beyond 7 Days" in both Classroom and Student timelines for clarity.

### Technical
- Time grouping uses `observedAt` with `timestamp` fallback; classroom pagination happens before grouping to keep sections consistent.

## [3.4.0] - 2025-09-12

### Added
- Global banner notification system: slides in from the right under the header, constrained to app container, respects safe areas. Stacks up to 4 banners (FIFO), 6s timer, swipe/X/ESC dismiss, animated left→right tint countdown, and MUI variant colors with icons.
- `useNotify` hook and helpers: `notify(...)`, `notify.success/error/warning/info(...)` with `duration`, `id` (dedupe/update), `onFinalize` (fires on timeout/dismiss), `onUndo`.
- Undo action: outlined button with icon for reversible, destructive actions.

### Integrated
- Notes: create/edit/delete (delete supports Undo; deduped by id).
- Notes: reassign (success/error banners).
- Export: success message with counts/filename; empty-state and error banners.
- Voice Recorder: mic permission denied, no device, 5‑minute auto‑stop, transcription failures.
- Admin: user created successfully and surfaced Cloud Function errors.
- Copy to clipboard: lightweight 2s success banner.

### Changed
- Countdown never pauses on hover/touch/focus; banners slide out on timeout for a smoother exit.
- Switched countdown fill to CSS keyframe `scaleX` for buttery animation.

### Fixed
- Duplicate “Note deleted successfully” banners when delete was triggered from two places — resolved via stable notification `id` (`delete-<noteId>`).

### Accessibility
- Uses `role="status"`/`aria-live="polite"` (errors use `alert`/`assertive`); all actions are keyboard focusable.

### Technical
- New files: `src/notifications/{NotificationContext.jsx, NotificationStack.jsx, NotificationBanner.jsx, useNotify.js, useSwipeDismiss.js}`.
- Provider integrated in `App.jsx`; notifications appear under the sticky header across screens.

## [3.3.5] - 2025-09-18

### Added
- Admin landing card for "Review Classroom Notes" with multi-class export dialog.

### Changed
- Classroom notes export now groups observations per classroom in both JSON and TXT outputs.
- Shared export helper supports grouped payloads and richer text formatting.

### Fixed
- Export dialog now lets admins clear date filters and shows clearer "All dates" messaging.

## [3.3.4] - 2025-09-16

### Added
- Top-level `VERSION` file to track app version alongside package.json.

### Changed
- `scripts/version.js` now updates `montessori-os/package.json`, `VersionBadge.jsx`, and the root `VERSION` file in one step.

### Notes
- No functional UI changes; this release streamlines version management.

## [3.3.3] - 2025-09-15

### Removed
- VoiceRecorder "Spoken language" picker and validation.
- Language labels on note chips and in note detail view.
- Voice Note Language Distribution chart from Stats page.

### Changed
- Stop persisting `spokenLanguage`/`languageCode` on new observations.
- Export: add author line in TXT output; export modal includes optional start/end dates and counts reflect the range.

### Added
- `scripts/remove_spoken_language.js` with npm tasks:
  - `cleanup:spokenLanguage`
  - `cleanup:spokenLanguage:all`

### Technical
- Ran cleanup removing `spokenLanguage` and `languageCode` from 580 observations across 245 students.

## [3.3.2] - 2025-09-14

### Added
- Observation schema: new `spokenLanguage` field (voice: selected; text: defaults to `en`).
- VoiceRecorder: required "Spoken language" selector shown under transcript; blocks Next until chosen.
- Timelines: language-aware chip labels (e.g., "English Voice Note").
- Note detail dialog: shows "Duration: N seconds • <Language>" for voice notes.
- Filters: language filter in FilterPanel + `useObservationFilters` support.
- Stats: Voice Note Language Distribution pie chart under Note Distribution.
- Admin: backfill script to set missing `spokenLanguage` to `en`.

### Changed
- Replaced generic "Voice Note" badge with language-specific labels on cards.
- Simplified language UI; removed auto-detect chip in header.

### Technical
- Added `scripts/admin/backfill-spoken-language.js` (batch update via collectionGroup).
- Normalized Telugu code (`te`) and language name mapping across components.
- Updated `DATA_STRUCTURE.md` with `spokenLanguage`.

## [3.3.1] - 2025-09-12

### Added
- Reusable UI: `NewFeaturePill` + `FeatureTag` wrapper for portable “New Feature” badges.
- Feature flag registry `FEATURE_TAGS` with `isFeatureTagEnabled(key)` helper.

### Changed
- Add Note modal: moved the Voice Note badge to the right end of the row.
- Voice Recorder copy: includes Telugu; clarifies ChatGPT auto‑translation + polish and a friendlier subline.

### Removed
- “Image (coming soon)” card from Add Note modal (only Text and Voice for now).

### Technical
- `config/featureFlags.js`: centralized flags (`voiceToText`) and kept alias `NEW_FEATURE_VOICE_TO_TEXT_BADGE` for back‑compat.

## [3.3.0] - 2025-09-10

### Added
- Whisper translate-to-English path with auto language detection.
- Store detected input language in note payload and log analytics.
- Bold pre-recording callout highlighting multilingual input, auto‑translation, and AI cleanup.

### Changed
- Recorder hides pre-recording tips after a recording/transcription exists.

### Technical
- `translateAudioToEnglish` using `/v1/audio/translations` with `response_format=verbose_json`.
- Language normalization for `en/ta/hi/kn` and name variants.

## [3.2.3] - 2025-09-09

### Added
- classroom timeline now has filter option similar to student timeline

## [3.2.2] - 2025-09-03

### Added
- Passive, non-blocking nudge after a short typing pause suggesting “Polish with AI” for rough text.
- Voice recorder: post-transcription “Polish with AI” action with progress state and Undo.

### Changed
- Rename “Clean Up” → “Polish with AI” to make the AI aspect explicit.
- Tooltip clarifies scope: grammar, tone, and structure only (no length changes).
- Subtext below text area: “Rough notes are okay — AI will polish for you.”
- Voice step header microcopy: “Speak your heart out — AI will tidy after you.”

### Technical
- `AddNoteModal.jsx`: subtext, tooltip, renamed button, paused-typing nudge, Undo for polish.
- `VoiceRecorder.jsx`: integrates `textCleanup` polish button after transcription with Undo.

### Result
- Clearer AI affordance that reduces copy–paste to external tools while preserving full user control (no auto-polish).

## [3.2.1] - 2025-08-29

### Added
- Centered dialog layout for Add Note flow with consistent modal styling
- In-field word count overlay on text input (bottom-right, subtle)

### Changed
- Cleanup UX copy: clearly communicates capitalization, paragraphing, and structural polish

### Fixed
- Preserve paragraph line breaks across app views (StudentTimeline, ClassroomTimeline, Note dialog) using pre-wrap and safe word breaking

### Technical
- Updated `AddNoteModal.jsx` dialog sizing and text field overlay
- Applied `whiteSpace: 'pre-wrap'` to note renders in timelines and detail dialog

## [3.2.0] - 2025-08-29

### Fixed
- Firestore write failures when saving voice notes after Whisper migration: omitted undefined fields (e.g., `sttConfidence`, `sttAlternatives`) and pruned payload before `addDoc()` to satisfy Firestore constraints.

### Changed
- Voice note metadata: default `sttProvider` to "OpenAI Whisper"; only persist voice-only fields when present.

### Technical
- `AddNoteModal.jsx`: guard optional STT fields, prune `undefined` keys prior to write, and add debug payload log.
- `VoiceRecorder.jsx`: continues to pass Whisper metadata; `sttProvider` now captured in observation docs.

### Compatibility
- No schema changes or migrations. `sttConfidence` remains optional and may be absent for Whisper notes. Update any UI that assumed a numeric confidence.

### Result
- Notes save reliably with Whisper-based STT; no more `addDoc()` undefined-field errors.

## [3.1.0] - 2025-08-29

### Added
- AI text cleanup for teacher notes with OpenAI-backed refinement
- One-time cleanup capability to prevent repeated rewrites
- New `textCleanup` utility with API fallback for offline/basic cleanup
- Environment sample keys: `VITE_OPENAI_TEXT_CLEANUP_API_KEY` (falls back to STT key)
- Copy-to-clipboard button on note cards and in note dialog (StudentTimeline, ClassroomTimeline, Note detail)

### Changed
- Polished UI for the cleanup action: gradient button, tooltip, and progress state
- Integrated cleanup into text note creation and pre-send edit flow
- Smoother copy interaction: zoom/fade transition from copy icon to tick

### Technical
- `src/textCleanup.js`: OpenAI chat completions client with Montessori-focused system prompt
- `AddNoteModal.jsx`: Cleanup button in text input step; passes `cleaned` flag forward
- `ClassroomStudentPicker.jsx`: Edit view supports one-time cleanup and preserves `cleaned` state
- `.env.sample`: Documented cleanup API key
- GitHub Actions: export `VITE_OPENAI_SPEECH_TO_TEXT_API_KEY` (and optional `VITE_OPENAI_TEXT_CLEANUP_API_KEY`) to Vite build in
  `.github/workflows/firebase-hosting-merge.yml` and `firebase-hosting-pull-request.yml`.
  Removed the old `VITE_GOOGLE_SPEECH_TO_TEXT_API_KEY` from the workflow env.
- `CopyToClipboardButton.jsx`: Reusable button with tooltip + animated icon state
- Integrated into `StudentTimeline.jsx`, `ClassroomTimeline.jsx`, and `NoteExpansionDialog.jsx`

### Fixed
- Production build now receives the OpenAI STT key, resolving
  "OpenAI API key not configured" errors in the Voice Recorder modal.

### Notes
- Client-side key usage mirrors existing Whisper setup; consider server proxy if you want to fully hide keys and monitor usage

### Result
- Teachers can write freely and polish with one tap, without leaving the app

## [3.0.1] - 2025-08-29

### Added
- **StudentTimeline Author Display**: Note cards now show the author/teacher row in the same style as ClassroomTimeline (emoji icon + small secondary text, with fallback to "Unknown Teacher").

### Changed
- **StudentTimeline Note Type Badge**: Added top-right note-type badge (Voice/Text/Note) matching ClassroomTimeline’s card overlay.
- **Removed Duplicate Type Row**: Removed the older top-left note-type row from StudentTimeline to avoid duplication; only the top-right badge remains. Star indicator remains unchanged.

### Result
- Consistent card styling between Classroom and Student timelines while keeping StudentTimeline focused on a single student.

## [3.0.0] - 2025-08-25

### Breaking Changes
- **Major API Migration**: Switched from Google Speech-to-Text to OpenAI Whisper API for voice transcription
- **Enhanced Audio Processing**: Improved audio format support and file size handling (25MB limit)
- **Context-Aware Transcription**: Added educational context prompts for better accuracy

### Added
- **OpenAI Whisper Integration**: Complete speech-to-text service using `whisper-1` model
- **Context-Aware Prompts**: Educational context prompts that improve transcription accuracy for:
  * Teacher observations and classroom activities
  * Educational terminology and Montessori vocabulary
  * Student names and curriculum areas
  * Professional teaching language
- **Enhanced Audio Support**: Multiple audio formats (MP3, WAV, WebM, M4A, MPEG) with auto-conversion
- **Test Scripts**: `test-openai-api.js` and `test-whisper-prompt.js` for API validation and testing
- **Improved Error Handling**: Better API key validation and comprehensive error messages

### Changed
- **Voice Recording Quality**: Significantly improved transcription accuracy through context-aware AI
- **Audio Processing**: Enhanced audio conversion and validation for optimal Whisper API performance
- **API Configuration**: Centralized OpenAI API configuration with proper environment variable handling
- **Transcription Workflow**: Streamlined voice-to-text process with better error recovery

### Fixed
- **Environment Configuration**: Resolved .env file formatting issues that were breaking API key validation
- **API Connectivity**: Fixed OpenAI API key parsing and connection issues
- **Audio Format Handling**: Improved audio file processing and validation for transcription

### Technical
- **New Service**: `src/whisperSTT.js` - Complete OpenAI Whisper integration service
- **API Integration**: Proper FormData handling with context prompts and model specification
- **Audio Processing**: Enhanced audio conversion utilities with format validation
- **Error Handling**: Comprehensive error handling for API failures and validation issues
- **Testing**: Added test scripts for API validation and prompt configuration verification

### Performance
- **Transcription Accuracy**: Significantly improved through context-aware AI prompts
- **Audio Processing**: Optimized audio conversion for Whisper API compatibility
- **Error Recovery**: Better handling of API failures and network issues

### Result
- **Major Quality Improvement**: Voice transcription accuracy significantly enhanced for educational content
- **Professional Transcription**: Context-aware AI understands Montessori terminology and classroom language
- **Better User Experience**: More reliable voice recording with improved error handling
- **Future-Ready**: OpenAI Whisper provides foundation for advanced AI features

## [2.6.4] - 2025-08-25

### Added
- **Enhanced Student Note Count Display**: Student cards now show "X notes overall | Y notes in the last 7 days" format
- **Recent Activity Tracking**: Displays notes from last 7 days alongside total note counts for better student progress visibility

### Changed
- **StudentList Component**: Enhanced to fetch and display classroom observations with time-based filtering
- **ClassroomStudentCard Component**: Updated note count display to show both total and recent activity metrics

### Technical
- **Collection Group Queries**: Added observations fetching using `collectionGroup('observations')` for comprehensive data access
- **Date Filtering**: Implemented 7-day rolling window calculation for recent note activity
- **Grammar Handling**: Proper singular/plural handling for note count displays

### Result
- Teachers can now see both total notes and recent activity for each student at a glance
- Better student progress tracking with immediate visibility into recent engagement
- Consistent note count format across all student list views

## [2.6.3] - 2025-08-25

### Added
- **Enhanced Version Badge Display**: Improved version number presentation in profile page for all users
- **Profile Page Version Access**: Teachers can now see app version in their profile page (previously admin-only)
- **showInProfile Prop**: New prop for VersionBadge component to control display context

### Changed
- **Version Badge Styling**: Replaced dark overlay badge with clean, elegant typography design in profile page
- **Profile Page Layout**: Added visual separation with border and proper spacing for version display
- **Component Architecture**: VersionBadge now supports both universal (bottom-left) and profile page display modes

### Improved
- **User Experience**: All users (teachers and admins) can now see app version in profile page
- **Visual Design**: Clean, professional version display that integrates seamlessly with profile page aesthetic
- **Accessibility**: Version information now accessible to teachers for transparency and troubleshooting
- **Component Flexibility**: VersionBadge component can be used in multiple contexts with different styling

### Technical
- **Component Enhancement**: Updated VersionBadge.jsx with conditional rendering based on showInProfile prop
- **Profile Integration**: Added VersionBadge to ProfilePage.jsx with showInProfile={true} for all users
- **Styling System**: Implemented elegant typography-based design with proper spacing and visual hierarchy
- **Backward Compatibility**: Universal bottom-left display for admins remains unchanged

### Result
- Teachers now have access to app version information in their profile page
- Consistent version display experience across all user roles
- Professional, integrated version presentation that enhances profile page design
- Maintained existing admin functionality while expanding teacher access

## [2.6.2] - 2025-08-25

### Added
- **Comprehensive Cache Busting System**: Complete solution to prevent client-side cache interference
- **Version-Aware Service Worker**: Dynamic cache naming based on app version (e.g., `montessori-os-v2.6.2`)
- **Automatic Update Detection**: App automatically detects when new versions are available
- **User-Friendly Update Notifications**: Blue banner appears when updates are ready with one-click update option
- **Smart Caching Strategies**: Network-first for HTML (always fresh), cache-first for assets (efficient)
- **Build Automation**: Service worker version automatically syncs with package.json during builds
- **Prebuild Script**: `update-sw-version.js` automatically updates service worker version before builds

### Changed
- **Service Worker Architecture**: Complete rewrite with version-aware caching and automatic cleanup
- **Vite Configuration**: Enhanced with asset hashing, build optimization, and PWA-friendly settings
- **Firebase Hosting**: Added proper cache headers for different file types (HTML, JS/CSS, images)
- **Package Scripts**: Added `prebuild` script that runs version update automatically

### Fixed
- **Cache Interference Issues**: Users no longer see old versions (e.g., 2.4.3 when 2.6.2 is deployed)
- **Manual Cache Clearing**: Eliminated need for users to manually clear browser cache
- **Version Mismatches**: Service worker cache names now match app version exactly
- **Update Reliability**: Automatic cache invalidation ensures users always get latest version

### Improved
- **User Experience**: Seamless updates without manual intervention or page refreshes
- **Performance**: Smart caching strategies optimize loading while ensuring content freshness
- **Mobile Experience**: Update notifications optimized for iPhone 13 mini (375×812px) viewport
- **Developer Workflow**: Automated version management reduces deployment errors

### Technical
- **New Components**: Created `UpdateNotification.jsx` for user update prompts
- **Version Management**: Added `versionManager.js` utility for service worker lifecycle management
- **Cache Strategy**: Implemented intelligent caching with automatic old cache cleanup
- **Build Process**: Enhanced Vite config with rollup options for better asset management
- **Firebase Headers**: Configured proper cache policies for different content types

### Security
- **Cache Isolation**: Each version creates separate cache, preventing cross-version interference
- **Update Verification**: Service worker validates version before applying updates
- **Automatic Cleanup**: Old caches are automatically removed to prevent security issues

### Result
- **Eliminated Cache Issues**: Users automatically get latest version without manual cache clearing
- **Better Performance**: Optimized caching strategies improve loading times
- **Professional Updates**: Seamless update experience that maintains user workflow
- **Future-Proof**: System automatically handles all future version updates

## [2.6.1] - 2025-08-22

### Added
- **1:1 Email Enforcement System**: Comprehensive solution to prevent duplicate user accounts
- **Cloud Functions for User Management**: Atomic user creation with email uniqueness validation
- **Email Uniqueness Validation**: Server-side enforcement that prevents duplicate email creation
- **Enhanced Error Handling**: Specific error messages for duplicate email scenarios
- **Admin Audit Scripts**: Tools for identifying and cleaning up duplicate accounts

### Changed
- **Frontend User Creation**: AddUserPage now uses Cloud Functions instead of direct Firestore writes
- **Firestore Security Rules**: Updated to support Cloud Function-based user creation
- **User Creation Flow**: Frontend → Cloud Function → Firestore (with atomic validation)
- **Error Messages**: Clear feedback when attempting to create duplicate email accounts

### Fixed
- **Duplicate Email Issue**: Cleaned up all duplicate Hemapriya accounts (4 accounts removed)
- **Data Integrity**: Ensured each email can only be associated with one user account
- **User Management**: Prevented future duplicate account creation through systematic enforcement

### Improved
- **System Security**: Email uniqueness enforced at server level, cannot be bypassed by client
- **Data Quality**: Eliminated duplicate user accounts that were causing data integrity problems
- **Admin Workflow**: Streamlined user creation with automatic duplicate prevention
- **Error Prevention**: Users get immediate feedback when attempting to create duplicate accounts

### Technical
- **Cloud Functions**: Added `createUserWithEmailCheck` and `updateUserWithEmailCheck` functions
- **Atomic Operations**: User creation now happens in single transaction with email validation
- **Frontend Integration**: Updated AddUserPage to use `httpsCallable` for Cloud Function calls
- **Admin Scripts**: Created audit and cleanup scripts for managing existing duplicate accounts
- **Security Architecture**: Multi-layer protection (Frontend → Cloud Function → Firestore Rules)

### Security
- **Email Uniqueness**: Enforced at Cloud Function level with atomic transactions
- **Server-Side Validation**: Cannot be bypassed by client-side manipulation
- **Access Control**: Maintained existing role-based permissions for user creation

### Result
- **Complete Duplicate Prevention**: System now prevents duplicate email accounts at multiple levels
- **Data Cleanup**: Removed all existing duplicate accounts from the system
- **Future Protection**: New users cannot be created with duplicate emails
- **Professional System**: Clean, consistent user management without data integrity issues

## [2.6.0] - 2025-08-20

### Added
- **Note Expansion Functionality**: Complete note expansion system for both ClassroomTimeline and StudentTimeline
- **Reusable NoteExpansionDialog Component**: Single component handling all note expansion operations across the app
- **"View Student Timeline" Button**: Direct navigation from classroom timeline to individual student timeline
- **Unified Note Management**: Consistent edit, delete, and reassign capabilities across all timeline views

### Changed
- **ClassroomTimeline Enhancement**: Notes are now clickable and expandable with full detail view
- **StudentTimeline Refactoring**: Replaced custom dialog implementation with reusable NoteExpansionDialog
- **Component Architecture**: Eliminated code duplication by creating shared note expansion component
- **Navigation Flow**: Seamless transition from classroom overview to individual student timelines

### Improved
- **User Experience**: Consistent note interaction patterns across all timeline views
- **Code Maintainability**: Single source of truth for note expansion functionality
- **Component Reusability**: NoteExpansionDialog can be used in any context requiring note details
- **Mobile Design**: Optimized note expansion dialogs for iPhone 13 mini (375×812px) viewport

### Technical
- **New Component**: Created `src/components/NoteExpansionDialog.jsx` with comprehensive note management
- **State Management**: Centralized note expansion state handling with proper cleanup
- **Permission System**: Integrated existing observation permissions for edit/delete/reassign operations
- **Error Handling**: Comprehensive error handling and user feedback throughout note operations
- **Code Cleanup**: Removed duplicate dialog code and fixed reference errors in StudentTimeline

### Features
- **Note Expansion**: Click any note to view full details with metadata
- **Edit Capability**: Inline text editing with save/cancel functionality
- **Delete Functionality**: Secure note deletion with confirmation dialogs
- **Reassignment**: Move notes between students with proper validation
- **Student Navigation**: Direct link from note to student's full timeline
- **Real-time Updates**: Live synchronization of note changes across all views

### Result
- **Unified Experience**: Consistent note interaction across classroom and student timelines
- **Better Workflow**: Teachers can now expand notes directly from classroom overview
- **Improved Navigation**: Seamless movement between classroom-wide and individual student views
- **Code Quality**: Eliminated duplication and improved maintainability
- **Professional Interface**: Polished note expansion system that scales across the entire app

## [2.5.0] - 2025-08-19

### Added
- **Classroom Timeline Component**: New comprehensive view for teachers to see all classroom activity
- **Notes Tab**: Time-grouped observations (Today, Last 7 Days, Beyond) with teacher attribution
- **Students Tab**: Complete student list with note counts and click navigation to individual timelines
- **Collection Group Queries**: Proper Firebase data structure using `collectionGroup('observations')`
- **Teacher Attribution**: Display teacher names with teacher emoji instead of note type information
- **Pagination System**: Show 10 notes initially with "Show 10 More" button for large datasets
- **Sticky Navigation**: Tabs remain visible under AppHeader while scrolling for better UX

### Changed
- **Navigation Flow**: Updated routing from classroom list → classroom timeline (instead of student list)
- **Back Button Integration**: Universal back button via AppHeader for consistent navigation
- **Student Count Display**: Shows "X observations among Y students" for better context
- **Note Type Display**: Replaced note type with teacher name for more useful information

### Improved
- **Teacher Collaboration**: Teachers can now see group activities and track classroom progress
- **Navigation Experience**: Sticky tabs and universal back button improve mobile navigation
- **Data Visibility**: Real-time classroom timeline with proper time-based organization
- **Student Navigation**: Click any student name to view their individual timeline
- **Mobile Design**: Optimized for iPhone 13 mini (375×812px) with proper spacing

### Technical
- **Firebase Integration**: Proper collection group queries across student observation subcollections
- **Real-time Updates**: Uses onSnapshot for live classroom activity updates
- **State Management**: Efficient state handling for tabs, notes, and student data
- **Error Handling**: Comprehensive error boundaries and loading states
- **Component Architecture**: Modular design with ClassroomNoteCard and ClassroomStudentCard components

### Result
- **Complete Classroom Overview**: Teachers can see all classroom activity in one place
- **Better Collaboration**: Track how other teachers are performing in shared classrooms
- **Improved Workflow**: Seamless navigation between classroom-wide and individual student views
- **Professional Interface**: Clean, organized timeline that scales to large classrooms

## [2.4.3] - 2025-08-19

### Added
- **Persistent Back Button in Header**: Added persistent back button to the left of menu button in AppHeader
- **Always-Visible Navigation**: Back button is now visible throughout the app and doesn't scroll away during content scrolling
- **Automatic Back Button Display**: Back button automatically shows/hides based on current screen (hidden on landing page)

### Changed
- **Navigation Architecture**: Moved back button functionality from individual page components to persistent header
- **Component Simplification**: Removed individual back buttons from all page components for cleaner interface
- **User Experience**: Improved navigation consistency by keeping back button always accessible

### Removed
- **Individual Back Buttons**: Removed back buttons from ClassroomList, StudentList, StudentTimeline, ProfilePage, StatsPage, and FeedbackPage components
- **Component Props**: Eliminated onBack props from all page components that previously had back buttons

### Improved
- **User Experience**: Navigation controls are now always accessible regardless of scroll position
- **Mobile-First Design**: Follows established mobile-first design principles with proper touch targets
- **Interface Consistency**: Unified navigation pattern across all pages with persistent header controls

### Technical
- **AppHeader Enhancement**: Added onBack and showBackButton props to AppHeader component
- **Navigation Logic**: Implemented centralized back navigation logic in App component
- **Component Updates**: Updated 8 components to remove back button functionality and props
- **State Management**: Centralized navigation state management for better maintainability

### Components Updated
- **AppHeader.jsx**: Added persistent back button with navigation props
- **App.jsx**: Added back navigation logic and header prop passing
- **ClassroomList.jsx**: Removed back button and onBack prop
- **StudentList.jsx**: Removed back button and onBack prop
- **StudentTimeline.jsx**: Removed back button and onBack prop
- **ProfilePage.jsx**: Removed back button and onBack prop
- **StatsPage.jsx**: Removed back button and onBack prop
- **FeedbackPage.jsx**: Removed back button and onBack prop

### Result
- **Better Navigation**: Users can always access back button regardless of scroll position
- **Cleaner Interface**: Removed duplicate back buttons from individual pages
- **Improved UX**: Consistent navigation experience across all app screens
- **Mobile Optimization**: Better touch target accessibility and mobile-first design compliance

## [2.4.2] - 2025-08-19

### Added
- **Feedback Timeline Organization**: Group feedback by status with clear visual separation
- **Status-Based Grouping**: Organize feedback into logical workflow stages (New → Reviewed → Implemented → Declined)
- **Status Headers**: Add colored status headers with count chips for each feedback group
- **Visual Dividers**: Implement dividers between status groups for better organization

### Changed
- **Feedback Display**: Replaced flat feedback list with organized status-based grouping
- **Admin Workflow**: Improved feedback management by organizing items by processing stage
- **User Interface**: Enhanced visual hierarchy with status-specific color coding and grouping

### Improved
- **Admin Experience**: Clearer organization makes it easier to process feedback in correct order
- **Visual Clarity**: Status groups provide immediate understanding of feedback workflow
- **Workflow Management**: Logical progression from new submissions to completed items
- **Interface Cleanliness**: Empty status groups are automatically hidden to maintain clean appearance

### Technical
- **Component Enhancement**: Updated FeedbackTimeline.jsx with status grouping logic
- **Data Organization**: Implemented groupedFeedback structure with status-based categorization
- **Status Ordering**: Defined consistent status display order for workflow consistency
- **Conditional Rendering**: Smart display logic that only shows groups with feedback items

### Result
- **Better Organization**: Feedback is now logically grouped by processing stage
- **Improved Workflow**: Admins can easily see what needs attention vs. what's completed
- **Professional Appearance**: Clean, organized interface that's easy to scan and manage
- **Enhanced Usability**: Clear visual separation makes feedback management more intuitive

## [2.4.1] - 2025-08-19

### Fixed
- **Accidental Student Selection Prevention**: Removed select all checkbox from ClassroomStudentPicker to prevent teachers from accidentally selecting all students in a classroom
- **Unwanted Note Duplication**: Eliminated the risk of teachers creating one note for all students when they don't intend to
- **User Experience**: Teachers can now only select individual students, providing better control over note targeting

### Changed
- **Classroom Selection Interface**: Removed checkbox that allowed bulk selection of all students in a classroom
- **Selection Behavior**: Classroom cards now serve as expandable containers without dangerous "select all" functionality
- **Component Architecture**: Simplified ClassroomStudentPicker by removing unnecessary selection state management

### Removed
- **Select All Checkbox**: Checkbox in classroom header that allowed selecting all students in a classroom
- **handleClassroomToggle Function**: Function that handled bulk classroom student selection logic
- **getClassroomSelectionState Function**: Function that determined checkbox state (checked/unchecked/indeterminate)

### Technical
- **Code Cleanup**: Removed 38 lines of code related to bulk selection functionality
- **State Simplification**: Eliminated complex selection state management for classroom-level operations
- **Component Focus**: Component now focuses solely on individual student selection and classroom browsing

### Result
- **Prevents Accidental Duplication**: Teachers can no longer accidentally create notes for entire classrooms
- **Better User Control**: Individual student selection provides precise control over note recipients
- **Cleaner Interface**: Simplified classroom cards that focus on organization rather than bulk operations
- **Reduced Risk**: Eliminated the possibility of unwanted mass note creation

## [2.4.0] - 2025-08-18

### Added
- **Comprehensive Admin User Creation Interface**: New AddUserPage component for creating admin and teacher accounts
- **Role-Based Permission Management**: Support for Super Admin, Regular Admin, and Teacher roles with customizable permissions
- **Classroom Assignment System**: Teachers can be assigned to multiple classrooms during account creation
- **Permission Customization**: Bulk Select All/Clear All buttons for efficient permission management
- **Form Validation**: Real-time validation for email domains, required fields, and classroom assignments
- **Access Control**: Only super admins can access user creation functionality
- **Navigation Integration**: Added routing and navigation to new user creation page from admin panel

### Changed
- **LandingPage Enhancement**: Updated "Add Admin / Teacher" card to be clickable and functional
- **App Navigation**: Added new screen state and routing for user creation page
- **UI Modernization**: Replaced basic section headers with gradient dividers and improved typography

### Improved
- **User Experience**: Streamlined user creation workflow with intuitive form design
- **Permission Management**: Automatic permission assignment based on admin level with customization options
- **Classroom Integration**: Real-time classroom fetching with student count display
- **Form Feedback**: Success/error messaging with automatic form reset after successful creation
- **Mobile Design**: Optimized for iPhone 13 mini (375×812px) with touch-friendly interactions

### Technical
- **Component Architecture**: New AddUserPage component with comprehensive form handling
- **Firebase Integration**: Creates user documents in Firestore and updates classroom assignments
- **State Management**: Complex form state with validation, permissions, and classroom selection
- **Permission System**: Configurable permission groups for different admin levels
- **Error Handling**: Comprehensive error handling for Firebase operations and form validation
- **MUI Integration**: Exclusive use of Material-UI components for consistent design

### Security
- **Access Control**: Super admin only access to user creation functionality
- **Permission Validation**: Server-side permission checking and role verification
- **Data Integrity**: Proper validation of email domains and required fields

### Features
- **Admin Account Creation**: Create admin accounts with Super/Regular levels and customizable permissions
- **Teacher Account Creation**: Create teacher accounts with automatic classroom assignments
- **Permission Management**: 6 permissions for Super Admin, 3 for Regular Admin
- **Classroom Picker**: Multi-select classroom assignment with student count display
- **Form Validation**: Real-time feedback for email format, required fields, and selections
- **Auto-Reset**: Form automatically clears after successful user creation
- **Success Feedback**: Clear confirmation messages and automatic navigation

### Result
- Complete web-based user management system matching CLI script functionality
- Streamlined admin workflow for adding new users to the system
- Professional-grade permission management with bulk operations
- Seamless integration with existing classroom and user management systems
- Enhanced admin capabilities for Montessori school user administration

## [2.3.5] - 2025-08-18

### Added
- **Text Editing in Voice Recorder**: Added edit mode to VoiceRecorder with confirmation dialog for canceling edits
- **Text Editing in Student Picker**: Implemented text editing functionality in ClassroomStudentPicker for text notes
- **Edit Confirmation Dialog**: Added confirmation popup when canceling edits to prevent accidental data loss
- **Visual Divider**: Added divider between text input and student selection sections for better UI organization

### Changed
- **Voice Recorder UI**: Replaced "Copy Text" button with "Edit Text" button for better functionality
- **Button Layout**: Swapped positions of "Record Again" and "Edit Text" buttons for improved UX
- **Edit Mode States**: Implemented dynamic button states (Edit Text → Cancel Edit/Save Edit)
- **Text Persistence**: Added temporary text persistence during editing with revert capability

### Improved
- **User Experience**: Users can now edit transcribed text before finalizing notes
- **UI Consistency**: Maintained consistent styling across voice and text note components
- **Workflow Clarity**: Clear visual separation between text input and recipient selection
- **Data Integrity**: Confirmation dialog prevents accidental loss of edited content

### Technical
- **State Management**: Added edit mode state variables (`isEditing`, `editableText`, `originalTranscription`)
- **Component Props**: Enhanced ClassroomStudentPicker with `textData` and `onTextDataChange` props
- **Edit Functions**: Implemented `startEditing()`, `cancelEditing()`, and `saveEditing()` functions
- **Conditional Rendering**: Dynamic UI switching between read-only and editable text modes
- **Data Flow**: Edited text properly updates parent component state for final note save

### Result
- Complete text editing workflow for both voice and text notes
- Consistent user experience across all note creation methods
- Better data quality through text editing capabilities
- Improved UI organization with clear visual hierarchy

## [2.3.4] - 2025-08-17

### Changed
- **Performance Targets Refactoring**: Centralized all performance targets in dedicated config file
- **Target Values Updated**: Adjusted performance targets for better teacher workflow:
  - Student notes per week: 5 → 2 notes/week
  - Classroom notes per student per week: 5 → 2 notes/student/week  
  - Struggling threshold: 2 → 0 notes/week
  - Teacher notes per week: remains 20 notes/week

### Added
- **New Config File**: `src/config/performanceTargets.js` with centralized target management
- **Helper Functions**: Performance calculation utilities and threshold checking functions
- **Performance Thresholds**: High (80%), Medium (60%), Low (0%) performance categories
- **Dynamic UI Updates**: All displays now show target values from config instead of hardcoded numbers

### Improved
- **Code Maintainability**: Single source of truth for all performance targets
- **Configuration Management**: Easy to modify targets without hunting through code
- **Consistency**: All performance calculations use same target values
- **Developer Experience**: Clear separation of configuration from business logic

### Technical
- **StatsPage Refactoring**: Replaced hardcoded values with config imports throughout component
- **Performance Calculations**: Centralized calculation logic in config file
- **Threshold Functions**: `isHighPerformer()`, `isMediumPerformer()`, `isLowPerformer()` helpers
- **Calculation Helpers**: `calculateStudentPerformance()`, `calculateTeacherPerformance()`, `calculateClassroomPerformance()`

### Result
- **Easier Target Management**: Admins can now adjust performance expectations in one place
- **Consistent Metrics**: All performance displays use same target values
- **Better Maintainability**: Future target changes require only config file updates
- **Cleaner Code**: StatsPage.jsx is more focused on UI logic rather than hardcoded values

## [2.3.3] - 2025-08-16

### Added
- **Role-Based User Deletion**: Enhanced `wipe-firestore.js` script with selective user deletion by role
- **User Role Selection**: Choose to delete teachers only, admins only, or both when using `users` flag
- **Universal Confirmation System**: All deletion operations now require explicit confirmation before execution

### Improved
- **Script Efficiency**: Consolidated confirmation logic into reusable `confirmAction()` function
- **Code Quality**: Eliminated redundant readline interfaces and duplicate confirmation code
- **Maintainability**: Streamlined async/await patterns and removed code duplication
- **Safety**: Mandatory confirmation prompt for all destructive operations regardless of input flags

### Technical
- **Admin Script Enhancement**: `wipe-firestore.js` now supports `node wipe-firestore.js users` with role selection
- **Confirmation Flow**: Role selection (1=teachers, 2=admins, 3=both) followed by confirmation prompt
- **Code Refactoring**: Reduced script size while maintaining all functionality and safety measures
- **Error Handling**: Consistent error handling and user feedback throughout all deletion operations

### Usage
```bash
# Delete users by role
node scripts/admin/wipe-firestore.js users
# Select: 1 (teachers only), 2 (admins only), or 3 (both)
# Confirm with 'YES' to proceed
```

### Result
- Admin can now selectively clear user data by role instead of all-or-nothing approach
- Script is more maintainable and efficient while preserving safety measures
- Consistent confirmation flow across all deletion operations
- Better user experience with clear role selection and confirmation prompts

## [2.3.2] - 2025-08-16

### Fixed
- **Wipe Firestore Script**: Fixed `wipe-firestore.js` to properly handle fanned-out observations structure
- **Observations Deletion**: Script now correctly deletes observations from student subcollections (`/students/{studentId}/observations/{observationId}`)
- **Collection Structure**: Updated script to match Firestore data model where observations are stored as subcollections under each student

### Technical
- **Script Enhancement**: Added `wipeAllObservations()` function to handle fanned-out structure
- **Special Handling**: Script now detects "observations" flag and calls appropriate deletion logic
- **Efficient Processing**: Iterates through all students to find and delete their observation subcollections
- **Progress Tracking**: Shows deletion progress and final count of observations deleted

### Result
- Admin can now properly clear all observations data using `node scripts/admin/wipe-firestore.js observations`
- Script correctly handles the complex fanned-out data structure
- No more confusion about why "observations" collection appears empty

## [2.3.1] - 2025-08-16

### Improved
- **Export Confirmation Modal Clarity**: Updated export confirmation modal to show "X out of Y notes" instead of just "Count: X notes"
- **Filter Display Clarity**: Changed filter chip from "2/8 filtered" to "Showing 2 of 8 notes" for better user understanding
- **User Experience**: Makes it obvious how many notes are being exported relative to total available notes
- **Interface Clarity**: Improves user experience by being explicit about what numbers represent rather than using cryptic shorthand

### Technical
- **StudentTimeline Component**: Enhanced export confirmation dialog with clearer count display
- **Filter Chip**: Updated filter indicator to use descriptive text instead of fraction format
- **UI Consistency**: Maintains existing design patterns while improving clarity

### Result
- Users can now clearly see "2 out of 8 notes" when exporting filtered observations
- Filter status is immediately understandable as "Showing 2 of 8 notes"
- Export process is more transparent and user-friendly
- No more confusion about what the numbers represent in the interface

## [2.3.0] - 2025-08-16

### Added
- major updates to stats page. complete revamp
- **Export Functionality for Teachers**: Teachers can now export student timeline data in clean text format
- **Role-Based Export Experience**: Different export formats for teachers (text) vs admins (JSON/Text)
- **Clean Text Export**: Simplified text format focused on observation content and dates
- **Export Button Visibility**: Export button now visible for all users regardless of role

### Changed
- **Export Button Access**: Export button moved outside admin-only restriction
- **Format Selection**: Teachers automatically get text format without format dropdown
- **Text Export Content**: Removed metadata clutter, focused on readable observation content
- **User Experience**: Teachers get simple one-click export, admins retain full format control

### Fixed
- **Teacher Export Access**: Teachers previously had no way to export their observation data
- **Export Format Clarity**: Text format now shows only essential information for sharing

### Technical
- **Component Updates**: StudentTimeline.jsx export button now visible for all users
- **Format Logic**: Role-based export handling with automatic format selection for teachers
- **Export Utility**: Enhanced export_student_timeline.js with clean text generation
- **UI Consistency**: Export button styling and behavior consistent across user roles

### Result
- Teachers can now export student timeline data for parent communication and record keeping
- Clean text format perfect for sharing observations without technical metadata
- Admin functionality preserved with full JSON export capabilities
- Improved teacher workflow while maintaining administrative oversight

## [2.2.1] - 2025-08-11

### Added
- **Complete StatsPage Revamp**: Multi-level filtering system with classroom, teacher, and student filters
- **Enhanced Analytics Dashboard**: Overview, Classrooms, Teachers, and Students tabs with performance metrics
- **Action Items Panel**: Smart alerts for underperforming areas with priority levels (High: classrooms, Medium: teachers, Low: students)
- **Trend Analysis**: Weekly comparisons, performance targets, and visual indicators with trend arrows
- **Multi-Level Filtering**: Smart cascading filters that work together and affect data display dynamically
- **Filter Management**: Collapsible interface with clear all functionality and filter summary display

### Changed
- **StatsPage Architecture**: Complete rewrite from basic stats to powerful admin analytics dashboard
- **Data Visualization**: Enhanced stat cards with trend indicators, performance bars, and comparison charts
- **Navigation Tabs**: Reorganized into logical sections (Overview, Classrooms, Teachers, Students)
- **Performance Metrics**: Implemented target-based calculations (5 notes/student/week, 20 notes/teacher/week)
- **Mobile Layout**: Optimized for 375px width containers with touch-friendly interactions

### Fixed
- **Firestore Permission Issues**: Fixed collection-level access for users collection listing
- **Variable Scope Errors**: Resolved 'classroomsData is not defined' reference errors
- **Query Optimization**: Simplified teachers query by removing problematic where clause, added client-side filtering
- **Collection Group Queries**: Properly configured for observations with enhanced error handling
- **Error Recovery**: Graceful fallbacks when queries fail with comprehensive debugging logs

### Technical
- **Enhanced Data Queries**: Collection group queries, granular error handling, client-side filtering
- **UI/UX Improvements**: Mobile-first design, MUI components, responsive layouts, color coding
- **Data Processing**: Weekly calculations, performance metrics, smart aggregation
- **Mobile Optimization**: Touch-friendly buttons (44px minimum), responsive patterns, proper spacing
- **Design System**: Consistent MUI integration, proper theme colors, accessibility compliance

### Security
- **Firestore Rules**: Added users collection access while maintaining individual document security
- **Admin Role Verification**: Proper admin role checking for collection-level queries
- **Access Control**: Maintained existing security for individual document access

### Performance
- **Indexing**: Configured collection group indexes for observations queries
- **Query Optimization**: Client-side filtering for better responsiveness
- **Error Handling**: Graceful degradation when Firestore queries fail

### Result
- **Transformed basic stats page** into powerful admin analytics dashboard
- **Fixed critical Firestore permission issues** that were blocking data access
- **Added sophisticated filtering** that gives admins granular control over data views
- **Implemented actionable insights** that help admins identify and address issues
- **Created mobile-optimized UI** that works perfectly on all devices

## [2.2.0] - 2025-08-11

### Added
- **Comprehensive Feedback & Suggestions System**: New dedicated page for users to submit feedback, complaints, and suggestions
- **FeedbackPage Component**: User-facing feedback submission form with large text area and optional category selection
- **FeedbackTimeline Component**: Admin dashboard for viewing and managing all feedback submissions
- **Feedback Collection**: New Firestore `feedback` collection with comprehensive metadata logging
- **Navigation Integration**: Added "Feedback & Suggestions" to sidebar menu and admin dashboard card
- **Role-Based Access Control**: Teachers see their own feedback, admins see all feedback
- **Metadata Logging**: Captures user info, timestamp, app version, user agent, and submission context
- **Category System**: Optional feedback categorization (Bug Report, Feature Request, UI/UX, Performance, General)
- **Status Management**: Feedback status tracking (new → reviewed → implemented/declined)
- **Admin Notes**: Private admin-only notes for internal feedback tracking
- **Search & Filtering**: Comprehensive filtering by user, category, date, status, and content
- **Success Notifications**: User feedback confirmation with "Thank you for your suggestion!" message

### Changed
- **App Navigation**: Updated App.jsx routing to include feedback screens (`/feedback`, `/feedbackTimeline`)
- **AppHeader**: Added feedback menu item to sidebar navigation
- **LandingPage**: Added feedback dashboard card for admin users
- **Data Structure**: Updated DATA_STRUCTURE.md with feedback collection schema and security rules
- **Firestore Rules**: Added comprehensive security rules for feedback collection access control

### Fixed
- **StudentTimeline Back Button**: Updated back button styling to match app-wide navigation pattern
- **Icon Import Issues**: Fixed missing History icon import that was causing React constructor errors
- **UI Consistency**: Back button now uses IconButton with ArrowBack icon instead of Button with text

### Technical
- **Component Architecture**: Created modular feedback system with separate user and admin components
- **Firestore Integration**: Implemented feedback collection with proper security rules and indexing
- **Client-Side Sorting**: Used client-side sorting to avoid Firestore composite index requirements
- **Mobile-First Design**: Ensured feedback system works perfectly on mobile viewport (375×812px)
- **Error Handling**: Comprehensive error handling and user feedback throughout feedback workflow
- **Accessibility**: Proper aria-labels and semantic HTML for all feedback components

### Security
- **Feedback Permissions**: Users can read/create their own feedback, admins can read/update/delete all
- **Field Immutability**: Critical fields (userId, timestamp, appVersion) cannot be modified after creation
- **Role-Based Access**: Teachers restricted to their own feedback, admins have full access
- **Admin Notes Privacy**: Admin notes are private and only visible to admin users

### Result
- Complete feedback loop system for continuous app improvement
- Low barrier to entry for user feedback submission
- Comprehensive admin dashboard for feedback management and analysis
- Proper access control and security throughout the feedback system
- Consistent UI/UX with existing app design patterns

## [2.1.2] - 2025-08-11

### Fixed
- **StudentTimeline Reassignment Dialog**: Updated reassignment interface for consistency and proper access control
- **UI Consistency**: Replaced simple student list with ClassroomStudentPicker component to match add note modal
- **Access Control**: Fixed issue where teachers could see ALL students instead of only their assigned classrooms
- **Unknown Teacher/Student Display**: Resolved "Unknown Teacher" and "Unknown Student" issues in observation detail dialog
- **Runtime Errors**: Fixed getDocs import that was causing blank pages and JavaScript errors

### Improved
- **User Experience**: Added proper validation to prevent reassigning notes to the same student
- **Confirmation Dialog**: Enhanced reassignment confirmation with better user feedback and "From/To" information
- **State Management**: Cleaned up unused imports and state variables for better code maintainability
- **Security**: Teachers now only see students and classrooms they have permission to access
- **Interface Consistency**: Reassignment dialog now uses same UI patterns as add note modal

### Technical
- **Component Integration**: Integrated ClassroomStudentPicker for consistent student selection experience
- **Permission Handling**: Proper role-based filtering for classrooms and students
- **Code Quality**: Removed duplicate logic and improved component architecture
- **Error Prevention**: Added validation and better error handling for reassignment operations

### Result
- Teachers can no longer see students from unassigned classrooms (e.g., "Adolescent" students)
- Consistent UI experience between note creation and note reassignment
- Proper access control maintained throughout the reassignment process
- No more blank pages or runtime errors when viewing student timelines

## [2.1.1] - 2025-08-11

### Fixed
- **StatsPage Schema Migration**: Updated StatsPage to work with new Firestore schema structure
- **Collection Group Queries**: Fixed collection group queries for observations subcollections (`students/{studentId}/observations/{observationId}`)
- **Field References**: Updated from old schema fields (`timestamp` → `observedAt`, `teacherId` → `createdBy`)
- **Student Name Resolution**: Fixed "Unknown Student" display issue by using `displayName` from new schema
- **Observation Type Filtering**: Improved filtering for `tags.type` structure in new schema
- **MUI Grid Warnings**: Fixed MUI Grid v2 migration warnings by removing deprecated `item` and `xs` props

### Improved
- **Error Handling**: Added comprehensive error handling and debugging for collection group queries
- **Client-Side Sorting**: Implemented graceful fallback with client-side sorting when Firestore index is missing
- **Debugging**: Enhanced console logging to troubleshoot schema migration issues
- **Performance**: Better handling of missing Firestore indexes with informative error messages

### Technical
- **Schema Compatibility**: StatsPage now properly queries observations from new subcollection structure
- **Index Management**: Clear instructions for creating missing `COLLECTION_GROUP_DESC` index in Firestore
- **Data Integrity**: Proper handling of both old and new schema structures during transition
- **Query Optimization**: Uses correct Firestore collection group patterns for new data model

### Result
- Statistics page now displays observation counts and student names correctly
- No more "Unknown Student" display issues
- Graceful handling of missing Firestore indexes
- Improved debugging and error reporting for development

## [2.1.0] - 2025-08-11

### Fixed
- **Classroom/Student Picker Issues**: Resolved undefined variable reference by changing 'allClassrooms' to 'classList' in ClassroomStudentPicker
- **Missing State Updates**: Fixed classrooms state not being populated from fetched data, causing empty classroom lists
- **Collection Group Queries**: Added proper collection group rule for observations to handle collectionGroup queries
- **Permission Errors**: Resolved "Missing or insufficient permissions" errors for teachers accessing classrooms and student observations

### UI Improvements
- **Enhanced Classroom Display**: Updated classroom display to show "X/Y selected" format instead of just total student count
- **Browse by Classroom**: Fixed section to properly display all classrooms with correct student grouping
- **Student Grouping**: Students are now correctly grouped under their respective classrooms
- **Selection Feedback**: Improved user experience with real-time selection count updates

### Security Rules
- **Simplified Classroom Access**: Streamlined classroom security rules to resolve permission conflicts
- **Collection Group Support**: Added proper rules for observations collection group queries
- **Teacher Access**: Teachers can now successfully access their assigned classrooms and student observations

### Result
- Classroom/student picker now works correctly for all user roles
- Teachers can see their assigned classrooms and students without permission errors
- Improved user experience with better selection feedback and classroom organization
- No more "Missing or insufficient permissions" errors during normal operation

## [2.0.4] - 2025-08-09

### Added
- Per-student observation subcollections
  - Notes are saved under `students/{sid}/observations/{obsId}` with `observedAt`, `createdBy`, `createdByName`, `createdByEmail`
- Timeline reads via collection group
  - `collectionGroup('observations')` with `where('studentId'...)` and `orderBy('observedAt','desc')`

### Changed
- Timeline update/delete/reassign operate on subcollection paths
- Use `createdBy` for creator checks (kept legacy `teacherId` fallback)

### Fixed
- Permission-denied errors and assertion logs when viewing timelines with no top-level `observations` collection
- Student selection/search showing blank names by using robust fallback: `name || displayName || firstName + lastName`

### Removed
- One-off classroom cleanup script after normalizing to `teacherIds`

## [2.0.3] - 2025-08-09

### Added
- Header search bars on classroom and student list screens
  - Search field sits next to the back button and expands to fill remaining space
  - Real-time client-side filtering
- Multi-select filter chips in Student Timeline
  - Replaced single-select dropdowns with chip-style `ToggleButtonGroup`
  - Supports multiple creators and types simultaneously

### Changed
- Student cards now display names only (cleaner list)
- Robust name fallback used across list and search: `name || displayName || firstName + lastName`

### Fixed
- Blank student list items when `name` was missing by using the new fallback

### Technical
- Updated `FilterPanel.jsx` and `useObservationFilters.js` to use array-based filters (`creators[]`, `types[]`)
- No backend or rules changes in this version

## [2.0.2] - 2025-08-08 

### Added
- Data preprocessing pipeline for educators
  - `scripts/data_preprocessing.py` cleans raw educators XLSX and writes `scripts/data/processed/educators_clean.xlsx`
  - Adds `Role` column (default teacher; admin for specified names)
- Teacher import utility
  - `scripts/admin/import-hsr-teachers.js` reads cleaned XLSX → JSON preview and optional Firestore upsert
- `package.json` scripts: `import:teachers`, `import:teachers:push`; add `xlsx` dependency

- Access request flow for unauthorized users
  - Request Access button on `AccessDenied.jsx` (one-tap, no custom message)
  - Callable Cloud Functions in `asia-south1`:
    - `requestAccess`: writes to `access_requests` (optional admin email via SMTP)
    - `logUnauthorizedAccess`: writes to `access_logs`
  - Minimal `logger` utility to suppress console output in production

### Changed
- Removed student handling from data preprocessing script (students handled elsewhere)
- Pinned Functions region to `asia-south1` (Mumbai) for client and server
- Hide `AddNoteFab` on access denied screen; make Sign Out a conspicuous outlined button

### Security
- Moved unauthorized logging to backend callable; no client-side Firestore writes
- `notifyAdminsOnUnauthorized` listener pinned to `asia-south1`

### Removed
- Legacy Speech-to-Text path: removed `transcribeVoiceNote` Storage trigger and `@google-cloud/speech` usage

## [2.0.1] - 2025-08-08

### Changed
- Minor adjustments post-schema rollout: confirmed canonical rules/indexes at repo root and removed duplicates under `montessori-os/`
- Updated security rules and indexes to match new schema

## [2.0.0] - 2025-08-08

### Breaking
- Core Firestore data model restructured to optimize teacher note-taking and admin analytics
- Observations moved to per-student subcollections with collection group queries
- Denormalized `classroomId` on observations for faster rules/queries
- Removed non-essential collections from core (tags, attendance, assessments) for now

### Added
- New `DATA_STRUCTURE.md` outlining Firestore-first schema:
  - `users/{uid}` for roles and identity
  - `classrooms/{classroomId}` with `teacherIds` and server-maintained `studentCount`
  - `students/{studentId}` with `classroomId` and `isActive`
  - `students/{studentId}/observations/{observationId}` fan-out; collection group `observations`
- Query patterns, essential indexes, and security rule hooks documented

### Security
- Simplified access control anchored on `classrooms.teacherIds`
- Admin-only updates/deletes of observations (teachers create only)

### Rationale
- Fan-out + denorm + collection groups greatly simplify read paths and scale analytics without complex joins

## [1.7.3] - 2025-01-08

### Changed
- Version badge now only shows for admin users
- Hide version badge for teachers to provide cleaner interface
- Maintain version badge visibility for unauthenticated users

### Improved
- Add role-based visibility to VersionBadge component
- Pass userRole prop to all VersionBadge instances in App.jsx
- Enhanced UI/UX by removing unnecessary version information for teachers

## [1.7.2] - 2025-01-08

### Fixed
- Teacher classroom filtering in note creation modal now works correctly
- Search functionality now only searches through assigned classrooms/students
- Prevented teachers from seeing students from unassigned classrooms
- Fixed edge case where search could find students from unassigned classrooms

### Improved
- Role-based classroom filtering for teachers in ClassroomStudentPicker component
- Added proper user role and current user props to AddNoteModal
- Updated ClassroomStudentPicker to filter both classrooms and students by teacher assignments
- Enhanced security by ensuring teachers only see their assigned classrooms and students

## [1.7.1] - 2025-01-08

### Fixed
- Teacher stats filtering now shows only teacher's own observations (was showing all school data)
- Added back button to Statistics page for consistent navigation
- Fixed MUI Grid warnings by adding missing `item` prop
- Import missing `where` function from firebase/firestore
- Remove overly restrictive classroom filtering that was breaking stats

### Improved
- Role-based filtering for teacher vs admin statistics
- Teacher stats now display personalized data instead of school-wide data
- Navigation consistency across all pages
- Console warnings eliminated

## [1.7.0] - 2025-01-08

### Added
- Teacher landing page with role-based content using unified LandingPage component
- Home button in AppHeader for quick navigation back to landing page
- Role-based classroom filtering (teachers see assigned classrooms only)
- Student count display in classroom cards
- Welcome message for teachers with personalized greeting

### Changed
- Refactored AdminPanel and TeacherPanel into single LandingPage component
- Updated navigation flow: Login → LandingPage → Classrooms → Students → Timeline
- Moved menu button slightly left and added home button to AppHeader
- Replaced standalone filter icon with "Filters" button in StudentTimeline
- Removed duplicate filter button from FilterPanel component

### Improved
- Code reusability: Single LandingPage component serves both admin and teacher views
- Navigation consistency: Both user types follow same panel-based navigation pattern
- UI/UX: Better filter button with text and icon instead of standalone icon
- Mobile-first design: Responsive classroom cards with hover effects
- Accessibility: Proper aria-labels and semantic HTML

### Technical
- Created `src/components/LandingPage.jsx` with role-based content rendering
- Updated `src/components/ClassroomList.jsx` to filter by teacher assignments
- Enhanced `src/components/AppHeader.jsx` with home button functionality
- Refactored `src/components/StudentTimeline.jsx` filter button implementation
- Cleaned up `src/components/FilterPanel.jsx` by removing duplicate button
- Updated App.jsx navigation system to use unified landing page approach

### Navigation Flow
- Teachers: Login → Teacher Panel → My Classrooms → Students → Timeline
- Admins: Login → Admin Panel → All Classrooms → Students → Timeline
- Home button: Quick return to landing page from anywhere in app
- Back navigation: Always returns to appropriate landing page

### Future-Ready
- LandingPage component easily extensible for additional teacher/admin features
- Filter system ready for curriculum area tags
- Modular architecture supports role-based feature additions

## [1.5.0] - 2025-01-08

### Added
- Statistics menu item in sidebar navigation with BarChart icon
- Complete routing integration for Statistics page (`/stats` route)
- Statistics page navigation with proper back button functionality
- Integration of StatsPage component into main app navigation system
- Comprehensive statistics and analytics system with real-time data visualization
- Interactive pie chart for note type distribution using Recharts library
- Student ranking system with proper name fetching from Firestore database
- Teacher activity analytics with admin-only access control
- Weekly activity progress bars showing note-taking trends over 4 weeks
- Dedicated StatsPage component for analytics and visualizations
- Note reassignment functionality with student selection modal
- "Assigned To" metadata line in observation detail dialog
- Modular filter system with reusable components
- `useObservationFilters` custom hook for filter state management
- `FilterPanel` component for reusable observation filtering UI
- Observation utility functions (`observationUtils.js`)
- Permission utility functions (`observationPermissions.js`)

### Changed
- Migrated statistics and analytics from ProfilePage to dedicated StatsPage component
- Streamlined ProfilePage to focus only on user account information
- Enhanced ProfilePage layout with email under profile photo and simplified role display
- Removed redundant account details card and authentication provider information
- Updated App.jsx to include stats screen state and navigation handling
- Enhanced page title logic to display "Statistics" for stats page
- Refactored StudentTimeline component from 942 to ~800 lines through modularization
- Extracted filter logic into dedicated hook with performance optimizations
- Separated permission checks into utility functions for better reusability
- Improved code organization with single responsibility principle

### Fixed
- "Unknown Student" display issue by properly fetching student names from Firestore
- Student name resolution in statistics by implementing batch student data fetching
- Observation detail dialog button spacing and text cutoff issues
- React console errors from missing Material-UI imports
- Dialog state management conflicts during reassignment

### Improved
- Profile page information hierarchy with email display under profile photo
- Role display simplified from chip to colored text for cleaner appearance
- Statistics visualization with interactive pie charts and progress bars
- Mobile-friendly analytics with responsive design and touch interactions
- Code maintainability through modular architecture and component separation
- Component reusability across different observation views
- Testability with isolated, focused modules
- Loading states and error handling for data fetching operations
- Navigation consistency with proper screen state management

### Technical
- Created `src/components/StatsPage.jsx` with comprehensive analytics functionality
- Implemented Recharts integration for interactive data visualizations
- Added batch student data fetching for proper name resolution in statistics
- Enhanced ProfilePage with simplified layout and better information hierarchy
- Updated App.jsx navigation system to support stats page routing
- Created `src/hooks/useObservationFilters.js` with memoized filter logic
- Added `src/components/FilterPanel.jsx` as standalone filter UI component
- Implemented `src/utils/observationUtils.js` for formatting and display helpers
- Added `src/utils/observationPermissions.js` for centralized access control
- Optimized filter performance with `useMemo` hooks
- Reduced code duplication by ~140+ lines through extraction
- Enhanced separation of concerns in StudentTimeline component

### Security
- Proper student name resolution from Firestore database
- Admin-only access to teacher activity analytics
- Secure data fetching with error handling and loading states

### Planned
- Further modularization: Dialog components extraction
- Data hooks creation (`useObservations`, `useStudentData`)
- Observation card component extraction
- Development toggle (phone/desktop/responsive views)
- Individual component responsiveness improvements
- Tag picker system for curriculum areas

## [1.4.0] - 2025-01-08

### Added
- Creator information displayed in observation detail modal
- Shows "Created by" field with teacher's Google display name
- New observations now store teacher name and email for better UX
- Comprehensive filtering system for student timeline observations
- Filter by date range (from/to dates) with date picker controls
- Filter by creator (teacher) with dropdown of all available creators
- Filter by observation type (voice/text notes)
- Combination filtering supporting multiple simultaneous criteria
- Filter toggle button with active filter indicator chip
- Clear all filters functionality with one-click reset
- Real-time filter results counter showing filtered observation count

### Changed
- Restricted observation editing and deleting to admin users only
- Teachers can no longer edit or delete any observations (admin-only permissions)
- Student timeline now displays filtered results instead of all observations
- Enhanced header with filter controls and result indicators

### Technical
- Added filter state management with date range, creator, and type filters
- Implemented real-time filtering with useEffect dependencies
- Added unique creator extraction from observation data
- Enhanced UI with collapsible filter panel using Material-UI components
- Improved user experience with filter persistence and visual feedback

### Security
- Centralized observation editing and deletion to admin users only
- Enhanced permission system for content moderation and oversight

## [1.3.1] - 2025-01-08

### Fixed
- Production deployment pipeline (GitHub Actions workflows)
- Blank production site due to missing Firebase environment variables
- Duplicate workflow runs from empty staging configuration file
- Firebase configuration not being available during production builds

### Changed
- Improved CI/CD workflow with GitHub secrets management for environment variables
- Updated deployment workflows to use repository secrets for Firebase configuration
- Cleaned up workflow files for single-run efficiency
- Established main branch as production deployment trigger

### Technical
- Added environment variable mapping in GitHub Actions workflows
- Configured VITE_FIREBASE_* secrets in repository settings
- Removed empty firebase-hosting-dev-staging.yml workflow file
- Enhanced deployment pipeline reliability and consistency

### Security
- Moved Firebase configuration from committed files to GitHub repository secrets
- Implemented proper environment variable management for production deployments
- Secured API keys and configuration through GitHub Actions secret store

## [1.3.0] - 2025-07-27

### Added
- Note editing functionality with role-based permissions
- Edit button in observation detail dialog
- Inline text editing with save/cancel actions
- Permission system: admins can edit any note, teachers can edit their own notes
- Real-time dialog updates after saving edits
- Edit metadata tracking (edit count and last edited timestamp)

### Changed
- Voice recording limit reduced from 30 seconds to 15 seconds
- Updated UI text and timer display to reflect new recording limit
- Improved user experience with instant feedback after editing

### Fixed
- Duplicate CircularProgress import error in StudentTimeline component
- Auto-refresh issue where edited content wasn't immediately visible in dialog
- Google Speech-to-Text API sync limit compatibility

### Technical
- Enhanced StudentTimeline component with edit functionality
- Added updateDoc and serverTimestamp imports from firebase/firestore
- Implemented permission checking logic (canEditObservation)
- Added TextField component for inline editing
- Real-time synchronization between Firestore updates and dialog state
- Optimized recording duration for Speech-to-Text API reliability

### Security
- Role-based access control for note editing
- Admin users can edit any observation note
- Teachers can only edit notes they created
- Secure Firestore updates with proper error handling

## [1.2.0] - 2025-07-27

### Added
- Note deletion functionality with role-based permissions
- Delete button in observation detail dialog
- Confirmation dialog for note deletion with preview
- Permission system: admins can delete any note, teachers can delete their own notes
- Visual feedback during deletion process

### Security
- Role-based access control for note deletion
- Admin users can delete any observation note
- Teachers can only delete notes they created
- Secure Firestore deletion with proper error handling

### Technical
- Enhanced StudentTimeline component with delete functionality
- Added deleteDoc import from firebase/firestore
- Implemented permission checking logic (canDeleteObservation)
- Added loading states and error handling for deletion
- Automatic timeline refresh after successful deletion

## [1.1.4] - 2025-07-27

### Fixed
- AddNoteModal centering issues on mobile and desktop
- Modal alignment now properly centered on all screen sizes
- Removed transform positioning that caused right-alignment
- Improved Dialog container styling for consistent centering

### Technical
- Updated Dialog PaperProps to use margin: auto for proper centering
- Added padding: 0 to Dialog container to prevent alignment interference
- Simplified modal positioning approach for better reliability

## [1.1.3] - 2025-07-27

### Fixed
- Sidebar menu popup positioning and backdrop behavior
- Menu overlay now properly covers content without interference
- Added shadow depth to sidebar for better visual separation

### Changed
- Removed User ID from profile page for privacy protection
- Improved sidebar menu z-index hierarchy and positioning

### Security
- User ID no longer publicly displayed in profile (internal use only)

## [1.1.2] - 2025-07-27

### Fixed
- Version management script bug showing incorrect old/new version numbers

### Technical
- Fixed version script logging to display correct version transitions

## [1.1.1] - 2025-07-27

### Added
- User profile page with Google profile photo and account details
- Profile navigation from hamburger menu
- Account verification status display
- Professional user information layout with role indicators

### Technical
- New ProfilePage component with mobile-first design
- Navigation system for menu item routing
- Integrated profile page into main app screen management

## [1.1.0] - 2025-07-27

### Added
- Mobile-first responsive design system
- Sticky header that remains anchored during scrolling
- Proper viewport handling for mobile devices
- Safe area support for devices with notches/home indicators
- Development-friendly positioning for desktop and mobile elements

### Fixed
- FAB button positioning (always visible, proper mobile/desktop behavior)
- Modal scrolling issues on mobile devices
- Version badge collision with FAB button
- AppHeader sticky positioning conflicts
- Desktop element positioning outside container bounds

### Changed
- Replaced hardcoded 375px container with responsive mobile-first layout
- Restructured authenticated app layout for better sticky header support
- Updated FAB to use fixed positioning on mobile, absolute on desktop
- Enhanced modal to be full-screen on mobile with proper scrolling
- Improved z-index hierarchy across all fixed elements

### Technical
- Replaced MUI AppBar with custom Box component for better sticky control
- Removed conflicting overflow properties that broke sticky positioning
- Added responsive breakpoints for mobile vs desktop behavior
- Implemented proper container structure for sticky elements

## [1.0.0] - 2025-07-20

### Added
- Initial release with core functionality
- Google Sign-in authentication
- Voice recording and transcription (≤30 seconds)
- Text note creation
- Firebase integration (Auth, Firestore)
- Basic admin panel structure
- Classroom and student management
- Student timeline view
- Mobile-optimized UI framework

### Features
- User authentication with domain validation (@pepschoolv2.com)
- Role-based access control (admin/teacher)
- Voice note recording with speech-to-text
- Multi-student note targeting
- Real-time data synchronization
- PWA-ready architecture

### Technical
- React + Vite frontend
- Firebase backend services
- Material-UI component system
- Google Speech-to-Text integration
- Responsive design foundation 
