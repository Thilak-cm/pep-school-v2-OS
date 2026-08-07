# Pep OS Overview

Generated: 2026-08-07T01:41:11.896Z
App version: 12.2.2

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
| timelines-and-media | Timelines and Media | Student and classroom timelines surface text/voice/lesson/media events with filtering and expansion flows. | `montessori-os/src/components/StudentTimeline.jsx`<br>`montessori-os/src/components/ClassroomTimeline.jsx`<br>`montessori-os/src/components/FilterPanel.jsx`<br>`montessori-os/src/components/StudentDashboard.jsx` |
| analytics-and-notifications | Analytics and Notifications | Stats, performance cards, and escalation notifications highlight behavior/engagement patterns. | `montessori-os/src/components/StatsPage.jsx`<br>`montessori-os/src/components/NotificationsPage.jsx`<br>`montessori-os/src/components/PerformanceSummaryCard.jsx`<br>`montessori-os/src/notifications/NotificationStack.jsx` |
| ai-tools-and-chat | AI Tools and Chat | Admin-configurable AI prompts and teacher-facing copilots (cleanup, transcriber, coach, chat). | `montessori-os/src/components/AIHomePage.jsx`<br>`montessori-os/src/components/AITextCleanupEditor.jsx`<br>`montessori-os/src/components/AIVoiceTranscriberEditor.jsx`<br>`montessori-os/src/components/AICoachEditor.jsx`<br>`montessori-os/src/components/ChatCommandCentreEditor.jsx`<br>`montessori-os/src/components/ChildChat.jsx`<br>`montessori-os/src/services/promptProvider.js` |
| admin-and-access | Admin and Access | Role-aware access, user management, classroom operations, aliases, and graduation workflows. | `montessori-os/src/components/UsersAccessPage.jsx`<br>`montessori-os/src/components/GraduateStudentsPage.jsx`<br>`montessori-os/src/components/StudentAliasesPage.jsx`<br>`montessori-os/src/components/ConfigHomePage.jsx`<br>`montessori-os/src/components/LessonNoteConfigEditor.jsx`<br>`montessori-os/src/utils/roleUtils.js`<br>`firestore.rules` |
| settings-feedback-shell | Settings, Feedback, and App Shell | Global navigation, profile/settings, feedback loops, and version/update surfaces. | `montessori-os/src/App.jsx`<br>`montessori-os/src/AppHeader.jsx`<br>`montessori-os/src/AppFooter.jsx`<br>`montessori-os/src/components/SettingsPage.jsx`<br>`montessori-os/src/components/ProfilePage.jsx`<br>`montessori-os/src/components/FeedbackPage.jsx`<br>`montessori-os/src/components/UpdateNotification.jsx` |

## Existing Pages and Components

### Observation Capture (`observation-capture`)
- Count: 14
- Components: `AddNoteFab`, `AddNoteFab.test`, `AddNoteModal`, `AddNoteModal.photoUX.test`, `AddNoteModal.saveButton.test`, `AddNoteModal.syncSave.test`, `AddNoteModal.versionGate.test`, `ClassroomStudentPicker`, `LessonNoteConfigEditor`, `LessonNotes`, `LessonNotesPage`, `LessonNoteTagDialog`, `MentionTextArea`, `VoiceRecorder`
- Representative paths:
- `montessori-os/src/components/AddNoteFab.jsx`
- `montessori-os/src/components/AddNoteFab.test.js`
- `montessori-os/src/components/AddNoteModal.jsx`
- `montessori-os/src/components/AddNoteModal.photoUX.test.js`
- `montessori-os/src/components/AddNoteModal.saveButton.test.js`
- `montessori-os/src/components/AddNoteModal.syncSave.test.js`
- `montessori-os/src/components/AddNoteModal.versionGate.test.js`
- `montessori-os/src/components/ClassroomStudentPicker.jsx`

### Timelines and Media (`timelines-and-media`)
- Count: 10
- Components: `ClassroomList`, `ClassroomTimeline`, `classroomTimelineUtils`, `classroomTimelineUtils.extraction.test`, `ExportWizard`, `FeedbackTimeline`, `FilterPanel`, `StudentDashboard`, `StudentDashboard.test`, `StudentTimeline`
- Representative paths:
- `montessori-os/src/components/ClassroomList.jsx`
- `montessori-os/src/components/ClassroomTimeline.jsx`
- `montessori-os/src/components/classroomTimelineUtils.js`
- `montessori-os/src/components/classroomTimelineUtils.extraction.test.js`
- `montessori-os/src/components/ExportWizard.jsx`
- `montessori-os/src/components/FeedbackTimeline.jsx`
- `montessori-os/src/components/FilterPanel.jsx`
- `montessori-os/src/components/StudentDashboard.jsx`

### Analytics and Notifications (`analytics-and-notifications`)
- Count: 7
- Components: `NewFeaturePill`, `NotificationsPage`, `NotificationsPage.heatmap.test`, `PerformanceSummaryCard`, `StatsPage`, `StatsPage.noteTypes.test`, `UpdateNotification`
- Representative paths:
- `montessori-os/src/components/NewFeaturePill.jsx`
- `montessori-os/src/components/NotificationsPage.jsx`
- `montessori-os/src/components/NotificationsPage.heatmap.test.js`
- `montessori-os/src/components/PerformanceSummaryCard.jsx`
- `montessori-os/src/components/StatsPage.jsx`
- `montessori-os/src/components/StatsPage.noteTypes.test.js`
- `montessori-os/src/components/UpdateNotification.jsx`

### AI Tools and Chat (`ai-tools-and-chat`)
- Count: 11
- Components: `AICoachEditor`, `AIHomePage`, `AITextCleanupEditor`, `AIVoiceTranscriberEditor`, `ChatCommandCentreEditor`, `ChatCommandCentreEditor.test`, `chatCommandCentreTools`, `chatCommandCentreTools.test`, `ChildChat`, `ChildChat.layout.test`, `ChildChat.test`
- Representative paths:
- `montessori-os/src/components/AICoachEditor.jsx`
- `montessori-os/src/components/AIHomePage.jsx`
- `montessori-os/src/components/AITextCleanupEditor.jsx`
- `montessori-os/src/components/AIVoiceTranscriberEditor.jsx`
- `montessori-os/src/components/ChatCommandCentreEditor.jsx`
- `montessori-os/src/components/ChatCommandCentreEditor.test.js`
- `montessori-os/src/components/chatCommandCentreTools.js`
- `montessori-os/src/components/chatCommandCentreTools.test.js`

### Admin and Access (`admin-and-access`)
- Count: 11
- Components: `AccessDenied`, `BaseballCardConfigEditor`, `ConfigHomePage`, `GraduateStudentsPage`, `ReportGenConfigEditor`, `SignIn`, `StudentAliasesPage`, `UsersAccessPage`, `UsersAccessPage.parentFields.test`, `UsersAccessPage.validation`, `WeeklyDigestConfigEditor`
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
- Count: 49
- Components: `App`, `AppFooter`, `AppHeader`, `BroadcastComposer`, `BroadcastComposer.test`, `BulkUploadPage`, `BulkUploadPage.helpers`, `BulkUploadPage.test`, `ChatMaintenance`, `ChatMaintenance.test`, `ClassroomNoteCard`, `ClassroomStudentCard`, `CopyToClipboardButton`, `DynamicIslandPill`, `DynamicIslandPill.test`, `FeedbackPage`, `GroupedNoteCard`, `GroupedNoteDialog`, `InlineVoiceOverlay`, `InterviewsPage`, `InterviewsPage.helpers`, `InterviewsPage.test`, `LandingPage`, `LandingPage.test`, `MonthlyPlanTab`, `MonthlyPlanTab.test`, `NoteBottomSheet.structure.test`, `NotesOverTimeDrawer`, `PlanFeedbackDialog`, `PlanFeedbackDialog.test`, `ProfilePage`, `QuestionDeck`, `QuestionDeck.test`, `ReadinessCheckDialog`, `ReportGenerateDialog`, `ReportPreviewDialog`, `ReportsCard`, `ReportsPage`, `ReportsPage.test`, `ReportTypeLandingPage`, `ReportTypeLandingPage.test`, `ReviewClassroomNotes`, `SettingsPage`, `SettingsPage.test`, `SnapshotBody`, `SnapshotCard`, `VersionBadge`, `WritingAnalysisTab`, `WritingAnalysisTab.test`
- Representative paths:
- `montessori-os/src/App.jsx`
- `montessori-os/src/AppFooter.jsx`
- `montessori-os/src/AppHeader.jsx`
- `montessori-os/src/components/BroadcastComposer.jsx`
- `montessori-os/src/components/BroadcastComposer.test.js`
- `montessori-os/src/components/BulkUploadPage.jsx`
- `montessori-os/src/components/BulkUploadPage.helpers.js`
- `montessori-os/src/components/BulkUploadPage.test.js`

## Existing UX Patterns

- Mobile-first navigation with header/back handling plus bottom app footer navigation.
- Quick capture pattern: floating action (`AddNoteFab`) opens modal (`AddNoteModal`) and branches into text/voice/lesson/media flows.
- Timeline-first review model with filters and expansion dialogs for note details/media context.
- MUI-centered component system for cards, dialogs, chips, selectors, and status indicators.
- Voice input support exists in both note capture (`VoiceRecorder`) and AI tooling flows.

## Firestore/Data Surface

- Core collections/signals: `users`, `branches`, `programs`, `classrooms`, `students`, `observations`, `ai_summaries`, `config`, `feedback`, `placements`, `chats`, `messages`, `access`, `alerts`, `brain`, `digests`, `files`, `history`, `interviews`, `monthly_plan_feedback`, `runs`, `statsCache`, `testbench`, `turns`
- Rule-declared paths:
- `/{document=**}`
- `/access/{uid}`
- `/ai_summaries/{summaryId}`
- `/alerts/{alertId}`
- `/brain/{program}`
- `/branches/{branchId}`
- `/chats/{chatId}`
- `/classrooms/{classroomId}`
- `/config/{docId}`
- `/digests/{digestId}`
- `/feedback/{feedbackId}`
- `/files/{fileId}`
- `/history/{historyId}`
- `/history/{weekKey}`
- `/interviews/{interviewId}`
- `/messages/{messageId}`
- `/monthly_plan_feedback/{feedbackId}`
- `/observations/{observationId}`
- `/placements/{placementId}`
- `/programs/{programId}`
- `/runs/{runId}`
- `/statsCache/{docId}`
- `/students/{studentId}`
- `/testbench/settings`
- `/turns/{turnId}`
- `/users/{uid}`
- `/{path=**}/ai_summaries/{summaryId}`
- `/{path=**}/observations/{observationId}`
- `/classrooms/_digest_all/digests/{digestId}`
- `/classrooms/_digest_all/digests/{digestId}/history/{weekKey}`

## Recent Changes

### 12.2.2 (2026-08-06)
- Coach Pepper chat now gives clearer startup guidance, teacher-friendly tool progress, smoother streamed responses, and standard Markdown list-formatting guidance.
- Empty-chat cleanup now revalidates candidates transactionally before deletion, and chat streaming/persistence edge cases have expanded test coverage.

### 12.2.1 (2026-08-06)
- Coach Pepper chat now uses a bounded phone-sized conversation viewport with a connected session selector, safe Markdown rendering, reliable follow-mode scrolling, and composer behavior that stays editable during streaming (#217).
- User timestamps and copy actions, plus completed assistant copy and Helpful actions, remain permanently visible without hover or touch reveal (#217).
- Conversation controls, messages, errors, and the composer remain correctly separated across safe-area, virtual-keyboard, dropdown, retry, and streaming-scroll states (#217).

### 12.2.0 (2026-08-06)
- Emulator-based Firestore and Storage rules suite with canonical fixtures, shared production operation helpers, transfer lifecycle coverage, media Storage boundaries, and CI gating for security-rule regressions (#207).
- Classroom directory, Firestore auth-boundary, and precise 48-hour edit/delete boundary coverage in the rules emulator suite (#207).
- Coach Pepper now streams responses progressively through a durable, server-orchestrated chat session (#220).

### 12.1.0 (2026-07-23)
- Timeline pagination: classroom and student timelines now load 20 notes at a time with cursor-based "Show More" instead of fetching all notes at once (#221)
- Timeline stats (notes overall, 7-day count, student count) now read from statsCache instead of being derived from loaded notes (#221)
- Media observations merged into unified `observations` subcollection - single sorted stream replaces the previous two-collection k-way merge (#221)
