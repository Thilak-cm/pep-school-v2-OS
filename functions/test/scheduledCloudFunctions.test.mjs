import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const FUNCTIONS_ROOT = path.resolve(REPOSITORY_ROOT, "functions");
const INVENTORY_PATH = path.resolve(
  REPOSITORY_ROOT,
  "docs/SCHEDULED_CLOUD_FUNCTIONS.md",
);

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJavaScriptFiles(entryPath));
    } else if (entry.name.endsWith(".js")) {
      files.push(entryPath);
    }
  }

  return files;
}

async function readScheduledDeclarations() {
  const declarations = [];

  for (const filePath of await listJavaScriptFiles(FUNCTIONS_ROOT)) {
    if (filePath.includes(`${path.sep}test${path.sep}`)) continue;

    const source = await readFile(filePath, "utf8");
    const schedulePattern = /export const (\w+)[\s\S]{0,500}?\.pubsub\.schedule\("([^"]+)"\)/g;

    for (const match of source.matchAll(schedulePattern)) {
      declarations.push({
        functionName: match[1],
        cron: match[2],
        source: path.relative(REPOSITORY_ROOT, filePath),
      });
    }
  }

  return declarations.sort((a, b) => a.functionName.localeCompare(b.functionName));
}

function readInventoryRows(inventory) {
  const rows = [];
  const rowPattern = /^\| `([^`]+)` \| `([^`]+)` \|/gm;

  for (const match of inventory.matchAll(rowPattern)) {
    rows.push({ functionName: match[1], cron: match[2] });
  }

  return rows.sort((a, b) => a.functionName.localeCompare(b.functionName));
}

test("scheduled Cloud Function inventory matches source declarations", async () => {
  const [declarations, inventory] = await Promise.all([
    readScheduledDeclarations(),
    readFile(INVENTORY_PATH, "utf8"),
  ]);
  const documented = readInventoryRows(inventory);

  assert.deepEqual(
    documented,
    declarations.map(({ functionName, cron }) => ({ functionName, cron })),
    `Update docs/SCHEDULED_CLOUD_FUNCTIONS.md to match scheduled declarations.\nSource: ${JSON.stringify(declarations, null, 2)}`,
  );
});
