/**
 * Walk the shared Google Drive folder tree and print it.
 *
 * Usage:
 *   node scripts/admin/walk-drive.mjs                    # full tree from root
 *   node scripts/admin/walk-drive.mjs --folder <id>      # subtree from a folder
 *   node scripts/admin/walk-drive.mjs --depth 2          # limit depth
 *   node scripts/admin/walk-drive.mjs --dates            # show created dates
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const { google } = require("googleapis");

const __dirname = dirname(fileURLToPath(import.meta.url));
const SA_KEY_PATH = resolve(__dirname, "../../firebase-service-account.json");
const SHARED_DRIVE_ID = "0ANF5MPbc7nZEUk9PVA";

const args = process.argv.slice(2);
const folderIdx = args.indexOf("--folder");
const depthIdx = args.indexOf("--depth");
const showDates = args.includes("--dates");
const rootFolderId = folderIdx >= 0 ? args[folderIdx + 1] : SHARED_DRIVE_ID;
const maxDepth = depthIdx >= 0 ? parseInt(args[depthIdx + 1], 10) : Infinity;

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: SA_KEY_PATH,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  const drive = google.drive({ version: "v3", auth });

  console.log(`Walking Drive from ${rootFolderId} (depth ${maxDepth === Infinity ? "unlimited" : maxDepth})...\n`);

  await walkFolder(drive, rootFolderId, 0);
}

async function walkFolder(drive, folderId, depth) {
  if (depth > maxDepth) return;

  let pageToken = null;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      driveId: SHARED_DRIVE_ID,
      corpora: "drive",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: "nextPageToken, files(id, name, mimeType, createdTime)",
      orderBy: "name",
      pageSize: 200,
      pageToken,
    });

    const files = res.data.files || [];
    for (const file of files) {
      const isFolder = file.mimeType === "application/vnd.google-apps.folder";
      const icon = isFolder ? "📁" : "📄";
      const indent = "  ".repeat(depth);
      const dateSuffix = showDates ? `  (${file.createdTime?.slice(0, 10)})` : "";
      console.log(`${indent}${icon} ${file.name}${dateSuffix}`);

      if (isFolder) {
        await walkFolder(drive, file.id, depth + 1);
      }
    }

    pageToken = res.data.nextPageToken;
  } while (pageToken);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
