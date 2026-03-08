# Pep OS Overview

Generated: 2026-03-08T04:53:11.634Z
App version: 9.8.1

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
- Components: `AddNoteFab`, `AddNoteModal`, `ClassroomStudentPicker`, `LessonNoteConfigEditor`, `LessonNotes`, `LessonNotesPage`, `LessonNoteTagDialog`, `MentionTextArea`, `NoteExpansionDialog`, `VoiceRecorder`
- Representative paths:
- `montessori-os/src/components/AddNoteFab.jsx`
- `montessori-os/src/components/AddNoteModal.jsx`
- `montessori-os/src/components/ClassroomStudentPicker.jsx`
- `montessori-os/src/components/LessonNoteConfigEditor.jsx`
- `montessori-os/src/components/LessonNotes.jsx`
- `montessori-os/src/components/LessonNotesPage.jsx`
- `montessori-os/src/components/LessonNoteTagDialog.jsx`
- `montessori-os/src/components/MentionTextArea.jsx`

### Timelines and Media (`timelines-and-media`)
- Count: 12
- Components: `ClassroomList`, `ClassroomTimeline`, `ClassroomTimeline.pagination.test`, `classroomTimelineUtils`, `ExportWizard`, `FeedbackTimeline`, `FilterPanel`, `StudentDashboard`, `StudentList`, `StudentStatsPage`, `StudentTimeline`, `StudentTimeline.reassignCleanup.test`
- Representative paths:
- `montessori-os/src/components/ClassroomList.jsx`
- `montessori-os/src/components/ClassroomTimeline.jsx`
- `montessori-os/src/components/ClassroomTimeline.pagination.test.js`
- `montessori-os/src/components/classroomTimelineUtils.js`
- `montessori-os/src/components/ExportWizard.jsx`
- `montessori-os/src/components/FeedbackTimeline.jsx`
- `montessori-os/src/components/FilterPanel.jsx`
- `montessori-os/src/components/StudentDashboard.jsx`

### Analytics and Notifications (`analytics-and-notifications`)
- Count: 7
- Components: `BaseballCardSnapshotCard`, `FeatureTag`, `NewFeaturePill`, `NotificationsPage`, `PerformanceSummaryCard`, `StatsPage`, `UpdateNotification`
- Representative paths:
- `montessori-os/src/components/BaseballCardSnapshotCard.jsx`
- `montessori-os/src/components/FeatureTag.jsx`
- `montessori-os/src/components/NewFeaturePill.jsx`
- `montessori-os/src/components/NotificationsPage.jsx`
- `montessori-os/src/components/PerformanceSummaryCard.jsx`
- `montessori-os/src/components/StatsPage.jsx`
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
- Count: 19
- Components: `App`, `AppFooter`, `AppHeader`, `BaseballCardBody`, `BulkUploadPage`, `BulkUploadPage.helpers`, `BulkUploadPage.test`, `CopyToClipboardButton`, `FeedbackPage`, `LandingPage`, `ProfilePage`, `ReportGenerateDialog`, `ReportPreviewDialog`, `ReportsCard`, `ReportsPage`, `ReportsPage.test`, `ReviewClassroomNotes`, `SettingsPage`, `VersionBadge`
- Representative paths:
- `montessori-os/src/App.jsx`
- `montessori-os/src/AppFooter.jsx`
- `montessori-os/src/AppHeader.jsx`
- `montessori-os/src/components/BaseballCardBody.jsx`
- `montessori-os/src/components/BulkUploadPage.jsx`
- `montessori-os/src/components/BulkUploadPage.helpers.js`
- `montessori-os/src/components/BulkUploadPage.test.js`
- `montessori-os/src/components/CopyToClipboardButton.jsx`

## Existing UX Patterns

- Mobile-first navigation with header/back handling plus bottom app footer navigation.
- Quick capture pattern: floating action (`AddNoteFab`) opens modal (`AddNoteModal`) and branches into text/voice/lesson/media flows.
- Timeline-first review model with filters and expansion dialogs for note details/media context.
- MUI-centered component system for cards, dialogs, chips, selectors, and status indicators.
- Voice input support exists in both note capture (`VoiceRecorder`) and AI tooling flows.

## Firestore/Data Surface

- Core collections/signals: `users`, `branches`, `programs`, `classrooms`, `students`, `observations`, `media`, `ai_summaries`, `config`, `feedback`, `ai_prompts`, `placements`, `chats`, `messages`
- Rule-declared paths:
- `/ai_prompts/{docId}`
- `/ai_summaries/{summaryId}`
- `/branches/{branchId}`
- `/chats/{chatId}`
- `/classrooms/{classroomId}`
- `/config/{docId}`
- `/feedback/{feedbackId}`
- `/media/{mediaId}`
- `/messages/{messageId}`
- `/observations/{observationId}`
- `/placements/{placementId}`
- `/programs/{programId}`
- `/students/{studentId}`
- `/users/{uid}`
- `/{path=**}/ai_summaries/{summaryId}`
- `/{path=**}/media/{mediaId}`
- `/{path=**}/observations/{observationId}`

## Recent Changes

### 9.8.1 (2026-03-07)
- Google Doc report metadata line now shows start date in DD/MM/YYYY format with "to date" text, and academic year moved to pipe 4 (PEP-76)
- Report logo increased from 80x80 to 200x200 PT in exported Google Docs (PEP-76)
- Entire exported report document now uses Roboto font (PEP-76)

### 9.8.0 (2026-03-06)
- Drive folder permissions now mirror in-app access: teachers, classroom admins, and superadmins automatically receive editor access on classroom-level Google Drive folders (PEP-69)
- Firestore triggers sync Drive permissions when classroom teacher assignments, user roles, or manageable programs change (PEP-69)
- Bulk sync callable for superadmins to backfill Drive permissions across all existing classroom folders (PEP-69)

### 9.7.4 (2026-03-06)
- ClassroomTimeline now fetches 20 observations per batch with Firestore cursor-based pagination instead of 50, with a "Show 20 More" button to load additional pages (PEP-28)
- StudentTimeline now fetches 20 observations initially via real-time listener, with cursor-based "Show 20 More" for older notes (PEP-28)
- UsersAccessPage displays 10 users per tab with "Show 10 More" buttons; limits reset automatically when search or filters change (PEP-28)

### 9.7.3 (2026-03-06)
- Google Doc report exports now match the reference template: PEP logo, navy blue student name heading, pink metadata line with program/academic year, styled section headings, dark grey justified body text, proper spacing (PEP-73)
- Missing input flags in report preview now display as a compact chip-button with expandable popover instead of stacked alerts (PEP-73)
- Google Doc export logo URL updated to use GCS direct URL (PNG format) — fixes 403 error from Google Docs API when inserting inline image (PEP-73)

