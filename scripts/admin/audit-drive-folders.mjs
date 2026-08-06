/**
 * Audit shared Drive folder tree for duplicates caused by race conditions.
 *
 * Fetches ALL folders in the shared Drive in one paginated query,
 * groups by (parentId, name), and reports duplicates.
 *
 * Usage:
 *   node scripts/admin/audit-drive-folders.mjs
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

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

async function fetchAllFolders() {
  const folders = [];
  let pageToken = null;
  let page = 0;

  do {
    page++;
    process.stdout.write(`  Fetching page ${page}...\r`);
    const res = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      driveId: SHARED_DRIVE_ID,
      corpora: "drive",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 1000,
      pageToken,
      fields: "nextPageToken, files(id, name, parents, createdTime, modifiedTime)",
    });
    folders.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  console.log(`  Fetched ${folders.length} folders total.\n`);
  return folders;
}

async function fetchAllFiles() {
  const files = [];
  let pageToken = null;
  let page = 0;

  do {
    page++;
    process.stdout.write(`  Fetching files page ${page}...\r`);
    const res = await drive.files.list({
      q: "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
      driveId: SHARED_DRIVE_ID,
      corpora: "drive",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 1000,
      pageToken,
      fields: "nextPageToken, files(id, name, parents, createdTime)",
    });
    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  console.log(`  Fetched ${files.length} files total.\n`);
  return files;
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

async function main() {
  console.log("Auditing shared Drive folder tree...\n");

  console.log("Step 1: Fetching all folders...");
  const folders = await fetchAllFolders();

  console.log("Step 2: Fetching all files...");
  const files = await fetchAllFiles();

  // Build folder map and child counts
  const folderMap = new Map();
  for (const f of folders) {
    folderMap.set(f.id, f);
  }

  // Count children per folder (folders + files)
  const childCount = new Map();
  for (const f of folders) {
    const parentId = f.parents?.[0];
    if (parentId) childCount.set(parentId, (childCount.get(parentId) || 0) + 1);
  }
  for (const f of files) {
    const parentId = f.parents?.[0];
    if (parentId) childCount.set(parentId, (childCount.get(parentId) || 0) + 1);
  }

  // Group folders by (parentId, name)
  const groups = new Map();
  for (const f of folders) {
    const parentId = f.parents?.[0] || SHARED_DRIVE_ID;
    const key = `${parentId}::${f.name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }

  // Find duplicates
  const duplicates = [];
  for (const [key, group] of groups) {
    if (group.length > 1) {
      group.sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));
      const parentId = group[0].parents?.[0] || SHARED_DRIVE_ID;
      duplicates.push({
        parentPath: buildPath(parentId, folderMap),
        name: group[0].name,
        copies: group.map((f, i) => ({
          id: f.id,
          createdTime: f.createdTime,
          childCount: childCount.get(f.id) || 0,
          isCanonical: i === 0,
        })),
      });
    }
  }

  // Print top-level folders
  const topLevel = folders.filter(
    (f) => f.parents?.[0] === SHARED_DRIVE_ID
  );
  topLevel.sort((a, b) => a.name.localeCompare(b.name));

  console.log("=== Top-Level Folders ===\n");
  for (const f of topLevel) {
    const children = childCount.get(f.id) || 0;
    console.log(`  ${f.name}  [created: ${f.createdTime.slice(0, 10)}]  [children: ${children}]`);
  }

  // Report duplicates
  if (duplicates.length === 0) {
    console.log("\nNo duplicate folders found.");
    return;
  }

  console.log(`\n=== Duplicate Folder Groups: ${duplicates.length} ===\n`);

  let totalDuplicateFolders = 0;
  let totalChildrenToMove = 0;

  for (const dup of duplicates) {
    console.log(`  ${dup.parentPath}/${dup.name}  (${dup.copies.length} copies)`);
    for (const copy of dup.copies) {
      const label = copy.isCanonical ? "CANONICAL (oldest)" : "DUPLICATE";
      console.log(`    ${label}  id=${copy.id}  created=${copy.createdTime}  children=${copy.childCount}`);
      if (!copy.isCanonical) {
        totalDuplicateFolders++;
        totalChildrenToMove += copy.childCount;
      }
    }
    console.log();
  }

  console.log(`=== Summary ===`);
  console.log(`Total folders in Drive: ${folders.length}`);
  console.log(`Total files in Drive: ${files.length}`);
  console.log(`Duplicate groups: ${duplicates.length}`);
  console.log(`Duplicate folders to merge+trash: ${totalDuplicateFolders}`);
  console.log(`Children to relocate: ${totalChildrenToMove}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
