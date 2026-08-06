/**
 * Deduplicate shared Drive folders caused by race conditions in getOrCreateFolder.
 *
 * For each group of duplicate folders (same parentId + name):
 *   1. Pick the oldest (by createdTime) as canonical
 *   2. Move all children from duplicates into the canonical folder
 *   3. Trash the now-empty duplicate folders
 *
 * DRY RUN by default. Pass --execute to actually make changes.
 *
 * Usage:
 *   node scripts/admin/dedup-drive-folders.mjs            # dry run
 *   node scripts/admin/dedup-drive-folders.mjs --execute   # live
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
const execute = process.argv.includes("--execute");

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const driveClient = google.drive({ version: "v3", auth });

async function fetchAllItems(mimeFilter) {
  const items = [];
  let pageToken = null;
  const q = mimeFilter
    ? `mimeType ${mimeFilter} 'application/vnd.google-apps.folder' and trashed = false`
    : "trashed = false";

  do {
    const res = await driveClient.files.list({
      q,
      driveId: SHARED_DRIVE_ID,
      corpora: "drive",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 1000,
      pageToken,
      fields: "nextPageToken, files(id, name, parents, createdTime, mimeType)",
    });
    items.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return items;
}

function buildPath(folderId, folderMap) {
  const parts = [];
  let current = folderId;
  let depth = 0;
  while (current && folderMap.has(current) && depth < 10) {
    const f = folderMap.get(current);
    parts.unshift(f.name);
    current = f.parents?.[0];
    depth++;
  }
  return parts.join("/") || "(root)";
}

async function moveItem(itemId, fromParentId, toParentId) {
  await driveClient.files.update({
    fileId: itemId,
    addParents: toParentId,
    removeParents: fromParentId,
    supportsAllDrives: true,
    fields: "id",
  });
}

async function trashFolder(folderId) {
  await driveClient.files.update({
    fileId: folderId,
    requestBody: { trashed: true },
    supportsAllDrives: true,
    fields: "id",
  });
}

async function main() {
  console.log(`\nDeduplicate Drive Folders`);
  console.log(`Mode: ${execute ? "*** LIVE — CHANGES WILL BE MADE ***" : "DRY RUN (pass --execute to apply)"}\n`);

  // Step 1: Fetch everything
  console.log("Fetching all folders...");
  const folders = await fetchAllItems("=");
  console.log(`  ${folders.length} folders found.\n`);

  console.log("Fetching all files...");
  const files = await fetchAllItems("!=");
  console.log(`  ${files.length} files found.\n`);

  // Build lookup maps
  const folderMap = new Map();
  for (const f of folders) folderMap.set(f.id, f);

  // Map parentId -> list of direct children (folders + files)
  const childrenOf = new Map();
  for (const f of [...folders, ...files]) {
    const pid = f.parents?.[0];
    if (pid) {
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid).push(f);
    }
  }

  // Step 2: Find duplicate groups
  const groups = new Map();
  for (const f of folders) {
    const parentId = f.parents?.[0] || SHARED_DRIVE_ID;
    const key = `${parentId}::${f.name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }

  const duplicates = [];
  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    group.sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));
    duplicates.push(group);
  }

  if (duplicates.length === 0) {
    console.log("No duplicates found. Drive is clean!");
    return;
  }

  console.log(`Found ${duplicates.length} duplicate groups.\n`);

  // Step 3: Plan and execute merges
  let totalMoved = 0;
  let totalTrashed = 0;

  for (const group of duplicates) {
    const canonical = group[0];
    const dupes = group.slice(1);
    const parentPath = buildPath(canonical.parents?.[0] || SHARED_DRIVE_ID, folderMap);

    console.log(`── ${parentPath}/${canonical.name}  (${group.length} copies)`);
    console.log(`   Canonical: ${canonical.id}  created=${canonical.createdTime}`);

    for (const dupe of dupes) {
      const children = childrenOf.get(dupe.id) || [];
      console.log(`   Duplicate: ${dupe.id}  created=${dupe.createdTime}  children=${children.length}`);

      if (children.length > 0) {
        for (const child of children) {
          const label = child.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file";
          console.log(`     ${execute ? "MOVING" : "would move"} ${label} "${child.name}" → canonical`);

          if (execute) {
            await moveItem(child.id, dupe.id, canonical.id);
          }
          totalMoved++;
        }
      }

      console.log(`     ${execute ? "TRASHING" : "would trash"} empty duplicate folder`);
      if (execute) {
        await trashFolder(dupe.id);
      }
      totalTrashed++;
    }
    console.log();
  }

  console.log(`=== Summary ===`);
  console.log(`Duplicate groups: ${duplicates.length}`);
  console.log(`Children ${execute ? "moved" : "to move"}: ${totalMoved}`);
  console.log(`Folders ${execute ? "trashed" : "to trash"}: ${totalTrashed}`);

  if (!execute) {
    console.log(`\nThis was a dry run. Run with --execute to apply changes.`);
  } else {
    console.log(`\nDone. All duplicates merged and trashed.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
