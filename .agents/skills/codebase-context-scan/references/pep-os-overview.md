# Pep OS Overview

Generated: 2026-08-31T22:54:36.458Z
App version: 13.1.0

## App Snapshot

- Mobile-first web app for Montessori classrooms (repo root package: `pep-os`, app package: `montessori-os`).
- Frontend stack: React 19.1.0, MUI 7.3.0, Firebase 11.10.0, Vite 6.0.0.
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
- Count: 15
- Components: `AddNoteFab`, `AddNoteFab.test`, `AddNoteModal`, `AddNoteModal.photoEditor.test`, `AddNoteModal.photoUX.test`, `AddNoteModal.saveButton.test`, `AddNoteModal.syncSave.test`, `AddNoteModal.versionGate.test`, `ClassroomStudentPicker`, `LessonNoteConfigEditor`, `LessonNotes`, `LessonNotesPage`, `LessonNoteTagDialog`, `MentionTextArea`, `VoiceRecorder`
- Representative paths:
- `montessori-os/src/components/AddNoteFab.jsx`
- `montessori-os/src/components/AddNoteFab.test.js`
- `montessori-os/src/components/AddNoteModal.jsx`
- `montessori-os/src/components/AddNoteModal.photoEditor.test.js`
- `montessori-os/src/components/AddNoteModal.photoUX.test.js`
- `montessori-os/src/components/AddNoteModal.saveButton.test.js`
- `montessori-os/src/components/AddNoteModal.syncSave.test.js`
- `montessori-os/src/components/AddNoteModal.versionGate.test.js`

### Timelines and Media (`timelines-and-media`)
- Count: 13
- Components: `ClassroomList`, `ClassroomTimeline`, `ClassroomTimeline.batchMedia.test`, `ClassroomTimeline.interactions.test`, `classroomTimelineUtils`, `classroomTimelineUtils.extraction.test`, `ExportWizard`, `FeedbackTimeline`, `FilterPanel`, `StudentDashboard`, `StudentDashboard.test`, `StudentTimeline`, `StudentTimeline.batchMedia.test`
- Representative paths:
- `montessori-os/src/components/ClassroomList.jsx`
- `montessori-os/src/components/ClassroomTimeline.jsx`
- `montessori-os/src/components/ClassroomTimeline.batchMedia.test.js`
- `montessori-os/src/components/ClassroomTimeline.interactions.test.js`
- `montessori-os/src/components/classroomTimelineUtils.js`
- `montessori-os/src/components/classroomTimelineUtils.extraction.test.js`
- `montessori-os/src/components/ExportWizard.jsx`
- `montessori-os/src/components/FeedbackTimeline.jsx`

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
- Count: 59
- Components: `App`, `AppFooter`, `AppHeader`, `AssessmentUploadPage`, `AssessmentUploadPage.test`, `BroadcastComposer`, `BroadcastComposer.test`, `BulkUploadPage`, `BulkUploadPage.helpers`, `BulkUploadPage.test`, `ClassroomNoteCard`, `ClassroomStudentCard`, `CopyToClipboardButton`, `DynamicIslandPill`, `DynamicIslandPill.test`, `FeedbackPage`, `GroupedMediaCard`, `GroupedMediaCard.test`, `groupedMediaUtils`, `groupedMediaUtils.test`, `GroupedNoteCard`, `GroupedNoteDialog`, `InlineVoiceOverlay`, `InterviewsPage`, `InterviewsPage.helpers`, `InterviewsPage.test`, `LandingPage`, `LandingPage.test`, `MediaBatchPreview`, `MediaBatchPreview.test`, `MonthlyPlanTab`, `MonthlyPlanTab.test`, `NoteBottomSheet.structure.test`, `NotesOverTimeDrawer`, `PhotoEditor`, `PlanFeedbackDialog`, `PlanFeedbackDialog.test`, `ProfilePage`, `QuestionDeck`, `QuestionDeck.test`, `ReadinessCheckDialog`, `ReportGenerateDialog`, `ReportPreviewDialog`, `ReportsCard`, `ReportsPage`, `ReportsPage.test`, `ReportTypeLandingPage`, `ReportTypeLandingPage.test`, `ReviewClassroomNotes`, `SettingsPage`, `SettingsPage.test`, `SnapshotBody`, `SnapshotCard`, `StudentAssessmentsPage`, `StudentAssessmentsPage.test`, `VersionBadge`, `VersionBadge.test`, `WritingAnalysisTab`, `WritingAnalysisTab.test`
- Representative paths:
- `montessori-os/src/App.jsx`
- `montessori-os/src/AppFooter.jsx`
- `montessori-os/src/AppHeader.jsx`
- `montessori-os/src/components/AssessmentUploadPage.jsx`
- `montessori-os/src/components/AssessmentUploadPage.test.js`
- `montessori-os/src/components/BroadcastComposer.jsx`
- `montessori-os/src/components/BroadcastComposer.test.js`
- `montessori-os/src/components/BulkUploadPage.jsx`

## Existing UX Patterns

- Mobile-first navigation with header/back handling plus bottom app footer navigation.
- Quick capture pattern: floating action (`AddNoteFab`) opens modal (`AddNoteModal`) and branches into text/voice/lesson/media flows.
- Timeline-first review model with filters and expansion dialogs for note details/media context.
- MUI-centered component system for cards, dialogs, chips, selectors, and status indicators.
- Voice input support exists in both note capture (`VoiceRecorder`) and AI tooling flows.

## Firestore/Data Surface

- Core collections/signals: `users`, `branches`, `programs`, `classrooms`, `students`, `observations`, `ai_summaries`, `config`, `feedback`, `placements`, `chats`, `messages`, `access`, `alerts`, `brain`, `digests`, `files`, `history`, `interviews`, `monthly_plan_feedback`, `pendingMedicalAssessmentUploads`, `pendingStructuredAssessmentUploads`, `runs`, `statsCache`, `structuredAssessmentSources`, `testbench`, `turns`
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
- `/pendingMedicalAssessmentUploads/{uploadId}`
- `/pendingStructuredAssessmentUploads/{uploadId}`
- `/placements/{placementId}`
- `/programs/{programId}`
- `/runs/{runId}`
- `/statsCache/{docId}`
- `/structuredAssessmentSources/{sourceId}`
- `/students/{studentId}`
- `/testbench/settings`
- `/turns/{turnId}`
- `/users/{uid}`
- `/{path=**}/ai_summaries/{summaryId}`
- `/{path=**}/observations/{observationId}`
- `/classrooms/_digest_all/digests/{digestId}`
- `/classrooms/_digest_all/digests/{digestId}/history/{weekKey}`

## Recent Changes

### 13.1.0 (2026-08-31)
- Durable execution ledger at `jobs/{jobKey}/executions/{executionId}/workItems/{workItemId}` tracks every scheduled job run with per-target work items, verification outcomes, and TTL-based cleanup (#229).
- Five verifier Cloud Functions (`verifyCleanupDeletedChats`, `verifySoulRegeneration`, `verifyMonthlyPlans`, `verifyWeeklyStudentAI`, `verifyWeeklyDigests`) finalize executions using a shared engine with three-layer output verification and missed-start detection (#229).
- Automated green/red Telegram signals on every execution completion, with PII-free formatting, counts, and dominant failure category (#229).

### 13.0.1 (2026-08-30)
- Soul generation month picker in Settings: superadmins select a target month (current or next, IST-bounded) to pre-generate next month's souls ahead of the monthly cron (#264).
- `generatedForMonth` ("YYYY-MM") field on soul and open_questions docs serves as the idempotency token — the worker skips students already generated for the target month (#264).
- Question Deck subtitle reads the month from `generatedForMonth`, appending the year for cross-year pre-generation (#264).

### 12.5.0 (2026-08-27)
- Paginated delta stats refresh (`updateStatsDelta`) replaces the monolithic `recomputeStats` that was crashing with OOM errors at ~400MB heap (#256).
- Weekly `reconcileStats` scheduled function rebuilds stats classroom-by-classroom every Sunday at 04:00 IST with atomic publication and pending-media guards (#256).
- Lease-based coordination with generation fencing prevents concurrent stats refreshes from corrupting cache state (#256).

### 12.4.2 (2026-08-22)
- Student and Classroom Timelines now show complete multi-photo MediaNote batches with image counts, carousel positions, and correct per-image editing/deletion targets (#249).
- Classroom Timeline tabs now switch only through their headers, preventing tab gestures from competing with media carousel swipes (#249).

