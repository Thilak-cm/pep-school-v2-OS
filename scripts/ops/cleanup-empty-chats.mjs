/**
 * Remove legacy/orphan Coach Pepper chats that contain no durable messages.
 *
 * Usage:
 *   node scripts/ops/cleanup-empty-chats.mjs          # dry-run (default)
 *   node scripts/ops/cleanup-empty-chats.mjs --yes    # execute after review
 */
import admin from "firebase-admin";
import { parseArgs } from "node:util";

import { deleteEmptyChat, inspectChat } from "./cleanup-empty-chats-lib.mjs";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();
const { values: flags } = parseArgs({
  options: { yes: { type: "boolean", default: false } },
  strict: true,
});
const dryRun = !flags.yes;

function isStudentChatPath(path) {
  return /^students\/[^/]+\/chats\/[^/]+$/.test(path);
}

function printSkip(path, reason) {
  console.log(`!!! SKIP ${path}: ${reason}`);
}

async function scanChats() {
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
      return inspectChat(chatDoc);
    }));

    for (const inspected of inspectedBatch) {
      if (inspected.classification.action === "delete") {
        candidates.push(inspected);
      } else if (inspected.classification.action === "skip") {
        printSkip(inspected.chatDoc.ref.path, inspected.classification.reason);
        skipped += 1;
      } else {
        kept += 1;
      }
    }
  }
  return { candidates, kept, skipped, scanned: snapshot.size };
}

async function run() {
  console.log("\n=== Empty Coach Pepper Chat Cleanup ===");
  console.log(`Project: pep-os`);
  console.log(`Mode: ${dryRun ? "DRY RUN (pass --yes only after reviewing these IDs)" : "LIVE"}\n`);

  const scan = await scanChats();
  for (const candidate of scan.candidates) {
    console.log(`CANDIDATE ${candidate.chatDoc.ref.path} (${candidate.turnDocs.length} terminal turn(s))`);
  }

  let deleted = 0;
  let liveSkipped = 0;
  if (!dryRun) {
    for (const original of scan.candidates) {
      // The approved dry-run can become stale. Re-read every candidate directly
      // before deletion and skip on any new message, turn state, or collection.
      const currentSnapshot = await original.chatDoc.ref.get();
      if (!currentSnapshot.exists) {
        printSkip(original.chatDoc.ref.path, "chat no longer exists");
        liveSkipped += 1;
        continue;
      }
      const current = await inspectChat(currentSnapshot);
      if (current.classification.action !== "delete") {
        printSkip(current.chatDoc.ref.path, `changed since scan: ${current.classification.reason}`);
        liveSkipped += 1;
        continue;
      }
      await deleteEmptyChat({ chatRef: current.chatDoc.ref, terminalTurns: current.turnDocs });
      console.log(`DELETED ${current.chatDoc.ref.path}`);
      deleted += 1;
    }
  }

  console.log("\nSummary");
  console.log(`Scanned: ${scan.scanned}`);
  console.log(`Kept with messages: ${scan.kept}`);
  console.log(`Highlighted skips: ${scan.skipped + liveSkipped}`);
  console.log(`${dryRun ? "Candidates" : "Deleted"}: ${dryRun ? scan.candidates.length : deleted}`);
}

await run();
