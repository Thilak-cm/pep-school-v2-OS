/**
 * Trash all shared Drive items created on 2026-05-29 (the broken batch export).
 *
 * Safety:
 *   - Only targets items with createdTime on 2026-05-29 (UTC)
 *   - Items created before 2026-05-29 are NEVER touched
 *   - Dry-run by default — shows what would be trashed
 *   - Pass --execute to actually trash
 *   - Trashes files first, then folders (deepest first) to avoid
 *     "folder not empty" issues
 *
 * Usage:
 *   node scripts/admin/nuke-todays-drive-output.mjs            # dry run
 *   node scripts/admin/nuke-todays-drive-output.mjs --execute   # live
 */

import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(
  path.resolve(__dirname, "../../functions/package.json")
);
const { google } = require("googleapis");
const serviceAccount = require(
  path.resolve(__dirname, "../../firebase-service-account.json")
);

const SHARED_DRIVE_ID = "0ANF5MPbc7nZEUk9PVA";
const CUTOFF_START = "2026-05-29T00:00:00Z";
const CUTOFF_END = "2026-05-30T00:00:00Z";
const execute = process.argv.includes("--execute");

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const driveClient = google.drive({ version: "v3", auth });

async function fetchItemsCreatedToday() {
  const items = [];
  let pageToken = null;

  do {
    const res = await driveClient.files.list({
      q: `createdTime >= '${CUTOFF_START}' and createdTime < '${CUTOFF_END}' and trashed = false`,
      driveId: SHARED_DRIVE_ID,
      corpora: "drive",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 1000,
      pageToken,
      fields: "nextPageToken, files(id, name, mimeType, createdTime, parents)",
    });
    items.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return items;
}

async function fetchAllFolders() {
  const folders = [];
  let pageToken = null;

  do {
    const res = await driveClient.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      driveId: SHARED_DRIVE_ID,
      corpora: "drive",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 1000,
      pageToken,
      fields: "nextPageToken, files(id, name, parents, createdTime)",
    });
    folders.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return folders;
}

function buildPath(itemId, folderMap) {
  const parts = [];
  let current = itemId;
  let depth = 0;
  while (current && folderMap.has(current) && depth < 10) {
    const f = folderMap.get(current);
    parts.unshift(f.name);
    current = f.parents?.[0];
    depth++;
  }
  return parts.join("/") || "(root)";
}

async function main() {
  console.log(`\nNuke Today's Drive Output (2026-05-29)`);
  console.log(`Mode: ${execute ? "*** LIVE — ITEMS WILL BE TRASHED ***" : "DRY RUN (pass --execute to apply)"}\n`);

  // Step 1: Fetch all items created today
  console.log("Fetching items created on 2026-05-29...");
  const todayItems = await fetchItemsCreatedToday();
  console.log(`  Found ${todayItems.length} items created today.\n`);

  if (todayItems.length === 0) {
    console.log("Nothing to trash. Drive is clean for today.");
    return;
  }

  // Step 2: Fetch all folders for path building
  console.log("Fetching all folders for path resolution...");
  const allFolders = await fetchAllFolders();
  const folderMap = new Map();
  for (const f of allFolders) folderMap.set(f.id, f);
  console.log(`  ${allFolders.length} folders indexed.\n`);

  // Step 3: Safety check — verify NONE of today's items have createdTime before cutoff
  for (const item of todayItems) {
    const created = new Date(item.createdTime);
    if (created < new Date(CUTOFF_START)) {
      console.error(`SAFETY ABORT: Item "${item.name}" (${item.id}) has createdTime ${item.createdTime} which is BEFORE ${CUTOFF_START}`);
      console.error("This should be impossible. Aborting to prevent data loss.");
      process.exit(1);
    }
  }
  console.log("Safety check passed: all items confirmed created on 2026-05-29.\n");

  // Step 4: Separate files and folders
  const files = todayItems.filter(i => i.mimeType !== "application/vnd.google-apps.folder");
  const folders = todayItems.filter(i => i.mimeType === "application/vnd.google-apps.folder");

  // Sort folders deepest-first (by path depth) so children are trashed before parents
  const foldersWithPaths = folders.map(f => ({
    ...f,
    path: buildPath(f.id, folderMap),
  }));
  foldersWithPaths.sort((a, b) => {
    const depthA = a.path.split("/").length;
    const depthB = b.path.split("/").length;
    return depthB - depthA; // deepest first
  });

  // Step 5: Show what we'd trash
  console.log(`=== Files to trash (${files.length}) ===\n`);
  for (const f of files) {
    const parentPath = buildPath(f.parents?.[0], folderMap);
    console.log(`  ${parentPath}/${f.name}`);
    console.log(`    id=${f.id}  created=${f.createdTime}  type=${f.mimeType.split(".").pop()}`);
  }

  console.log(`\n=== Folders to trash (${folders.length}, deepest first) ===\n`);
  for (const f of foldersWithPaths) {
    console.log(`  ${f.path}`);
    console.log(`    id=${f.id}  created=${f.createdTime}`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Files to trash:   ${files.length}`);
  console.log(`Folders to trash: ${folders.length}`);
  console.log(`Total:            ${todayItems.length}`);
  console.log(`Items from before 2026-05-29: 0 (verified)\n`);

  if (!execute) {
    console.log("This was a dry run. Review the list above carefully.");
    console.log("Run with --execute to trash these items.");
    return;
  }

  // Step 6: Execute — trash files first, then folders deepest-first
  console.log("Trashing files...");
  let trashedFiles = 0;
  for (const f of files) {
    try {
      await driveClient.files.update({
        fileId: f.id,
        requestBody: { trashed: true },
        supportsAllDrives: true,
        fields: "id",
      });
      trashedFiles++;
      if (trashedFiles % 20 === 0) {
        process.stdout.write(`  ${trashedFiles}/${files.length} files trashed\r`);
      }
    } catch (err) {
      console.error(`  FAILED to trash file "${f.name}" (${f.id}): ${err.message}`);
    }
  }
  console.log(`  ${trashedFiles}/${files.length} files trashed.\n`);

  console.log("Trashing folders (deepest first)...");
  let trashedFolders = 0;
  for (const f of foldersWithPaths) {
    try {
      await driveClient.files.update({
        fileId: f.id,
        requestBody: { trashed: true },
        supportsAllDrives: true,
        fields: "id",
      });
      trashedFolders++;
    } catch (err) {
      console.error(`  FAILED to trash folder "${f.path}" (${f.id}): ${err.message}`);
    }
  }
  console.log(`  ${trashedFolders}/${folders.length} folders trashed.\n`);

  console.log(`=== Done ===`);
  console.log(`Trashed: ${trashedFiles} files + ${trashedFolders} folders = ${trashedFiles + trashedFolders} total`);
  console.log(`\nItems are in Drive trash (recoverable for 30 days).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
