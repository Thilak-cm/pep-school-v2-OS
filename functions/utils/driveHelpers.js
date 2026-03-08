import { google } from "googleapis";
import { DRIVE_CONSTANTS, DOC_STYLE, LOGO_URL } from "../config/reportConstants.js";

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
 * Format a date as DD/MM/YYYY for display in report metadata.
 * Accepts Date, ISO string, or Firestore Timestamp (with toDate()).
 * Returns empty string for null/undefined.
 */
export function formatDateDDMMYYYY(dateInput) {
  if (dateInput == null) return "";
  const d = typeof dateInput.toDate === "function" ? dateInput.toDate() : new Date(dateInput);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Derive the academic year string (e.g. "2025-26") from a date.
 * Academic year starts in November (month index 10).
 * Dates before November belong to the AY that started the previous November.
 * Uses UTC to stay consistent with ISO date strings and Cloud Functions.
 */
export function deriveAcademicYear(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-indexed
  const startYear = month >= 10 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
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
 * @param {object} [formatOpts] - Optional formatting: { programName, academicYear }
 */
export async function createReportDoc(
  drive, docs, folderId, studentName, reportMarkdown, existingDocCount, generatedAt,
  formatOpts,
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
  const docOpts = formatOpts ? {
    studentName,
    programName: formatOpts.programName,
    academicYear: formatOpts.academicYear,
    logoUrl: LOGO_URL,
  } : undefined;
  const requests = buildDocInsertRequests(reportMarkdown, docOpts);

  if (requests.length) {
    try {
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests },
      });
    } catch (err) {
      // Clean up the empty doc so it doesn't orphan on Drive
      console.error("[drive-export] batchUpdate failed, trashing empty doc:", err.message);
      try {
        await drive.files.update({
          fileId: docId,
          requestBody: { trashed: true },
          supportsAllDrives: true,
        });
      } catch (cleanupErr) {
        console.warn("[drive-export] Failed to trash orphaned doc:", cleanupErr.message);
      }
      throw err;
    }
  }

  return { docId, docLink };
}

/**
 * Convert report markdown to Google Docs API batchUpdate requests.
 * When `opts` is provided, inserts a branded header (logo, student name,
 * metadata line) and applies colors/typography matching the reference template.
 * Without `opts`, falls back to basic heading styles (backward compatible).
 *
 * @param {string} markdown - Report content in markdown
 * @param {object} [opts] - { studentName, programName, academicYear, startDate, logoUrl }
 */
export function buildDocInsertRequests(markdown, opts) {
  if (!markdown || !markdown.trim()) return [];

  const lines = markdown.split("\n");
  const hasOpts = opts && opts.studentName;

  // Parse markdown lines into segments
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

  const requests = [];
  let idx = 1; // Start after the default empty paragraph

  // --- Header block (only when formatting options are provided) ---
  if (hasOpts) {
    // 1. Logo
    if (opts.logoUrl) {
      requests.push({
        insertInlineImage: {
          uri: opts.logoUrl,
          location: { index: idx },
          objectSize: {
            width: { magnitude: DOC_STYLE.logoWidth, unit: "PT" },
            height: { magnitude: DOC_STYLE.logoHeight, unit: "PT" },
          },
        },
      });
      idx += 1; // Image occupies one index position
      // Newline after logo
      requests.push({
        insertText: { location: { index: idx }, text: "\n" },
      });
      idx += 1;
    }

    // 2. Student name heading
    const nameText = opts.studentName + "\n";
    requests.push({
      insertText: { location: { index: idx }, text: nameText },
    });
    requests.push({
      updateTextStyle: {
        range: { startIndex: idx, endIndex: idx + nameText.length },
        textStyle: {
          bold: true,
          fontSize: { magnitude: DOC_STYLE.nameFontSize, unit: "PT" },
          foregroundColor: { color: { rgbColor: DOC_STYLE.nameColor } },
          weightedFontFamily: { fontFamily: DOC_STYLE.fontFamily },
        },
        fields: "bold,fontSize,foregroundColor,weightedFontFamily",
      },
    });
    idx += nameText.length;

    // 3. Metadata line: "{Program} | Educator Summary | {DD/MM/YYYY} to Date | AY {YYYY-YY}"
    const dateStr = formatDateDDMMYYYY(opts.startDate);
    const datePipe = dateStr ? ` | ${dateStr} to Date` : "";
    const metaText = `${opts.programName || ""} | Educator Summary${datePipe} | AY ${opts.academicYear || ""}\n`;
    requests.push({
      insertText: { location: { index: idx }, text: metaText },
    });
    requests.push({
      updateTextStyle: {
        range: { startIndex: idx, endIndex: idx + metaText.length },
        textStyle: {
          fontSize: { magnitude: DOC_STYLE.metaFontSize, unit: "PT" },
          foregroundColor: { color: { rgbColor: DOC_STYLE.metaColor } },
          weightedFontFamily: { fontFamily: DOC_STYLE.fontFamily },
        },
        fields: "fontSize,foregroundColor,weightedFontFamily",
      },
    });
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: idx, endIndex: idx + metaText.length },
        paragraphStyle: {
          spaceBelow: { magnitude: DOC_STYLE.metaSpaceBelow, unit: "PT" },
        },
        fields: "spaceBelow",
      },
    });
    idx += metaText.length;
  }

  // --- Content segments ---
  for (const segment of segments) {
    requests.push({
      insertText: {
        location: { index: idx },
        text: segment.text,
      },
    });

    const rangeObj = { startIndex: idx, endIndex: idx + segment.text.length };

    if (hasOpts) {
      // Apply full formatting
      if (segment.style === "HEADING_2" || segment.style === "HEADING_3") {
        requests.push({
          updateTextStyle: {
            range: rangeObj,
            textStyle: {
              bold: true,
              fontSize: { magnitude: DOC_STYLE.headingFontSize, unit: "PT" },
              foregroundColor: { color: { rgbColor: DOC_STYLE.headingColor } },
              weightedFontFamily: { fontFamily: DOC_STYLE.fontFamily },
            },
            fields: "bold,fontSize,foregroundColor,weightedFontFamily",
          },
        });
        requests.push({
          updateParagraphStyle: {
            range: rangeObj,
            paragraphStyle: {
              spaceAbove: { magnitude: DOC_STYLE.headingSpaceAbove, unit: "PT" },
              spaceBelow: { magnitude: DOC_STYLE.headingSpaceBelow, unit: "PT" },
            },
            fields: "spaceAbove,spaceBelow",
          },
        });
      } else if (segment.text.trim()) {
        // Body text (non-empty lines only)
        requests.push({
          updateTextStyle: {
            range: rangeObj,
            textStyle: {
              fontSize: { magnitude: DOC_STYLE.bodyFontSize, unit: "PT" },
              foregroundColor: { color: { rgbColor: DOC_STYLE.bodyColor } },
              weightedFontFamily: { fontFamily: DOC_STYLE.fontFamily },
            },
            fields: "fontSize,foregroundColor,weightedFontFamily",
          },
        });
        requests.push({
          updateParagraphStyle: {
            range: rangeObj,
            paragraphStyle: {
              alignment: "JUSTIFIED",
              spaceBelow: { magnitude: DOC_STYLE.bodySpaceAfter, unit: "PT" },
            },
            fields: "alignment,spaceBelow",
          },
        });
      }
    } else {
      // Backward compatible: just apply named heading styles
      if (segment.style !== "NORMAL_TEXT") {
        requests.push({
          updateParagraphStyle: {
            range: rangeObj,
            paragraphStyle: { namedStyleType: segment.style },
            fields: "namedStyleType",
          },
        });
      }
    }

    idx += segment.text.length;
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

/**
 * Trash a file on Google Drive (recoverable for 30 days).
 */
export async function trashDriveFile(drive, fileId) {
  await drive.files.update({
    fileId,
    requestBody: { trashed: true },
    supportsAllDrives: true,
  });
}
