import { google } from "googleapis";
import { DRIVE_CONSTANTS } from "../config/reportConstants.js";

/**
 * Build a human-readable folder name for a classroom's Drive folder.
 */
export function buildClassroomFolderName(classroomName, programId) {
  const name = (classroomName || "").trim();
  const program = (programId || "").trim();
  if (!program) return name;
  return `${name} — ${program.charAt(0).toUpperCase() + program.slice(1)}`;
}

/**
 * Build the Google Doc title for a student report.
 * First report: "Name — Progress Report"
 * Subsequent: "Name — Progress Report v2", v3, etc.
 */
export function buildReportDocTitle(studentName, existingDocCount = 0) {
  const name = (studentName || "").trim();
  const base = `${name} — Progress Report`;
  if (existingDocCount <= 0) return base;
  return `${base} v${existingDocCount + 1}`;
}

/**
 * Get authenticated Google API clients using Application Default Credentials.
 * Cloud Functions automatically provide credentials for the Firebase Admin SDK
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
 * Find or create a classroom subfolder inside the shared Drive.
 * Returns the folder ID.
 */
export async function getOrCreateClassroomFolder(drive, classroomName, programId) {
  const folderName = buildClassroomFolderName(classroomName, programId);

  // Search for existing folder by name in the shared Drive
  const search = await drive.files.list({
    q: `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    driveId: DRIVE_CONSTANTS.sharedDriveId,
    corpora: "drive",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: "files(id, name)",
  });

  if (search.data.files?.length) {
    return search.data.files[0].id;
  }

  // Create new folder
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [DRIVE_CONSTANTS.sharedDriveId],
    },
    supportsAllDrives: true,
    fields: "id",
  });

  return folder.data.id;
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
    fields: "files(id)",
  });
  return search.data.files?.length || 0;
}

/**
 * Create a Google Doc with the report content in the specified folder.
 * Returns { docId, docLink }.
 */
export async function createReportDoc(drive, docs, folderId, studentName, reportMarkdown, existingDocCount) {
  const title = buildReportDocTitle(studentName, existingDocCount);

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
 * Inserts content in reverse order since Docs API inserts at index positions.
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
 * Find or upload the summary CSV in a classroom folder.
 * Downloads existing CSV content, applies updates, re-uploads.
 */
export async function updateDriveSummaryCsv(drive, folderId, newCsvContent) {
  const csvName = DRIVE_CONSTANTS.csvFilename;

  // Search for existing CSV
  const search = await drive.files.list({
    q: `name = '${csvName}' and '${folderId}' in parents and trashed = false`,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
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
