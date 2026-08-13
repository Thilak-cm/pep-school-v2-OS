import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TARGETS = {
  primary: "primary",
  toddler: "primary",
  elementary: "elementary",
  adolescent: "adolescent",
};

export async function loadBrainChatConfig(program, root = ROOT) {
  const folder = TARGETS[program] || program;
  const promptPath = join(root, "brain", folder, "teacher-facing", "chat", "prompt.md");
  const configPath = join(root, "brain", folder, "teacher-facing", "chat", "config.json");
  const [systemPrompt, rawConfig] = await Promise.all([readFile(promptPath, "utf8"), readFile(configPath, "utf8")]);
  const config = JSON.parse(rawConfig);
  if (!systemPrompt.trim() || !Number.isFinite(config.chatMessageLimit) || !Number.isFinite(config.observationWindowDays)) {
    throw new Error(`Invalid Brain chat config for ${program}`);
  }
  return { ...config, systemPrompt: systemPrompt.trim() };
}

export async function buildChatConfigMigration(root = ROOT) {
  const writes = [];
  for (const [program, source] of Object.entries(TARGETS)) {
    writes.push({ path: `config/chat_${program}`, fields: await loadBrainChatConfig(source, root) });
  }
  return writes;
}

async function main() {
  const apply = process.argv.includes("--yes");
  const writes = await buildChatConfigMigration();
  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${writes.length} chat config documents`);
  for (const write of writes) console.log(`  ${write.path}: ${Object.keys(write.fields).sort().join(", ")}`);
  if (!apply) {
    console.log("No writes performed. Re-run with --yes to apply.");
    return;
  }
  const admin = (await import("firebase-admin")).default;
  if (!admin.apps.length) admin.initializeApp({ projectId: "pep-os" });
  const db = admin.firestore();
  const batch = db.batch();
  for (const write of writes) batch.set(db.doc(write.path), write.fields, { merge: false });
  await batch.commit();
  console.log("Applied atomically.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
