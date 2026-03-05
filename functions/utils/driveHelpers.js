import { google } from "googleapis";
import { DRIVE_CONSTANTS, REPORT_BRANDING } from "../config/reportConstants.js";

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
 * Build Docs API requests to insert an image into a header/footer segment.
 * Each segment has its own index space starting at 0.
 *
 * @param {string} segmentId - Header or footer segment ID
 * @param {string} imageUri - Public URL of the image
 * @param {number} width - Image width in PT
 * @param {number} height - Image height in PT
 * @param {Object} [options]
 * @param {string} [options.alignment="END"] - Paragraph alignment (END for headers, START for footers)
 */
export function buildSegmentImageRequests(segmentId, imageUri, width, height, options = {}) {
  const alignment = options.alignment || "END";
  return [
    {
      insertInlineImage: {
        location: { segmentId, index: 0 },
        uri: imageUri,
        objectSize: {
          width: { magnitude: width, unit: "PT" },
          height: { magnitude: height, unit: "PT" },
        },
      },
    },
    {
      updateParagraphStyle: {
        range: { segmentId, startIndex: 0, endIndex: 1 },
        paragraphStyle: {
          alignment,
          spaceAbove: { magnitude: 0, unit: "PT" },
          spaceBelow: { magnitude: 0, unit: "PT" },
          indentStart: { magnitude: 0, unit: "PT" },
          indentEnd: { magnitude: 0, unit: "PT" },
        },
        fields: "alignment,spaceAbove,spaceBelow,indentStart,indentEnd",
      },
    },
  ];
}

/**
 * Create a Google Doc with branded report content in the specified folder.
 *
 * Multi-step process:
 *   1. Create blank doc
 *   2. Set up headers/footers (different first-page header enabled)
 *   3. Read doc to discover header/footer segment IDs
 *   4. Insert body content + header/footer images in one batch
 *
 * Returns { docId, docLink }.
 */
export async function createReportDoc(
  drive, docs, folderId, studentName, reportMarkdown,
  existingDocCount, generatedAt, metadata = {},
) {
  const { assets, dimensions } = REPORT_BRANDING;
  const title = buildReportDocTitle(studentName, generatedAt, existingDocCount);

  // 1. Create blank doc in the folder
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

  // 2. Set up document structure: zero out margins so header/footer images
  //    touch page edges, enable different first-page header, create segments
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          updateDocumentStyle: {
            documentStyle: {
              useFirstPageHeaderFooter: true,
              marginLeft: { magnitude: 0, unit: "PT" },
              marginRight: { magnitude: 0, unit: "PT" },
              marginHeader: { magnitude: 0, unit: "PT" },
              marginFooter: { magnitude: 0, unit: "PT" },
            },
            fields: "useFirstPageHeaderFooter,marginLeft,marginRight,marginHeader,marginFooter",
          },
        },
        { createHeader: { type: "DEFAULT", sectionBreakLocation: { index: 0 } } },
        { createFooter: { type: "DEFAULT", sectionBreakLocation: { index: 0 } } },
      ],
    },
  });

  // 3. Read doc to discover all header/footer segment IDs
  const doc = await docs.documents.get({ documentId: docId });
  const docStyle = doc.data.documentStyle || {};

  // 4. Build all content requests (body + header/footer images)
  const requests = buildDocInsertRequests(reportMarkdown, {
    studentName,
    programName: metadata.programName,
    academicYear: metadata.academicYear,
  });

  // Default header: small decoration on all non-first pages
  if (docStyle.defaultHeaderId) {
    requests.push(...buildSegmentImageRequests(
      docStyle.defaultHeaderId,
      assets.headerDefaultUrl,
      dimensions.headerDefaultPt.width,
      dimensions.headerDefaultPt.height,
    ));
  }

  // First-page header: large decoration
  if (docStyle.firstPageHeaderId) {
    requests.push(...buildSegmentImageRequests(
      docStyle.firstPageHeaderId,
      assets.headerFirstPageUrl,
      dimensions.headerFirstPagePt.width,
      dimensions.headerFirstPagePt.height,
    ));
  }

  // Default footer: footer pattern on all non-first pages (full width)
  if (docStyle.defaultFooterId) {
    requests.push(...buildSegmentImageRequests(
      docStyle.defaultFooterId,
      assets.footerUrl,
      dimensions.footerPt.width,
      dimensions.footerPt.height,
      { alignment: "START" },
    ));
  }

  // First-page footer: same footer pattern (full width)
  if (docStyle.firstPageFooterId) {
    requests.push(...buildSegmentImageRequests(
      docStyle.firstPageFooterId,
      assets.footerUrl,
      dimensions.footerPt.width,
      dimensions.footerPt.height,
      { alignment: "START" },
    ));
  }

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
 * Produces a branded document with logo, student name, subtitle,
 * styled body (headings + justified paragraphs), and footer image.
 *
 * @param {string} markdown - Report content in markdown format
 * @param {Object} metadata - { studentName, programName, academicYear }
 * @returns {Array} Google Docs API batchUpdate requests
 */
export function buildDocInsertRequests(markdown, metadata = {}) {
  const { assets, colors, fonts, dimensions } = REPORT_BRANDING;
  const studentName = metadata.studentName || "";
  const programName = metadata.programName || "";
  const academicYear = metadata.academicYear || "";

  const requests = [];
  let idx = 1;

  // Helper: insert text and return the range { start, end }
  const insertText = (text) => {
    const start = idx;
    requests.push({ insertText: { location: { index: idx }, text } });
    idx += text.length;
    return { start, end: idx };
  };

  // Helper: style a text range
  const styleText = (range, style) => {
    requests.push({
      updateTextStyle: {
        range: { startIndex: range.start, endIndex: range.end },
        textStyle: style,
        fields: Object.keys(style).join(","),
      },
    });
  };

  // Helper: style a paragraph range
  const styleParagraph = (range, style, fields) => {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: range.start, endIndex: range.end },
        paragraphStyle: style,
        fields,
      },
    });
  };

  // Helper: insert inline image and advance index by 1
  const insertImage = (uri, width, height) => {
    const start = idx;
    requests.push({
      insertInlineImage: {
        location: { index: idx },
        uri,
        objectSize: {
          width: { magnitude: width, unit: "PT" },
          height: { magnitude: height, unit: "PT" },
        },
      },
    });
    idx += 1; // inline image occupies 1 index
    return { start, end: idx };
  };

  // ── 1. Logo ──
  insertImage(assets.logoUrl, dimensions.logoPt.width, dimensions.logoPt.height);
  insertText("\n");

  // ── 2. Student Name ──
  if (studentName) {
    const nameRange = insertText(studentName + "\n");
    styleText(nameRange, {
      bold: true,
      fontSize: { magnitude: fonts.studentNameSize, unit: "PT" },
      weightedFontFamily: { fontFamily: fonts.heading },
      foregroundColor: { color: { rgbColor: colors.studentName } },
    });
  }

  // ── 3. Subtitle ──
  const subtitleParts = [programName ? `${programName} Program` : "", "Educator Summary", academicYear ? `AY ${academicYear}` : ""].filter(Boolean);
  const subtitleText = subtitleParts.join(" | ");
  if (subtitleText) {
    const subRange = insertText(subtitleText + "\n");
    styleText(subRange, {
      bold: true,
      fontSize: { magnitude: fonts.subtitleSize, unit: "PT" },
      weightedFontFamily: { fontFamily: fonts.heading },
      foregroundColor: { color: { rgbColor: colors.subtitle } },
    });
  }

  // ── 4. Blank separator ──
  insertText("\n");

  // ── 5. Body content ──
  if (markdown && markdown.trim()) {
    const lines = markdown.split("\n");

    for (const line of lines) {
      const h2Match = line.match(/^## (.+)$/);
      const h3Match = line.match(/^###+ (.+)$/);

      if (h2Match) {
        const range = insertText(h2Match[1] + "\n");
        styleText(range, {
          bold: true,
          fontSize: { magnitude: fonts.headingSize, unit: "PT" },
          weightedFontFamily: { fontFamily: fonts.heading },
          foregroundColor: { color: { rgbColor: colors.heading } },
        });
        styleParagraph(range, { spaceAbove: { magnitude: 18, unit: "PT" } }, "spaceAbove");
      } else if (h3Match) {
        const range = insertText(h3Match[1] + "\n");
        styleText(range, {
          bold: true,
          fontSize: { magnitude: 12, unit: "PT" },
          weightedFontFamily: { fontFamily: fonts.heading },
          foregroundColor: { color: { rgbColor: colors.heading } },
        });
        styleParagraph(range, { spaceAbove: { magnitude: 12, unit: "PT" } }, "spaceAbove");
      } else if (line.trim()) {
        const range = insertText(line + "\n");
        styleText(range, {
          fontSize: { magnitude: fonts.bodySize, unit: "PT" },
          weightedFontFamily: { fontFamily: fonts.body },
        });
        styleParagraph(
          range,
          {
            alignment: "JUSTIFIED",
            spaceAbove: { magnitude: 6, unit: "PT" },
            spaceBelow: { magnitude: 6, unit: "PT" },
          },
          "alignment,spaceAbove,spaceBelow",
        );
      } else {
        // Empty line → paragraph break
        insertText("\n");
      }
    }
  }

  // ── 6. Bulk indentation ──
  // Page left/right margins are 0 so header/footer images touch edges.
  // Compensate by indenting all body paragraphs 72pt (1 inch) each side.
  if (idx > 1) {
    styleParagraph(
      { start: 1, end: idx },
      {
        indentStart: { magnitude: 72, unit: "PT" },
        indentEnd: { magnitude: 72, unit: "PT" },
      },
      "indentStart,indentEnd",
    );
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
