---
type: pre_meeting_note
date: 2026-10-25
with: Rahul
status: open
---

## Agenda Items

- [ ] Get practice note dimensions from Rahul (all 4 program levels: toddler / primary / elementary / adolescent, same yes|partial|no|na scale as lesson notes). Currently hardcoded as 'Dimension 1/2/3' placeholders in `montessori-os/src/utils/lessonNoteConstraints.js:32-53`. Once delivered, drop the superadmin gate at `LessonNotes.jsx:1320-1323` and practice notes open to all teachers. See #227.
- [ ] (#255) Should structured assessment data (test scores) also feed into LLM pipelines? Medical PDF summaries will feed internal-facing AI only (Soul, coach chat, baseball card) - not external outputs (reports, digests). What about structured scores? Need decision on which LLM pipelines get which assessment types.
- [ ] (#255) Confirm: medical PDF summaries visible to all teachers in the student's classroom (same access as regular observations), or restrict to classroomadmin+ only?
- [ ] (#255) Should medical PDF summaries feed into other internal LLM pipelines (baseball card, coach chat) directly, or only through the Soul? Currently thinking Soul-only (option 2 from spec), but need to confirm which internal surfaces should see medical context.
- [ ] (#255) Soul-to-report leak risk: if medical summaries feed into the Soul, the Soul narrative is also read by report generation and other external-facing pipelines. Proposed solution: Soul generates a clearly delimited "Medical Notes" section that external-facing consumers can programmatically skip. Confirm this approach or suggest alternative.
