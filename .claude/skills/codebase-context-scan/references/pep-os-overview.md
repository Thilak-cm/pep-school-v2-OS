# Pep OS Overview

Generated: 2026-07-23T22:30:29.822Z
App version: 11.6.1

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
- Count: 47
- Components: `App`, `AppFooter`, `AppHeader`, `BroadcastComposer`, `BroadcastComposer.test`, `BulkUploadPage`, `BulkUploadPage.helpers`, `BulkUploadPage.test`, `ClassroomNoteCard`, `ClassroomStudentCard`, `CopyToClipboardButton`, `DynamicIslandPill`, `DynamicIslandPill.test`, `FeedbackPage`, `GroupedNoteCard`, `GroupedNoteDialog`, `InlineVoiceOverlay`, `InterviewsPage`, `InterviewsPage.helpers`, `InterviewsPage.test`, `LandingPage`, `LandingPage.test`, `MonthlyPlanTab`, `MonthlyPlanTab.test`, `NoteBottomSheet.structure.test`, `NotesOverTimeDrawer`, `PlanFeedbackDialog`, `PlanFeedbackDialog.test`, `ProfilePage`, `QuestionDeck`, `QuestionDeck.test`, `ReadinessCheckDialog`, `ReportGenerateDialog`, `ReportPreviewDialog`, `ReportsCard`, `ReportsPage`, `ReportsPage.test`, `ReportTypeLandingPage`, `ReportTypeLandingPage.test`, `ReviewClassroomNotes`, `SettingsPage`, `SettingsPage.test`, `SnapshotBody`, `SnapshotCard`, `VersionBadge`, `WritingAnalysisTab`, `WritingAnalysisTab.test`
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

- Core collections/signals: `users`, `branches`, `programs`, `classrooms`, `students`, `observations`, `media`, `ai_summaries`, `config`, `feedback`, `placements`, `chats`, `messages`, `access`, `alerts`, `digests`, `history`, `interviews`, `monthly_plan_feedback`, `runs`, `statsCache`, `testbench`
- Rule-declared paths:
- `/{document=**}`
- `/access/{uid}`
- `/ai_summaries/{summaryId}`
- `/alerts/{alertId}`
- `/branches/{branchId}`
- `/chats/{chatId}`
- `/classrooms/{classroomId}`
- `/config/{docId}`
- `/digests/{digestId}`
- `/feedback/{feedbackId}`
- `/history/{historyId}`
- `/history/{weekKey}`
- `/interviews/{interviewId}`
- `/media/{mediaId}`
- `/messages/{messageId}`
- `/monthly_plan_feedback/{feedbackId}`
- `/observations/{observationId}`
- `/placements/{placementId}`
- `/programs/{programId}`
- `/runs/{runId}`
- `/statsCache/{docId}`
- `/students/{studentId}`
- `/testbench/settings`
- `/users/{uid}`
- `/{path=**}/ai_summaries/{summaryId}`
- `/{path=**}/media/{mediaId}`
- `/{path=**}/observations/{observationId}`
- `/classrooms/_digest_all/digests/{digestId}`
- `/classrooms/_digest_all/digests/{digestId}/history/{weekKey}`

## Recent Changes

### 11.6.1 (2026-07-23)
- Open questions archival: previous question set automatically snapshot to `history/` subcollection before each monthly regeneration overwrites the doc (#215)
- Version-gated saves: teachers answering open questions from a stale doc get an error toast and auto-refresh instead of silently writing to the wrong generation (#215)
- MCP tool support for querying open questions history via `get_ai_summary_history` (#215)

### 11.6.0 (2026-07-23)
- Multi-POV answers on Question Deck - all teachers can now answer the same open question, with per-teacher CTA states (pending, others-answered, self-answered) and collapsible answer list (#216)
- Area accordion sorting by progress ratio (most answered first), then alphabetically (#216)
- Month subtitle derived from doc's `updatedAt` on Question Deck header (#216)

### 11.5.0 (2026-07-22)
- Soul generation refactored from single-CF `runWithConcurrency` to Pub/Sub dispatcher-worker fan-out - handles ~1,500 students without timeout (#203)
- `regenerateSoulsMonthly` now dispatches to `soulWorker` via `soul-workers` Pub/Sub topic in waves of 25 batches (10 students each) with 90s jitter gap (#203)
- Soul gen LLM calls migrated from OpenAI direct to OpenRouter (#203)

### 11.4.0 (2026-07-16)
- Question Deck screen accessible from student dashboard - shows AI-generated open questions organized by area with accordion layout, answer progress, and "Coach Pepper is curious about" subtitle (#144)
- Voice answer flow: tap "Answer" to open AddNoteModal with locked student and question context, saves observation linked to the question (#144)
- Manual "Mark as answered" with confirmation dialog (#144)

