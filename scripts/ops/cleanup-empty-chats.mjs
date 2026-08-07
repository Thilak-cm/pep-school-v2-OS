/**
 * Remove legacy/orphan Coach Pepper chats that contain no durable messages.
 *
 * Usage:
 *   node scripts/ops/cleanup-empty-chats.mjs          # dry-run (default)
 *   node scripts/ops/cleanup-empty-chats.mjs --yes    # execute after review
 */
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

import { deleteEmptyChatSafely, inspectChat } from "./cleanup-empty-chats-lib.mjs";

export function parseCleanupArgs(args = process.argv.slice(2)) {
  return parseArgs({
    args,
    options: { yes: { type: "boolean", default: false } },
    strict: true,
  }).values;
}

function isStudentChatPath(path) {
  return /^students\/[^/]+\/chats\/[^/]+$/.test(path);
}

function printSkip(log, path, reason) {
  log(`!!! SKIP ${path}: ${reason}`);
}

export async function scanChats({ db, log = console.log, inspect = inspectChat }) {
  const snapshot = await db.collectionGroup("chats").get();
  const candidates = [];
  let kept = 0;
  let skipped = 0;
  const inspectionBatchSize = 10;

  for (let index = 0; index < snapshot.docs.length; index += inspectionBatchSize) {
    const batch = snapshot.docs.slice(index, index + inspectionBatchSize);
    const inspectedBatch = await Promise.all(batch.map(async (chatDoc) => {
      if (!isStudentChatPath(chatDoc.ref.path)) {
        return { chatDoc, classification: { action: "skip", reason: "unexpected chat document path" } };
      }
      return inspect(chatDoc);
    }));

    for (const inspected of inspectedBatch) {
      if (inspected.classification.action === "delete") {
        candidates.push(inspected);
      } else if (inspected.classification.action === "skip") {
        printSkip(log, inspected.chatDoc.ref.path, inspected.classification.reason);
        skipped += 1;
      } else {
        kept += 1;
      }
    }
  }
  return { candidates, kept, skipped, scanned: snapshot.size };
}

export async function runCleanup({
  db,
  yes = false,
  log = console.log,
  inspect = inspectChat,
  deleteCandidate = deleteEmptyChatSafely,
}) {
  const dryRun = !yes;
  log("\n=== Empty Coach Pepper Chat Cleanup ===");
  log("Project: pep-os");
  log(`Mode: ${dryRun ? "DRY RUN (pass --yes only after reviewing these IDs)" : "LIVE"}\n`);

  const scan = await scanChats({ db, log, inspect });
  for (const candidate of scan.candidates) {
    const turnIds = candidate.turnDocs.map((turn) => turn.id);
    log(`CANDIDATE ${candidate.chatDoc.ref.path} (terminal turn IDs: ${turnIds.join(", ") || "none"})`);
  }

  let deleted = 0;
  let liveSkipped = 0;
  if (!dryRun) {
    for (const original of scan.candidates) {
      const result = await deleteCandidate({
        db,
        chatRef: original.chatDoc.ref,
        expectedTerminalTurnIds: original.turnDocs.map((turn) => turn.id),
      });
      if (!result.deleted) {
        printSkip(log, original.chatDoc.ref.path, result.reason);
        liveSkipped += 1;
        continue;
      }
      log(`DELETED ${original.chatDoc.ref.path}`);
      deleted += 1;
    }
  }

  log("\nSummary");
  log(`Scanned: ${scan.scanned}`);
  log(`Kept with messages: ${scan.kept}`);
  log(`Highlighted skips: ${scan.skipped + liveSkipped}`);
  log(`${dryRun ? "Candidates" : "Deleted"}: ${dryRun ? scan.candidates.length : deleted}`);
  return { ...scan, deleted, liveSkipped, dryRun };
}

async function main() {
  const { default: admin } = await import("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: "pep-os",
    });
  }
  await runCleanup({ db: admin.firestore(), yes: parseCleanupArgs().yes });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
