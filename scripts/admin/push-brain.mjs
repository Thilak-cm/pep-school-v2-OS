/**
 * push-brain — syncs the local brain/ folder to the Firestore `brain`
 * collection (#157). Run from repo root:
 *
 *   npm run push-brain
 *
 * Flow:
 *   1. Walk brain/ (skips manifest, BRAIN_RULES.md, hidden files)
 *   2. Validate (fixed files present, no blanks, no duplicates, valid JSON)
 *   3. Detect structural changes vs .brain-manifest.json (extra confirmation)
 *   4. Diff against Firestore checksums: NEW / CHANGED / DELETED / UNCHANGED
 *   5. Show summary (+/- line deltas); `d` shows full diffs
 *   6. On confirmed `y`: batched writes + parent metadata + manifest update
 *
 * DESIGN DECISIONS (issue #157):
 * - Checksums (SHA-256) let us skip unchanged files without downloading
 *   content; old content is fetched only for CHANGED files (line deltas/diffs).
 * - Sync attribution comes from git config — there is no Firebase Auth user
 *   under applicationDefault credentials. (Decision 12)
 * - The local folder is the source of truth: docs in Firestore with no local
 *   counterpart are DELETED (with confirmation).
 */

import admin from "firebase-admin";
import { execSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

import {
  walkBrainFolder,
  readFileContent,
  classifyFile,
  buildDocId,
  buildFileDoc,
  computeChecksum,
  extractFolders,
  detectStructuralChanges,
  diffStates,
  validateBrainTree,
  buildParentMetadata,
  countLineDelta,
} from "./push-brain.helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const BRAIN_ROOT = join(REPO_ROOT, "brain");
const MANIFEST_PATH = join(BRAIN_ROOT, ".brain-manifest.json");

// Fixed top-level structure — remote fetch covers all four regardless of
// local state so deletions are detected even if a local folder vanished.
const PROGRAMS = ["school-wide", "primary", "elementary", "adolescent"];

const BATCH_LIMIT = 400;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function gitIdentity() {
  try {
    const name = execSync("git config user.name", { cwd: REPO_ROOT }).toString().trim();
    const email = execSync("git config user.email", { cwd: REPO_ROOT }).toString().trim();
    if (!name || !email) throw new Error("empty");
    return { name, email };
  } catch {
    console.error("Could not read git identity. Set it with:");
    console.error('  git config user.name "Your Name" && git config user.email "you@example.com"');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Remote fetch
// ---------------------------------------------------------------------------

/** Fetches { path, checksum, docId, program } for every remote doc (light projection). */
async function fetchRemoteIndex() {
  const remote = [];
  for (const program of PROGRAMS) {
    const snap = await db
      .collection("brain").doc(program).collection("files")
      .select("path", "checksum")
      .get();
    for (const d of snap.docs) {
      remote.push({ path: d.data().path, checksum: d.data().checksum, docId: d.id, program });
    }
  }
  return remote;
}

/** Fetches full content for one remote doc (only used for CHANGED/diff display). */
async function fetchRemoteContent(program, docId) {
  const snap = await db.collection("brain").doc(program).collection("files").doc(docId).get();
  return snap.exists ? (snap.data().content ?? "") : "";
}

// ---------------------------------------------------------------------------
// Diff display
// ---------------------------------------------------------------------------

function showFullDiff(remoteContent, localPath, relativePath) {
  const tmp = mkdtempSync(join(tmpdir(), "brain-diff-"));
  const remoteFile = join(tmp, "remote");
  writeFileSync(remoteFile, remoteContent);
  try {
    // git diff --no-index exits 1 when files differ — capture output either way
    execSync(`git diff --no-index --color -- "${remoteFile}" "${localPath}"`, {
      stdio: ["ignore", "inherit", "inherit"],
    });
  } catch {
    // non-zero exit = files differ; diff already printed to stdout
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`  ^ ${relativePath}\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const identity = gitIdentity();
  console.log(`push-brain — syncing brain/ to Firestore (as ${identity.name} <${identity.email}>)\n`);

  // 1. Walk + read + classify
  const walked = walkBrainFolder(BRAIN_ROOT);
  const entries = [];
  const classifyErrors = [];
  for (const f of walked) {
    const content = readFileContent(f.fullPath);
    try {
      const classified = classifyFile(f.relativePath);
      entries.push({ ...f, content, classified });
    } catch (err) {
      classifyErrors.push({ path: f.relativePath, message: err.message });
    }
  }

  // 2. Validate — every error blocks the push
  const errors = [
    ...classifyErrors,
    ...validateBrainTree(entries.map((e) => ({ relativePath: e.relativePath, content: e.content }))),
  ];
  if (errors.length > 0) {
    console.error("Validation failed — fix these before pushing:\n");
    for (const e of errors) console.error(`  ✗ ${e.path}: ${e.message}`);
    process.exit(1);
  }
  console.log(`Validated ${entries.length} files — OK`);

  // 3. Structural changes vs manifest
  const currentFolders = extractFolders(entries.map((e) => e.relativePath));
  let manifestFolders = [];
  try {
    manifestFolders = JSON.parse(readFileContent(MANIFEST_PATH)).folders ?? [];
  } catch {
    console.log("No readable .brain-manifest.json — treating current structure as new.");
  }
  const structural = detectStructuralChanges(currentFolders, manifestFolders);
  if (structural.added.length > 0 || structural.removed.length > 0) {
    console.log("\n⚠ STRUCTURAL CHANGES DETECTED (folders differ from manifest):");
    for (const f of structural.added) console.log(`  + folder added:   ${f}`);
    for (const f of structural.removed) console.log(`  - folder removed: ${f}`);
    console.log("\nFolder structure is managed deliberately (see BRAIN_RULES.md).");
    const okStructural = await ask("Are these structural changes intentional? (y/N) ");
    if (!okStructural.startsWith("y")) {
      console.log("Aborted — no changes pushed.");
      process.exit(0);
    }
  }

  // 4. Diff against remote
  const local = entries.map((e) => ({
    ...e,
    path: e.relativePath,
    checksum: computeChecksum(e.content),
    docId: buildDocId(e.classified),
  }));
  const remote = await fetchRemoteIndex();
  const diff = diffStates(local, remote);

  // 5. Summary (fetch old content only for CHANGED files)
  const changedWithOld = [];
  for (const file of diff.changed) {
    const remoteDoc = remote.find((r) => r.path === file.path);
    const oldContent = await fetchRemoteContent(remoteDoc.program, remoteDoc.docId);
    changedWithOld.push({ file, oldContent });
  }

  console.log("");
  for (const f of diff.new) console.log(`  NEW:       ${f.path}`);
  for (const { file, oldContent } of changedWithOld) {
    const { added, removed } = countLineDelta(oldContent, file.content);
    console.log(`  CHANGED:   ${file.path} (+${added}, -${removed})`);
  }
  for (const d of diff.deleted) console.log(`  DELETE:    ${d.path}`);
  console.log(`  UNCHANGED: ${diff.unchanged.length} files\n`);

  const toWrite = diff.new.length + diff.changed.length;
  if (toWrite === 0 && diff.deleted.length === 0) {
    console.log("Nothing to push — Firestore matches local.");
    process.exit(0);
  }

  // 6. Confirm (d = full diffs)
  let answer = await ask(
    `${toWrite} to upload, ${diff.deleted.length} to delete. Proceed? (y/N, d=show diffs) `,
  );
  if (answer.startsWith("d")) {
    console.log("");
    for (const { file, oldContent } of changedWithOld) {
      showFullDiff(oldContent, file.fullPath, file.path);
    }
    for (const f of diff.new) console.log(`  NEW (full content will upload): ${f.path}`);
    for (const d of diff.deleted) console.log(`  DELETE (doc will be removed): ${d.path}`);
    answer = await ask(`\n${toWrite} to upload, ${diff.deleted.length} to delete. Proceed? (y/N) `);
  }
  if (!answer.startsWith("y")) {
    console.log("Aborted — no changes pushed.");
    process.exit(0);
  }

  // 7. Batched writes
  let batch = db.batch();
  let batchCount = 0;
  const commitIfFull = async () => {
    if (batchCount >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  };

  for (const file of [...diff.new, ...diff.changed]) {
    const ref = db.collection("brain").doc(file.classified.program)
      .collection("files").doc(file.docId);
    batch.set(ref, {
      ...buildFileDoc(file.classified, file.path, file.content),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batchCount++;
    await commitIfFull();
  }
  for (const d of diff.deleted) {
    const ref = db.collection("brain").doc(d.program).collection("files").doc(d.docId);
    batch.delete(ref);
    batchCount++;
    await commitIfFull();
  }

  // Parent metadata per program (docCount/pipelineIds reflect full local state)
  for (const program of PROGRAMS) {
    const programFiles = local.filter((f) => f.classified.program === program);
    if (programFiles.length === 0) continue;
    const meta = buildParentMetadata(program, programFiles.map((f) => f.classified), identity);
    const ref = db.collection("brain").doc(program);
    batch.set(ref, { ...meta, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    batchCount++;
    await commitIfFull();
  }

  if (batchCount > 0) await batch.commit();

  // 8. Manifest auto-update (structure confirmed above)
  writeFileSync(MANIFEST_PATH, JSON.stringify({ folders: currentFolders }, null, 2) + "\n");

  console.log(`\nDone. Uploaded ${toWrite}, deleted ${diff.deleted.length}.`);
  console.log("Reminder: commit the brain/ folder to git to keep the repo in sync:");
  console.log('  git add brain/ && git commit -m "brain: update knowledge" && git push');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
