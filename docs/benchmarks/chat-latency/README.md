# Coach Pepper latency benchmark

This package is the reproducible measurement contract for GitHub issue #234. It intentionally contains no student names, IDs, messages from real teachers, observations, prompts assembled by the server, tool arguments, or tool results.

## Metrics

- Primary: browser Send → first answer text visibly painted.
- Secondary: browser Send → terminal event.
- Server: every versioned stage emitted by `chat_server_latency`.
- Bytes: `providerResponseBytes` measures encoded bytes read from OpenRouter;
  `sseResponseBytes` measures encoded SSE records written by the server.
- Percentiles: nearest-rank p50 and p95, plus count, minimum, and maximum.

## Workload

Use `prompt-set.v1.json` in order. Complete 10 successful turns in each group:

1. `direct`
2. `observation-context`
3. `tool-assisted`

Use students from anonymized `small`, `medium`, and `large` recent-observation-history buckets. Record only the bucket, `clientTurnId`, workload type, and prompt case ID in the local case manifest. A failed attempt remains in the telemetry export but does not replace one of the 30 successful cases.

Do not overlap benchmark turns. Sequential execution lets the Cloud Logging `receivedAt` order be checked against the case order without adding benchmark labels to normal production telemetry.

## Mid-issue deployment sequence

1. Run all chat tests, Functions lint, and the production frontend build.
2. Confirm the feature-branch commit and rollback revision.
3. Deploy only `childChatStream`, `chatClientTelemetry`, and Hosting after explicit approval.
4. Confirm the installed PWA reports the new app version.
5. Smoke-test success, provider/tool failure, authentication retry, Stop, and navigation abort.
6. Confirm every attempt has one `chat_server_latency` event and terminal client events reach `chat_client_latency`.
7. Inspect sampled events for forbidden content before running the benchmark.

## Export format

Create a local JSON file with this shape:

```json
{
  "clientEvents": [],
  "serverEvents": [],
  "cases": [
    {
      "clientTurnId": "opaque-client-turn-id",
      "workloadType": "direct",
      "historyBucket": "small",
      "caseId": "direct-01"
    }
  ]
}
```

Export only structured events where `eventName` is `chat_client_latency` or `chat_server_latency`. Remove Cloud Logging envelope fields that are not needed by the analyzer. Do not commit authentication data, user identifiers, IP addresses, user agents, or request headers.

Run:

```bash
node scripts/ops/analyze-chat-latency.mjs /path/to/combined-export.json
```

After the production run, commit the sanitized combined export as `baseline.v1.json` and the interpreted findings as `baseline-report.md`. The report must include coverage gaps, the stage waterfall, workload and `byInstanceWarmth` cold/warm instance breakdowns, failures, and ranked bottlenecks for #235.

## Required coverage checks

- One server summary for every POST attempt, including early failures and disconnects.
- Client/server correlation for every successful benchmark turn.
- Duplicate client deliveries reported and deduplicated by `eventId`.
- Missing client or server records explicitly counted.
- Client percentile breakdowns use the same client/server-matched population as
  the overall distribution; unmatched attempts remain visible in coverage.
- No real chat, observation, prompt, student, teacher, classroom, tool-argument, or tool-result content.
