# Pep OS Overview

Generated: 2026-06-19T22:46:00.627Z
App version: 10.38.0

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
| analytics-and-notifications | Analytics and Notifications | Stats, performance cards, and escalation notifications highlight behavior/engagement patterns. | `montessori-os/src/components/StatsPage.jsx`<br>`montessori-os/src/components/NotificationsPage.jsx`<br>`montessori-os/src/components/PerformanceSummaryCard.jsx`<br>`montessori-os/src/notifications/NotificationStack.jsx` |
| ai-tools-and-chat | AI Tools and Chat | Admin-configurable AI prompts and teacher-facing copilots (cleanup, transcriber, coach, chat). | `montessori-os/src/components/AIHomePage.jsx`<br>`montessori-os/src/components/AITextCleanupEditor.jsx`<br>`montessori-os/src/components/AIVoiceTranscriberEditor.jsx`<br>`montessori-os/src/components/AICoachEditor.jsx`<br>`montessori-os/src/components/ChatCommandCentreEditor.jsx`<br>`montessori-os/src/components/ChildChat.jsx`<br>`montessori-os/src/services/promptProvider.js` |
| admin-and-access | Admin and Access | Role-aware access, user management, classroom operations, aliases, and graduation workflows. | `montessori-os/src/components/UsersAccessPage.jsx`<br>`montessori-os/src/components/GraduateStudentsPage.jsx`<br>`montessori-os/src/components/StudentAliasesPage.jsx`<br>`montessori-os/src/components/ConfigHomePage.jsx`<br>`montessori-os/src/components/LessonNoteConfigEditor.jsx`<br>`montessori-os/src/utils/roleUtils.js`<br>`firestore.rules` |
| settings-feedback-shell | Settings, Feedback, and App Shell | Global navigation, profile/settings, feedback loops, and version/update surfaces. | `montessori-os/src/App.jsx`<br>`montessori-os/src/AppHeader.jsx`<br>`montessori-os/src/AppFooter.jsx`<br>`montessori-os/src/components/SettingsPage.jsx`<br>`montessori-os/src/components/ProfilePage.jsx`<br>`montessori-os/src/components/FeedbackPage.jsx`<br>`montessori-os/src/components/UpdateNotification.jsx` |

## Existing Pages and Components

### Observation Capture (`observation-capture`)
- Count: 12
- Components: `AddNoteFab`, `AddNoteFab.test`, `AddNoteModal`, `AddNoteModal.photoUX.test`, `AddNoteModal.saveButton.test`, `ClassroomStudentPicker`, `LessonNoteConfigEditor`, `LessonNotes`, `LessonNotesPage`, `LessonNoteTagDialog`, `MentionTextArea`, `VoiceRecorder`
- Representative paths:
- `montessori-os/src/components/AddNoteFab.jsx`
- `montessori-os/src/components/AddNoteFab.test.js`
- `montessori-os/src/components/AddNoteModal.jsx`
- `montessori-os/src/components/AddNoteModal.photoUX.test.js`
- `montessori-os/src/components/AddNoteModal.saveButton.test.js`
- `montessori-os/src/components/ClassroomStudentPicker.jsx`
- `montessori-os/src/components/LessonNoteConfigEditor.jsx`
- `montessori-os/src/components/LessonNotes.jsx`

### Timelines and Media (`timelines-and-media`)
- Count: 12
- Components: `ClassroomList`, `ClassroomTimeline`, `ClassroomTimeline.pagination.test`, `classroomTimelineUtils`, `classroomTimelineUtils.extraction.test`, `ExportWizard`, `FeedbackTimeline`, `FilterPanel`, `StudentDashboard`, `StudentDashboard.test`, `StudentStatsPage`, `StudentTimeline`
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
- Count: 6
- Components: `NotificationsPage`, `NotificationsPage.heatmap.test`, `PerformanceSummaryCard`, `StatsPage`, `StatsPage.noteTypes.test`, `UpdateNotification`
- Representative paths:
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
- Count: 41
- Components: `App`, `AppFooter`, `AppHeader`, `BroadcastComposer`, `BroadcastComposer.test`, `BulkUploadPage`, `BulkUploadPage.helpers`, `BulkUploadPage.test`, `ClassroomNoteCard`, `ClassroomStudentCard`, `CopyToClipboardButton`, `DynamicIslandPill`, `DynamicIslandPill.test`, `FeedbackPage`, `GroupedNoteCard`, `GroupedNoteDialog`, `InlineVoiceOverlay`, `InterviewsPage`, `InterviewsPage.helpers`, `InterviewsPage.test`, `LandingPage`, `LandingPage.test`, `MonthlyPlanTab`, `MonthlyPlanTab.test`, `NoteBottomSheet.structure.test`, `NotesOverTimeDrawer`, `PlanFeedbackDialog`, `PlanFeedbackDialog.test`, `ProfilePage`, `ReadinessCheckDialog`, `ReportGenerateDialog`, `ReportPreviewDialog`, `ReportsCard`, `ReportsPage`, `ReportsPage.test`, `ReviewClassroomNotes`, `SettingsPage`, `SettingsPage.test`, `SnapshotBody`, `SnapshotCard`, `VersionBadge`
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

### 10.38.0 (2026-06-19)
- MCQ poll composer for broadcasts — superadmins attach a poll with question, options, multi-select, and free-text "Other" toggle (PEP-323a)
- Teacher poll voting flow in DIP dialog — radio/checkbox options with "Respond" submit button (PEP-323a)
- Poll results infographic in broadcast detail — bar chart with vote counts, percentages, and collapsible voter lists (PEP-323b)

### 10.37.0 (2026-06-15)
- School Context Notes editor on Configurations page — superadmins can add, edit, and delete contextual notes injected into weekly digest LLM calls (PEP-324)
- Reusable coachmark system for feature discovery — floating tooltip with backdrop overlay, pulse animation, session and permanent dismiss, and guided tour scaffolding (PEP-322)
- Plan feedback coachmark on StudentDashboard plan tab — guides teachers to the feedback chip on first visit (PEP-322)

### 10.36.0 (2026-06-09)
- Digest Generation feature in prompt test bench — full agent loop with 8 digest tools, HTML email preview, side-by-side variant comparison, and run history with classroom context (PEP-304)
- Shared tool registry (`functions/shared/toolRegistry.js`) with scope permissions, prerequisite enforcement, and static frontend metadata mirror (`toolCatalog.js`) (PEP-304)
- Role-scoped ClassroomPicker for testbench — teachers see assigned, classroomadmins see manageable, superadmins see all (PEP-304)

### 10.35.0 (2026-06-09)
- Superadmin broadcast composer in Settings → Admin Tools — compose, edit, and manage broadcast alerts with label, title, message body, audience targeting, priority, DIP toggle, and expiry (PEP-307)
- Broadcast acknowledgment modal in DIP — tapping a broadcast CTA shows the full message with "I've read this" confirmation before dismissing (PEP-307)
- Broadcast management view — list all published broadcasts (live + expired) with edit, delete, and DIP visibility toggle (PEP-307)

