# Deep Dive: Observation Capture

Generated: 2026-02-14T18:06:34.052Z
Source overview: `.claude/skills/codebase-context-scan/references/pep-os-overview.md`

## Scope

- area_tag: `observation-capture`
- Intent: Teachers capture text, voice, lesson, and media observations with low-friction mobile flows.
- Declared key paths: 7
- Existing key paths found: 7

## Architecture and Data Flow

- Primary key files: `montessori-os/src/components/AddNoteFab.jsx`, `montessori-os/src/components/AddNoteModal.jsx`, `montessori-os/src/components/ClassroomStudentPicker.jsx`, `montessori-os/src/components/LessonNotes.jsx`, `montessori-os/src/components/LessonNotesPage.jsx`, `montessori-os/src/components/MentionTextArea.jsx`, `montessori-os/src/VoiceRecorder.jsx`
- Related imports discovered: `montessori-os/src/coach/coach_nudge.jsx`, `montessori-os/src/coach/coachIO.js`, `montessori-os/src/coach/constants.js`, `montessori-os/src/components/ClassroomStudentPicker.jsx`, `montessori-os/src/components/LessonNotes.jsx`, `montessori-os/src/components/LessonNoteTagDialog.jsx`, `montessori-os/src/components/MentionTextArea.jsx`, `montessori-os/src/components/NewFeaturePill.jsx`, `montessori-os/src/firebase.js`, `montessori-os/src/hooks/useMentionableStudents.js`, `montessori-os/src/hooks/useTranscriptStudentSuggestions.js`, `montessori-os/src/notifications/useNotify.js`, `montessori-os/src/textCleanup.js`, `montessori-os/src/utils/analytics.js`, `montessori-os/src/utils/fuzzySearch.js`, `montessori-os/src/utils/lessonNoteConstraints.js`
- Firestore collections referenced in scoped files: `ai_prompts`, `classrooms`, `config`, `media`, `observations`, `programs`, `students`, `users`
- Cloud Functions referenced: `aiCoachReview`, `extractPdfEssence`, `suggestPdfTitle`
- React hooks commonly used: `useCallback`, `useEffect`, `useMemo`, `useRef`, `useState`

## Key Components/Files

| Path | Type | Notes |
| --- | --- | --- |
| `montessori-os/src/components/AddNoteFab.jsx` | UI component | Primary logic for add note fab. |
| `montessori-os/src/components/AddNoteModal.jsx` | UI component | Primary logic for add note modal. |
| `montessori-os/src/components/ClassroomStudentPicker.jsx` | UI component | Primary logic for classroom student picker. |
| `montessori-os/src/components/LessonNotes.jsx` | UI component | Primary logic for lesson notes. |
| `montessori-os/src/components/LessonNotesPage.jsx` | UI component | Primary logic for lesson notes page. |
| `montessori-os/src/components/MentionTextArea.jsx` | UI component | Primary logic for mention text area. |
| `montessori-os/src/VoiceRecorder.jsx` | App/module | Primary logic for voice recorder. |

## Operational Constraints

- Capture flow is optimized for quick mobile input and should minimize step friction.
- Role-aware recipient/classroom scoping must remain consistent with current permissions.
- Media and lesson-note behavior must stay compatible with timeline rendering expectations.

## Open Questions / Unknowns

- No major structural unknowns from the current scoped scan.

## Issue-Drafting Guidance

- Which note mode is affected (text, voice, lesson, media), and for which role(s)?
- What is the expected capture speed or interaction target on mobile devices?
- Are there classroom/student selection edge cases (group notes, mentions, reassignment)?

## Confidence + Gaps

- Confidence: High (99/100)
- Key path coverage: 100% (7/7)
- Related file count: 16
- Missing key paths: None

