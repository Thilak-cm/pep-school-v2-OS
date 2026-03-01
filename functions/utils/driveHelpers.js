import { google } from "googleapis";
import { DRIVE_CONSTANTS } from "../config/reportConstants.js";

/**
 * Resolve a student document's display name.
 * Checks displayName, name, then firstName+lastName fallback.
 */
export function resolveStudentName(studentData) {
  if (!studentData) return "Unknown Student";
  const fallback = [studentData.firstName, studentData.lastName]
    .filter(Boolean).join(" ").trim();
  return studentData.displayName || studentData.name || fallback || "Unknown Student";
}

/**
 * Capitalize the first letter of a string.
 */
export function capitalize(str) {
  const s = (str || "").trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Build the Google Doc title for a student report, including generation date.
 * First report:  "Name — Progress Report (2026-02-28)"
 * Subsequent:    "Name — Progress Report v2 (2026-02-28)"
 */
export function buildReportDocTitle(studentName, generatedAt, existingDocCount = 0) {
  const name = (studentName || "").trim();
  const date = generatedAt ? new Date(generatedAt) : new Date();
  const dateStr = date.toISOString().split("T")[0];
  const base = `${name} — Progress Report`;
  if (existingDocCount <= 0) return `${base} (${dateStr})`;
  return `${base} v${existingDocCount + 1} (${dateStr})`;
}

/**
 * Get authenticated Google API clients using Application Default Credentials.
 * Cloud Functions automatically provide credentials for the runtime
 * service account at runtime.
 */
export async function getDriveClients() {
  const auth = new google.auth.GoogleAuth({
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
    ],
  });
  const drive = google.drive({ version: "v3", auth });
  const docs = google.docs({ version: "v1", auth });
  return { drive, docs };
}

/**
 * Generic: find or create a subfolder within a parent folder
 * inside the shared Drive. Returns the folder ID.
 */
export async function getOrCreateFolder(drive, parentId, folderName) {
  const search = await drive.files.list({
    q: `name = '${folderName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    driveId: DRIVE_CONSTANTS.sharedDriveId,
    corpora: "drive",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 1,
    fields: "files(id, name)",
  });

  if (search.data.files?.length) {
    return search.data.files[0].id;
  }

  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    supportsAllDrives: true,
    fields: "id",
  });

  return folder.data.id;
}

/**
 * Create the full folder hierarchy:
 *   Shared Drive root → Branch → Program → Classroom
 * Returns the classroom folder ID.
 */
export async function getOrCreateClassroomFolder(drive, branchName, programName, classroomName) {
  const branchFolderId = await getOrCreateFolder(
    drive, DRIVE_CONSTANTS.sharedDriveId, branchName,
  );
  const programFolderId = await getOrCreateFolder(
    drive, branchFolderId, programName,
  );
  return getOrCreateFolder(drive, programFolderId, classroomName);
}

/**
 * Count existing report docs for a student in a folder.
 */
export async function countExistingReportDocs(drive, folderId, studentName) {
  const namePattern = `${studentName.trim()} — Progress Report`;
  const search = await drive.files.list({
    q: `name contains '${namePattern.replace(/'/g, "\\'")}' and '${folderId}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false`,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 100,
    fields: "files(id)",
  });
  return search.data.files?.length || 0;
}

/**
 * Create a Google Doc with the report content in the specified folder.
 * Returns { docId, docLink }.
 */
export async function createReportDoc(
  drive, docs, folderId, studentName, reportMarkdown, existingDocCount, generatedAt,
) {
  const title = buildReportDocTitle(studentName, generatedAt, existingDocCount);

  // Create blank doc in the folder
  const file = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: "application/vnd.google-apps.document",
      parents: [folderId],
    },
    supportsAllDrives: true,
    fields: "id, webViewLink",
  });

  const docId = file.data.id;
  const docLink = file.data.webViewLink;

  // Build Docs API requests to insert formatted content
  const requests = buildDocInsertRequests(reportMarkdown);

  if (requests.length) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests },
    });
  }

  return { docId, docLink };
}

/**
 * Convert report markdown to Google Docs API batchUpdate requests.
 * Handles ## headings (h2), ### headings (h3), and body paragraphs.
 * Builds Docs API requests to insert formatted content at sequential indices.
 */
export function buildDocInsertRequests(markdown) {
  if (!markdown || !markdown.trim()) return [];

  const lines = markdown.split("\n");
  const segments = [];

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)$/);
    const h3Match = line.match(/^###+ (.+)$/);

    if (h2Match) {
      segments.push({ text: h2Match[1] + "\n", style: "HEADING_2" });
    } else if (h3Match) {
      segments.push({ text: h3Match[1] + "\n", style: "HEADING_3" });
    } else {
      segments.push({ text: line + "\n", style: "NORMAL_TEXT" });
    }
  }

  // Build requests: insert text at index 1 (after the default empty paragraph),
  // then apply paragraph styles
  const requests = [];
  let currentIndex = 1;

  for (const segment of segments) {
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: segment.text,
      },
    });

    if (segment.style !== "NORMAL_TEXT") {
      requests.push({
        updateParagraphStyle: {
          range: {
            startIndex: currentIndex,
            endIndex: currentIndex + segment.text.length,
          },
          paragraphStyle: { namedStyleType: segment.style },
          fields: "namedStyleType",
        },
      });
    }

    currentIndex += segment.text.length;
  }

  return requests;
}

/**
 * Find or upload the summary CSV in a folder.
 * Downloads existing CSV content, applies updates, re-uploads.
 */
export async function updateDriveSummaryCsv(drive, folderId, newCsvContent) {
  const csvName = DRIVE_CONSTANTS.csvFilename;

  // Search for existing CSV
  const search = await drive.files.list({
    q: `name = '${csvName}' and '${folderId}' in parents and trashed = false`,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 1,
    fields: "files(id)",
  });

  const existingFileId = search.data.files?.[0]?.id;

  if (existingFileId) {
    // Update existing file
    await drive.files.update({
      fileId: existingFileId,
      media: {
        mimeType: "text/csv",
        body: newCsvContent,
      },
      supportsAllDrives: true,
    });
    return existingFileId;
  }

  // Create new CSV file
  const file = await drive.files.create({
    requestBody: {
      name: csvName,
      mimeType: "text/csv",
      parents: [folderId],
    },
    media: {
      mimeType: "text/csv",
      body: newCsvContent,
    },
    supportsAllDrives: true,
    fields: "id",
  });

  return file.data.id;
}

/**
 * Download existing CSV content from Drive. Returns empty string if not found.
 */
export async function downloadCsvContent(drive, folderId) {
  const csvName = DRIVE_CONSTANTS.csvFilename;

  const search = await drive.files.list({
    q: `name = '${csvName}' and '${folderId}' in parents and trashed = false`,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 1,
    fields: "files(id)",
  });

  const fileId = search.data.files?.[0]?.id;
  if (!fileId) return "";

  const response = await drive.files.get({
    fileId,
    alt: "media",
    supportsAllDrives: true,
  });

  return typeof response.data === "string" ? response.data : "";
}
