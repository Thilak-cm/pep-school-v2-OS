# Coach MVP — Implementation Plan

A phased, atomic TODO plan for implementing Coach. Tackle milestones in order; resolve pinned decisions as they come up.

Current status
- Milestone 0 — Contracts & Constants: completed
- Milestone 1 — UI Scaffolding (stubbed): completed
- Milestone 2 — Redaction Pipeline: skipped for now (plan to use student list cross-check later)
- Milestone 3 — Server Integration (model call): in progress

## Milestone 0 — Contracts & Constants
- Freeze chip labels as code constants (exact strings + order).
- Decide append behavior (template-only vs default pick) for `append_line`.
- Define request/response types and strict JSON schema (validate on server).
- Implement parser with safe fallback to `{ nudges: [] }` on any error.
- Unit tests for schema/parse: >2 nudges, bad ids, bad chips, malformed JSON.

## Milestone 1 — UI Scaffolding (stubbed)
- Hook Coach into onSave in `montessori-os/src/components/AddNoteModal.jsx`.
- Show non-blocking reviewing state: spinner after 5s, auto-continue at 10s.
- Render up to 2 nudges UI with chips and a text field (Subjective/Evidence quote).
- Compose append-only lines preview; buttons: Apply, Skip.
- Wire appended lines + structured fields into the existing note save path.

## Milestone 2 — Redaction Pipeline
- Client-side redaction: names→tokens, emails/phones/IDs/addresses masked.
- Ignore subjective terms inside quotes; preserve age band, subject, class name.
- Tests: quoted speech, multiple names, Unicode/emoji, RTL text sanity.
- Ensure redacted text is analysis-only; never saved to note.

## Milestone 3 — Server Integration (model call)
- Secure backend endpoint (Firebase Callable/HTTPS function) for Coach.
- Enforce 5s long-running notice and 10s hard cutoff; return `nudges: []` on timeout.
- Simple cache (hash of `note_text` + relevant context) with short TTL.
- Retry-on-429/5xx once with jitter; otherwise fail closed (no nudges).
- Log status codes and latency per call.

## Milestone 4 — Prompt & Heuristics
- Build system prompt from PRD: ground rules, chips, priorities.
- Add few-shot examples (fix Ex5 inconsistency per PRD notes).
- Use JSON schema/function-call style to force strict output.
- Unit tests with seed notes: activity gate, independence phrases, evidence counts vs quote, subjective-in-quotes, multi-activity.

## Milestone 5 — Data Model & Firestore
- Note doc fields: appended lines + `duration_range`, `modality`, `independence`, `evidence_attempts`, `evidence_correct`, `evidence_quote`.
- Telemetry collection: `coach.events` with `status`, `reason`, `latency_ms`, `nudgesShown[{id,confidence}]`, `coach.selections`.
- Update `firestore.rules` for note + telemetry writes.
- Viewer tolerant of notes without coach fields (backward compatible).

## Milestone 6 — Performance & Reliability
- Cancel request on rapid re-save; reuse cached result if unchanged.
- Instrument p95 end-to-end latency; pre-warm function if possible.
- Feature flag to disable Coach globally or per-tenant.
- Fallback: if model unavailable, save-as-is and log `status=fail_closed`.

## Milestone 7 — Acceptance Tests & QA
- Create 100-seed corpus (multi-activity, non-activity, quotes, counts+quote, redaction edge cases).
- Batch harness to run seeds; assert ≤1% parse failures, max 2 nudges, correct priority order.
- Manual UX checks for >5s notice and ≥10s cutoff behavior.

## Milestone 8 — Rollout
- Gradual enablement behind flag; monitor adoption/acceptance rates.
- Define starScore plan (manual vs automated) and storage field.
- Iterate from telemetry (noisy nudges, misfires); plan expansion beyond English later.

---

## Pinned Decisions (resolve in-flow)
- [ ] Append behavior: template-only `append_template` vs default chip in `append_line`.
- [ ] Evidence when both counts and quote provided (numbers only vs both; order/format).
- [ ] Caching key: re-call when `subject_tags`/`age_band` change, or `note_text`-only?
- [ ] Independence: if "with peers" present, still prompt for explicit chip or skip?
- [ ] Activity gate edge cases (circle time, transitions, arrivals) for Duration/Modality suppression.
- [ ] Canonical chip labels (hyphens/en-dashes/punctuation) and dedicated microcopy for Independence.
- [ ] Save timing semantics: when to block UI vs overlay; exact behavior at 10s.
- [ ] Telemetry storage: Firestore collections/paths and fields separation (note vs analytics-only).
- [ ] starScore ownership/computation (manual rating vs heuristic) and storage.

---

## References
- PRD: `coach_prd.md` (ground rules, input/output contract, chips, examples, acceptance).
- UI hook: `montessori-os/src/components/AddNoteModal.jsx`.
- Security rules: `firestore.rules`.
