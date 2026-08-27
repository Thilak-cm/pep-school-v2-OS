// Sync the program-specific soul prompts from the review markdown file.
//
// Usage:
//   node scripts/admin/sync-soul-program-prompts.mjs
//   node scripts/admin/sync-soul-program-prompts.mjs --source /path/to/soul-generation-prompts.md
//   node scripts/admin/sync-soul-program-prompts.mjs --yes
//
// The script is dry-run by default. Pass --yes only after reviewing the
// document and field-level write plan printed by the dry run.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_SOURCE = resolve(ROOT, "../soul-generation-prompts.md");
const TARGETS = [
  { section: "Elementary", docId: "soul_generation_elementary" },
  { section: "Adolescent", docId: "soul_generation_adolescent" },
];

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function extractPrompt(markdown, section) {
  const sectionStart = markdown.search(new RegExp(`^## ${section}$`, "m"));
  if (sectionStart === -1) throw new Error(`Section not found: ## ${section}`);

  const nextSection = markdown.slice(sectionStart + 1).search(
    /^## (Toddler and Primary|Elementary|Adolescent)$/m,
  );
  const sectionText = markdown.slice(
    sectionStart,
    nextSection === -1 ? markdown.length : sectionStart + 1 + nextSection,
  );
  const promptMatch = sectionText.match(/^### System prompt\n\n([\s\S]*)$/m);
  if (!promptMatch) throw new Error(`System prompt not found under ## ${section}`);

  return promptMatch[1].trim();
}

function normalize(value) {
  return value.replace(/\r\n/g, "\n").trim();
}

export async function loadSource(sourcePath) {
  const markdown = await readFile(sourcePath, "utf8");
  const prompts = Object.fromEntries(
    ["Toddler and Primary", ...TARGETS.map((target) => target.section)].map((section) => [
      section,
      extractPrompt(markdown, section),
    ]),
  );

  return prompts;
}

async function main() {
  const apply = process.argv.includes("--yes");
  const sourcePath = resolve(getArgValue("--source") || DEFAULT_SOURCE);
  const prompts = await loadSource(sourcePath);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: "pep-os",
    });
  }

  const db = admin.firestore();
  const changes = [];

  for (const target of TARGETS) {
    const ref = db.collection("config").doc(target.docId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error(`Missing Firestore document: config/${target.docId}`);

    const current = normalize(snapshot.data().systemPrompt || "");
    const next = normalize(prompts[target.section]);
    changes.push({
      ref,
      docId: target.docId,
      changed: current !== next,
      currentLength: current.length,
      nextLength: next.length,
      next,
    });
  }

  console.log(`${apply ? "APPLY" : "DRY RUN"}: soul prompt sync from ${sourcePath}`);
  for (const change of changes) {
    console.log(`  config/${change.docId}`);
    console.log(`    field: systemPrompt`);
    console.log(`    action: ${change.changed ? "update" : "no change"}`);
    console.log(`    current length: ${change.currentLength} chars`);
    console.log(`    source length: ${change.nextLength} chars`);
  }

  const pending = changes.filter((change) => change.changed);
  if (!apply) {
    console.log(`No writes performed. ${pending.length} document(s) would be updated.`);
    console.log("Re-run with --yes to apply.");
    return;
  }

  if (pending.length === 0) {
    console.log("No writes needed.");
    return;
  }

  const batch = db.batch();
  for (const change of pending) {
    batch.update(change.ref, {
      systemPrompt: change.next,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`Applied ${pending.length} update(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Fatal: ${error.message}`);
    process.exitCode = 1;
  });
}
