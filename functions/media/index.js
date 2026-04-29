import * as functions from "firebase-functions/v1";
import { db, storage, Timestamp } from "../shared/firebase.js";
import { OPENAI_API_KEY, getOpenAiKey, buildChatBody, runChatCompletion, CHAT_ENDPOINT } from "../shared/openai.js";
import { MINI_MODEL, NANO_MODEL } from "../config/modelConstants.js";

// -------------------------------------------------
// PDF helpers (title + essence) for media notes
// -------------------------------------------------
const PDF_TITLE_MODEL = { model: MINI_MODEL, temperature: 0.4, max_tokens: 48 };
const PDF_ESSENCE_MODEL = { model: MINI_MODEL, temperature: 0.35, max_tokens: 220 };
// Per-photo classification (PEP-146): Call 1 only (gpt-5.4-nano)
// Call 2 (handwriting analysis) removed — deferred to PEP-132 batch analysis
const PHOTO_CLASSIFICATION_MODEL = { model: NANO_MODEL, temperature: 0.2, max_tokens: 400 };

const CLASSIFICATION_FALLBACK_PROMPT = `You classify Montessori classroom photos. Return JSON with exactly three fields:

- handwritten (boolean): true if the image contains handwriting (letters, numbers, or words written by hand)
- curriculumArea (string|null): broad Montessori curriculum area. Null if not identifiable as student work.
- materialsIdentified (string[]): Montessori materials visible in the photo, using standard Montessori names. Empty array [] if no specific materials are identifiable.

Respond with ONLY valid JSON.`;

const MAX_PDF_TEXT_LENGTH = 15000;

/**
 * Load config from Firestore with fallback defaults.
 * Returns { systemPrompt, model, temperature, max_tokens }.
 */
async function loadPhotoConfig(docId, fallbackPrompt, fallbackModel) {
  let systemPrompt = fallbackPrompt;
  let model = fallbackModel.model;
  let temperature = fallbackModel.temperature;
  let maxTokens = fallbackModel.max_tokens;
  try {
    const doc = await db.collection("config").doc(docId).get();
    if (doc.exists) {
      const d = doc.data() || {};
      if (d.systemPrompt) systemPrompt = d.systemPrompt;
      if (d.model) model = d.model;
      if (typeof d.temperature === "number") temperature = d.temperature;
      if (Number.isFinite(d.max_tokens)) maxTokens = d.max_tokens;
    }
  } catch (err) {
    console.warn(`[loadPhotoConfig] Failed to fetch config/${docId}, using fallback`, err?.message);
  }
  return { systemPrompt, model, temperature, maxTokens };
}

/**
 * Run a VLM call with image(s) and return parsed JSON.
 */
async function runVLMCall(systemPrompt, userContent, modelInfo) {
  const openAiKey = getOpenAiKey();
  if (!openAiKey) {
    throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
  }

  const enhancedPrompt = systemPrompt.includes("JSON") || systemPrompt.includes("json")
    ? systemPrompt
    : systemPrompt + "\n\nIMPORTANT: You must respond with valid JSON only.";

  const body = buildChatBody({
    model: modelInfo.model,
    messages: [
      { role: "system", content: enhancedPrompt },
      { role: "user", content: userContent },
    ],
    temperature: modelInfo.temperature,
    max_completion_tokens: modelInfo.maxTokens,
    response_format: { type: "json_object" },
  });

  let response;
  try {
    response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[runVLMCall] network error", err);
    throw new functions.https.HttpsError("unavailable", "AI service unavailable");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[runVLMCall] OpenAI error", response.status, errText?.slice?.(0, 300));
    throw new functions.https.HttpsError("internal", `AI error: ${response.status}`);
  }

  const json = await response.json();
  const rawContent = json?.choices?.[0]?.message?.content?.trim();
  if (!rawContent) {
    throw new functions.https.HttpsError("internal", "AI returned no content");
  }

  try {
    return JSON.parse(rawContent);
  } catch {
    throw new functions.https.HttpsError("internal", "AI returned invalid JSON");
  }
}

const analyzePhotoVLMHandler = async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  // Support both single-image (legacy) and multi-image payloads
  let images = [];
  if (Array.isArray(data?.images) && data.images.length > 0) {
    images = data.images.map((img) => ({
      itemId: String(img.itemId || ""),
      base64: String(img.imageBase64 || "").trim(),
      contentType: String(img.contentType || "image/webp").trim(),
    })).filter((img) => img.base64);
  } else {
    const imageBase64 = String(data?.imageBase64 || "").trim();
    if (imageBase64) {
      images = [{ itemId: "", base64: imageBase64, contentType: String(data?.contentType || "image/webp").trim() }];
    }
  }
  if (images.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "At least one image is required");
  }
  if (images.length > 10) {
    throw new functions.https.HttpsError("invalid-argument", "Too many images; maximum 10 per call");
  }
  const totalBytes = images.reduce((sum, img) => sum + Buffer.byteLength(img.base64, "base64"), 0);
  if (totalBytes > 10 * 1024 * 1024) {
    throw new functions.https.HttpsError("invalid-argument", "Images too large; maximum 10 MB total");
  }

  // --- Per-photo classification (PEP-146) ---
  // Run Call 1 (gpt-5.4-nano) independently per photo in parallel.
  // Call 2 (handwriting analysis) removed — deferred to PEP-132 batch analysis.
  const classConfig = await loadPhotoConfig(
    "photo_classification", CLASSIFICATION_FALLBACK_PROMPT, PHOTO_CLASSIFICATION_MODEL
  );

  const results = await Promise.all(images.map(async (img) => {
    const imageContent = [{
      type: "image_url",
      image_url: { url: `data:${img.contentType};base64,${img.base64}` },
    }];
    const classUserContent = [
      { type: "text", text: "Classify this classroom photo." },
      ...imageContent,
    ];

    try {
      const classification = await runVLMCall(
        classConfig.systemPrompt, classUserContent, classConfig
      );
      return {
        itemId: img.itemId,
        handwritten: classification?.handwritten === true,
        curriculumArea: typeof classification?.curriculumArea === "string"
          ? classification.curriculumArea : null,
        materialsIdentified: Array.isArray(classification?.materialsIdentified)
          ? classification.materialsIdentified.filter((s, i, arr) => typeof s === "string" && arr.indexOf(s) === i)
          : [],
      };
    } catch (err) {
      console.warn(
        `[analyzePhotoVLM] Classification failed for item ${img.itemId}`,
        err?.message
      );
      return {
        itemId: img.itemId,
        handwritten: false,
        curriculumArea: null,
        materialsIdentified: [],
      };
    }
  }));

  return { results };
};

const photoVLMRunWith = { timeoutSeconds: 60, memory: "512MB", secrets: [OPENAI_API_KEY] };

export const analyzePhotoVLM = functions
  .region("asia-south1")
  .runWith(photoVLMRunWith)
  .https.onCall(analyzePhotoVLMHandler);

// Backward-compatible alias (PEP-43 callers)
export const detectHandwritingVLM = functions
  .region("asia-south1")
  .runWith(photoVLMRunWith)
  .https.onCall(analyzePhotoVLMHandler);

export const suggestPdfTitle = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 60, memory: "512MB", secrets: [OPENAI_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    const rawText = String(data?.extractedText || "").trim();
    if (!rawText) {
      throw new functions.https.HttpsError("invalid-argument", "extractedText is required");
    }
    const text = rawText.slice(0, MAX_PDF_TEXT_LENGTH);
    const fileName = String(data?.fileName || "").trim();
    const pageCount = Number.isFinite(data?.pageCount) ? Number(data.pageCount) : null;

    const systemPrompt = "You title short PDF uploads for Montessori teachers. Output a concise, parent-friendly title (max 8 words). No quotes, no markdown.";
    const userPrompt = [
      fileName ? `Filename: ${fileName}` : null,
      pageCount ? `Pages: ${pageCount}` : null,
      "Extracted text:",
      text,
    ].filter(Boolean).join("\n");

    const title = await runChatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      PDF_TITLE_MODEL
    );

    return { title: title.split("\n")[0].trim() };
  });

export const extractPdfEssence = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 60, memory: "512MB", secrets: [OPENAI_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    const rawText = String(data?.extractedText || "").trim();
    if (!rawText) {
      throw new functions.https.HttpsError("invalid-argument", "extractedText is required");
    }
    const text = rawText.slice(0, MAX_PDF_TEXT_LENGTH);

    const systemPrompt = "You summarize short PDF notes for Montessori teachers. Write 2–3 clear sentences (max ~120 words) covering the main idea and actions. No bullets, no markdown.";
    const userPrompt = `Extracted text:\n${text}`;

    const essence = await runChatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      PDF_ESSENCE_MODEL
    );

    return { essence_text: essence.trim() };
  });

// -------------------------------------------------
// Storage finalize: media uploads -> Firestore metadata
// -------------------------------------------------
const MEDIA_PATH_REGEX = new RegExp("^students/([^/]+)/media/([^/]+)/([^/]+)$");
const MEDIA_CONFIG = {
  photo: { extension: ".webp", contentType: "image/webp", maxBytes: 2 * 1024 * 1024 },
  pdf: { extension: ".pdf", contentType: "application/pdf" },
  video: { extension: ".mp4", contentType: "video/mp4" },
};

function parseWebpDimensions(buffer) {
  if (!buffer || buffer.length < 30) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }

  const chunkHeader = buffer.toString("ascii", 12, 16);
  if (chunkHeader === "VP8X" && buffer.length >= 30) {
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
    return { width, height };
  }

  const vp8Start = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
  if (chunkHeader === "VP8 " && vp8Start !== -1 && buffer.length >= vp8Start + 7) {
    const width = buffer.readUInt16LE(vp8Start + 3) & 0x3fff;
    const height = buffer.readUInt16LE(vp8Start + 5) & 0x3fff;
    return { width, height };
  }

  if (chunkHeader === "VP8L" && buffer.length >= 21) {
    const b0 = buffer[20];
    const b1 = buffer[21];
    const b2 = buffer[22];
    const b3 = buffer[23];
    const width = 1 + (((b1 & 0x3F) << 8) | b0);
    const height = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6));
    return { width, height };
  }

  return null;
}

async function markMediaFailed(obsRef, errorCode, errorMessage) {
  try {
    await obsRef.set(
      {
        status: "failed",
        errorCode,
        errorMessage,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("[mediaFinalize] failed to mark doc failed", err);
  }
}

async function deleteStorageFile(bucketName, filePath) {
  try {
    await storage.bucket(bucketName).file(filePath).delete();
  } catch (err) {
    if (err?.code !== 404) {
      console.error("[mediaFinalize] delete file error", err);
    }
  }
}

export const mediaFinalize = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB" })
  .storage.object()
  .onFinalize(async (object) => {
    const filePath = object.name;
    const contentType = object.contentType || "";
    const sizeBytes = Number(object.size || 0);
    if (!filePath) return;

    const match = MEDIA_PATH_REGEX.exec(filePath);
    if (!match) return;

    const [, studentId, mediaId, fileName] = match;
    const mediaRef = db.collection("students").doc(studentId).collection("media").doc(mediaId);
    const mediaSnap = await mediaRef.get();
    if (!mediaSnap.exists) {
      await deleteStorageFile(object.bucket, filePath);
      return;
    }

    const data = mediaSnap.data() || {};
    if (data.type !== "media") {
      await deleteStorageFile(object.bucket, filePath);
      return;
    }

    const mediaKind = data.mediaKind;
    const config = MEDIA_CONFIG[mediaKind];
    if (!config) {
      await markMediaFailed(mediaRef, "unsupported_kind", "Unsupported media type");
      await deleteStorageFile(object.bucket, filePath);
      return;
    }

    if (!fileName.endsWith(config.extension) || contentType !== config.contentType) {
      await markMediaFailed(mediaRef, "content_type_mismatch", "Upload must be in the expected format");
      await deleteStorageFile(object.bucket, filePath);
      return;
    }

    if (config.maxBytes && sizeBytes > config.maxBytes) {
      await markMediaFailed(mediaRef, "file_too_large", "Photo exceeds 2MB limit");
      await deleteStorageFile(object.bucket, filePath);
      return;
    }

    const expectedPath = Array.isArray(data.media) && data.media.length > 0 ? data.media[0]?.storagePath : null;
    if (expectedPath && expectedPath !== filePath) {
      await markMediaFailed(mediaRef, "path_mismatch", "Upload path does not match note");
      await deleteStorageFile(object.bucket, filePath);
      return;
    }

    let dimensions = null;
    if (mediaKind === "photo") {
      try {
        const [buffer] = await storage.bucket(object.bucket).file(filePath).download();
        dimensions = parseWebpDimensions(buffer);
      } catch (err) {
        console.error("[mediaFinalize] failed to read image for dimensions", err);
      }
    }

    const mediaEntry = {
      storagePath: filePath,
      contentType,
      sizeBytes,
    };
    if (dimensions?.width && dimensions?.height) {
      mediaEntry.width = dimensions.width;
      mediaEntry.height = dimensions.height;
    }

    try {
      await mediaRef.set(
        {
          media: [mediaEntry],
          status: "ready",
          errorCode: null,
          errorMessage: null,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("[mediaFinalize] failed to update Firestore", err);
    }
  });

// -------------------------------------------------
// Firestore onDelete: clean up storage when a media doc is removed
// -------------------------------------------------
export const mediaCleanup = functions
  .region("asia-south1")
  .firestore.document("students/{studentId}/media/{mediaId}")
  .onDelete(async (snap) => {
    const data = snap.data() || {};
    const storagePath =
      Array.isArray(data.media) && data.media.length > 0
        ? data.media[0]?.storagePath
        : null;
    if (!storagePath) return;

    try {
      await storage.bucket().file(storagePath).delete();
    } catch (err) {
      if (err?.code !== 404) {
        console.error("[mediaCleanup] delete file error", err);
      }
    }
  });
