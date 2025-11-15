# PEP OS – Lesson Notes PRD

## 1. Purpose & Background
- Provide Montessori teachers a fast, structured way to log lesson delivery outcomes across multiple students, complimenting existing text/voice notes.
- Replace manual attendance grids with guided defaults so teachers capture per-student mastery data in under two minutes, even for whole-class lessons.
- Ensure each student receives their own record (1 note per student) for accurate timelines, analytics, and reporting.

## 2. Objectives & Success Metrics
| Goal | Metric | Target |
|------|--------|--------|
| Fast capture | ≤ 90 seconds median time to log a 12-student lesson note | v1 release |
| Coverage | ≥ 80% of whole-class lessons logged as structured notes in pilot classes | Weeks 3–4 post launch |
| Insight | Student dashboard “Lessons Received” card used in ≥ 60% of parent conference preps | By Week 6 |
| Data quality | 100% notes include dimension ratings (Step A enforced) | Always |

## 3. Primary Users & Needs
- **Lead & Assistant Teachers** – log structured lesson outcomes, quickly spot students needing follow-up, reuse saved subgroups.
- **Admins/Principals** – audit lesson coverage per classroom/student, surface aggregated mastery summaries alongside existing notes.
- **Future**: Data team/analysts – rely on per-student records for curriculum coverage dashboards (not in current scope but informed by data model).

## 4. Experience Overview
1. Teacher taps `+ Add Note` → modal shows `Text`, `Voice`, `Lesson Note`.
2. Lesson Note flow enforces ordered steps:
   1. Lesson context (title, description, group comment, classroom).
   2. Select class/subgroup/students with present/absent toggles (absent excluded + flagged for catch-up).
   3. Step A: pick program-type-driven dimension defaults (all required before continuing).
   4. Step B: student grid auto-filled with defaults; teacher overrides per child and can add optional comments.
   5. Save writes individual student records + toast confirmation, then return to originating timeline view.
3. Lesson Notes display with unique icon/color in timelines and power new “Lessons Received” card on student dashboards with aggregated stats.

## 5. Detailed Requirements
### 5.1 Entry Modal
- `+ Add Note` CTA opens modal containing three cards: Text Note, Voice Note, Lesson Note (new).
- Selecting Lesson Note opens a wizard with persistent progress indicator (Step 1–3, plus Save).

### 5.2 Lesson Context (Step 1)
- Fields:
  - `Lesson Title` (required, free text, optional auto-suggest from lesson plans catalog when available).
  - `Short Description` (optional, 140 char guidance).
  - `Group Comment` (optional, stored across all student notes for context).
  - `Classroom` selector (pre-populated if the entry point was a class timeline).
- On submit, program_type is inferred from the chosen classroom and locked for the rest of the flow.

### 5.3 Select Students / Group (Step 2)
- Search input supports:
  - Live student lookup, classroom names, and `/shortcut` aliases (see §6).
  - Typing `/` immediately surfaces autocomplete for the teacher’s shortcuts.
  - Plain-text shortcut names still surface (ranked below direct matches).
- Browse-by-classroom collapsible panel mirrors existing text-note picker.
- Selection rules:
  - Teacher can pick an entire class, a saved subgroup, or individual students.
  - After selection, roster list renders with Present/Absent toggles per student.
  - Absent = default unchecked from subsequent steps, logged inline within the note payload only (no attendance write).
  - Show small badge for shortcuts containing inactive students (e.g., after roster changes) with inline “Update shortcut” prompt.

### 5.4 Step A – Group Defaults (Step 3)
- Header: “Step 2: Lesson Feedback (Group Defaults)”.
- Display dimension chips seeded from program_type:
  - **Primary**: Focused during lesson, Focused when repeating, Grasped work.
  - **Elementary**: Showed prerequisite recall, Attentive, Participative, Excited for follow-up.
  - **Adolescent**: Prepared, Showed prerequisite recall, Attentive, Participative, Showed understanding.
- For each dimension, required to pick exactly one state: `Yes / Partially / No / N/A`.
- Validation: cannot advance until all dimensions have a selection.

### 5.5 Step B – Exceptions (Step 4)
- Grid layout: rows = students (sorted by first name), columns = dimensions.
- Cells pre-filled with Step A defaults; tapping cycles `Yes → Partially → No → N/A`.
- Optional per-student comment expander (collapsed by default).
- Present/Absent indicator pinned to each row; absent students remain greyed with no inputs (but record still created with status = absent).

### 5.6 Save (Step 5)
- CTA “Save Lesson Note” triggers:
  - Validation that at least one student is marked present.
  - Creation of **individual note documents** (1 per student) each referencing shared lesson context fields.
  - Toast copy: “Lesson Note saved for {count} students.”
- Return user to previous context (class timeline or student dashboard) and auto-filter timeline to highlight the new entries.

### 5.7 Display
- Class and student timelines show Lesson Notes with a unique icon/color and condensed badge summarizing dimension outcomes (e.g., `Yes` count / total).
- Student Dashboard gains a `Lessons Received` card:
  - List view: rows with lesson title, date/time, quick summary (e.g., “Focused: 10/12 Yes”).
  - Aggregated mini-analytics above the list (e.g., percent Yes per dimension over selected range, with toggles for 7/30/90 days).
  - Card sits alongside existing `Notes` card (text/voice) without intermixing data.

## 6. Shortcuts (User-Owned Subgroups)
- Location: Hamburger menu → “Shortcuts” plus inline quick-create from any student selector.
- Scope: shortcut tied to a single classroom; name uniqueness enforced per user+class.
- Naming rules: begins with `/`, 2–32 chars (letters/digits/spaces/hyphens/underscores), case-insensitive but display preserves casing.
- Creation flow: name, select classroom, multi-select students. Private to creator (future sharing out-of-scope).
- Usage:
  - Typing `/name` in selectors autocompletes; suggestions appear immediately after `/`.
  - Search results show Recents, Pinned Shortcuts, My Shortcuts, and Class chips below input.
  - Selecting a shortcut expands to show its members with Present/Absent toggles and inline “Edit members” option; edits persist for future sessions only (current draft keeps its resolved list).
- Roster drift: removed students stay flagged as inactive; user prompted to update but historical lesson notes retain stored student IDs.

## 7. Data Model & Storage
- **Collection:** `lessonNotes`
  ```ts
  {
    id: string;                   // unique per student note
    student_id: string;
    classroom_id: string;
    teacher_id: string;
    lesson_title: string;
    lesson_description?: string;
    group_comment?: string;
    program_type: 'primary' | 'elementary' | 'adolescent';
    dimensions: Array<{
      name: string;
      value: 'yes' | 'partial' | 'no' | 'na';
    }>;
    student_comment?: string;
    attendance_status: 'present' | 'absent';
    shortcut_ids?: string[];      // optional, resolved at save time
    created_at: Timestamp;
    updated_at?: Timestamp;
  }
  ```
- Shared context (title, description, group comment, defaults) duplicated across student records for independent querying.
- Present/Absent stored only within each lesson note (no attendance collection update).

## 8. Permissions & Access Control
- Teachers can create lesson notes for classrooms they’re assigned to; each record inherits the same ACL checks as text/voice observations.
- Editing/deleting after submission follows existing observation rules (e.g., author-only edits within 24h, if already implemented elsewhere).
- Shortcuts are private to the owner; no admin visibility unless impersonating the user.

## 9. Non-Goals
- Syncing lesson notes to Google Docs or parent emails (handled by other note types or future releases).
- Attendance reporting or automatic catch-up task creation (beyond storing absent status inline).
- Cross-class shortcuts or shared subgroup libraries.

## 10. Dependencies & Technical Notes
- Reuse existing note modal component architecture; add Lesson Note entry plus wizard state management.
- Wizard should be mobile-first (>=360px width) and keyboard accessible.
- Grid UI must handle up to ~35 students; implement virtual scrolling if performance concerns arise.
- Aggregated dashboard summaries require query capable of filtering lesson notes by student + date range; consider Cloud Function to materialize counts if client-side aggregation is too heavy.

## 11. Open Items / Risks
- **Auto-suggest source**: confirm whether lesson plan metadata is available or if suggestions ship later.
- **Dimension localization**: verify if labels require localization hooks before exposing to broader regions.
- **Analytics load**: validate Firestore query cost for per-dimension aggregation on the fly; may need caching strategy.

