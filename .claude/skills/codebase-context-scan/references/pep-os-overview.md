# Pep OS Overview

Generated: 2026-05-21T20:10:00.000Z
App version: 10.26.0

## App Snapshot

- Mobile-first web app for Montessori classrooms (repo root package: `pep-os`, app package: `montessori-os`).
- Frontend stack: React 19.1.0, MUI 7.2.0, Firebase 11.10.0, Vite 6.0.0.
- Product focus: fast classroom note capture, timeline review, analytics, and AI-assisted educator workflows.

## Roles

| Role | Primary Capabilities |
| --- | --- |
| Teacher | Create observations and lesson notes for assigned classrooms, view timelines/dashboards, submit feedback. |
| Classroom Admin | Manage teacher/student operations within manageable classrooms, review stats/timelines, operate Users & Access for teachers. |
| Super Admin | Full workspace control: user roles, classroom/branch/program/config management, AI tool configuration, and global analytics. |

## Area Map

| area_tag | area_name | intent | key_paths |
| --- | --- | --- | --- |
| observation-capture | Observation Capture | Teachers capture text, voice, lesson, and media observations with low-friction mobile flows. | `montessori-os/src/components/AddNoteFab.jsx`<br>`montessori-os/src/components/AddNoteModal.jsx`<br>`montessori-os/src/components/LessonNotesPage.jsx`<br>`montessori-os/src/components/LessonNotes.jsx`<br>`montessori-os/src/VoiceRecorder.jsx`<br>`montessori-os/src/components/MentionTextArea.jsx`<br>`montessori-os/src/components/ClassroomStudentPicker.jsx` |
| timelines-and-media | Timelines and Media | Student and classroom timelines surface text/voice/lesson/media events with filtering and expansion flows. | `montessori-os/src/components/StudentTimeline.jsx`<br>`montessori-os/src/components/ClassroomTimeline.jsx`<br>`montessori-os/src/components/FilterPanel.jsx`<br>`montessori-os/src/components/StudentDashboard.jsx`<br>`montessori-os/src/components/StudentStatsPage.jsx` |
| analytics-and-notifications | Analytics and Notifications | Stats, performance cards, and escalation notifications highlight behavior/engagement patterns. | `montessori-os/src/components/StatsPage.jsx`<br>`montessori-os/src/components/NotificationsPage.jsx`<br>`montessori-os/src/components/PerformanceSummaryCard.jsx`<br>`montessori-os/src/components/BaseballCardSnapshotCard.jsx`<br>`montessori-os/src/notifications/NotificationStack.jsx` |
| ai-tools-and-chat | AI Tools and Chat | Admin-configurable AI prompts and teacher-facing copilots (cleanup, transcriber, coach, chat). | `montessori-os/src/components/AIHomePage.jsx`<br>`montessori-os/src/components/AITextCleanupEditor.jsx`<br>`montessori-os/src/components/AIVoiceTranscriberEditor.jsx`<br>`montessori-os/src/components/AICoachEditor.jsx`<br>`montessori-os/src/components/ChatCommandCentreEditor.jsx`<br>`montessori-os/src/components/ChildChat.jsx`<br>`montessori-os/src/services/promptProvider.js` |
| admin-and-access | Admin and Access | Role-aware access, user management, classroom operations, aliases, and graduation workflows. | `montessori-os/src/components/UsersAccessPage.jsx`<br>`montessori-os/src/components/GraduateStudentsPage.jsx`<br>`montessori-os/src/components/StudentAliasesPage.jsx`<br>`montessori-os/src/components/ConfigHomePage.jsx`<br>`montessori-os/src/components/LessonNoteConfigEditor.jsx`<br>`montessori-os/src/utils/roleUtils.js`<br>`firestore.rules` |
| settings-feedback-shell | Settings, Feedback, and App Shell | Global navigation, profile/settings, feedback loops, and version/update surfaces. | `montessori-os/src/App.jsx`<br>`montessori-os/src/AppHeader.jsx`<br>`montessori-os/src/AppFooter.jsx`<br>`montessori-os/src/components/SettingsPage.jsx`<br>`montessori-os/src/components/ProfilePage.jsx`<br>`montessori-os/src/components/FeedbackPage.jsx`<br>`montessori-os/src/components/UpdateNotification.jsx` |

## Existing Pages and Components

### Observation Capture (`observation-capture`)
- Count: 10
- Components: `AddNoteFab`, `AddNoteFab.test`, `AddNoteModal`, `ClassroomStudentPicker`, `LessonNoteConfigEditor`, `LessonNotes`, `LessonNotesPage`, `LessonNoteTagDialog`, `MentionTextArea`, `VoiceRecorder`
- Representative paths:
- `montessori-os/src/components/AddNoteFab.jsx`
- `montessori-os/src/components/AddNoteFab.test.js`
- `montessori-os/src/components/AddNoteModal.jsx`
- `montessori-os/src/components/ClassroomStudentPicker.jsx`
- `montessori-os/src/components/LessonNoteConfigEditor.jsx`
- `montessori-os/src/components/LessonNotes.jsx`
- `montessori-os/src/components/LessonNotesPage.jsx`
- `montessori-os/src/components/LessonNoteTagDialog.jsx`

### Timelines and Media (`timelines-and-media`)
- Count: 12
- Components: `ClassroomList`, `ClassroomTimeline`, `ClassroomTimeline.pagination.test`, `classroomTimelineUtils`, `classroomTimelineUtils.extraction.test`, `ExportWizard`, `FeedbackTimeline`, `FilterPanel`, `StudentDashboard`, `StudentStatsPage`, `StudentTimeline`, `StudentTimeline.reassignCleanup.test`
- Representative paths:
- `montessori-os/src/components/ClassroomList.jsx`
- `montessori-os/src/components/ClassroomTimeline.jsx`
- `montessori-os/src/components/ClassroomTimeline.pagination.test.js`
- `montessori-os/src/components/classroomTimelineUtils.js`
- `montessori-os/src/components/classroomTimelineUtils.extraction.test.js`
- `montessori-os/src/components/ExportWizard.jsx`
- `montessori-os/src/components/FeedbackTimeline.jsx`
- `montessori-os/src/components/FilterPanel.jsx`

### Analytics and Notifications (`analytics-and-notifications`)
- Count: 7
- Components: `BaseballCardSnapshotCard`, `NewFeaturePill`, `NotificationsPage`, `PerformanceSummaryCard`, `StatsPage`, `StatsPage.noteTypes.test`, `UpdateNotification`
- Representative paths:
- `montessori-os/src/components/BaseballCardSnapshotCard.jsx`
- `montessori-os/src/components/NewFeaturePill.jsx`
- `montessori-os/src/components/NotificationsPage.jsx`
- `montessori-os/src/components/PerformanceSummaryCard.jsx`
- `montessori-os/src/components/StatsPage.jsx`
- `montessori-os/src/components/StatsPage.noteTypes.test.js`
- `montessori-os/src/components/UpdateNotification.jsx`

### AI Tools and Chat (`ai-tools-and-chat`)
- Count: 6
- Components: `AICoachEditor`, `AIHomePage`, `AITextCleanupEditor`, `AIVoiceTranscriberEditor`, `ChatCommandCentreEditor`, `ChildChat`
- Representative paths:
- `montessori-os/src/components/AICoachEditor.jsx`
- `montessori-os/src/components/AIHomePage.jsx`
- `montessori-os/src/components/AITextCleanupEditor.jsx`
- `montessori-os/src/components/AIVoiceTranscriberEditor.jsx`
- `montessori-os/src/components/ChatCommandCentreEditor.jsx`
- `montessori-os/src/components/ChildChat.jsx`

### Admin and Access (`admin-and-access`)
- Count: 8
- Components: `AccessDenied`, `BaseballCardConfigEditor`, `ConfigHomePage`, `GraduateStudentsPage`, `ReportGenConfigEditor`, `SignIn`, `StudentAliasesPage`, `UsersAccessPage`
- Representative paths:
- `montessori-os/src/AccessDenied.jsx`
- `montessori-os/src/components/BaseballCardConfigEditor.jsx`
- `montessori-os/src/components/ConfigHomePage.jsx`
- `montessori-os/src/components/GraduateStudentsPage.jsx`
- `montessori-os/src/components/ReportGenConfigEditor.jsx`
- `montessori-os/src/SignIn.jsx`
- `montessori-os/src/components/StudentAliasesPage.jsx`
- `montessori-os/src/components/UsersAccessPage.jsx`

### Settings, Feedback, and App Shell (`settings-feedback-shell`)
- Count: 31
- Components: `App`, `AppFooter`, `AppHeader`, `BaseballCardBody`, `BulkUploadPage`, `BulkUploadPage.helpers`, `BulkUploadPage.test`, `ClassroomNoteCard`, `ClassroomStudentCard`, `CopyToClipboardButton`, `deadCodeRemoval.pep115.test`, `FeedbackPage`, `GroupedNoteCard`, `GroupedNoteDialog`, `InterviewsPage`, `InterviewsPage.helpers`, `InterviewsPage.test`, `LandingPage`, `LandingPage.test`, `NoteBottomSheet.structure.test`, `ProfilePage`, `ReadinessCheckDialog`, `ReportGenerateDialog`, `ReportPreviewDialog`, `ReportsCard`, `ReportsPage`, `ReportsPage.test`, `ReviewClassroomNotes`, `SettingsPage`, `SettingsPage.test`, `VersionBadge`
- Representative paths:
- `montessori-os/src/App.jsx`
- `montessori-os/src/AppFooter.jsx`
- `montessori-os/src/AppHeader.jsx`
- `montessori-os/src/components/BaseballCardBody.jsx`
- `montessori-os/src/components/BulkUploadPage.jsx`
- `montessori-os/src/components/BulkUploadPage.helpers.js`
- `montessori-os/src/components/BulkUploadPage.test.js`
- `montessori-os/src/components/ClassroomNoteCard.jsx`

## Existing UX Patterns

- Mobile-first navigation with header/back handling plus bottom app footer navigation.
- Quick capture pattern: floating action (`AddNoteFab`) opens modal (`AddNoteModal`) and branches into text/voice/lesson/media flows.
- Timeline-first review model with filters and expansion dialogs for note details/media context.
- MUI-centered component system for cards, dialogs, chips, selectors, and status indicators.
- Voice input support exists in both note capture (`VoiceRecorder`) and AI tooling flows.

## Firestore/Data Surface

- Core collections/signals: `users`, `branches`, `programs`, `classrooms`, `students`, `observations`, `media`, `ai_summaries`, `config`, `feedback`, `placements`, `chats`, `messages`, `access`, `history`, `interviews`, `runs`, `testbench`
- Rule-declared paths:
- `/{document=**}`
- `/access/{uid}`
- `/ai_summaries/{summaryId}`
- `/branches/{branchId}`
- `/chats/{chatId}`
- `/classrooms/{classroomId}`
- `/config/{docId}`
- `/feedback/{feedbackId}`
- `/history/{historyId}`
- `/interviews/{interviewId}`
- `/media/{mediaId}`
- `/messages/{messageId}`
- `/observations/{observationId}`
- `/placements/{placementId}`
- `/programs/{programId}`
- `/runs/{runId}`
- `/students/{studentId}`
- `/testbench/settings`
- `/users/{uid}`
- `/{path=**}/ai_summaries/{summaryId}`
- `/{path=**}/media/{mediaId}`
- `/{path=**}/observations/{observationId}`

## Recent Changes

### 10.26.0 (2026-05-21)
- Parent contact fields on student documents — parent1 (name + email required on creation), parent2 (optional), with email validation (PEP-247)
- Student creation integrated into Add Users form with role tab selector (PEP-247)
- Parent contact fields visible in student edit dialog and read-only view (PEP-247)
- Guardian-to-parent migration script for existing student records (PEP-247)
- Writing snapshot tab wired to real `writing_analysis` data — fetches doc, renders narrative with loading/empty/error states (PEP-256)
- Handwriting samples gallery on writing tab — toolbar chip with sample count, lazy-loaded grid dialog, NoteBottomSheet lightbox with carousel (PEP-256)
- Weekly snapshot empty state now shows consistent centered card for both "no data" and "no notes" cases (PEP-256)

### 10.25.1 (2026-05-21)
- Author-can-read-own rule on collection group queries for observations and media — fixes SettingsPage permissions for teachers with transferred students (PEP-255)

### 10.25.0 (2026-05-21)
- Handwriting image gallery with horizontal thumbnail carousel and lightbox in Handwriting Workbench (PEP-241)
- Weekly/Writing snapshot tabs on student dashboard with tab switching (PEP-242)
- Renamed BaseballCardSnapshotCard/Body to SnapshotCard/SnapshotBody (PEP-242)
- StudentPicker upgrade with pinned defaults and free-text search (PEP-241)
- Batched URL resolution with concurrency-limited download URL fetching (PEP-241)

### 10.24.1 (2026-05-20)
- Collection group security rules for observations and media check student's current classroom instead of observation's classroomId — fixes teacher reads for transferred students (PEP-251)
- ClassroomStudentCard note counts use batched getCountFromServer queries via useStudentNoteCounts hook (PEP-251)
- Classroom chips in manage-users dialogs grouped by branch and program hierarchy (PEP-251)

### 10.24.0 (2026-05-16)
- Monthly Plan feature in prompt testbench — generates structured monthly action plans per student across Language, Sensorial, Math, and Practical Life (PEP-235)
- Writing analysis prerequisite dialog — prompts generation when missing before plan creation (PEP-235)
- Media observations included in monthly plan prompt inputs alongside text, voice, and lesson observations (PEP-235)

### 10.23.0 (2026-05-15)
- Teacher Pick exploration mode in Interview Workbench — teachers choose 2 of 4 randomly drawn areas to direct the interview (PEP-220)
- Area filtering forwarded to Cloud Function on every turn — only selected areas' open questions are sent to the LLM, tightening the question bank for the entire session (PEP-220)
- Pipeline visualization shows filtered area count and names when area selection is active (PEP-220)

### 10.22.0 (2026-05-15)
- Proactive soul generation dialog in InterviewWorkbench — prompts teachers to generate missing soul/open_questions before starting an interview (PEP-222)
- Classroom-scoped student picker — teachers see only students from their assigned classrooms, classroom admins see their manageable classrooms (PEP-222)
- Classroom-level access check in `generateStudentProfile` Cloud Function — defense-in-depth enforcement beyond client-side filtering (PEP-222)

### 10.21.0 (2026-05-15)
- Superadmin access control panel for the test bench — grant specific teachers access to specific features with per-feature chip toggles and a searchable user picker (PEP-224)
- Teachers and classroom admins with testbench_access grants can now use the test bench for their allowed features (PEP-224)
- New `testbench_access/{uid}` Firestore collection for per-teacher feature grants (PEP-224)

