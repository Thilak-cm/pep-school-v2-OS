import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
// import { getStorage } from "firebase-admin/storage";
// Use v1 compatibility API for region(), https.onCall(), etc.
import * as functions from "firebase-functions/v1";
// import { v4 as uuidv4 } from "uuid";
import { COACH_MODEL_INFO } from "./config/coachConstants.js";
import { BASEBALL_CARD_DEFAULTS } from "./config/baseballCardConstants.js";
import { CHAT_MODEL_INFO, DEFAULT_CHAT_MESSAGE_LIMIT, DEFAULT_OBSERVATION_LIMIT, CHAT_SYSTEM_PROMPT } from "./config/chatConstants.js";

initializeApp({ credential: applicationDefault() });

const db = getFirestore();
const auth = getAuth();
// const storage = getStorage();

// Helper: Sanitize email for use as document ID
function sanitizeEmailForDocId(email) {
  return email.toLowerCase().replace(/[^a-z0-9]/g, "_");
}

// Callable: Create pending Firestore profile (no Auth account - Google-only onboarding)
// - Enforces allowed domains
// - Creates doc at users/pending_{sanitizedEmail}
// - User will sign in with Google, and app will migrate doc to users/{uid} on first sign-in
// - If user already exists (by email), returns existing info
export const createAuthUserAndProfile = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const requesterUid = context.auth.uid;
    const requesterSnap = await db.collection("users").doc(requesterUid).get();
    const requesterRole = requesterSnap.data()?.role;
    const isSuperAdmin = requesterRole === "superadmin";
    const isClassroomAdmin = requesterRole === "classroomadmin";
    if (!requesterSnap.exists || (!isSuperAdmin && !isClassroomAdmin)) {
      throw new functions.https.HttpsError("permission-denied", "Only admins can create users");
    }

    const {
      email,
      firstName,
      lastName,
      role = "teacher", // 'superadmin' | 'classroomadmin' | 'teacher'
      selectedClassrooms = [], // array of classroom IDs for teachers
      updateIfExists = false,
      status = "active",
      manageableClassrooms = [],
    } = data || {};
    const uniqueSelectedClassrooms = Array.isArray(selectedClassrooms)
      ? Array.from(new Set(selectedClassrooms.filter(Boolean)))
      : [];

    if (!email || !firstName) {
      throw new functions.https.HttpsError("invalid-argument", "email and firstName are required");
    }

    const emailLc = String(email).trim().toLowerCase();
    const allowedDomains = ["@pepschoolv2.com", "@ribbons.education", "@accelschool.in"];
    if (!allowedDomains.some(domain => emailLc.endsWith(domain))) {
      throw new functions.https.HttpsError("failed-precondition", "Email must be from an allowed domain (@pepschoolv2.com, @ribbons.education, or @accelschool.in)");
    }

    const displayName = `${firstName} ${lastName || ""}`.trim();
    const normalizedRole = role === "classroomadmin"
      ? "classroomadmin"
      : (role === "superadmin" ? "superadmin" : "teacher");
    const hasManageableClassroomsInput = Array.isArray(manageableClassrooms);
    const normalizedManageableClassrooms = hasManageableClassroomsInput
      ? Array.from(new Set(manageableClassrooms.map((c) => String(c || "").trim()).filter(Boolean)))
      : [];

    if (normalizedRole === "classroomadmin") {
      if (!isSuperAdmin) {
        throw new functions.https.HttpsError("permission-denied", "Only super admins can create classroom admins");
      }
      if (normalizedManageableClassrooms.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Classroom admins must have at least one manageable classroom");
      }
    }

    if (normalizedRole === "superadmin" && !isSuperAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Only super admins can create super admin accounts");
    }

    try {
      // Check if user already exists (by email query - could be pending or migrated)
      const existingUserQuery = await db.collection("users")
        .where("email", "==", emailLc)
        .limit(1)
        .get();

      if (!existingUserQuery.empty) {
        const existingDoc = existingUserQuery.docs[0];
        const existingData = existingDoc.data();
        const existingDocId = existingDoc.id;
        
        // Check if it's a migrated user (has UID as doc ID) or pending user
        const isMigrated = existingDocId.length === 28 && !existingDocId.startsWith("pending_");
        
        if (!updateIfExists) {
          return { 
            exists: true, 
            uid: isMigrated ? existingDocId : null,
            pendingId: !isMigrated ? existingDocId : null,
            hasDoc: true, 
            existingRole: existingData.role 
          };
        }

        // Update existing doc
        const updateData = {
          displayName,
          email: emailLc,
          status: status || existingData.status || "active",
          updatedAt: new Date(),
        };
        if (existingData.role === "classroomadmin" && hasManageableClassroomsInput) {
          if (!isSuperAdmin) {
            throw new functions.https.HttpsError("permission-denied", "Only super admins can edit classroom admins");
          }
          if (normalizedManageableClassrooms.length === 0) {
            throw new functions.https.HttpsError("invalid-argument", "Classroom admins must manage at least one classroom");
          }
          updateData.manageableClassrooms = normalizedManageableClassrooms;
        }
        if (!isMigrated && existingData.role === "teacher" && uniqueSelectedClassrooms.length > 0) {
          updateData.selectedClassrooms = uniqueSelectedClassrooms;
        }
        
        await db.collection("users").doc(existingDocId).set(updateData, { merge: true });

        // Assign teacher to classrooms (non-destructive) - only if migrated user
        if (isMigrated && existingData.role === "teacher" && uniqueSelectedClassrooms.length > 0) {
          for (const classroomId of uniqueSelectedClassrooms) {
            const cRef = db.collection("classrooms").doc(classroomId);
            await db.runTransaction(async (tx) => {
              const cSnap = await tx.get(cRef);
              if (!cSnap.exists) return;
              const teacherIds = Array.isArray(cSnap.data().teacherIds) ? cSnap.data().teacherIds : [];
              if (!teacherIds.includes(existingDocId)) {
                tx.update(cRef, {
                  teacherIds: [...teacherIds, existingDocId],
                  updatedAt: new Date(),
                });
              }
            });
          }
        } else if (!isMigrated && existingData.role === "teacher" && uniqueSelectedClassrooms.length > 0) {
          // Keep pending teachers reflected on classroom docs so assignments show up pre-migration
          for (const classroomId of uniqueSelectedClassrooms) {
            const cRef = db.collection("classrooms").doc(classroomId);
            await db.runTransaction(async (tx) => {
              const cSnap = await tx.get(cRef);
              if (!cSnap.exists) return;
              const teacherIds = Array.isArray(cSnap.data().teacherIds) ? cSnap.data().teacherIds : [];
              if (!teacherIds.includes(existingDocId)) {
                tx.update(cRef, {
                  teacherIds: [...teacherIds, existingDocId],
                  updatedAt: new Date(),
                });
              }
            });
          }
        }

        return { ok: true, uid: isMigrated ? existingDocId : null, updated: true, role: existingData.role };
      }

      // Create pending Firestore profile (no Auth account - Google-only)
      const pendingDocId = `pending_${sanitizeEmailForDocId(emailLc)}`;
      const newUserData = {
        displayName,
        email: emailLc,
        role: normalizedRole,
        status: status,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: requesterUid,
        isPending: true, // Flag to identify pending users
      };
      if (normalizedRole === "classroomadmin") {
        newUserData.manageableClassrooms = normalizedManageableClassrooms;
      }
      if (normalizedRole === "teacher" && uniqueSelectedClassrooms.length > 0) {
        newUserData.selectedClassrooms = uniqueSelectedClassrooms; // Store for migration
      }
      
      await db.collection("users").doc(pendingDocId).set(newUserData, { merge: true });

      // Assign the pending teacher to classrooms immediately so UI reflects the selection
      if (normalizedRole === "teacher" && uniqueSelectedClassrooms.length > 0) {
        for (const classroomId of uniqueSelectedClassrooms) {
          try {
            const classroomRef = db.collection("classrooms").doc(classroomId);
            await db.runTransaction(async (tx) => {
              const classroomSnap = await tx.get(classroomRef);
              if (!classroomSnap.exists) return;

              const classroomData = classroomSnap.data();
              const teacherIds = Array.isArray(classroomData.teacherIds) ? classroomData.teacherIds : [];

              if (!teacherIds.includes(pendingDocId)) {
                tx.update(classroomRef, {
                  teacherIds: [...teacherIds, pendingDocId],
                  updatedAt: new Date(),
                });
              }
            });
          } catch (classroomErr) {
            console.error(`[createAuthUserAndProfile] Failed to assign classroom ${classroomId} for pending user:`, classroomErr);
          }
        }
      }

      return { ok: true, pendingId: pendingDocId, created: true, role: newUserData.role };
    } catch (err) {
      console.error("createAuthUserAndProfile error:", err);
      if (err instanceof functions.https.HttpsError) throw err;
      throw new functions.https.HttpsError("internal", err?.message || "Failed to create/update user");
    }
  });

// Callable: Update basic profile fields for existing users (no role change)
export const updateUserProfileIfExists = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { uid, displayName, status = "active" } = data || {};
    if (!uid) {
      throw new functions.https.HttpsError("invalid-argument", "uid is required");
    }

    // Only admins can update
    const requesterSnap = await db.collection("users").doc(context.auth.uid).get();
    const requesterRole = requesterSnap.data()?.role;
    if (!requesterSnap.exists || (requesterRole !== "classroomadmin" && requesterRole !== "superadmin")) {
      throw new functions.https.HttpsError("permission-denied", "Only admins can update users");
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new functions.https.HttpsError("not-found", "User profile not found");
    }

    const updateData = {
      updatedAt: new Date(),
    };
    if (displayName) updateData.displayName = displayName;
    if (status) updateData.status = status;

    await userRef.set(updateData, { merge: true });
    return { ok: true, uid };
});

// Callable function: Update user with email uniqueness check
export const updateUserWithEmailCheck = functions.region("asia-south1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const { uid, email, displayName, additionalData = {} } = data;
  
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "User UID is required");
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      // Get the current user document
      const userRef = db.collection("users").doc(uid);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists) {
        throw new functions.https.HttpsError("not-found", "User not found");
      }

      // If email is being updated, check for conflicts
      if (email && email !== userSnap.data().email) {
        const existingUserSnap = await transaction.get(
          db.collection("users").where("email", "==", email)
        );

        if (!existingUserSnap.empty) {
          throw new functions.https.HttpsError(
            "already-exists", 
            "User with email " + email + " already exists"
          );
        }
      }

      // Update the user document
      const updateData = {
        ...additionalData
      };

      if (email) updateData.email = email.toLowerCase().trim();
      if (displayName) updateData.displayName = displayName;
      updateData.updatedAt = new Date();

      transaction.update(userRef, updateData);

      return {
        uid,
        ...updateData
      };
    });

    return { success: true, user: result };

  } catch (error) {
    console.error("updateUserWithEmailCheck failed:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal", 
      "Failed to update user: " + error.message
    );
  }
});


// Callable: Migrate pending user document to users/{uid} when user signs in
// - Called automatically when user signs in and no doc exists at users/{uid}
// - Finds pending doc by email, migrates it, assigns classrooms, deletes old doc
// Updated: Fixed exists property access (not method call)
export const migratePendingUser = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const userUid = context.auth.uid;
    const userEmail = context.auth.token?.email;
    if (!userEmail) {
      throw new functions.https.HttpsError("invalid-argument", "Email not found in auth token");
    }

    const emailLower = String(userEmail).trim().toLowerCase();

    try {
      // Check if user doc already exists at users/{uid}
      const userRef = db.collection("users").doc(userUid);
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        // Already migrated or exists
        return { ok: true, migrated: false, uid: userUid };
      }

      // Look up by email to find any user doc (pending or existing with different UID)
      const emailQuery = await db.collection("users")
        .where("email", "==", emailLower)
        .limit(1)
        .get();

      if (emailQuery.empty) {
        // No user doc found by email
        return { ok: false, error: "no_user_found_by_email", uid: userUid };
      }

      // Found user doc - migrate it to the new Auth UID
      const oldDoc = emailQuery.docs[0];
      const oldDocData = oldDoc.data();
      const oldDocId = oldDoc.id;
      
      // Skip if the doc is already at the correct UID (shouldn't happen, but be safe)
      if (oldDocId === userUid) {
        return { ok: true, migrated: false, uid: userUid };
      }

      // Prepare migrated data
      const migratedData = {
        ...oldDocData,
        email: emailLower,
        updatedAt: new Date(),
        migratedAt: new Date(),
        migratedFrom: oldDocId,
      };

      // Remove pending flag if present
      delete migratedData.isPending;

      // Handle classroom assignments for teachers (if stored in selectedClassrooms)
      const selectedClassrooms = Array.isArray(migratedData.selectedClassrooms) 
        ? Array.from(new Set(migratedData.selectedClassrooms.filter(Boolean)))
        : [];
      
      if (migratedData.role === "teacher") {
        delete migratedData.selectedClassrooms; // Remove temp field

        const swapTeacherIds = async (classroomId) => {
          const classroomRef = db.collection("classrooms").doc(classroomId);
          await db.runTransaction(async (tx) => {
            const classroomSnap = await tx.get(classroomRef);
            if (!classroomSnap.exists) return;

            const classroomData = classroomSnap.data();
            const teacherIds = Array.isArray(classroomData.teacherIds) ? classroomData.teacherIds : [];
            const nextTeacherIds = teacherIds.filter((id) => id !== oldDocId);
            if (!nextTeacherIds.includes(userUid)) {
              nextTeacherIds.push(userUid);
            }

            tx.update(classroomRef, {
              teacherIds: nextTeacherIds,
              updatedAt: new Date(),
            });
          });
        };

        try {
          // Replace the pending ID with the real UID everywhere it appears
          const pendingQuery = await db.collection("classrooms")
            .where("teacherIds", "array-contains", oldDocId)
            .get();

          const touched = new Set();
          for (const docSnap of pendingQuery.docs) {
            const classroomId = docSnap.id;
            touched.add(classroomId);
            await swapTeacherIds(classroomId);
          }

          // Ensure the selectedClassrooms list is also applied (covers legacy cases)
          for (const classroomId of selectedClassrooms) {
            if (touched.has(classroomId)) continue;
            await swapTeacherIds(classroomId);
          }
        } catch (classroomErr) {
          console.error("[migratePendingUser] Failed to migrate classroom assignments:", classroomErr);
        }
      }

      // Create new doc with new UID
      await userRef.set(migratedData);

      // Delete old doc
      await db.collection("users").doc(oldDocId).delete();

      return { 
        ok: true, 
        migrated: true, 
        uid: userUid,
        oldDocId: oldDocId,
        role: migratedData.role 
      };
    } catch (err) {
      console.error("[migratePendingUser] error:", err);
      console.error("[migratePendingUser] error stack:", err?.stack);
      console.error("[migratePendingUser] error details:", {
        userUid,
        userEmail: emailLower,
        errorMessage: err?.message,
        errorCode: err?.code
      });
      if (err instanceof functions.https.HttpsError) throw err;
      throw new functions.https.HttpsError("internal", err?.message || "Failed to migrate pending user");
    }
  });


// -----------------------------------------------
// AI: Text Cleanup (server-side OpenAI invocation)
// -----------------------------------------------
const OPENAI_API_KEY = functions.config().openai?.key || process.env.OPENAI_API_KEY || null;
const CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const CLEANUP_MODEL_INFO = { model: "gpt-4o-mini", temperature: 0, max_tokens: 1000 };

// In-memory TTL cache for prompts to reduce Firestore reads
const PROMPT_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
let textSummarizerCache = { data: null, ts: 0 };

async function getTextSummarizerPromptsServer({ forceRefresh = false } = {}) {
  const fresh =
    !forceRefresh &&
    textSummarizerCache.data &&
    (Date.now() - textSummarizerCache.ts < PROMPT_TTL_MS);
  if (fresh) return textSummarizerCache.data;

  try {
    const snap = await db.collection("ai_prompts").doc("text_summarizer").get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const out = {
      systemPrompt: String(data.systemPrompt || ""),
      userPrompt: String(data.userPrompt || ""),
      version: Number.isFinite(data.version) ? data.version : 1,
    };
    textSummarizerCache = { data: out, ts: Date.now() };
    return out;
  } catch (err) {
    console.warn("[aiTextCleanup] prompt fetch failed:", err);
    const out = {
      systemPrompt:
        "You are an assistant that cleans up Montessori observation notes. Goals: fix capitalization, grammar, and punctuation; group into clear short paragraphs (1–3 sentences each); use succinct hyphen bullets only when listing actions or next steps; keep tone neutral and observational. Rules: - Preserve all factual content, names, and dates; do not add or infer details. - Sentence case capitalization; correct accidental ALL CAPS (keep acronyms like IEP, ESL). - Ensure consistent spacing and final punctuation for sentences. - Keep it parent- and teacher-friendly; avoid clinical jargon. - Output plain text with line breaks (no headings, no markdown formatting beyond simple \"- \" bullets). - Return only the refined note text, with clean, readable structure.",
      userPrompt:
        "Please clean up the following observation. Density: ${tone}. --- ${text} ---",
      version: 1,
    };
    textSummarizerCache = { data: out, ts: Date.now() };
    return out;
  }
}

export const aiTextCleanup = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 60, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    if (!OPENAI_API_KEY) {
      throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
    }

    const text = String(data?.text || "").trim();
    const tone = String(data?.tone || "standard");
    if (!text) {
      throw new functions.https.HttpsError("invalid-argument", "text is required");
    }
    if (text.length > 12000) {
      throw new functions.https.HttpsError("invalid-argument", "text too long");
    }
    if (!["concise", "standard", "detailed"].includes(tone)) {
      throw new functions.https.HttpsError("invalid-argument", "invalid tone");
    }

    const forceRefresh = !!data?.forceRefresh;
    const { systemPrompt, userPrompt, version } = await getTextSummarizerPromptsServer({ forceRefresh });

    const interpolate = (tpl, vars) =>
      String(tpl)
        .replaceAll("${" + "tone}", vars.tone)
        .replaceAll("${" + "text}", vars.text);

    const renderedUser = interpolate(userPrompt || "Please clean up the following observation. Density: ${tone}. --- ${text} ---", { tone, text });

    const body = {
      model: CLEANUP_MODEL_INFO.model,
      messages: [
        { role: "system", content: systemPrompt || "" },
        { role: "user", content: renderedUser }
      ],
      temperature: CLEANUP_MODEL_INFO.temperature,
      max_tokens: CLEANUP_MODEL_INFO.max_tokens,
    };

    let response;
    try {
      response = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      console.error("[aiTextCleanup] network error", e);
      throw new functions.https.HttpsError("unavailable", "AI service unavailable");
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("[aiTextCleanup] OpenAI error", response.status, errText?.slice?.(0, 300));
      throw new functions.https.HttpsError("internal", `AI error: ${response.status}`);
    }

    const json = await response.json();
    const cleanedText = json?.choices?.[0]?.message?.content?.trim();
    if (!cleanedText) {
      throw new functions.https.HttpsError("internal", "AI returned no content");
    }

  return {
    cleanedText,
    model: CLEANUP_MODEL_INFO.model,
    promptVersion: version || 1,
  };
});

// -----------------------------------------------
// AI: Whisper STT (server-side OpenAI invocation)
// -----------------------------------------------
const WHISPER_TRANSCRIBE_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const WHISPER_TRANSLATE_ENDPOINT = "https://api.openai.com/v1/audio/translations";
const WHISPER_MODEL_INFO = { model: "whisper-1" };

// TTL cache for voice context prompt
const VOICE_PROMPT_TTL_MS = 5 * 60 * 1000;
let voicePromptCache = { data: null, ts: 0 };

async function getVoiceContextPromptServer({ forceRefresh = false } = {}) {
  const fresh =
    !forceRefresh &&
    voicePromptCache.data &&
    (Date.now() - voicePromptCache.ts < VOICE_PROMPT_TTL_MS);
  if (fresh) return voicePromptCache.data;

  try {
    const snap = await db.collection("ai_prompts").doc("voice_transcriber").get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const contextPrompt = String(
      data.contextPrompt ||
        "This is a Montessori teacher recording educational observations about student learning and development. Content includes Montessori methodology, curriculum areas, student names, developmental milestones, and classroom activities."
    );
    voicePromptCache = { data: contextPrompt, ts: Date.now() };
    return contextPrompt;
  } catch {
    const fallback =
      "This is a Montessori teacher recording educational observations about student learning and development. Content includes Montessori methodology, curriculum areas, student names, developmental milestones, and classroom activities.";
    voicePromptCache = { data: fallback, ts: Date.now() };
    return fallback;
  }
}

function base64ToBlob(base64, mimeType = "application/octet-stream") {
  const buf = Buffer.from(base64, "base64");
  return new Blob([buf], { type: mimeType });
}

// Max payload we allow for callable to avoid request-size limits (approx 9.5MB raw)
const MAX_CALLABLE_BYTES = 9.5 * 1024 * 1024;

export const aiWhisperTranscribe = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    if (!OPENAI_API_KEY) throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");

    const audioBase64 = data?.audioBase64;
    const mimeType = String(data?.mimeType || "audio/mpeg");
    const languageCode = String(data?.languageCode || "en-US");
    if (!audioBase64) throw new functions.https.HttpsError("invalid-argument", "audioBase64 is required");

    const rawBytes = Buffer.byteLength(audioBase64, "base64");
    if (rawBytes > MAX_CALLABLE_BYTES) {
      throw new functions.https.HttpsError("invalid-argument", "Audio too large; please use a shorter recording");
    }

    const blob = base64ToBlob(audioBase64, mimeType);
    const form = new FormData();
    const filename = `recording_${Date.now()}.mp3`;
    form.append("file", blob, filename);
    form.append("model", WHISPER_MODEL_INFO.model);
    form.append("response_format", "verbose_json"); // Get detected language
    const contextPrompt = await getVoiceContextPromptServer({ forceRefresh: !!data?.forceRefresh });
    form.append("prompt", contextPrompt);
    if (languageCode && languageCode !== "en-US") {
      form.append("language", languageCode.split("-")[0]);
    }

    let response;
    try {
      response = await fetch(WHISPER_TRANSCRIBE_ENDPOINT, {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
        body: form,
      });
    } catch (e) {
      console.error("[aiWhisperTranscribe] network error", e);
      throw new functions.https.HttpsError("unavailable", "STT service unavailable");
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("[aiWhisperTranscribe] OpenAI error", response.status, errText?.slice?.(0, 300));
      throw new functions.https.HttpsError("internal", `STT error: ${response.status}`);
    }
    const json = await response.json();
    const text = (json?.text || "").trim();
    const detectedLanguage = json?.language || undefined;
    return { text, languageCode, detectedLanguage };
  });

export const aiWhisperTranslate = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    if (!OPENAI_API_KEY) throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");

    const audioBase64 = data?.audioBase64;
    const mimeType = String(data?.mimeType || "audio/mpeg");
    if (!audioBase64) throw new functions.https.HttpsError("invalid-argument", "audioBase64 is required");

    const rawBytes = Buffer.byteLength(audioBase64, "base64");
    if (rawBytes > MAX_CALLABLE_BYTES) {
      throw new functions.https.HttpsError("invalid-argument", "Audio too large; please use a shorter recording");
    }

    const blob = base64ToBlob(audioBase64, mimeType);
    const form = new FormData();
    const filename = `recording_${Date.now()}.mp3`;
    form.append("file", blob, filename);
    form.append("model", WHISPER_MODEL_INFO.model);
    form.append("response_format", "verbose_json");
    const contextPrompt = await getVoiceContextPromptServer({ forceRefresh: !!data?.forceRefresh });
    form.append("prompt", contextPrompt);

    let response;
    try {
      response = await fetch(WHISPER_TRANSLATE_ENDPOINT, {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
        body: form,
      });
    } catch (e) {
      console.error("[aiWhisperTranslate] network error", e);
      throw new functions.https.HttpsError("unavailable", "STT service unavailable");
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("[aiWhisperTranslate] OpenAI error", response.status, errText?.slice?.(0, 300));
      throw new functions.https.HttpsError("internal", `STT error: ${response.status}`);
    }
    const json = await response.json();
    const text = (json?.text || "").trim();
    const language = json?.language || undefined;
    return { text, detectedLanguage: language };
  });

// -----------------------------------------------
// Coach Review (AI nudges) — callable
// -----------------------------------------------

const NUDGE_IDS = Object.freeze(["duration", "modality", "independence", "evidence", "subjective"]);

// In-memory TTL cache for coach prompts (1 day)
const COACH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const coachConfigCache = new Map(); // docId -> { data, ts }

async function getCoachConfigServer(docId, { forceRefresh = false } = {}) {
  if (!docId || typeof docId !== "string") {
    throw new Error("Invalid coach docId");
  }

  // Check cache first
  const cached = coachConfigCache.get(docId);
  const fresh = !forceRefresh && cached && (Date.now() - cached.ts < COACH_CACHE_TTL_MS);
  if (fresh) {
    return cached.data;
  }

  const snap = await db.collection("ai_prompts").doc(docId).get();
  if (!snap.exists) {
    throw new Error(`Coach prompt configuration not found in Firestore for doc ${docId}`);
  }
  
  const data = snap.data() || {};
  
  // Validate and extract enabled/disabled nudges
  const enabledNudges = Array.isArray(data.enabledNudges)
    ? data.enabledNudges.filter((x) => NUDGE_IDS.includes(x))
    : [];
  const disabledNudges = Array.isArray(data.disabledNudges)
    ? data.disabledNudges.filter((x) => NUDGE_IDS.includes(x))
    : [];
  
  // Extract nudgeBlocks (object with string values)
  const nudgeBlocks = (data.nudgeBlocks && typeof data.nudgeBlocks === "object") 
    ? data.nudgeBlocks 
    : {};
  
  // Extract other fields
  const title = typeof data.title === "string" ? data.title : undefined;
  const description = typeof data.description === "string" ? data.description : undefined;
  const maxReturnNudges = typeof data.maxReturnNudges === "number" ? data.maxReturnNudges : undefined;
  const introBlock = typeof data.introBlock === "string" ? data.introBlock : undefined;
  const finalPrompt = typeof data.finalPrompt === "string" ? data.finalPrompt : undefined;
  const coachFeatureEnable = data.coach_feature_enable === true; // default false
  
  const result = {
    title,
    description,
    enabledNudges,
    disabledNudges,
    maxReturnNudges,
    nudgeBlocks,
    introBlock,
    finalPrompt,
    coachFeatureEnable,
  };

  // Cache the result
  coachConfigCache.set(docId, { data: result, ts: Date.now() });
  return result;
}

// Callable: Run Coach Review on observation text
export const aiCoachReview = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 60, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    if (!OPENAI_API_KEY) {
      throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
    }

    // minimal logging in production; remove verbose payload logs
    const noteText = String(data?.noteText || "").trim();
    // note length intentionally not logged
    if (!noteText) {
      console.error("[aiCoachReview] noteText is empty or missing");
      throw new functions.https.HttpsError("invalid-argument", "noteText is required");
    }

    try {
      // Determine program routing
      const rawProgramIds = Array.isArray(data?.programIds)
        ? data.programIds
        : (data?.programId ? [data.programId] : []);
      const programIds = Array.from(new Set((rawProgramIds || []).map((x) => String(x || "").trim()).filter(Boolean)));

      // If no program provided → log and skip nudges (client should pass program)
      if (programIds.length === 0) {
        console.error("[aiCoachReview] missing programId/programIds; returning empty nudges");
        return {
          nudges: [],
          model: COACH_MODEL_INFO.model,
          enabledNudges: [],
          maxReturnNudges: 0,
        };
      }

      // If multiple programs provided (group note across programs) → skip nudges
      if (programIds.length > 1) {
        return {
          nudges: [],
          model: COACH_MODEL_INFO.model,
          enabledNudges: [],
          maxReturnNudges: 0,
        };
      }

      // Resolve document id by program (no legacy fallback)
      const coachDocId = `coach_${programIds[0]}`;

      // Get coach configuration from Firestore; if missing treat as disabled
      let config;
      try {
        const forceRefresh = !!data?.forceRefresh;
        config = await getCoachConfigServer(coachDocId, { forceRefresh });
      } catch {
        return {
          nudges: [],
          model: COACH_MODEL_INFO.model,
          enabledNudges: [],
          maxReturnNudges: 0,
        };
      }

      // If feature disabled or prompt missing → skip nudges
      if (!config.coachFeatureEnable || !config.finalPrompt) {
        return {
          nudges: [],
          model: COACH_MODEL_INFO.model,
          enabledNudges: config.enabledNudges,
          maxReturnNudges: config.maxReturnNudges,
        };
      }


      // Prepare messages for OpenAI chat completion
      const systemPrompt = config.finalPrompt;
      const userPrompt = noteText;

      // Ensure system prompt explicitly mentions JSON when using json_object format
      // OpenAI requires explicit JSON instruction for response_format: json_object
      const enhancedSystemPrompt = systemPrompt.includes("JSON") || systemPrompt.includes("json")
        ? systemPrompt
        : systemPrompt + "\n\nIMPORTANT: You must respond with valid JSON only.";

      // avoid logging prompt contents in production

      const body = {
        model: COACH_MODEL_INFO.model,
        messages: [
          { role: "system", content: enhancedSystemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: COACH_MODEL_INFO.temperature,
        max_tokens: COACH_MODEL_INFO.max_tokens,
        response_format: { type: "json_object" }, // Force JSON response
      };

      // avoid logging request body details

      let response;
      try {
        response = await fetch(CHAT_ENDPOINT, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch (e) {
        console.error("[aiCoachReview] network error", e);
        throw new functions.https.HttpsError("unavailable", "AI service unavailable");
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error("[aiCoachReview] OpenAI API error", response.status);
        console.error("[aiCoachReview] OpenAI error details:", errText?.slice?.(0, 500));
        let errorMessage = `AI error: ${response.status}`;
        try {
          const errorJson = JSON.parse(errText);
          errorMessage = errorJson?.error?.message || errorMessage;
          console.error("[aiCoachReview] Parsed error:", errorMessage);
        } catch {
          // Not JSON, use raw text
        }
        throw new functions.https.HttpsError("internal", errorMessage);
      }

      const json = await response.json();
      const rawContent = json?.choices?.[0]?.message?.content?.trim();
      
      if (!rawContent) {
        throw new functions.https.HttpsError("internal", "AI returned no content");
      }

      // Parse JSON response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(rawContent);
      } catch (parseError) {
        console.error("[aiCoachReview] JSON parse error", parseError, "Raw content:", rawContent);
        throw new functions.https.HttpsError("internal", "AI returned invalid JSON");
      }

      // Extract nudges array from response
      const nudges = Array.isArray(parsedResponse.nudges) ? parsedResponse.nudges : [];
      
      // Apply maxReturnNudges limit if configured
      let limitedNudges = nudges;
      if (config.maxReturnNudges && config.maxReturnNudges > 0) {
        limitedNudges = nudges.slice(0, config.maxReturnNudges);
      }

      return {
        nudges: limitedNudges,
        rawResponse: rawContent,
        model: COACH_MODEL_INFO.model,
        enabledNudges: config.enabledNudges,
        maxReturnNudges: config.maxReturnNudges,
      };
    } catch (error) {
      console.error("[aiCoachReview] error:", error);
      
      // Re-throw Firebase Functions errors
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      // Handle other errors
      throw new functions.https.HttpsError(
        "internal",
        "Failed to run coach review: " + (error?.message || "Unknown error")
      );
    }
  });

// -----------------------------------------------
// AI: Baseball Card (Last 6 Weeks summary)
// -----------------------------------------------

const BASEBALL_PROMPT_DOC = "baseball_card";
const BASEBALL_CONFIG_DOC = "baseball_card";
const BASEBALL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let baseballPromptCache = { data: null, ts: 0 };
let baseballConfigCache = { data: null, ts: 0 };

const BASEBALL_SYSTEM_PROMPT_FALLBACK = `You are Coach Pepper. Your job is to generate an evidence-based, staff-facing summary for ONE student using ONLY the notes provided.

INPUT:
Notes: JSON array of observation notes from the last <WINDOW_DAYS> days for one student. Each note includes: text, observedAt, studentId, and other metadata.

OUTPUT:
Return exactly one JSON object with this schema:

{
  "summary": "2-3 paragraph staff-facing summary",
  "redFlag": {
    "severity": "low" | "medium" | "high" | null,
    "reason": "brief explanation or null"
  },
  "coverageGaps": ["Language/Literacy", "Mathematics", "Practical Life", "Sensorial", "Cultural Studies", "Creative Arts"]
}

HARD RULES
- Use ONLY the provided notes. Do not invent events, dates, skills, diagnoses, causes, or next steps.
- Every claim must be supported by one or more notes. If evidence is weak/limited, say so plainly.
- Include dates naturally in the summary (e.g., “On Dec 4…”, “In early November…”).
- Keep it concise: 2–3 paragraphs, 3–5 sentences each. Active voice. Professional internal staff tone (not parent-facing).
- Do NOT prescribe interventions or next steps.

SUMMARY STRUCTURE
Paragraph 1 — Academic / classroom work:
- Lead with the most frequently observed academic/domain areas present in the notes.
- Mention specific Montessori materials/activities when named. Describe trajectory (emerging/consistent/variable) only if repeated evidence exists.

Paragraph 2 — Social-emotional / learning behaviors:
- Focus, independence, work cycle completion, transitions, peer interactions, regulation.
- Describe patterns only if repeated; otherwise describe as “observed once” or “limited data”.

Paragraph 3 (optional) — Cross-cutting themes:
- Only include if a clear theme appears across multiple notes (e.g., repeated persistence, repeated frustration in transitions, repeated preference for certain work types).

COVERAGE GAPS
- Determine which of these domains have ZERO observations in the provided window (based on note content): Language/Literacy, Mathematics, Practical Life, Sensorial, Cultural Studies, Creative Arts.
- Output ONLY the domains expected for the student’s age/stage when that metadata is available; otherwise default to all six domains.
- If coverage is complete, return an empty array [].

RED FLAG LOGIC (set severity + reason)
- Use null severity + null reason if there is no concern AND coverage is adequate.
- HIGH: safety risks (aggression, elopement, dangerous behavior), severe/frequent dysregulation, prolonged refusal to engage, significant regression in previously mastered skills.
- MEDIUM: persistent social conflict/isolation, consistent avoidance of a key academic area, emotional patterns clearly affecting learning, significant foundational gaps that repeatedly block engagement.
- LOW: emerging concerns (inconsistent engagement, mild but repeated peer friction, variable regulation), OR “dog that didn’t bark” (a major expected domain absent across a sufficiently long window with otherwise reasonable coverage).
- If severity is LOW/MEDIUM/HIGH, the reason must be one short sentence that references the pattern and (when possible) time range (e.g., “Across late Nov–Dec…”). If it’s primarily a coverage issue, say that explicitly (“Observation gap…”).

QUALITY CHECK BEFORE YOU OUTPUT
- Ensure output is one JSON object only, and that it is valid.
- Ensure coverageGaps is an array (possibly empty), never null.
- Ensure redFlag.severity is one of: low, medium, high, null.
- Ensure redFlag.reason is null when severity is null.
`;

function isFreshCache(cacheEntry) {
  return cacheEntry?.data && (Date.now() - cacheEntry.ts < BASEBALL_CACHE_TTL_MS);
}

async function getBaseballCardPrompt({ forceRefresh = false } = {}) {
  if (!forceRefresh && isFreshCache(baseballPromptCache)) return baseballPromptCache.data;

  try {
    const snap = await db.collection("ai_prompts").doc(BASEBALL_PROMPT_DOC).get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const out = {
      title: String(data.title || ""),
      description: String(data.description || ""),
      systemPrompt: String(data.systemPrompt || BASEBALL_SYSTEM_PROMPT_FALLBACK),
      version: Number.isFinite(data.version) ? data.version : 1,
    };
    baseballPromptCache = { data: out, ts: Date.now() };
    return out;
  } catch (err) {
    console.warn("[baseballCard] prompt fetch failed, using fallback:", err);
    const out = {
      title: "Baseball Card Summary",
      description: "Coach Pepper’s last 6 weeks summary",
      systemPrompt: BASEBALL_SYSTEM_PROMPT_FALLBACK,
      version: 1,
    };
    baseballPromptCache = { data: out, ts: Date.now() };
    return out;
  }
}

async function getBaseballCardConfigServer({ forceRefresh = false } = {}) {
  if (!forceRefresh && isFreshCache(baseballConfigCache)) return baseballConfigCache.data;
  try {
    const snap = await db.collection("config").doc(BASEBALL_CONFIG_DOC).get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const out = {
      model: data.model || BASEBALL_CARD_DEFAULTS.model,
      temperature: Number.isFinite(data.temperature) ? data.temperature : BASEBALL_CARD_DEFAULTS.temperature,
      windowDays: Number.isFinite(data.windowDays) ? data.windowDays : BASEBALL_CARD_DEFAULTS.windowDays,
      timezone: data.timezone || BASEBALL_CARD_DEFAULTS.timezone,
      max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : BASEBALL_CARD_DEFAULTS.max_tokens,
    };
    baseballConfigCache = { data: out, ts: Date.now() };
    return out;
  } catch (err) {
    console.warn("[baseballCard] config fetch failed, using defaults:", err);
    const out = { ...BASEBALL_CARD_DEFAULTS };
    baseballConfigCache = { data: out, ts: Date.now() };
    return out;
  }
}

const normalizeTimestampValue = (ts) => {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  if (ts instanceof Date) return ts;
  return null;
};

const chooseObservationTimestamp = (obs) => {
  return normalizeTimestampValue(obs?.observedAt) ||
    normalizeTimestampValue(obs?.timestamp) ||
    normalizeTimestampValue(obs?.createdAt) ||
    null;
};

function formatObservationForPrompt(obs) {
  const ts = chooseObservationTimestamp(obs);
  return {
    id: obs.id || "",
    type: obs.type || "",
    text: obs.text || "",
    lessonTitle: obs.lessonTitle || obs.title || "",
    lessonDescription: obs.lessonDescription || obs.description || "",
    groupComment: obs.groupComment || "",
    studentComment: obs.studentComment || "",
    createdByName: obs.createdByName || obs.teacherName || "",
    observedAt: ts ? ts.toISOString() : null,
    ratings: obs.ratings || obs.dimensionRatings || {},
    dimensionOrder: obs.dimensionOrder || [],
    attendanceStatus: obs.attendanceStatus || "",
  };
}

async function fetchStudentNotesForWindow(studentId, windowDays) {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const notesMap = new Map();
  const studentObsRef = db.collection("students").doc(studentId).collection("observations");

  const collect = async (field) => {
    try {
      const snap = await studentObsRef.where(field, ">=", cutoff).get();
      snap.docs.forEach((doc) => {
        notesMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
    } catch (err) {
      console.warn(`[baseballCard] query failed for field ${field} student ${studentId}:`, err);
    }
  };

  await collect("observedAt");
  await collect("createdAt");
  await collect("timestamp");

  const notes = Array.from(notesMap.values()).filter((n) => {
    const ts = chooseObservationTimestamp(n);
    return ts && ts >= cutoff;
  });

  notes.sort((a, b) => {
    const ta = chooseObservationTimestamp(a);
    const tb = chooseObservationTimestamp(b);
    return (tb?.getTime() || 0) - (ta?.getTime() || 0);
  });

  return notes;
}

async function callBaseballCard(notes, config, prompt, windowDays) {
  const renderedSystem = (prompt.systemPrompt || BASEBALL_SYSTEM_PROMPT_FALLBACK).replace("<WINDOW_DAYS>", String(windowDays));
  const userPrompt = `Generate the last ${windowDays}-day summary.\n\nNotes (JSON array):\n${JSON.stringify(notes)}`;

  const body = {
    model: config.model || BASEBALL_CARD_DEFAULTS.model,
    messages: [
      { role: "system", content: renderedSystem },
      { role: "user", content: userPrompt }
    ],
    temperature: Number.isFinite(config.temperature) ? config.temperature : BASEBALL_CARD_DEFAULTS.temperature,
    max_tokens: Number.isFinite(config.max_tokens) ? config.max_tokens : BASEBALL_CARD_DEFAULTS.max_tokens,
    response_format: { type: "json_object" },
  };

  let response;
  try {
    response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("[baseballCard] network error", e);
    throw new functions.https.HttpsError("unavailable", "AI service unavailable");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[baseballCard] OpenAI error", response.status, errText?.slice?.(0, 400));
    throw new functions.https.HttpsError("internal", `AI error: ${response.status}`);
  }

  const json = await response.json();
  const rawContent = json?.choices?.[0]?.message?.content?.trim();
  if (!rawContent) {
    throw new functions.https.HttpsError("internal", "AI returned no content");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch (err) {
    console.error("[baseballCard] JSON parse error", err, rawContent);
    throw new functions.https.HttpsError("internal", "AI returned invalid JSON");
  }

  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  const redFlagRaw = parsed.redFlag || {};
  const redFlag = {
    severity: ["low", "medium", "high"].includes(redFlagRaw?.severity) ? redFlagRaw.severity : null,
    reason: typeof redFlagRaw?.reason === "string" ? redFlagRaw.reason : null,
  };
  const coverageGaps = Array.isArray(parsed.coverageGaps) ? parsed.coverageGaps.filter((c) => typeof c === "string") : [];

  return { summary, redFlag, coverageGaps, rawContent };
}

async function writeBaseballCardDoc(studentId, payload) {
  const ref = db.collection("students").doc(studentId).collection("ai_summaries").doc("baseball_card");
  await ref.set(payload);
}

async function writeSignalsDoc(studentId, payload) {
  const ref = db.collection("students").doc(studentId).collection("ai_summaries").doc("signals");
  await ref.set(payload);
}

async function fetchActiveStudentIds() {
  const studentsSnap = await db.collection("students").where("isActive", "==", true).get();
  return studentsSnap.docs.map((doc) => doc.id);
}

async function runWithConcurrency(items, worker, limit = 10) {
  const queue = [...items];
  const workers = new Array(Math.min(limit, queue.length)).fill(null).map(async () => {
    while (queue.length) {
      const next = queue.shift();
      try {
        await worker(next);
      } catch (err) {
        console.error("[baseballCard] worker error", err);
      }
    }
  });
  await Promise.all(workers);
}

async function runBaseballCards({
  studentIds,
  config,
  prompt,
  windowDays,
  dryRun = false,
  collectResults = false,
  concurrency = 12,
}) {
  const ids = Array.isArray(studentIds) && studentIds.length ? studentIds : await fetchActiveStudentIds();
  if (!dryRun) {
    console.log(`[baseballCard] running for ${ids.length} student(s)`);
  }
  const results = [];
  const effectiveWindowDays = Number.isFinite(windowDays) && windowDays > 0 ? windowDays : config.windowDays;

  await runWithConcurrency(ids, async (studentId) => {
    try {
      const notes = await fetchStudentNotesForWindow(studentId, effectiveWindowDays);

      if (!notes.length) {
        const payload = {
          summary: "",
          redFlag: { severity: null, reason: null },
          coverageGaps: [],
          noteCount: 0,
          windowDays: effectiveWindowDays,
          timezone: config.timezone,
          model: config.model,
          temperature: config.temperature,
          generatedAt: new Date(),
          status: "no_notes",
        };
        if (dryRun && collectResults) {
          results.push({ studentId, status: "no_notes", payload });
        } else if (!dryRun) {
          await writeBaseballCardDoc(studentId, payload);
          await writeSignalsDoc(studentId, {
            redFlag: payload.redFlag,
            coverageGaps: payload.coverageGaps,
            noteCount: payload.noteCount,
            windowDays: payload.windowDays,
            timezone: payload.timezone,
            model: payload.model,
            temperature: payload.temperature,
            generatedAt: payload.generatedAt,
            status: payload.status,
          });
        }
        return;
      }

      const formatted = notes.map(formatObservationForPrompt);
      const aiResult = await callBaseballCard(formatted, config, prompt, effectiveWindowDays);

      const payload = {
        summary: aiResult.summary,
        redFlag: aiResult.redFlag,
        coverageGaps: aiResult.coverageGaps,
        noteCount: formatted.length,
        windowDays: effectiveWindowDays,
        timezone: config.timezone,
        model: config.model,
        temperature: config.temperature,
        generatedAt: new Date(),
        status: "ok",
        sourceNoteIds: formatted.map((n) => n.id).filter(Boolean),
        rawContent: aiResult.rawContent,
      };

      if (dryRun && collectResults) {
        results.push({ studentId, status: "ok", payload });
      } else if (!dryRun) {
        await writeBaseballCardDoc(studentId, payload);
        await writeSignalsDoc(studentId, {
          redFlag: aiResult.redFlag,
          coverageGaps: aiResult.coverageGaps,
          noteCount: payload.noteCount,
          windowDays: payload.windowDays,
          timezone: payload.timezone,
          model: payload.model,
          temperature: payload.temperature,
          generatedAt: payload.generatedAt,
          status: payload.status,
        });
      }
    } catch (err) {
      console.error(`[baseballCard] run failed for student ${studentId}`, err);
      if (dryRun && collectResults) {
        results.push({ studentId, status: "error", error: err?.message || "Unknown error" });
      }
    }
  }, concurrency);

  return results;
}

export const previewBaseballCard = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const requesterSnap = await db.collection("users").doc(context.auth.uid).get();
    const requesterRole = requesterSnap.data()?.role;
    if (!requesterSnap.exists || requesterRole !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Only super admins can preview baseball cards");
    }

    if (!OPENAI_API_KEY) {
      throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
    }

    const studentId = String(data?.studentId || "").trim();
    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    const baseConfig = await getBaseballCardConfigServer({ forceRefresh: !!data?.forceRefresh });
    const basePrompt = await getBaseballCardPrompt({ forceRefresh: !!data?.forceRefresh });

    const windowDaysInput = Number(data?.windowDays);
    const windowDays = Number.isFinite(windowDaysInput) && windowDaysInput > 0
      ? windowDaysInput
      : baseConfig.windowDays;

    const mergedConfig = {
      model: data?.config?.model || baseConfig.model,
      temperature: Number.isFinite(Number(data?.config?.temperature))
        ? Number(data?.config?.temperature)
        : baseConfig.temperature,
      max_tokens: Number.isFinite(Number(data?.config?.max_tokens))
        ? Number(data?.config?.max_tokens)
        : baseConfig.max_tokens,
      timezone: data?.config?.timezone || baseConfig.timezone,
    };

    const systemPrompt = typeof data?.systemPrompt === "string" && data.systemPrompt.trim()
      ? data.systemPrompt
      : (basePrompt.systemPrompt || BASEBALL_SYSTEM_PROMPT_FALLBACK);
    const promptPayload = { ...basePrompt, systemPrompt };

    const results = await runBaseballCards({
      studentIds: [studentId],
      config: mergedConfig,
      prompt: promptPayload,
      windowDays,
      dryRun: true,
      collectResults: true,
      concurrency: 1,
    });

    const result = results?.[0];
    if (!result) {
      throw new functions.https.HttpsError("internal", "No result returned");
    }

    if (result.status === "error") {
      throw new functions.https.HttpsError("internal", result.error || "Failed to generate baseball card preview");
    }

    return {
      status: result.status,
      noteCount: result.payload?.noteCount ?? 0,
      windowDays: result.payload?.windowDays ?? windowDays,
      usedConfig: mergedConfig,
      usedPrompt: promptPayload,
      summary: result.payload?.summary,
      redFlag: result.payload?.redFlag,
      coverageGaps: result.payload?.coverageGaps,
      rawContent: result.payload?.rawContent,
      generatedAt: result.payload?.generatedAt?.toISOString?.() || new Date().toISOString(),
    };
  });

export const regenerateBaseballCardForStudent = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const requesterSnap = await db.collection("users").doc(context.auth.uid).get();
    const requesterRole = requesterSnap.data()?.role;
    if (!requesterSnap.exists || requesterRole !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Only super admins can regenerate baseball cards");
    }

    if (!OPENAI_API_KEY) {
      throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
    }

    const studentId = String(data?.studentId || "").trim();
    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    const baseConfig = await getBaseballCardConfigServer({ forceRefresh: !!data?.forceRefresh });
    const basePrompt = await getBaseballCardPrompt({ forceRefresh: !!data?.forceRefresh });

    const windowDaysInput = Number(data?.windowDays);
    const windowDays = Number.isFinite(windowDaysInput) && windowDaysInput > 0
      ? windowDaysInput
      : baseConfig.windowDays;

    const mergedConfig = {
      model: baseConfig.model,
      temperature: baseConfig.temperature,
      max_tokens: baseConfig.max_tokens,
      timezone: baseConfig.timezone,
    };

    await runBaseballCards({
      studentIds: [studentId],
      config: mergedConfig,
      prompt: basePrompt,
      windowDays,
      dryRun: false,
      collectResults: false,
      concurrency: 1,
    });

    // Regeneration writes directly to Firestore; return a simple ack.
    return {
      status: "ok",
      studentId,
      windowDays,
      regeneratedAt: new Date().toISOString(),
    };
  });

/**
 * Recursively delete a Firestore document and all its subcollections
 * @param {Firestore.DocumentReference} docRef - Document reference to delete
 * @returns {Promise<void>}
 */
async function deleteDocumentRecursively(docRef) {
  const subcollections = await docRef.listCollections();
  
  // Delete all subcollections first
  for (const subcollection of subcollections) {
    const subcollectionDocs = await subcollection.get();
    const deletePromises = subcollectionDocs.docs.map(doc => 
      deleteDocumentRecursively(doc.ref)
    );
    await Promise.all(deletePromises);
  }
  
  // Delete the document itself
  await docRef.delete();
}

export const generateBaseballCards = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .pubsub.schedule("0 0 * * 0")
  .timeZone(BASEBALL_CARD_DEFAULTS.timezone)
  .onRun(async () => {
    if (!OPENAI_API_KEY) {
      console.error("[baseballCard] OpenAI key not configured");
      return null;
    }

    const config = await getBaseballCardConfigServer();
    const prompt = await getBaseballCardPrompt();

    console.log("[baseballCard] generating for active students");

    await runBaseballCards({
      config,
      prompt,
      windowDays: config.windowDays,
      dryRun: false,
      collectResults: false,
      concurrency: 12,
    });

    console.log("[baseballCard] generation run complete");
    return null;
  });

export const cleanupDeletedChats = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("0 0 1 * *")  // First day of every month at midnight
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    console.log("[cleanupDeletedChats] Starting monthly cleanup of deleted chats");
    
    const cutoffDate = Timestamp.fromMillis(
      Date.now() - (31 * 24 * 60 * 60 * 1000)  // 31 days ago
    );
    
    try {
      // Query all chats with deleted=true and deletedAt older than 31 days
      const chatsRef = db.collectionGroup("chats");
      const query = chatsRef
        .where("deleted", "==", true)
        .where("deletedAt", "<=", cutoffDate);
      
      const snapshot = await query.get();
      console.log(`[cleanupDeletedChats] Found ${snapshot.size} chats to delete`);
      
      let deletedCount = 0;
      let errorCount = 0;
      
      // Process deletions in batches to avoid overwhelming Firestore
      const batchSize = 10;
      const docs = snapshot.docs;
      
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = docs.slice(i, i + batchSize);
        const deletePromises = batch.map(async (doc) => {
          try {
            await deleteDocumentRecursively(doc.ref);
            deletedCount++;
            console.log(`[cleanupDeletedChats] Deleted chat ${doc.id} (${deletedCount}/${snapshot.size})`);
          } catch (error) {
            errorCount++;
            console.error(`[cleanupDeletedChats] Error deleting chat ${doc.id}:`, error);
          }
        });
        
        await Promise.all(deletePromises);
      }
      
      console.log(`[cleanupDeletedChats] Cleanup complete. Deleted: ${deletedCount}, Errors: ${errorCount}`);
      return { deletedCount, errorCount, totalFound: snapshot.size };
    } catch (error) {
      console.error("[cleanupDeletedChats] Fatal error during cleanup:", error);
      throw error;
    }
  });

// -----------------------------------------------
// AI: Per-Child Chat (server-side OpenAI invocation with streaming)
// -----------------------------------------------

/**
 * Get chat configuration from Firestore (with fallback to constants)
 * @param {string} programId - Program ID (e.g., 'toddler', 'primary', 'elementary', 'adolescent')
 * @returns {Promise<Object>} Chat configuration object
 */
async function getChatConfigServer(programId) {
  // Default fallback values
  const defaults = {
    model: CHAT_MODEL_INFO.model,
    temperature: CHAT_MODEL_INFO.temperature,
    max_tokens: CHAT_MODEL_INFO.max_tokens,
    chatMessageLimit: DEFAULT_CHAT_MESSAGE_LIMIT,
    observationLimit: DEFAULT_OBSERVATION_LIMIT,
    systemPrompt: CHAT_SYSTEM_PROMPT,
  };

  if (!programId || typeof programId !== "string") {
    console.warn("[childChat] Invalid programId, using defaults");
    return defaults;
  }

  try {
    const docId = `chat_${programId}`;
    const snap = await db.collection("ai_prompts").doc(docId).get();
    
    if (!snap.exists) {
      console.warn(`[childChat] Chat config not found for ${docId}, using defaults`);
      return defaults;
    }

    const data = snap.data() || {};
    
    return {
      model: typeof data.model === "string" ? data.model : defaults.model,
      temperature: Number.isFinite(data.temperature) ? data.temperature : defaults.temperature,
      max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : defaults.max_tokens,
      chatMessageLimit: Number.isFinite(data.chatMessageLimit) ? data.chatMessageLimit : defaults.chatMessageLimit,
      observationLimit: data.observationLimit === "all" ? "all" : (Number.isFinite(data.observationLimit) ? data.observationLimit : defaults.observationLimit),
      systemPrompt: typeof data.systemPrompt === "string" ? data.systemPrompt : defaults.systemPrompt,
    };
  } catch (err) {
    console.error("[childChat] Error fetching chat config:", err);
    return defaults;
  }
}

/**
 * Fetch recent observations for a student (for chat context)
 * @param {string} studentId - Student document ID
 * @param {number|string} limit - Maximum number of observations to fetch, or 'all' for all observations
 * @returns {Promise<Array>} Array of observation documents with all fields
 */
async function fetchRecentObservationsForChat(studentId, limit = DEFAULT_OBSERVATION_LIMIT) {
  if (!studentId || typeof studentId !== "string") {
    throw new Error("Invalid studentId");
  }

  try {
    // Use collectionGroup to query observations across all students
    const observationsRef = db.collectionGroup("observations");
    let query = observationsRef
      .where("studentId", "==", studentId)
      .orderBy("observedAt", "desc");

    // Apply limit only if not 'all'
    if (limit !== "all" && Number.isFinite(limit)) {
      query = query.limit(limit);
    } else {
      // For 'all', use a reasonable max limit to prevent excessive reads
      query = query.limit(1000);
    }

    const snapshot = await query.get();
    const observations = [];
    snapshot.docs.forEach((doc) => {
      observations.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return observations;
  } catch (err) {
    console.error("[childChat] Error fetching observations:", err);
    // Return empty array on error to allow chat to continue
    return [];
  }
}

/**
 * Fetch recent chat messages for a specific chat
 * @param {string} studentId - Student document ID
 * @param {string} chatId - Chat document ID
 * @param {number} limit - Maximum number of messages to fetch (default: 6)
 * @returns {Promise<Array>} Array of message documents { role, content, timestamp }
 */
async function fetchRecentChatMessages(studentId, chatId, limit = DEFAULT_CHAT_MESSAGE_LIMIT) {
  if (!studentId || typeof studentId !== "string") {
    throw new Error("Invalid studentId");
  }
  if (!chatId || typeof chatId !== "string") {
    throw new Error("Invalid chatId");
  }

  try {
    const messagesRef = db
      .collection("students")
      .doc(studentId)
      .collection("chats")
      .doc(chatId)
      .collection("messages");
    const query = messagesRef.orderBy("timestamp", "desc").limit(limit);

    const snapshot = await query.get();
    const messages = [];
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        role: data.role || "user",
        content: data.content || "",
        timestamp: data.timestamp || null,
      });
    });

    // Reverse to get chronological order (oldest first)
    return messages.reverse();
  } catch (err) {
    console.error("[childChat] Error fetching chat messages:", err);
    // Return empty array on error to allow chat to continue
    return [];
  }
}

/**
 * Pack chat context from observations, messages, and new user message
 * Returns structured object that can be passed to LLM or LangChain later
 * @param {string} studentId - Student document ID
 * @param {Array} recentObservations - Array of observation documents
 * @param {Array} recentMessages - Array of chat message documents
 * @param {string} newUserMessage - New message from teacher
 * @param {string} systemPrompt - System prompt from config
 * @returns {Object} Context pack with systemPrompt, observationsBlock, conversationBlock, userMessage
 */
function packChatContext(studentId, recentObservations, recentMessages, newUserMessage, systemPrompt) {
  // Format observations block
  const observationsBlock = recentObservations.length > 0
    ? `Recent Observations (${recentObservations.length} notes):\n${JSON.stringify(recentObservations, null, 2)}`
    : "No recent observations available.";

  // Format conversation block (exclude the new message being sent)
  const conversationBlock = recentMessages.length > 0
    ? recentMessages
        .map((msg) => `${msg.role === "user" ? "Teacher" : "Assistant"}: ${msg.content}`)
        .join("\n\n")
    : "No previous conversation.";

  return {
    systemPrompt: systemPrompt || CHAT_SYSTEM_PROMPT,
    observationsBlock,
    conversationBlock,
    userMessage: newUserMessage,
    studentId,
  };
}

/**
 * Save a chat message to Firestore
 * @param {string} studentId - Student document ID
 * @param {string} chatId - Chat document ID
 * @param {string} role - Message role ('user' or 'assistant')
 * @param {string} content - Message content
 * @param {string} model - Model used for assistant messages (optional)
 * @param {string} authorId - Author user ID (optional, for user messages)
 * @param {string} authorName - Author display name (optional, for user messages)
 * @returns {Promise<string>} Message document ID
 */
async function saveChatMessage(studentId, chatId, role, content, model = null, authorId = null, authorName = null) {
  if (!studentId || typeof studentId !== "string") {
    throw new Error("Invalid studentId");
  }
  if (!chatId || typeof chatId !== "string") {
    throw new Error("Invalid chatId");
  }
  if (!role || (role !== "user" && role !== "assistant")) {
    throw new Error("Invalid role, must be 'user' or 'assistant'");
  }
  if (!content || typeof content !== "string") {
    throw new Error("Invalid content");
  }

  const messagesRef = db
    .collection("students")
    .doc(studentId)
    .collection("chats")
    .doc(chatId)
    .collection("messages");

  const messageData = {
    role,
    content: content.trim(),
    timestamp: Timestamp.now(),
  };

  // Add model field for assistant messages
  if (role === "assistant" && model) {
    messageData.model = model;
  }

  // Add author information for user messages
  if (role === "user" && authorId) {
    messageData.authorId = authorId;
    if (authorName) {
      messageData.authorName = authorName;
    }
  }

  const docRef = await messagesRef.add(messageData);
  return docRef.id;
}

/**
 * Build messages array for OpenAI API from context pack
 * @param {Object} contextPack - Context pack from packChatContext()
 * @returns {Array} Messages array for OpenAI API
 */
function buildOpenAIMessages(contextPack) {
  const messages = [
    { role: "system", content: contextPack.systemPrompt },
  ];

  // Add conversation history (if any)
  if (contextPack.conversationBlock && contextPack.conversationBlock !== "No previous conversation.") {
    // Parse conversation block back into messages
    const conversationLines = contextPack.conversationBlock.split("\n\n");
    for (const line of conversationLines) {
      if (line.startsWith("Teacher: ")) {
        messages.push({ role: "user", content: line.replace("Teacher: ", "") });
      } else if (line.startsWith("Assistant: ")) {
        messages.push({ role: "assistant", content: line.replace("Assistant: ", "") });
      }
    }
  }

  // Add observations context as a user message
  if (contextPack.observationsBlock) {
    messages.push({
      role: "user",
      content: `Here are recent observations for this student:\n\n${contextPack.observationsBlock}\n\n---\n\nNow, please answer the teacher's question about this student.`,
    });
  }

  // Add the new user message
  messages.push({ role: "user", content: contextPack.userMessage });

  return messages;
}

/**
 * Run child chat inference with OpenAI (streaming internally, returns full content)
 * This function is isolated so it can be replaced with LangChain later
 * @param {Object} contextPack - Context pack from packChatContext()
 * @param {string} model - OpenAI model to use
 * @param {number} temperature - Temperature setting
 * @param {number} max_tokens - Max tokens setting
 * @returns {Promise<string>} Full assistant response content
 */
async function runChildChat(contextPack, model, temperature, max_tokens) {
  if (!OPENAI_API_KEY) {
    throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
  }

  const messages = buildOpenAIMessages(contextPack);

  const body = {
    model: model || CHAT_MODEL_INFO.model,
    messages,
    temperature: Number.isFinite(temperature) ? temperature : CHAT_MODEL_INFO.temperature,
    max_tokens: Number.isFinite(max_tokens) ? max_tokens : CHAT_MODEL_INFO.max_tokens,
    stream: true, // Enable streaming
  };

  let response;
  try {
    response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("[childChat] network error", e);
    throw new functions.https.HttpsError("unavailable", "Unable to connect to AI service. Please check your connection.");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[childChat] OpenAI API error", response.status, errText?.slice?.(0, 500));

    // Parse error for user-friendly message
    let errorMessage = "AI service error occurred.";
    try {
      const errorJson = JSON.parse(errText);
      const apiError = errorJson?.error?.message || errorMessage;
      
      // Handle rate limits
      if (response.status === 429 || apiError.includes("rate limit")) {
        errorMessage = "AI service is busy. Please try again in a moment.";
      } else {
        errorMessage = apiError;
      }
    } catch {
      // Not JSON, use generic message
      if (response.status === 429) {
        errorMessage = "AI service is busy. Please try again in a moment.";
      }
    }

    throw new functions.https.HttpsError("internal", errorMessage);
  }

  // Stream and accumulate full content
  let fullContent = "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            return fullContent;
          }

            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
              }
            } catch {
              // Skip invalid JSON lines
            }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
}

/**
 * Stream child chat inference with OpenAI to client via SSE
 * @param {Object} contextPack - Context pack from packChatContext()
 * @param {string} model - OpenAI model to use
 * @param {number} temperature - Temperature setting
 * @param {number} max_tokens - Max tokens setting
 * @param {Function} sendChunk - Function to send chunk to client (SSE format)
 * @returns {Promise<string>} Full assistant response content
 */
async function streamChildChat(contextPack, model, temperature, max_tokens, sendChunk) {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI key not configured");
  }

  const messages = buildOpenAIMessages(contextPack);

  const body = {
    model: model || CHAT_MODEL_INFO.model,
    messages,
    temperature: Number.isFinite(temperature) ? temperature : CHAT_MODEL_INFO.temperature,
    max_tokens: Number.isFinite(max_tokens) ? max_tokens : CHAT_MODEL_INFO.max_tokens,
    stream: true, // Enable streaming
  };

  let response;
  try {
    response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("[childChat] network error", e);
    throw new Error("Unable to connect to AI service. Please check your connection.");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[childChat] OpenAI API error", response.status, errText?.slice?.(0, 500));

    // Parse error for user-friendly message
    let errorMessage = "AI service error occurred.";
    try {
      const errorJson = JSON.parse(errText);
      const apiError = errorJson?.error?.message || errorMessage;
      
      // Handle rate limits
      if (response.status === 429 || apiError.includes("rate limit")) {
        errorMessage = "AI service is busy. Please try again in a moment.";
      } else {
        errorMessage = apiError;
      }
    } catch {
      // Not JSON, use generic message
      if (response.status === 429) {
        errorMessage = "AI service is busy. Please try again in a moment.";
      }
    }

    throw new Error(errorMessage);
  }

  // Stream chunks to client and accumulate full content
  let fullContent = "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            // Send final chunk and return
            sendChunk("", true); // Empty chunk with done flag
            return fullContent;
          }

          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              // #region agent log
              console.log(JSON.stringify({location:"functions/index.js:1847",message:"OpenAI delta received",data:{deltaLength:delta.length,deltaPreview:delta.substring(0,50),fullContentLength:fullContent.length},timestamp:Date.now(),sessionId:"debug-session",runId:"run1",hypothesisId:"H1"}));
              // #endregion
              // Send chunk to client immediately
              sendChunk(delta, false);
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
}

/**
 * Create a new chat document for a student
 * @param {string} studentId - Student document ID
 * @returns {Promise<string>} Chat document ID
 */
async function createChat(studentId) {
  if (!studentId || typeof studentId !== "string") {
    throw new Error("Invalid studentId");
  }

  const chatsRef = db
    .collection("students")
    .doc(studentId)
    .collection("chats");

  const chatData = {
    name: "New Chat",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    lastMessagePreview: "",
    messageCount: 0,
    deleted: false,
  };

  const docRef = await chatsRef.add(chatData);
  return docRef.id;
}

/**
 * Update chat metadata
 * @param {string} studentId - Student document ID
 * @param {string} chatId - Chat document ID
 * @param {Object} updates - Object with fields to update (name, lastMessagePreview, messageCount)
 * @returns {Promise<void>}
 */
async function updateChatMetadata(studentId, chatId, updates) {
  if (!studentId || typeof studentId !== "string") {
    throw new Error("Invalid studentId");
  }
  if (!chatId || typeof chatId !== "string") {
    throw new Error("Invalid chatId");
  }

  const chatRef = db
    .collection("students")
    .doc(studentId)
    .collection("chats")
    .doc(chatId);

  const updateData = {
    updatedAt: Timestamp.now(),
    ...updates,
  };

  await chatRef.update(updateData);
}

/**
 * List all non-deleted chats for a student
 * @param {string} studentId - Student document ID
 * @returns {Promise<Array>} Array of chat documents
 */
async function listChatsForStudent(studentId) {
  if (!studentId || typeof studentId !== "string") {
    throw new Error("Invalid studentId");
  }

  try {
    const chatsRef = db
      .collection("students")
      .doc(studentId)
      .collection("chats");
    
    // Try query with orderBy first (requires composite index)
    // If index doesn't exist, fall back to fetching all and sorting in memory
    let snapshot;
    try {
      const query = chatsRef
        .where("deleted", "==", false)
        .orderBy("createdAt", "desc");
      snapshot = await query.get();
    } catch (indexError) {
      // If query fails (likely missing index), fetch all chats and filter/sort in memory
      console.warn("[listChatsForStudent] Query with orderBy failed, falling back to in-memory sort:", indexError.message);
      const allChatsSnapshot = await chatsRef.get();
      snapshot = allChatsSnapshot;
    }

    const chats = [];
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      // Filter out deleted chats if we're using fallback method
      if (data.deleted === true) {
        return;
      }
      chats.push({
        id: doc.id,
        name: data.name || "New Chat",
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        lastMessagePreview: data.lastMessagePreview || "",
        messageCount: data.messageCount || 0,
      });
    });

    // Sort by createdAt desc if we used fallback method
    if (chats.length > 0 && chats[0].createdAt) {
      chats.sort((a, b) => {
        const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds || 0) * 1000;
        const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds || 0) * 1000;
        return bTime - aTime; // Descending order
      });
    }

    console.log(`[listChatsForStudent] Found ${chats.length} chats for student ${studentId}`);
    return chats;
  } catch (err) {
    console.error("[listChatsForStudent] Error fetching chats:", err);
    // Don't silently fail - throw the error so it can be handled upstream
    throw err;
  }
}


/**
 * Generate a chat name from the first user message using AI
 * @param {string} firstMessage - First user message in the chat
 * @returns {Promise<string>} Generated chat name or "New Chat" as fallback
 */
async function generateChatName(firstMessage) {
  if (!firstMessage || typeof firstMessage !== "string" || firstMessage.trim().length < 3) {
    return "New Chat";
  }

  if (!OPENAI_API_KEY) {
    console.warn("[generateChatName] OpenAI key not configured, using fallback");
    return "New Chat";
  }

  try {
    const prompt = `Generate a concise, descriptive title (maximum 50 characters) for a chat conversation that starts with this message: "${firstMessage.trim()}". Return only the title, nothing else.`;

    const response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 50,
      }),
    });

    if (!response.ok) {
      console.error("[generateChatName] OpenAI API error", response.status);
      return "New Chat";
    }

    const data = await response.json();
    const generatedName = data.choices?.[0]?.message?.content?.trim();

    if (!generatedName || generatedName.length > 100) {
      return "New Chat";
    }

    // Truncate to 100 chars max (though we aim for 50)
    return generatedName.substring(0, 100);
  } catch (err) {
    console.error("[generateChatName] Error generating name:", err);
    return "New Chat";
  }
}

/**
 * Verify authentication token from HTTP request
 * @param {Object} req - Express request object
 * @returns {Promise<Object>} Decoded token and user document
 */
async function verifyAuthToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new functions.https.HttpsError("unauthenticated", "Missing or invalid authorization header");
  }

  const token = authHeader.split("Bearer ")[1];
  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(token);
  } catch {
    throw new functions.https.HttpsError("unauthenticated", "Invalid token");
  }

  const userDoc = await db.collection("users").doc(decodedToken.uid).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "You don't have permission to access this chat.");
  }

  const userRole = userDoc.data()?.role;
  if (userRole !== "superadmin" && userRole !== "classroomadmin") {
    throw new functions.https.HttpsError("permission-denied", "You don't have permission to access this chat.");
  }

  return { decodedToken, userDoc };
}

/**
 * HTTP Cloud Function: Child Chat (Streaming)
 * Handles per-student AI chat with context from observations and chat history
 * Streams response via Server-Sent Events (SSE)
 */
export const childChatStream = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 60, memory: "512MB" })
  .https.onRequest(async (req, res) => {
    // Handle CORS preflight (OPTIONS request)
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Max-Age", "3600");
      res.status(204).send("");
      return;
    }

    // Only allow POST
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Set up SSE headers with CORS
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // Helper function to send SSE chunk
    // SSE format: Each data line must end with \n\n to form a complete SSE message
    // For chunks with newlines, we send multiple data: lines (SSE spec: they're concatenated)
    const sendChunk = (chunk, done = false) => {
      if (done) {
        // #region agent log
        console.log(JSON.stringify({location:"functions/index.js:2116",message:"Sending [DONE] chunk",data:{},timestamp:Date.now(),sessionId:"debug-session",runId:"run1",hypothesisId:"H1"}));
        // #endregion
        res.write("data: [DONE]\n\n");
      } else if (chunk) {
        // Handle newlines: split into multiple data: lines per SSE spec
        // Multiple data: lines in one message are concatenated with \n by the client
        const lines = chunk.split("\n");
        // #region agent log
        console.log(JSON.stringify({location:"functions/index.js:2120",message:"sendChunk called",data:{chunkLength:chunk.length,chunkPreview:chunk.substring(0,50),linesCount:lines.length},timestamp:Date.now(),sessionId:"debug-session",runId:"run1",hypothesisId:"H1"}));
        // #endregion
        for (let i = 0; i < lines.length; i++) {
          res.write(`data: ${lines[i]}\n`);
        }
        res.write("\n"); // End of SSE message (double newline)
        // #region agent log
        console.log(JSON.stringify({location:"functions/index.js:2124",message:"SSE chunk written to response",data:{totalBytesWritten:chunk.length+lines.length*8},timestamp:Date.now(),sessionId:"debug-session",runId:"run1",hypothesisId:"H1"}));
        // #endregion
      }
      // Force immediate send - don't wait for buffer to fill
      // Cloud Functions should handle this, but we ensure chunks are sent immediately
    };

    // Helper function to send error
    const sendError = (error) => {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message || error })}\n\n`);
      res.end();
    };

    try {
      // Verify authentication
      const { decodedToken, userDoc } = await verifyAuthToken(req);

      // Parse request body
      const data = req.body;
      const studentId = String(data?.studentId || "").trim();
      const message = String(data?.message || "").trim();
      let chatId = data?.chatId ? String(data.chatId).trim() : null;
      const devMode = Boolean(data?.devMode);

      if (!studentId) {
        sendError(new Error("studentId is required"));
        return;
      }

      if (!message) {
        sendError(new Error("Please enter a message before sending."));
        return;
      }

      if (!OPENAI_API_KEY) {
        sendError(new Error("OpenAI key not configured"));
        return;
      }

      // Get student's programId via classroom to fetch program-specific config
      const studentDoc = await db.collection("students").doc(studentId).get();
      if (!studentDoc.exists) {
        sendError(new Error("Student not found"));
        return;
      }

      const studentData = studentDoc.data();
      const classroomId = studentData?.classroomId;
      
      if (!classroomId) {
        sendError(new Error("Student has no classroom assigned"));
        return;
      }

      // Get classroom to find programId
      const classroomDoc = await db.collection("classrooms").doc(classroomId).get();
      if (!classroomDoc.exists) {
        sendError(new Error("Student's classroom not found"));
        return;
      }

      const classroomData = classroomDoc.data();
      const programId = classroomData?.programId || "primary";

      // Handle chatId: if not provided, find most recent chat or create new one
      if (!chatId) {
        const existingChats = await listChatsForStudent(studentId);
        if (existingChats.length > 0) {
          chatId = existingChats[0].id;
        } else {
          chatId = await createChat(studentId);
        }
      }

      // Verify chat exists
      const chatDoc = await db
        .collection("students")
        .doc(studentId)
        .collection("chats")
        .doc(chatId)
        .get();
      
      if (!chatDoc.exists) {
        sendError(new Error("Chat not found"));
        return;
      }

      const chatData = chatDoc.data();
      if (chatData?.deleted) {
        sendError(new Error("Chat has been deleted"));
        return;
      }

      // Fetch chat configuration from Firestore
      const chatConfig = await getChatConfigServer(programId);

      // Fetch context (unless dev mode)
      let recentObservations = [];
      let recentMessages = [];
      
      if (!devMode) {
        [recentObservations, recentMessages] = await Promise.all([
          fetchRecentObservationsForChat(studentId, chatConfig.observationLimit),
          fetchRecentChatMessages(studentId, chatId, chatConfig.chatMessageLimit),
        ]);
      }

      // Pack context with config's system prompt
      const contextPack = packChatContext(studentId, recentObservations, recentMessages, message, chatConfig.systemPrompt);

      // Check if this is the first message in the chat
      const isFirstMessage = (chatData.messageCount || 0) === 0;

      // Get author information from user document
      const userData = userDoc.data();
      const authorId = decodedToken.uid;
      const authorName = userData?.displayName || userData?.name || decodedToken.name || null;

      // Save user message with author information
      await saveChatMessage(studentId, chatId, "user", message, null, authorId, authorName);

      // Stream LLM inference to client
      let fullContent = "";
      try {
        fullContent = await streamChildChat(
          contextPack,
          chatConfig.model,
          chatConfig.temperature,
          chatConfig.max_tokens,
          sendChunk // Just pass sendChunk directly - streamChildChat handles accumulation
        );
      } catch (streamErr) {
        sendError(streamErr);
        return;
      }

      if (!fullContent || !fullContent.trim()) {
        sendError(new Error("AI returned no content"));
        return;
      }

      // Save assistant response with model info
      const messageId = await saveChatMessage(studentId, chatId, "assistant", fullContent, chatConfig.model);

      // Update chat metadata
      const lastMessagePreview = fullContent.substring(0, 100);
      const newMessageCount = (chatData.messageCount || 0) + 2;

      // If first message, generate chat name
      let chatName = chatData.name || "New Chat";
      if (isFirstMessage) {
        chatName = await generateChatName(message);
      }

      await updateChatMetadata(studentId, chatId, {
        name: chatName,
        lastMessagePreview,
        messageCount: newMessageCount,
      });

      // Send completion event with metadata
      res.write(`event: complete\ndata: ${JSON.stringify({ chatId, messageId, success: true })}\n\n`);
      res.end();
    } catch (err) {
      console.error("[childChatStream] error", err);
      sendError(err);
    }
  });

/**
 * Callable Cloud Function: Child Chat (Legacy - kept for backward compatibility)
 * Handles per-student AI chat with context from observations and chat history
 * @deprecated Use childChatStream for streaming support
 */
export const childChat = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 60, memory: "512MB" })
  .https.onCall(async (data, context) => {
    // Authentication check
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    // Admin-only check
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError("permission-denied", "You don't have permission to access this chat.");
    }

    const userRole = userDoc.data()?.role;
    if (userRole !== "superadmin" && userRole !== "classroomadmin") {
      throw new functions.https.HttpsError("permission-denied", "You don't have permission to access this chat.");
    }

    // Validate parameters
    const studentId = String(data?.studentId || "").trim();
    const message = String(data?.message || "").trim();
    let chatId = data?.chatId ? String(data.chatId).trim() : null;

    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    if (!message) {
      throw new functions.https.HttpsError("invalid-argument", "Please enter a message before sending.");
    }

    if (!OPENAI_API_KEY) {
      throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
    }

    try {
      // Get student's programId via classroom to fetch program-specific config
      const studentDoc = await db.collection("students").doc(studentId).get();
      if (!studentDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Student not found");
      }

      const studentData = studentDoc.data();
      const classroomId = studentData?.classroomId;
      
      if (!classroomId) {
        throw new functions.https.HttpsError("failed-precondition", "Student has no classroom assigned");
      }

      // Get classroom to find programId
      const classroomDoc = await db.collection("classrooms").doc(classroomId).get();
      if (!classroomDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Student's classroom not found");
      }

      const classroomData = classroomDoc.data();
      const programId = classroomData?.programId || "primary"; // Default to primary if missing

      // Handle chatId: if not provided or forceNewChat is true, create new chat
      const forceNewChat = Boolean(data?.forceNewChat);
      if (!chatId || forceNewChat) {
        // Always create new chat when forceNewChat is true or no chatId provided
        chatId = await createChat(studentId);
      }

      // Verify chat exists
      const chatDoc = await db
        .collection("students")
        .doc(studentId)
        .collection("chats")
        .doc(chatId)
        .get();
      
      if (!chatDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Chat not found");
      }

      const chatData = chatDoc.data();
      if (chatData?.deleted) {
        throw new functions.https.HttpsError("failed-precondition", "Chat has been deleted");
      }

      // Fetch chat configuration from Firestore
      const chatConfig = await getChatConfigServer(programId);

      // Dev mode: skip observation context (temporary feature for UI testing)
      const devMode = Boolean(data?.devMode);
      
      let recentObservations = [];
      let recentMessages = [];
      
      if (!devMode) {
        // Fetch context (current chat only)
        [recentObservations, recentMessages] = await Promise.all([
          fetchRecentObservationsForChat(studentId, chatConfig.observationLimit),
          fetchRecentChatMessages(studentId, chatId, chatConfig.chatMessageLimit),
        ]);
      }
      // In dev mode, keep arrays empty - only system prompt + current message will be used

      // Pack context with config's system prompt
      const contextPack = packChatContext(studentId, recentObservations, recentMessages, message, chatConfig.systemPrompt);

      // Check if this is the first message in the chat
      const isFirstMessage = (chatData.messageCount || 0) === 0;

      // Get author information from user document
      const userData = userDoc.data();
      const authorId = context.auth.uid;
      const authorName = userData?.displayName || userData?.name || context.auth.token?.name || null;

      // Save user message with author information
      await saveChatMessage(studentId, chatId, "user", message, null, authorId, authorName);

      // Run LLM inference (streams internally, returns full content)
      const fullContent = await runChildChat(
        contextPack,
        chatConfig.model,
        chatConfig.temperature,
        chatConfig.max_tokens
      );

      if (!fullContent || !fullContent.trim()) {
        throw new functions.https.HttpsError("internal", "AI returned no content");
      }

      // Save assistant response with model info
      const messageId = await saveChatMessage(studentId, chatId, "assistant", fullContent, chatConfig.model);

      // Update chat metadata
      const lastMessagePreview = fullContent.substring(0, 100);
      const newMessageCount = (chatData.messageCount || 0) + 2; // User message + assistant response

      // If first message, generate chat name
      let chatName = chatData.name || "New Chat";
      if (isFirstMessage) {
        chatName = await generateChatName(message);
      }

      await updateChatMetadata(studentId, chatId, {
        name: chatName,
        lastMessagePreview,
        messageCount: newMessageCount,
      });

      return {
        chatId,
        messageId,
        content: fullContent,
        success: true,
      };
    } catch (err) {
      console.error("[childChat] error", err);

      // Re-throw Firebase errors as-is
      if (err instanceof functions.https.HttpsError) {
        throw err;
      }

      // Handle other errors
      const errorMessage = err?.message || "An unexpected error occurred.";
      throw new functions.https.HttpsError("internal", errorMessage);
    }
  });

