#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

function round(value) {
  return Math.round(value * 1000) / 1000;
}

export function latencyStats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const nearestRank = (percentile) => sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
  return {
    count: sorted.length,
    min: round(sorted[0]),
    max: round(sorted.at(-1)),
    p50: round(nearestRank(0.5)),
    p95: round(nearestRank(0.95)),
  };
}

function uniqueBy(values, key) {
  const map = new Map();
  for (const value of values) {
    const id = value?.[key];
    if (id) map.set(id, value);
  }
  return [...map.values()];
}

function clientDistribution(turns) {
  return {
    firstVisibleToken: latencyStats(turns.map((turn) => turn.milestones?.firstVisibleToken)),
    completion: latencyStats(turns.map((turn) => turn.milestones?.terminalEvent)),
  };
}

function groupDistribution(rows, key) {
  const groups = {};
  for (const row of rows) {
    const value = row[key] || "unknown";
    (groups[value] ||= []).push(row.client);
  }
  return Object.fromEntries(Object.entries(groups).map(([name, turns]) => [name, clientDistribution(turns)]));
}

export function analyzeChatLatency({ clientEvents = [], serverEvents = [], cases = [] } = {}) {
  const clientLatencyEvents = clientEvents.filter((event) => event?.eventName === "chat_client_latency");
  const clients = uniqueBy(clientLatencyEvents, "eventId");
  const serverLatencyEvents = serverEvents.filter((event) => event?.eventName === "chat_server_latency");
  const preflightEvents = serverLatencyEvents.filter((event) =>
    event.dimensions?.requestKind === "cors_preflight" || event.stages?.cors_preflight);
  const postServerEvents = serverLatencyEvents.filter((event) => !preflightEvents.includes(event));
  const correlatedServerEvents = postServerEvents.filter((event) => event.runId);
  const uncorrelatedServerEvents = postServerEvents.filter((event) => !event.runId);
  const correlatedServers = uniqueBy(correlatedServerEvents, "runId");
  // An uncorrelated summary still represents an HTTP attempt. It cannot be
  // safely deduplicated, so retain every one in coverage and stage statistics.
  const servers = [...correlatedServers, ...uncorrelatedServerEvents];
  const serverByRun = new Map(correlatedServers.map((event) => [event.runId, event]));
  const caseByClient = new Map(cases.map((item) => [item.clientTurnId, item]));
  const referencedRuns = new Set(clients.flatMap((event) => event.attemptRunIds || []));

  const matchedRows = clients
    .map((client) => {
      const server = serverByRun.get(client.finalRunId);
      if (!server) return null;
      const benchmarkCase = caseByClient.get(client.clientTurnId) || {};
      return {
        client,
        server,
        workloadType: benchmarkCase.workloadType || "unknown",
        historyBucket: benchmarkCase.historyBucket || "unknown",
        instanceWarmth: server.dimensions?.coldInstance ? "cold" : "warm",
      };
    })
    .filter(Boolean);

  const stageValues = {};
  const outcomeGroups = {};
  for (const { client } of matchedRows) {
    (outcomeGroups[client.outcome || "unknown"] ||= []).push(client);
  }
  for (const server of servers) {
    for (const [stage, measurement] of Object.entries(server.stages || {})) {
      if (Number.isFinite(measurement?.durationMs)) (stageValues[stage] ||= []).push(measurement.durationMs);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    percentileMethod: "nearest-rank",
    coverage: {
      uniqueClientTurns: clients.length,
      uniqueServerAttempts: servers.length,
      serverSummaries: serverLatencyEvents.length,
      postServerSummaries: postServerEvents.length,
      corsPreflightSummaries: preflightEvents.length,
      matchedClientTurns: matchedRows.length,
      clientTurnsMissingServer: clients.length - matchedRows.length,
      clientAttemptsMissingServer: [...referencedRuns]
        .filter((runId) => !serverByRun.has(runId)).length,
      serverAttemptsMissingClient: correlatedServers
        .filter((event) => !referencedRuns.has(event.runId)).length + uncorrelatedServerEvents.length,
      uncorrelatedServerAttempts: uncorrelatedServerEvents.length,
      duplicateClientDeliveries: clientLatencyEvents.length - clients.length,
      duplicateServerSummaries: correlatedServerEvents.length - correlatedServers.length,
    },
    overall: clientDistribution(matchedRows.map((row) => row.client)),
    serverStages: Object.fromEntries(Object.entries(stageValues).map(([name, values]) => [name, latencyStats(values)])),
    corsPreflight: latencyStats(preflightEvents
      .map((event) => event.stages?.cors_preflight?.durationMs)),
    byWorkload: groupDistribution(matchedRows, "workloadType"),
    byHistoryBucket: groupDistribution(matchedRows, "historyBucket"),
    byInstanceWarmth: groupDistribution(matchedRows, "instanceWarmth"),
    byOutcome: Object.fromEntries(Object.entries(outcomeGroups)
      .map(([outcome, turns]) => [outcome, clientDistribution(turns)])),
  };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/ops/analyze-chat-latency.mjs <combined-export.json>");
    process.exitCode = 1;
    return;
  }
  const input = JSON.parse(await readFile(path.resolve(inputPath), "utf8"));
  process.stdout.write(`${JSON.stringify(analyzeChatLatency(input), null, 2)}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
