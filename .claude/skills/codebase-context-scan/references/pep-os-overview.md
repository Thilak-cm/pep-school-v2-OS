# Pep OS Overview

Generated: 2026-05-08T16:53:08.258Z
App version: 10.17.2

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
| settings-feedback-shell | Settings, Feedback, and App Shell | Global navigation, profile/settings, feedback loops, and version/update surfaces. | `montessori-os/src/App.jsx`<br>`montessori-os/src/AppFooter.jsx`<br>`montessori-os/src/components/SettingsPage.jsx`<br>`montessori-os/src/components/ProfilePage.jsx`<br>`montessori-os/src/components/FeedbackPage.jsx`<br>`montessori-os/src/components/UpdateNotification.jsx` |

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
- Count: 29
- Components: `App`, `AppFooter`, `BaseballCardBody`, `BulkUploadPage`, `BulkUploadPage.helpers`, `BulkUploadPage.test`, `ClassroomNoteCard`, `ClassroomStudentCard`, `CopyToClipboardButton`, `deadCodeRemoval.pep115.test`, `FeedbackPage`, `GroupedNoteCard`, `GroupedNoteDialog`, `InterviewsPage`, `InterviewsPage.helpers`, `InterviewsPage.test`, `LandingPage`, `LandingPage.test`, `NoteBottomSheet.structure.test`, `ProfilePage`, `ReportGenerateDialog`, `ReportPreviewDialog`, `ReportsCard`, `ReportsPage`, `ReportsPage.test`, `ReviewClassroomNotes`, `SettingsPage`, `SettingsPage.test`, `VersionBadge`
- Representative paths:
- `montessori-os/src/App.jsx`
- `montessori-os/src/AppFooter.jsx`
- `montessori-os/src/components/BaseballCardBody.jsx`
- `montessori-os/src/components/BulkUploadPage.jsx`
- `montessori-os/src/components/BulkUploadPage.helpers.js`
- `montessori-os/src/components/BulkUploadPage.test.js`
- `montessori-os/src/components/ClassroomNoteCard.jsx`
- `montessori-os/src/components/ClassroomStudentCard.jsx`

## Existing UX Patterns

- Mobile-first navigation with header/back handling plus bottom app footer navigation.
- Quick capture pattern: floating action (`AddNoteFab`) opens modal (`AddNoteModal`) and branches into text/voice/lesson/media flows.
- Timeline-first review model with filters and expansion dialogs for note details/media context.
- MUI-centered component system for cards, dialogs, chips, selectors, and status indicators.
- Voice input support exists in both note capture (`VoiceRecorder`) and AI tooling flows.

## Firestore/Data Surface

- Core collections/signals: `users`, `branches`, `programs`, `classrooms`, `students`, `observations`, `media`, `ai_summaries`, `config`, `feedback`, `placements`, `chats`, `messages`, `history`, `interviews`, `testbench`
- Rule-declared paths:
- `/{document=**}`
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
- `/students/{studentId}`
- `/testbench/{runId}`
- `/users/{uid}`
- `/{path=**}/ai_summaries/{summaryId}`
- `/{path=**}/media/{mediaId}`
- `/{path=**}/observations/{observationId}`

## Recent Changes

### 10.17.2 (2026-05-08)
- Chat IDOR: `childChatStream` and `childChat` now verify classroom scope for classroomadmins and teachers before granting access (PEP-90)
- CORS: replaced wildcard `Access-Control-Allow-Origin: *` with explicit origin allowlist and `Vary: Origin` header (PEP-90)
- Firestore rules: teachers can only read classrooms, students, observations, media, chats, and interviews in their assigned classrooms (PEP-90)

### 10.17.1 (2026-05-08)
- Redesigned Settings page as card-of-cards layout with inline profile hero, mini stats row, and role-gated admin tools (PEP-199)
- Notes-this-week stat counts both observations and media uploads via parallel collection group queries (PEP-199)

### 10.17.0 (2026-05-07)
- Cold-start interview: first question displayed instantly from pre-generated open questions bank — no LLM call, zero latency (PEP-208)
- Visible elapsed timer during interview sessions with warning at 10 minutes (PEP-208)
- LLM-driven interview termination: model returns `interviewComplete` flag with closing remarks when it decides the interview has covered enough ground (PEP-208)

### 10.16.6 (2026-05-07)
- Redesigned note expansion as bottom sheet with type-specific layouts replacing NoteExpansionDialog (PEP-194)
- Unified media preview into the bottom sheet for both ClassroomTimeline and StudentTimeline
- Type chip in header uses shared TONE_STYLES from extracted toneStyles.js module

