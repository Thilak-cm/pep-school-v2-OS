#!/usr/bin/env bash
#
# setup-fanout-dlq.sh (#288)
#
# Provisions the shared dead-letter infrastructure for the four fan-out
# worker pipelines (writingAnalysis, baseballCards, soulRegen, monthlyPlans):
#
#   1. Topic `fanout-dlq` - ONE shared DLQ topic for all four workers.
#      Why shared (#288 decision): ~0-5 dead msgs/week total, the source is
#      always identifiable via the CloudPubSubDeadLetterSourceSubscription
#      message attribute, and one artifact is harder to forget than four
#      (#169 was forgotten for months).
#   2. Pull subscription `fanout-dlq-sub` - REQUIRED: a topic with no
#      subscription silently discards messages. Max retention, never expires.
#   3. Dead-letter policy (maxDeliveryAttempts=5 -> fanout-dlq) on each
#      worker's auto-created gcf-* subscription. Without this, a poison
#      message retries for 7 days once failurePolicy is enabled.
#   4. IAM for the Pub/Sub service agent: publisher on fanout-dlq (to
#      forward dead messages) + subscriber on each source subscription
#      (to ack them away after forwarding).
#
# Idempotent: safe to re-run; existing resources are left untouched.
# Dry-run by default - prints the plan. Pass --yes to apply.
#
# Runbook: on a verifier `never_started` red signal, inspect the DLQ before
# manually republishing:
#   gcloud pubsub subscriptions pull fanout-dlq-sub --project=pep-os --limit=10 --format=json
#
set -euo pipefail

PROJECT="pep-os"
DLQ_TOPIC="fanout-dlq"
DLQ_SUB="fanout-dlq-sub"
MAX_DELIVERY_ATTEMPTS=5
# Worker topics (names from functions/ source constants)
WORKER_TOPICS=(
  "writing-analysis-workers"
  "baseball-card-workers"
  "soul-workers"
  "monthly-plan-workers"
)

APPLY=false
[[ "${1:-}" == "--yes" ]] && APPLY=true

run() {
  if $APPLY; then
    echo "+ $*"
    "$@"
  else
    echo "[dry-run] $*"
  fi
}

echo "== setup-fanout-dlq (#288) project=${PROJECT} apply=${APPLY} =="
echo

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format="value(projectNumber)")
PUBSUB_SA="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"
echo "Pub/Sub service agent: ${PUBSUB_SA}"
echo

# --- 1. DLQ topic -----------------------------------------------------------
if gcloud pubsub topics describe "$DLQ_TOPIC" --project="$PROJECT" >/dev/null 2>&1; then
  echo "topic ${DLQ_TOPIC}: exists, skipping"
else
  run gcloud pubsub topics create "$DLQ_TOPIC" --project="$PROJECT"
fi

# --- 2. DLQ pull subscription (retention 7d, never expires) -----------------
if gcloud pubsub subscriptions describe "$DLQ_SUB" --project="$PROJECT" >/dev/null 2>&1; then
  echo "subscription ${DLQ_SUB}: exists, skipping"
else
  run gcloud pubsub subscriptions create "$DLQ_SUB" \
    --project="$PROJECT" \
    --topic="$DLQ_TOPIC" \
    --message-retention-duration=7d \
    --expiration-period=never
fi

# --- 3. IAM: service agent may publish into the DLQ topic -------------------
run gcloud pubsub topics add-iam-policy-binding "$DLQ_TOPIC" \
  --project="$PROJECT" \
  --member="serviceAccount:${PUBSUB_SA}" \
  --role="roles/pubsub.publisher"

# --- 4. Per-worker: dead-letter policy + subscriber IAM ---------------------
for topic in "${WORKER_TOPICS[@]}"; do
  echo
  echo "-- worker topic: ${topic}"

  # Discover the auto-created gcf-* push subscription for this topic.
  gcf_sub=$(gcloud pubsub subscriptions list \
    --project="$PROJECT" \
    --filter="topic:projects/${PROJECT}/topics/${topic} AND name:gcf-" \
    --format="value(name)" | head -1)

  if [[ -z "$gcf_sub" ]]; then
    echo "   WARNING: no gcf-* subscription found for ${topic} (worker not deployed?) - skipping"
    continue
  fi
  echo "   subscription: ${gcf_sub}"

  existing_dlq=$(gcloud pubsub subscriptions describe "$gcf_sub" \
    --project="$PROJECT" --format="value(deadLetterPolicy.deadLetterTopic)" || true)
  if [[ -n "$existing_dlq" ]]; then
    echo "   dead-letter policy: already set (${existing_dlq}), skipping update"
  else
    run gcloud pubsub subscriptions update "$gcf_sub" \
      --project="$PROJECT" \
      --dead-letter-topic="$DLQ_TOPIC" \
      --max-delivery-attempts="$MAX_DELIVERY_ATTEMPTS"
  fi

  # Service agent must be able to ack/pull on the source subscription to
  # remove messages after forwarding them to the DLQ.
  run gcloud pubsub subscriptions add-iam-policy-binding "$gcf_sub" \
    --project="$PROJECT" \
    --member="serviceAccount:${PUBSUB_SA}" \
    --role="roles/pubsub.subscriber"
done

echo
if $APPLY; then
  echo "== done. Verify with:"
else
  echo "== dry-run complete. Re-run with --yes to apply. Verify afterwards with:"
fi
for topic in "${WORKER_TOPICS[@]}"; do
  echo "   gcloud pubsub subscriptions list --project=${PROJECT} --filter=\"topic:${topic}\" --format=\"table(name,deadLetterPolicy.deadLetterTopic,deadLetterPolicy.maxDeliveryAttempts)\""
done
