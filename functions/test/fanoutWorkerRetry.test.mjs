/**
 * #288: fan-out workers must opt into Pub/Sub redelivery.
 *
 * CF v1 background functions ACK every invocation end (success, throw, OR
 * timeout) unless runWith({ failurePolicy: true }) is set. Without it, the
 * shared fanout.js "rethrow so Pub/Sub redelivers" contract is silently
 * false and thrown/timed-out messages are dropped forever (the W37
 * writingAnalysis silent miss). This static check pins the flag on all four
 * workers so a future refactor can't quietly drop it.
 *
 * Pattern follows test/scheduledCloudFunctions.test.mjs (source-scan test).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const FUNCTIONS_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const WORKERS = [
  { name: "writingAnalysisWorker", file: "ai/handwriting.js" },
  { name: "baseballCardWorker", file: "ai/baseballCard.js" },
  { name: "soulWorker", file: "students/soul.js" },
  { name: "monthlyPlanWorker", file: "monthlyPlan/index.js" },
];

test("all four fan-out workers set failurePolicy: true (#288)", async () => {
  for (const { name, file } of WORKERS) {
    const source = await readFile(path.resolve(FUNCTIONS_ROOT, file), "utf8");

    // Capture the declaration from `export const <name>` through `.onPublish(`.
    const declPattern = new RegExp(
      `export const ${name}[\\s\\S]*?\\.onPublish\\(`,
    );
    const match = source.match(declPattern);
    assert.ok(match, `${file}: could not find declaration of ${name}`);

    assert.match(
      match[0],
      /failurePolicy:\s*true/,
      `${file}: ${name} must set failurePolicy: true in runWith - without it, ` +
      "thrown/timed-out invocations are ACKed and messages are dropped forever",
    );
  }
});
