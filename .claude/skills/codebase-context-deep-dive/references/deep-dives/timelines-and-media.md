# Deep Dive: Timelines and Media

Generated: 2026-02-13T10:23:10.708Z
Source overview: `.claude/skills/codebase-context-scan/references/pep-os-overview.md`

## Scope

- area_tag: `timelines-and-media`
- Intent: Student and classroom timelines surface text/voice/lesson/media events with filtering and expansion flows.
- Declared key paths: 5
- Existing key paths found: 5

## Architecture and Data Flow

- Primary key files: `montessori-os/src/components/ClassroomTimeline.jsx`, `montessori-os/src/components/FilterPanel.jsx`, `montessori-os/src/components/StudentDashboard.jsx`, `montessori-os/src/components/StudentStatsPage.jsx`, `montessori-os/src/components/StudentTimeline.jsx`
- Related imports discovered: `montessori-os/src/components/BaseballCardSnapshotCard.jsx`, `montessori-os/src/components/ExportWizard.jsx`, `montessori-os/src/components/FilterPanel.jsx`, `montessori-os/src/components/NoteExpansionDialog.jsx`, `montessori-os/src/firebase.js`, `montessori-os/src/hooks/useObservationFilters.js`, `montessori-os/src/hooks/useSwipeTabs.js`, `montessori-os/src/notifications/useNotify.js`, `montessori-os/src/utils/analytics.js`, `montessori-os/src/utils/export.js`, `montessori-os/src/utils/fuzzySearch.js`, `montessori-os/src/utils/lessonNoteConstraints.js`, `montessori-os/src/utils/observationPermissions.js`, `montessori-os/src/utils/observationUtils.jsx`, `montessori-os/src/utils/roleUtils.js`, `scripts/config/baseballCardConstants.js`
- Firestore collections referenced in scoped files: `ai_summaries`, `config`, `media`, `observations`, `students`, `users`
- Cloud Functions referenced: `regenerateBaseballCardForStudent`
- React hooks commonly used: `useCallback`, `useEffect`, `useMemo`, `useRef`, `useState`

## Key Components/Files

| Path | Type | Notes |
| --- | --- | --- |
| `montessori-os/src/components/ClassroomTimeline.jsx` | UI component | Primary logic for classroom timeline. |
| `montessori-os/src/components/FilterPanel.jsx` | UI component | Primary logic for filter panel. |
| `montessori-os/src/components/StudentDashboard.jsx` | UI component | Primary logic for student dashboard. |
| `montessori-os/src/components/StudentStatsPage.jsx` | UI component | Primary logic for student stats page. |
| `montessori-os/src/components/StudentTimeline.jsx` | UI component | Primary logic for student timeline. |

## Operational Constraints

- Timeline grouping and filter behavior should stay consistent across note/media types.
- Media interactions must align with Firestore + Storage constraints and status transitions.
- Teacher-visible text/labels should preserve concise, scan-friendly timeline readability.

## Open Questions / Unknowns

- No major structural unknowns from the current scoped scan.

## Issue-Drafting Guidance

- Which timeline view is in scope (student, classroom, dashboard card, media dialog)?
- What filter/grouping behavior must remain unchanged?
- Does this change impact media status states, batch summaries, or delete behavior?

## Confidence + Gaps

- Confidence: High (99/100)
- Key path coverage: 100% (5/5)
- Related file count: 16
- Missing key paths: None

