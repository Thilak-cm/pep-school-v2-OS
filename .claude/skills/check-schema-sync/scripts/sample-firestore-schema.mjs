#!/usr/bin/env node

/**
 * Sample Firestore documents and infer schema from production data.
 *
 * Connects to the pep-os Firestore project, samples documents from every
 * known collection and subcollection (using 3 real students for student-scoped
 * data), and outputs a JSON schema describing field names, types, and which
 * fields are optional (not present in every sampled doc).
 *
 * Usage:
 *   node .claude/skills/check-schema-sync/scripts/sample-firestore-schema.mjs
 *
 * Output: writes schema JSON to stdout. Logs progress to stderr.
 */

import admin from "firebase-admin";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = resolve(__dirname, "../../../../firebase-service-account.json");
const PROJECT_ID = "pep-os";

// Init Firebase — prefer service account key (like the MCP server), fall back to ADC
if (existsSync(SERVICE_ACCOUNT_PATH)) {
  const sa = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId: PROJECT_ID,
  });
  process.stderr.write("[schema-sampler] Auth via service account\n");
} else {
  process.env.GCLOUD_PROJECT = PROJECT_ID;
  process.env.GCP_PROJECT = PROJECT_ID;
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
  });
  process.stderr.write("[schema-sampler] Auth via ADC\n");
}

const db = admin.firestore();

const SAMPLE_LIMIT = 5; // docs to sample per collection
const STUDENT_SAMPLE_COUNT = 3; // students to sample subcollections from

// ── Helpers ──

function inferType(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (value.toDate && typeof value.toDate === "function") return "Timestamp";
  if (Array.isArray(value)) {
    if (value.length === 0) return "array<unknown>";
    const elemTypes = [...new Set(value.map(inferType))];
    if (elemTypes.length === 1) return `array<${elemTypes[0]}>`;
    return `array<${elemTypes.join(" | ")}>`;
  }
  if (typeof value === "object") {
    // Firestore DocumentReference
    if (value.constructor?.name === "DocumentReference") return "DocumentReference";
    // GeoPoint
    if ("latitude" in value && "longitude" in value && Object.keys(value).length === 2) return "GeoPoint";
    return "map";
  }
  return typeof value;
}

/**
 * Merge field info from a single document into an accumulator.
 * Tracks: field name, observed types, how many docs had this field,
 * and for map fields, recurses into nested structure.
 */
function mergeDocFields(acc, data, docCount) {
  for (const [key, value] of Object.entries(data)) {
    if (!acc[key]) {
      acc[key] = { types: new Set(), presentIn: 0, nested: null };
    }
    const fieldType = inferType(value);
    acc[key].types.add(fieldType);
    acc[key].presentIn++;

    // Recurse into maps to capture nested structure
    if (fieldType === "map" && typeof value === "object" && !Array.isArray(value)) {
      if (!acc[key].nested) acc[key].nested = {};
      mergeDocFields(acc[key].nested, value, docCount);
    }
  }
}

/**
 * Convert the accumulator into a clean JSON-serializable schema.
 */
function finalizeSchema(acc, totalDocs) {
  const schema = {};
  for (const [key, info] of Object.entries(acc)) {
    schema[key] = {
      types: [...info.types].sort(),
      optional: info.presentIn < totalDocs,
      presentIn: `${info.presentIn}/${totalDocs}`,
    };
    if (info.nested) {
      schema[key].nested = finalizeSchema(info.nested, totalDocs);
    }
  }
  return schema;
}

/**
 * Sample docs from a collection/query and return inferred schema.
 */
async function sampleCollection(ref, limit = SAMPLE_LIMIT) {
  const snap = await ref.limit(limit).get();
  if (snap.empty) return { docCount: 0, sampleIds: [], schema: {} };

  const acc = {};
  const sampleIds = [];
  snap.forEach((doc) => {
    sampleIds.push(doc.id);
    mergeDocFields(acc, doc.data(), snap.size);
  });

  return {
    docCount: snap.size,
    sampleIds,
    schema: finalizeSchema(acc, snap.size),
  };
}

/**
 * Sample a subcollection across multiple students and merge schemas.
 */
async function sampleStudentSubcollection(studentIds, subPath, limit = SAMPLE_LIMIT) {
  const allAcc = {};
  let totalDocs = 0;
  const allSampleIds = [];

  for (const sid of studentIds) {
    const ref = db.collection("students").doc(sid).collection(subPath);
    const snap = await ref.limit(limit).get();
    snap.forEach((doc) => {
      totalDocs++;
      allSampleIds.push(`${sid}/${subPath}/${doc.id}`);
      mergeDocFields(allAcc, doc.data(), 1); // we'll recalc presentIn
    });
  }

  if (totalDocs === 0) return { docCount: 0, sampleIds: [], schema: {} };

  // Fix presentIn counts — mergeDocFields incremented per doc
  return {
    docCount: totalDocs,
    sampleIds: allSampleIds.slice(0, 6), // keep output manageable
    schema: finalizeSchema(allAcc, totalDocs),
  };
}

/**
 * Sample specific named docs (like ai_summaries/soul) across students.
 */
async function sampleNamedDoc(studentIds, collectionPath, docId) {
  const allAcc = {};
  let totalDocs = 0;
  const allSampleIds = [];

  for (const sid of studentIds) {
    const doc = await db
      .collection("students")
      .doc(sid)
      .collection(collectionPath)
      .doc(docId)
      .get();

    if (doc.exists) {
      totalDocs++;
      allSampleIds.push(`${sid}/${collectionPath}/${docId}`);
      mergeDocFields(allAcc, doc.data(), 1);
    }
  }

  if (totalDocs === 0) return { docCount: 0, sampleIds: [], schema: {} };

  return {
    docCount: totalDocs,
    sampleIds: allSampleIds,
    schema: finalizeSchema(allAcc, totalDocs),
  };
}

/**
 * Sample history subcollections (e.g., ai_summaries/soul/history).
 */
async function sampleHistorySubcollection(studentIds, parentCollection, parentDocId) {
  const allAcc = {};
  let totalDocs = 0;
  const allSampleIds = [];

  for (const sid of studentIds) {
    const ref = db
      .collection("students")
      .doc(sid)
      .collection(parentCollection)
      .doc(parentDocId)
      .collection("history");

    const snap = await ref.limit(3).get();
    snap.forEach((doc) => {
      totalDocs++;
      allSampleIds.push(`${sid}/${parentCollection}/${parentDocId}/history/${doc.id}`);
      mergeDocFields(allAcc, doc.data(), 1);
    });
  }

  if (totalDocs === 0) return { docCount: 0, sampleIds: [], schema: {} };

  return {
    docCount: totalDocs,
    sampleIds: allSampleIds.slice(0, 6),
    schema: finalizeSchema(allAcc, totalDocs),
  };
}

// ── Main ──

async function main() {
  const log = (msg) => process.stderr.write(`[schema-sampler] ${msg}\n`);

  log("Starting Firestore schema sampling...");

  // Pick 3 active students from different classrooms for variety
  const studentSnap = await db
    .collection("students")
    .where("status", "==", "active")
    .limit(50)
    .get();

  const seenClassrooms = new Set();
  const studentIds = [];
  studentSnap.forEach((doc) => {
    const d = doc.data();
    if (!seenClassrooms.has(d.classroomId) && studentIds.length < STUDENT_SAMPLE_COUNT) {
      seenClassrooms.add(d.classroomId);
      studentIds.push(doc.id);
    }
  });

  // Fallback: if fewer than 3 classrooms, just take first 3 students
  if (studentIds.length < STUDENT_SAMPLE_COUNT) {
    studentSnap.forEach((doc) => {
      if (studentIds.length < STUDENT_SAMPLE_COUNT && !studentIds.includes(doc.id)) {
        studentIds.push(doc.id);
      }
    });
  }

  log(`Sampled students: ${studentIds.join(", ")}`);

  const result = {};

  // ── Top-level collections ──

  log("Sampling top-level collections...");

  const topLevelCollections = [
    "branches",
    "programs",
    "users",
    "classrooms",
    "students",
    "feedback",
    "config",
    "testbench_access",
    "testbench",
  ];

  for (const name of topLevelCollections) {
    log(`  ${name}...`);
    result[name] = await sampleCollection(db.collection(name));
  }

  // ── Student subcollections ──

  log("Sampling student subcollections...");

  // Dynamic subcollections (multiple docs)
  const studentSubcollections = [
    "observations",
    "media",
    "placements",
    "interviews",
    "chats",
  ];

  for (const sub of studentSubcollections) {
    log(`  students/{id}/${sub}...`);
    result[`students/{id}/${sub}`] = await sampleStudentSubcollection(studentIds, sub);
  }

  // Chat messages (need a chat ID first)
  log("  students/{id}/chats/{id}/messages...");
  const chatMsgAcc = {};
  let chatMsgTotal = 0;
  const chatMsgSamples = [];
  for (const sid of studentIds) {
    const chatSnap = await db
      .collection("students")
      .doc(sid)
      .collection("chats")
      .limit(1)
      .get();

    if (!chatSnap.empty) {
      const chatId = chatSnap.docs[0].id;
      const msgSnap = await db
        .collection("students")
        .doc(sid)
        .collection("chats")
        .doc(chatId)
        .collection("messages")
        .limit(SAMPLE_LIMIT)
        .get();

      msgSnap.forEach((doc) => {
        chatMsgTotal++;
        chatMsgSamples.push(`${sid}/chats/${chatId}/messages/${doc.id}`);
        mergeDocFields(chatMsgAcc, doc.data(), 1);
      });
    }
  }
  result["students/{id}/chats/{id}/messages"] = {
    docCount: chatMsgTotal,
    sampleIds: chatMsgSamples.slice(0, 6),
    schema: chatMsgTotal > 0 ? finalizeSchema(chatMsgAcc, chatMsgTotal) : {},
  };

  // ── Named AI summary docs ──

  log("Sampling ai_summaries named docs...");

  const namedSummaryDocs = [
    "soul",
    "guidelines",
    "open_questions",
    "report_readiness",
    "writing_analysis",
    "weekly_snapshot",
  ];

  for (const docId of namedSummaryDocs) {
    log(`  ai_summaries/${docId}...`);
    result[`students/{id}/ai_summaries/${docId}`] = await sampleNamedDoc(
      studentIds,
      "ai_summaries",
      docId
    );
  }

  // Also sample any report_* docs (dynamic report IDs)
  log("  ai_summaries/report_*...");
  const reportAcc = {};
  let reportTotal = 0;
  const reportSamples = [];
  for (const sid of studentIds) {
    const summSnap = await db
      .collection("students")
      .doc(sid)
      .collection("ai_summaries")
      .limit(20)
      .get();

    summSnap.forEach((doc) => {
      if (doc.id.startsWith("report_")) {
        reportTotal++;
        reportSamples.push(`${sid}/ai_summaries/${doc.id}`);
        mergeDocFields(reportAcc, doc.data(), 1);
      }
    });
  }
  result["students/{id}/ai_summaries/report_{timestamp}"] = {
    docCount: reportTotal,
    sampleIds: reportSamples.slice(0, 6),
    schema: reportTotal > 0 ? finalizeSchema(reportAcc, reportTotal) : {},
  };

  // ── History subcollections ──

  log("Sampling history subcollections...");

  const historyParents = ["soul", "guidelines", "weekly_snapshot", "report_readiness"];

  for (const parentDocId of historyParents) {
    log(`  ai_summaries/${parentDocId}/history...`);
    result[`students/{id}/ai_summaries/${parentDocId}/history`] =
      await sampleHistorySubcollection(studentIds, "ai_summaries", parentDocId);
  }

  // ── Output ──

  const output = {
    sampledAt: new Date().toISOString(),
    studentsSampled: studentIds,
    collections: result,
  };

  process.stdout.write(JSON.stringify(output, null, 2));
  log("Done. Schema written to stdout.");
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[schema-sampler] Fatal error: ${err.message}\n`);
  process.stderr.write(err.stack + "\n");
  process.exit(1);
});
