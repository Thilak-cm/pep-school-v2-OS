# 2026-09-13 - Async Catch-Up (Weekly Email, writingAnalysis Backfill, Billing)

**Format:** Async chat update from Thilak to Rahul (no live meeting this week). Rahul acknowledged with a thumbs-up - treat the content as accepted status. This document supersedes the previous week's window as the meeting-prep baseline.

## Update Sent (verbatim summary)

What's done:
1. Weekly teacher stats email shipped. Sept 14 (Monday) noon should be the first iteration where all teachers get an email.
2. Term report prompts for adolescent updated; default start date moved to July 1st 2026. *(Archive note: commit `e0204ba` says June 1 - discrepancy unresolved at time of writing, verify which is live.)*
3. Structured assessments name matching system and UI drastically improved. Still accessible only to supers - Rahul asked to test it and share thoughts.
4. writingAnalysis and other batch-processed runs bolstered after scale issues caused a 7-week string of errors for writingAnalysis; everything teachers see on the app and downstream pipelines consuming this data are outdated. The verifiers and job monitoring set up last week brought this to light. Actively backfilling writingAnalysis week by week so incremental processing of structured media analysis is maintained (not lump processing).
5. OpenRouter billing account updated: Rahul's account for credit refill when low, Thilak's as fallback. Manual refills continue when on call, but auto-refill covers forgetting.
6. Payment: Thilak received 25k for last month; confirming the bumped 35k salary kicks in this month and the next paycheck reflects it.

What's next:
1. Harden backend functions and local emulator testing.

Housekeeping:
1. Switched to Claude after one month of Codex usage. Will send receipts along with ad-hoc credit refills from Thilak's account and tag Harish Fernandes for reimbursements.

## Post-Meeting Reflection

Durable commitment ledger update. This async update refines the 2026-08-20 ledger; carry-forward status below is authoritative as of 2026-09-13.

### Ledger updates to prior takeaways (origin 2026-08-20)

#### Takeaway T1 — Deliver an AI cost-per-child report
- **Owner:** Thilak
- **Status at 2026-09-13:** Not mentioned in the async update; no movement. Displaced by the W36 incident response.
- **Tracking refs:** #241
- **Carry forward:** Yes (definition of done unchanged from 2026-08-20 doc)

#### Takeaway T2 — Validate and run improved Open Questions for every program
- **Owner:** Thilak
- **Status at 2026-09-13:** Not mentioned in the async update. August Soul run completed (with #270 recovery); Questions page opened to all programs. Integration/validation of the four program-specific prompt edits (dependency on Rahul, Takeaway R3) remains unverified.
- **Status at 2026-09-23:** RESOLVED. Rahul responded on the program-specific prompt edits (R3 dependency cleared) and Thilak completed the validation. Fully resolved per Thilak.
- **Tracking refs:** `docs/soul-generation-prompts.md`; Takeaway R3
- **Carry forward:** No (resolved 2026-09-23)

#### Takeaway T3 — Ship Assessment notes v1
- **Owner:** Thilak
- **Status at 2026-09-13:** Core shipped (#248 closed 08-27); name matching engine + one-tap review UI drastically improved (#285, v13.2.1). Still supers-only; Rahul asked to test and give feedback before wider rollout.
- **Remaining:** #275 (P1, classroom-first filter in upload UX), opening access beyond supers after Rahul's feedback, production verification of downstream AI consumers.
- **Tracking refs:** #248, #275, #285; Takeaway R1
- **Next-meeting check:** Has Rahul tested the matching UI? Decision on opening access beyond supers.
- **Carry forward:** Yes

#### Takeaway T4 — Implement month-end job monitoring
- **Owner:** Thilak
- **Status at 2026-09-13:** COMPLETE. Execution ledger with output verification and Telegram signals shipped (#229, closed 08-31) and verified against live runs - it surfaced both the soulWorker 402 cascade (#270) and the W36 writingAnalysis gap before teachers reported anything. Rahul acknowledged via this async update.
- **Carry forward:** No (completion evidence satisfied and verified live)

### New Thilak takeaways (origin 2026-09-13)

#### Takeaway T5 — Complete week-by-week writingAnalysis backfill (W30-W36)
- **Owner:** Thilak
- **Commitment:** Backfill the 7-week writingAnalysis gap week by week so incremental processing of structured media analysis is preserved (not lump processing), restoring correct data for teachers and downstream pipelines.
- **Why it matters:** Everything teachers see in the app and pipelines consuming writingAnalysis are outdated until the backfill lands.
- **Tracking refs:** #281 (P1); branch `gh-281-backfill-writing-analysis`
- **Completion evidence:** Backfill executed and verified against production for all gap weeks; #281 closed; branch merged; downstream consumers reflect refreshed data.
- **Baseline at 2026-09-13:** ~90% - all 3 phases executed against production (24 lump students restored, 464 history docs), 130 tests passing; review/merge and issue closure pending.
- **Next-meeting check:** Confirm #281 closed and teachers see current writingAnalysis data.
- **Carry forward:** Yes

#### Takeaway T6 — Harden backend functions and local emulator testing
- **Owner:** Thilak
- **Commitment:** Harden backend Cloud Functions and establish local emulator testing (stated as the single "what's next" item in the async update).
- **Tracking refs:** #280 (P1, batch job error observability) is the closest existing issue; scope beyond it not yet specified.
- **Completion evidence:** Not yet defined - firm up scope with Rahul at the next live meeting.
- **Baseline at 2026-09-13:** 0% - commitment stated, scope not yet pinned to issues.
- **Carry forward:** Yes

### Verification checks (not takeaways)

- **Weekly stats email first full send:** confirm all teachers received the Sept 14 Monday noon email (#274 shipped in v13.2.0).
- **Term report start date:** resolve July 1 (message) vs June 1 (commit `e0204ba`) discrepancy.
- **OpenRouter billing:** auto-refill order (Rahul primary, Thilak fallback) reported done; #276 (P3, migrate API key from personal to school account) remains open as related follow-up.
- **Compensation:** confirm next paycheck reflects the 35k salary bump.
- **Reimbursements:** send Claude receipts + ad-hoc credit refill receipts, tag Harish Fernandes.

### Rahul's Takeaways

- **R-async-1 — Test the structured assessments matching UI (supers-only) and share thoughts.** Follow up next meeting.
- Prior R1/R2 from 2026-08-20 remain open follow-ups unless superseded; R3 (four program prompt edits) resolved 2026-09-23 - Rahul responded and T2 validation completed.
