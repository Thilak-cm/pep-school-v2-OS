# Lesson Notes – Implementation Plan

## 1. Goals & Scope
- Ship the structured Lesson Note workflow defined in the PRD, including shortcuts UX and student dashboard enhancements.
- Maintain feature parity with existing text/voice note permissions and timelines while keeping tech debt low.
- Deliver iteratively so classrooms can pilot the capture flow before dashboard analytics land.

## 2. Assumptions & Dependencies
- Stack remains React + Vite PWA, Firebase Auth, Firestore, Cloud Functions.
- Current `observations` collection handles text/voice notes; new `lessonNotes` collection will coexist (no schema migration).
- Classroom documents already include `program_type`.
- Google SSO + roster management already live.
- No external integrations (Docs, STT) required for this feature.

## 3. Architecture Updates
1. **Data Model**
   - Create `lessonNotes` collection (schema per PRD §7) with composite indexes on `(student_id, created_at desc)` and `(classroom_id, created_at desc)`.
   - Optional `lessonShortcuts` subcollection keyed by user + classroom (if not already stored elsewhere).
2. **API layer**
   - Client writes directly to Firestore; wrap writes in module `services/lessonNotes.ts`.
   - Cloud Function (optional) for denormalized aggregates (per-student dimension counts) to power dashboard if client aggregation proves heavy.
3. **Security**
   - Update Firestore rules: teachers can `create` lesson notes for students in their classrooms; `read` limited to same scope; `update/delete` restricted to author within 24h (reuse logic from observations).
   - Shortcuts: owner-only CRUD.

## 4. Frontend Workstreams
### 4.1 Entry Modal & Routing
- Extend `AddNoteModal` state to include third option “Lesson Note”.
- On select, render multi-step wizard (local component `LessonNoteWizard`).
- Maintain compatibility with existing note creation (no regression tests fail).

### 4.2 Step 1 – Lesson Context
- Build form with validation using existing form utilities (e.g., React Hook Form if present).
- Auto-populate classroom when modal invoked from class timeline context.
- Lock `program_type` derived from classroom for subsequent steps.

### 4.3 Step 2 – Student / Group Selection
- Reuse/break out student picker logic from text note flow into shared component (`SelectStudentsPanel`) with support for:
  - Search across students, classes, shortcuts.
  - `/` triggered autocomplete for shortcuts.
  - Present/Absent toggles per student (persisted in wizard state).
- Introduce inline pill to create shortcut from selection; open modal for naming/classroom assignment.

### 4.4 Step 3 – Group Defaults
- Build UI for dimension chips with required selection per dimension.
- Map `program_type` to dimension sets via config file.
- Prevent Next button until all dimensions chosen.

### 4.5 Step 4 – Exceptions Grid
- Implement responsive grid (table or card matrix) with:
  - Rows sorted by student first name.
  - Column headers = dimensions.
  - Cell cycle interactions (Yes → Partially → No → N/A) with keyboard support.
  - Optional comment drawer per student stored in wizard state.
  - Greyed-out absent students.
- Consider virtualization (React Window) for large classes.

### 4.6 Save + Toast
- Compose payload: one record per student with shared lesson context.
- Batch writes using Firestore `writeBatch` to guarantee all-or-nothing.
- Display toast with student count and close modal; refresh timeline query cache.

### 4.7 Timeline & Dashboard Surface
- Timeline:
  - Add new icon/color for lesson notes; filter toggles (Text/Voice/Lesson) if not already present.
  - Summaries (e.g., `Focused: Yes for 8/10`).
- Student Dashboard:
  - New `Lessons Received` card with aggregated metrics + list of latest entries.
  - Provide quick filters (7/30/90 days) and dimension level bars.
  - Ensure data loading coexists with existing `Notes` card.

## 5. Shortcuts Feature
1. **Storage**
   - Collection `lessonShortcuts` with docs keyed by `{user_id}_{classroom_id}_{shortcut_name}` storing student IDs and metadata (inactive members flagged).
2. **Management UI**
   - Hamburger menu → `Shortcuts` page listing, create/edit/delete.
   - Inline suggestion “Create shortcut '/NewGroup' from current selection” when entry not found.
3. **Selector Integration**
   - Search index merges shortcuts with normal results; fuzzy matching for plain names.
   - Selecting a shortcut expands membership, allows inline edits (persist to Firestore, but wizard uses resolved list snapshot).

## 6. Backend & Ops Tasks
- **Firestore Rules**: update for `lessonNotes` and `lessonShortcuts`.
- **Indexes**: add via `firestore.indexes.json`.
- **Cloud Functions (optional)**:
  - `onWrite` trigger to update aggregated counts per student/classroom for dashboard.
  - Scheduled job to mark shortcuts stale when >0 inactive students (optional reminder).
- **Config**: add dimension definitions to `config/dimensions.json` for reuse in UI + analytics.

## 7. Testing Strategy
- **Unit/Component**: wizard navigation, validation logic, selector search, grid interactions.
- **Integration**: Firestore emulator tests for rule coverage; ensure writeBatch honors permissions.
- **E2E**: Cypress/Playwright flow covering Add Lesson Note, shortcuts usage, dashboard display.
- **Performance**: test grid rendering for 35-student classes on low-end devices.
- **Analytics validation**: verify aggregated values vs. raw data for sample students.

## 8. Rollout Plan
1. **Phase 1 – Capture Flow (Weeks 1–2)**
   - Ship Lesson Note wizard without dashboard card; data only accessible via timelines.
2. **Phase 2 – Shortcuts + Timeline polish (Weeks 2–3)**
   - Enable subgroup shortcuts and timeline filters.
3. **Phase 3 – Dashboard Aggregations (Weeks 3–4)**
   - Release Lessons Received card + aggregated stats, behind feature flag toggled per classroom.
4. **Phase 4 – Analytics Hardening (Week 5)**
   - Monitor write/read costs, optimize indexes, address user feedback.

## 9. Risks & Mitigations
- **Complex wizard UX**: run hallway usability test with 2 teachers before school-wide rollout; instrument completion times.
- **Firestore cost spikes**: monitor `lessonNotes` write bursts; consider throttling Save CTA to prevent double submissions.
- **Shortcut drift**: add inactive badge + reminder to edit; scheduled job optional.
- **Aggregation performance**: if client-side lags, implement Cloud Function materialized views.

