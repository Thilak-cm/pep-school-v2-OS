/**
 * Promote test bench variant config to live Firestore config docs (PEP-326).
 *
 * Callable CF: validates superadmin caller, snapshots current config into
 * _promotionHistory, then merge-writes only the selected promotable fields.
 *
 * Uses PROMOTE_MAP from promoteFieldMap.js for field-aware target resolution.
 */
import * as functions from "firebase-functions/v1";
import { db, Timestamp } from "../shared/firebase.js";
import {
  PROMOTE_MAP,
  VALID_FEATURE_IDS,
  VALID_PROGRAMS,
  VALID_PROMPT_TYPES,
  MAX_HISTORY_ENTRIES,
} from "./promoteFieldMap.js";

// -----------------------------------------------
// Field type rules — which variant fields are strings vs numbers
// -----------------------------------------------

const STRING_FIELDS = new Set(["systemPrompt", "model", "guidelinesContent", "staticSystemPrompt"]);
const NUMBER_FIELDS = new Set(["temperature", "max_tokens"]);

// -----------------------------------------------
// Validation
// -----------------------------------------------

/**
 * Validate a promote request payload.
 * @param {object} data — raw request from the client
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePromoteRequest(data) {
  const featureId = data?.featureId;
  if (!featureId || !VALID_FEATURE_IDS.includes(featureId)) {
    return { valid: false, error: `Invalid featureId: ${featureId}. Must be one of: ${VALID_FEATURE_IDS.join(", ")}` };
  }

  const fields = data?.fields;
  if (!fields || typeof fields !== "object" || Object.keys(fields).length === 0) {
    return { valid: false, error: "fields is required and must be a non-empty object" };
  }

  const entry = PROMOTE_MAP[featureId];

  // programId requirement — must validate before targets() which uses it
  if (entry.requiresProgramId) {
    if (!data?.programId || !VALID_PROGRAMS.includes(data.programId)) {
      return { valid: false, error: `programId is required for ${featureId}. Must be one of: ${VALID_PROGRAMS.join(", ")}` };
    }
  }

  // promptType requirement — must validate before targets() which uses it
  if (entry.requiresPromptType) {
    if (!data?.promptType || !VALID_PROMPT_TYPES.includes(data.promptType)) {
      return { valid: false, error: `promptType is required for ${featureId}. Must be one of: ${VALID_PROMPT_TYPES.join(", ")}` };
    }
  }

  // Collect all valid field names for this feature
  const targets = entry.targets(data?.programId, data?.promptType);
  const allowedFields = new Set();
  for (const t of targets) {
    for (const key of Object.keys(t.fields)) {
      allowedFields.add(key);
    }
  }

  // Check for unknown fields
  for (const key of Object.keys(fields)) {
    if (!allowedFields.has(key)) {
      return { valid: false, error: `Unknown field "${key}" for feature ${featureId}. Allowed: ${[...allowedFields].join(", ")}` };
    }
  }

  // Type checks
  for (const [key, value] of Object.entries(fields)) {
    if (STRING_FIELDS.has(key) && typeof value !== "string") {
      return { valid: false, error: `${key} must be a string, got ${typeof value}` };
    }
    if (NUMBER_FIELDS.has(key) && typeof value !== "number") {
      return { valid: false, error: `${key} must be a number, got ${typeof value}` };
    }
  }

  return { valid: true };
}

// -----------------------------------------------
// Target resolution
// -----------------------------------------------

/**
 * Resolve the PROMOTE_MAP targets for a given feature.
 * @returns {Array<{ docPath: string, fields: Record<string, string> }>}
 */
export function resolveTargets(featureId, programId, promptType) {
  return PROMOTE_MAP[featureId].targets(programId, promptType);
}

// -----------------------------------------------
// Write payload construction
// -----------------------------------------------

/**
 * Build the Firestore merge-write payload for one target doc.
 * Only includes fields that are both in the target mapping AND in the user's selected fields.
 *
 * @param {object} target — { docPath, fields: { variantKey: firestoreKey } }
 * @param {object} variantFields — user-selected fields from the variant { systemPrompt: "...", model: "..." }
 * @returns {object} Firestore write payload with renamed keys
 */
export function buildPromotionWrite(target, variantFields) {
  const write = {};
  for (const [variantKey, firestoreKey] of Object.entries(target.fields)) {
    if (variantKey in variantFields) {
      write[firestoreKey] = variantFields[variantKey];
    }
  }
  return write;
}

// -----------------------------------------------
// Version snapshot
// -----------------------------------------------

/**
 * Build a promotion history entry by snapshotting the current values
 * of only the fields being overwritten.
 *
 * @param {object} currentDoc — current Firestore doc data (full doc)
 * @param {object} fieldsBeingWritten — the write payload (post-rename, Firestore keys)
 * @param {object} meta — { uid, name, runId?, featureId }
 * @returns {object} history entry
 */
export function buildHistoryEntry(currentDoc, fieldsBeingWritten, meta) {
  const snapshot = {};
  for (const key of Object.keys(fieldsBeingWritten)) {
    if (key in currentDoc) {
      snapshot[key] = currentDoc[key];
    }
  }

  return {
    snapshot,
    replacedBy: { uid: meta.uid, name: meta.name },
    promotedFromRun: meta.runId || null,
    featureId: meta.featureId,
  };
}

// -----------------------------------------------
// Callable Cloud Function
// -----------------------------------------------

export const promoteTestBenchConfig = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 30, memory: "256MB" })
  .https.onCall(async (data, context) => {
    // 1. Auth gate
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    // 2. Superadmin check
    const callerSnap = await db.collection("users").doc(context.auth.uid).get();
    const callerRole = callerSnap.exists ? callerSnap.data().role : null;
    const callerName = callerSnap.exists ? (callerSnap.data().displayName || callerSnap.data().name || "Unknown") : "Unknown";
    if (callerRole !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Only superadmins can promote test bench configs");
    }

    // 3. Validate request
    const validation = validatePromoteRequest(data);
    if (!validation.valid) {
      throw new functions.https.HttpsError("invalid-argument", validation.error);
    }

    const { featureId, fields, programId, promptType, runId } = data;
    const targets = resolveTargets(featureId, programId, promptType);
    const promotedAt = new Date().toISOString();
    const results = [];

    // 4. Process each target doc
    for (const target of targets) {
      const writePayload = buildPromotionWrite(target, fields);

      // Skip if no fields to write for this target
      if (Object.keys(writePayload).length === 0) {
        continue;
      }

      const docRef = db.doc(target.docPath);
      let previousVersionIndex = -1;

      await db.runTransaction(async (tx) => {
        const currentSnap = await tx.get(docRef);
        const currentData = currentSnap.exists ? currentSnap.data() : {};

        // Build history entry (only if doc exists and has data to snapshot)
        if (currentSnap.exists) {
          const historyEntry = buildHistoryEntry(currentData, writePayload, {
            uid: context.auth.uid,
            name: callerName,
            runId: runId || null,
            featureId,
          });
          // Use server timestamp for the history entry
          historyEntry.replacedAt = Timestamp.now();

          const history = currentData._promotionHistory || [];
          history.unshift(historyEntry);
          // Cap at MAX_HISTORY_ENTRIES
          const cappedHistory = history.slice(0, MAX_HISTORY_ENTRIES);
          writePayload._promotionHistory = cappedHistory;
          previousVersionIndex = 0;
        }

        // Add audit metadata
        writePayload.updatedAt = Timestamp.now();
        writePayload.updatedBy = `testbench:${context.auth.uid}`;

        // Merge write — only touches specified fields
        tx.set(docRef, writePayload, { merge: true });
      });

      results.push({
        docPath: target.docPath,
        fieldsWritten: Object.keys(writePayload).filter((k) => k !== "_promotionHistory" && k !== "updatedAt" && k !== "updatedBy"),
        previousVersionIndex,
      });
    }

    return { status: "ok", promotedAt, targets: results };
  });
