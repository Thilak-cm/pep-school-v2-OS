# Scheduled Cloud Functions

Canonical inventory of cron-triggered Cloud Functions. Keep this document in
sync with the `.pubsub.schedule(...)` declarations under `functions/`.

All schedules use the `Asia/Kolkata` timezone unless noted otherwise. These are
Firebase Functions v1 Pub/Sub schedules and use asynchronous `onRun` handlers.

## Daily

| IST schedule | Function | Module | Execution pattern | Purpose |
|---|---|---|---|---|
| Every day at 06:00 | `dataIntegrityChecks` | `functions/integrity/index.js` | Direct async work | Runs registered data-integrity checks and sends pass/failure results to configured Telegram chats. |
| Every day at 03:15 | `cleanupStaleAssessmentUploads` | `functions/assessments/index.js` | Direct async work | Retries deletion of stale Structured and Medical staging files, retaining failed cleanup references for later retries. |

## Weekly

| IST schedule | Function | Module | Execution pattern | Purpose |
|---|---|---|---|---|
| Sunday at 00:00 | `generateBaseballCards` | `functions/ai/baseballCard.js` | Direct async work | Generates baseball-card summaries for active students and rebuilds the heatmap cache. |
| Sunday at 04:00 | `reconcileStats` | `functions/stats/index.js` | Classroom-by-classroom paginated rebuild | Reconciles every stats cache from source observations and seeds the delta checkpoint. |
| Sunday at 18:00 | `weeklyDigestClassroomAdmin` | `functions/digest/index.js` | Direct async work | Generates, stores, and emails classroom-admin weekly digests. |
| Sunday at 18:45 | `weeklyDigestSuperadmin` | `functions/digest/index.js` | Direct async work | Generates and emails a consolidated superadmin digest from classroom digests. The 45-minute offset is not a guaranteed completion dependency on the first digest job. |
| Sunday at 00:30 | `generateWritingAnalysis` | `functions/ai/handwriting.js` | Direct async work | Runs writing analysis for all active students and archives prior scheduled results. Moved from Monday 00:00 to Sunday 00:30 so digests consume same-week results (#229). |
| Sunday at 01:00 | `verifyWeeklyStudentAI` | `functions/verification/index.js` | Verifier | Verifies baseball-card and writing-analysis outputs for all active students (#229). |
| Sunday at 19:15 | `verifyWeeklyDigests` | `functions/verification/index.js` | Verifier | Verifies classroom-admin and superadmin digest outputs (#229). |

## Monthly

| IST schedule | Function | Module | Execution pattern | Purpose |
|---|---|---|---|---|
| Day 1 at 00:00 | `cleanupDeletedChats` | `functions/chat/cleanupDeletedChats.js` | Direct async work | Hard-deletes soft-deleted chats older than 31 days, including subcollections. |
| Day 1 at 00:30 | `verifyCleanupDeletedChats` | `functions/verification/index.js` | Verifier | Verifies chat cleanup completed for all targeted docs (#229). |
| Day 1 at 02:00 | `regenerateSoulsMonthly` | `functions/students/soul.js` | Async dispatcher | Finds active students and publishes batches to the `soul-workers` Pub/Sub topic. Each batch message carries a `targetMonth` (YYYY-MM) used by the worker for idempotency - students whose soul doc already has `generatedForMonth === targetMonth` are skipped. Actual generation runs in `soulWorker`, which is Pub/Sub-triggered rather than cron-triggered. |
| Day 1 at 04:00 | `verifySoulRegeneration` | `functions/verification/index.js` | Verifier | Verifies soul regeneration outputs for all active students (+2h provisional offset, #229). |
| Last day at 00:00 | `batchGenerateMonthlyPlans` | `functions/monthlyPlan/index.js` | Async dispatcher | Cron expression fires on days 28-31; an IST runtime guard allows processing only on the actual last day. Publishes eligible students to the monthly-plan worker topic. Actual generation and Drive export run in `monthlyPlanWorker`, which is Pub/Sub-triggered rather than cron-triggered. |
| Last day at 03:00 | `verifyMonthlyPlans` | `functions/verification/index.js` | Verifier | Verifies monthly plan generation + Drive export for all dispatched students (+3h provisional offset, same last-day guard, #229). |

## Source-of-truth details

| Function | Cron expression | Source |
|---|---|---|
| `dataIntegrityChecks` | `0 6 * * *` | `functions/integrity/index.js` |
| `cleanupStaleAssessmentUploads` | `15 3 * * *` | `functions/assessments/index.js` |
| `generateBaseballCards` | `0 0 * * 0` | `functions/ai/baseballCard.js` |
| `reconcileStats` | `0 4 * * 0` | `functions/stats/index.js` |
| `weeklyDigestClassroomAdmin` | `0 18 * * 0` | `functions/digest/index.js` |
| `weeklyDigestSuperadmin` | `45 18 * * 0` | `functions/digest/index.js` |
| `generateWritingAnalysis` | `30 0 * * 0` | `functions/ai/handwriting.js` |
| `verifyWeeklyStudentAI` | `0 1 * * 0` | `functions/verification/index.js` |
| `verifyWeeklyDigests` | `15 19 * * 0` | `functions/verification/index.js` |
| `cleanupDeletedChats` | `0 0 1 * *` | `functions/chat/cleanupDeletedChats.js` |
| `verifyCleanupDeletedChats` | `30 0 1 * *` | `functions/verification/index.js` |
| `regenerateSoulsMonthly` | `0 2 1 * *` | `functions/students/soul.js` |
| `verifySoulRegeneration` | `0 4 1 * *` | `functions/verification/index.js` |
| `batchGenerateMonthlyPlans` | `0 0 28-31 * *` | `functions/monthlyPlan/index.js` (plus last-day guard) |
| `verifyMonthlyPlans` | `0 3 28-31 * *` | `functions/verification/index.js` (plus last-day guard) |

## Maintenance rules

- When adding, removing, or changing a `.pubsub.schedule(...)` function, update
  this inventory in the same change.
- Verify the explicit `.timeZone(...)` declaration before changing the timezone
  shown above. Do not infer production timing from the developer machine's
  timezone.
- Keep Pub/Sub workers listed separately from cron jobs unless they also have a
  schedule trigger.
- **Deployment prerequisite:** Before releasing `updateStatsDelta`, invoke
  `reconcileStats` manually once to seed its exact `createdAt + documentPath`
  checkpoint and compact rolling state. Existing classroom cache docs lack the
  `aggregationState.version: 2` field that `applyDeltaToCache` requires; without
  a prior reconcile, every `updateStatsDelta` call will fail until the next
  scheduled Sunday run. Deploy Firestore indexes first and wait for READY status
  before triggering reconcile.
- Stats publication uses one Firestore transaction and therefore fails safely
  before writing when more than 450 classroom documents, a 900 KiB classroom
  document, or 8 MiB of serialized cache payload would be published. The limits
  reserve headroom below Firestore's 500-write, 1 MiB-document, and 10 MiB
  transaction ceilings; the previous active cache remains untouched when a guard
  is exceeded.
