import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
// import { getStorage } from "firebase-admin/storage";
// Use v1 compatibility API for region(), https.onCall(), etc.
import * as functions from "firebase-functions/v1";
// import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";
import crypto from "node:crypto";

initializeApp({ credential: applicationDefault() });

const db = getFirestore();
const auth = getAuth();
// const storage = getStorage();

// Create transporter using SMTP credentials stored in functions config
const smtpUser = functions.config().smtp?.user;
const smtpPass = functions.config().smtp?.pass;
const transporter = (smtpUser && smtpPass)
  ? nodemailer.createTransport({
      service: "gmail",
      auth: { user: smtpUser, pass: smtpPass },
    })
  : null;

// Note: Removed legacy transcribeVoiceNote storage trigger as STT is no longer used. 

// Callable function: Atomic user creation with email uniqueness enforcement
export const createUserWithEmailCheck = functions.region("asia-south1").https.onCall(async (data, context) => {
  // Only allow authenticated users to create accounts
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const { email, firstName, lastName, role = "teacher", adminLevel, permissions, selectedClassrooms = [] } = data;
  
  if (!email || !firstName || !lastName) {
    throw new functions.https.HttpsError("invalid-argument", "Email, firstName, and lastName are required");
  }

  try {
    // Use a transaction to ensure atomicity
    const result = await db.runTransaction(async (transaction) => {
      // Check if email already exists
      const existingUserSnap = await transaction.get(
        db.collection("users").where("email", "==", email)
      );

      if (!existingUserSnap.empty) {
        throw new functions.https.HttpsError(
          "already-exists", 
          "User with email " + email + " already exists"
        );
      }

      // Create the user document
      const userData = {
        email: email.toLowerCase().trim(),
        displayName: firstName + " " + lastName,
        firstName: firstName,
        lastName: lastName,
        role: role,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: context.auth.uid
      };

      // Add role-specific fields
      if (role === "admin") {
        userData.adminLevel = adminLevel || "regular";
        userData.permissions = permissions || [];
      }

      const userRef = db.collection("users").doc();
      transaction.set(userRef, userData);

      // Assign teacher to classrooms if applicable
      if (role === "teacher" && selectedClassrooms.length > 0) {
        for (const classroomId of selectedClassrooms) {
          try {
            const classroomRef = db.collection("classrooms").doc(classroomId);
            const classroomSnap = await transaction.get(classroomRef);
            
            if (classroomSnap.exists) {
              const currentTeacherIds = classroomSnap.data().teacherIds || [];
              transaction.update(classroomRef, {
                teacherIds: [...currentTeacherIds, userRef.id],
                updatedAt: new Date()
              });
            }
          } catch (error) {
            console.error("Failed to assign teacher to classroom " + classroomId + ":", error);
          }
        }
      }

      return {
        uid: userRef.id,
        ...userData
      };
    });

    console.log("User created successfully: " + result.uid + " (" + email + ")");
    return { success: true, user: result };

  } catch (error) {
    console.error("createUserWithEmailCheck failed:", error);
    
    // Re-throw Firebase Functions errors
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    // Handle other errors
    throw new functions.https.HttpsError(
      "internal", 
      "Failed to create user: " + error.message
    );
  }
});

// Callable: Create Auth user (if needed) and Firestore profile at users/{uid}
// - Enforces @pepschoolv2.com domain
// - If Auth user exists and updateIfExists=false, returns { exists:true, uid, hasDoc, existingRole }
// - If updateIfExists=true, updates displayName/status but DOES NOT change role (prevents role change drama)
// - For teachers, assigns classrooms by adding uid to classrooms/{id}.teacherIds (non-destructive)
export const createAuthUserAndProfile = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const requesterUid = context.auth.uid;
    // Require requester to be an admin
    const requesterSnap = await db.collection("users").doc(requesterUid).get();
    if (!requesterSnap.exists || requesterSnap.data()?.role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Only admins can create users");
    }

    const {
      email,
      firstName,
      lastName,
      role = "teacher", // 'admin' | 'teacher'
      selectedClassrooms = [], // array of classroom IDs for teachers
      updateIfExists = false,
      status = "active",
    } = data || {};

    if (!email || !firstName) {
      throw new functions.https.HttpsError("invalid-argument", "email and firstName are required");
    }

    const emailLc = String(email).trim().toLowerCase();
    if (!emailLc.endsWith("@pepschoolv2.com")) {
      throw new functions.https.HttpsError("failed-precondition", "Email must be @pepschoolv2.com");
    }

    const displayName = `${firstName} ${lastName || ""}`.trim();

    try {
      // 1) Resolve or create Auth user
      let userRecord;
      try {
        userRecord = await auth.getUserByEmail(emailLc);
      } catch (e) {
        if (e?.code === "auth/user-not-found") {
          userRecord = await auth.createUser({
            email: emailLc,
            displayName,
            emailVerified: true,
          });
        } else {
          throw e;
        }
      }

      const uid = userRecord.uid;

      // 2) Read existing Firestore profile (if any)
      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();

      if (userSnap.exists) {
        const existingRole = userSnap.data()?.role;
        if (!updateIfExists) {
          return { exists: true, uid, hasDoc: true, existingRole };
        }

        // Prevent role change: do not modify role if it exists
        const updateData = {
          displayName,
          email: emailLc,
          status: status || userSnap.data()?.status || "active",
          updatedAt: new Date(),
        };
        await userRef.set(updateData, { merge: true });

        // Assign teacher to classrooms (non-destructive)
        if (existingRole === "teacher" && Array.isArray(selectedClassrooms) && selectedClassrooms.length > 0) {
          for (const classroomId of selectedClassrooms) {
            const cRef = db.collection("classrooms").doc(classroomId);
            await db.runTransaction(async (tx) => {
              const cSnap = await tx.get(cRef);
              if (!cSnap.exists) return;
              const teacherIds = Array.isArray(cSnap.data().teacherIds) ? cSnap.data().teacherIds : [];
              if (!teacherIds.includes(uid)) {
                tx.update(cRef, {
                  teacherIds: [...teacherIds, uid],
                  updatedAt: new Date(),
                });
              }
            });
          }
        }

        return { ok: true, uid, updated: true, role: existingRole };
      }

      // 3) Create Firestore profile (doc id = UID)
      const newUserData = {
        displayName,
        email: emailLc,
        role: role === "admin" ? "admin" : "teacher",
        status: status,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: requesterUid,
      };
      await userRef.set(newUserData, { merge: true });

      // 4) Assign teacher classrooms
      if (newUserData.role === "teacher" && Array.isArray(selectedClassrooms) && selectedClassrooms.length > 0) {
        for (const classroomId of selectedClassrooms) {
          const cRef = db.collection("classrooms").doc(classroomId);
          await db.runTransaction(async (tx) => {
            const cSnap = await tx.get(cRef);
            if (!cSnap.exists) return;
            const teacherIds = Array.isArray(cSnap.data().teacherIds) ? cSnap.data().teacherIds : [];
            if (!teacherIds.includes(uid)) {
              tx.update(cRef, {
                teacherIds: [...teacherIds, uid],
                updatedAt: new Date(),
              });
            }
          });
        }
      }

      return { ok: true, uid, created: true, role: newUserData.role };
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
    if (!requesterSnap.exists || requesterSnap.data()?.role !== "admin") {
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

    console.log("User updated successfully: " + uid);
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

export const notifyAdminsOnUnauthorized = functions.region("asia-south1").firestore
  .document("access_logs/{logId}")
  .onCreate(async (snap) => {
    const logData = snap.data();

    try {
      // Fetch all admin users
      const adminSnap = await db.collection("users").where("type", "==", "admin").get();
      const adminEmails = adminSnap.docs.map((d) => d.data().email).filter(Boolean);

      if (!transporter || adminEmails.length === 0) {
        console.warn("Email transporter not configured or no admin emails found");
        return;
      }

      const mailOptions = {
        from: smtpUser,
        to: adminEmails.join(","),
        subject: "Unauthorized Access Attempt Detected",
        text: "An unauthorized user attempted to access the Montessori Observation Hub.\n\n" +
              "Email: " + logData.email + "\n" +
              "Display Name: " + logData.displayName + "\n" +
              "Reason: " + logData.reason + "\n" +
              "Timestamp: " + new Date(logData.timestamp._seconds * 1000).toLocaleString() + "\n\n" +
              "User Agent: " + logData.userAgent,
      };

      await transporter.sendMail(mailOptions);
      console.log("Unauthorized access email sent to admins");
    } catch (err) {
      console.error("Failed to send unauthorized access email", err);
    }
  }); 

// Callable: log unauthorized access from client (bypasses Firestore rules)
export const logUnauthorizedAccess = functions.region("asia-south1").https.onCall(async (data, context) => {
  const payload = {
    email: data?.email || context.auth?.token?.email || null,
    displayName: data?.displayName || context.auth?.token?.name || null,
    photoURL: data?.photoURL || null,
    reason: data?.reason || "unknown",
    timestamp: new Date().toISOString(),
    userAgent: data?.userAgent || "",
  };

  try {
    const ref = await db.collection("access_logs").add(payload);
    return { ok: true, id: ref.id };
  } catch (err) {
    console.error("logUnauthorizedAccess failed", err);
    throw new functions.https.HttpsError("internal", "Failed to log unauthorized access");
  }
});

// Callable function: user clicks Request Access -> we record and notify
export const requestAccess = functions.region("asia-south1").https.onCall(async (data, context) => {
  const requesterUid = context.auth?.uid || null;
  const requesterEmail = context.auth?.token?.email || data?.email || null;
  const requesterName = context.auth?.token?.name || data?.name || null;
  const note = "";

  const record = {
    email: requesterEmail,
    displayName: requesterName,
    uid: requesterUid,
    note,
    userAgent: data?.userAgent || "",
    createdAt: new Date().toISOString(),
  };

  try {
    const docRef = await db.collection("access_requests").add(record);

    // Email admins if possible
    try {
      const adminSnap = await db.collection("users").where("type", "==", "admin").get();
      const adminEmails = adminSnap.docs.map((d) => d.data().email).filter(Boolean);
      if (transporter && adminEmails.length > 0) {
        await transporter.sendMail({
          from: smtpUser,
          to: adminEmails.join(","),
          subject: "Access Request Submitted",
          text: "A user submitted an access request.\n\nEmail: " + requesterEmail + "\nName: " + requesterName + "\nUID: " + requesterUid + "\nWhen: " + record.createdAt,
        });
      }
    } catch (mailErr) {
      console.warn("requestAccess: could not email admins", mailErr);
    }

    return { ok: true, id: docRef.id };
  } catch (err) {
    console.error("requestAccess failed", err);
    throw new functions.https.HttpsError("internal", "Failed to submit access request");
  }
});

// -----------------------------------------------
// AI: Text Cleanup (server-side OpenAI invocation)
// -----------------------------------------------
const OPENAI_API_KEY = functions.config().openai?.key || process.env.OPENAI_API_KEY || null;
const CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const CLEANUP_MODEL_INFO = { model: "gpt-4o-mini", temperature: 0.2, max_tokens: 600 };

// In-memory TTL cache for prompts to reduce Firestore reads
const PROMPT_TTL_MS = 5 * 60 * 1000; // 5 minutes
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
    return { text, languageCode };
  });

// -----------------------------------------------
// Coach Review (AI nudges) — callable
// -----------------------------------------------
const COACH_MODEL_INFO = { model: "gpt-4o-mini", temperature: 0.2, max_tokens: 600 };
const COACH_TTL_MS = 3 * 60 * 1000; // 3 minutes cache
const coachCache = new Map(); // key -> { ts, data }

function coachCacheKey(text, ctx) {
  const base = `${text}\n|${ctx?.classroomId || ""}|${ctx?.programId || ""}`;
  return crypto.createHash("sha256").update(base).digest("hex");
}

function coachSystemPrompt() {
  return [
    "You are a Montessori teacher coach that proposes up to 2 nudges to improve",
    "a Montessori observation note. Do not rewrite the teacher's text. Only suggest:",
    "- Duration, Modality, Independence, Evidence, or Subjective (objective one-liner).",
    "",
    "Rules:",
    "- Output strict JSON with top-level {\"nudges\": [...]} with at most 2 items.",
    "- Allowed ids: duration | modality | independence | evidence | subjective.",
    "- Chips by id:",
    "  duration: [\"<5m\",\"5–10m\",\"10–20m\",\"20m+\"]",
    "  modality: [\"Material\",\"Pen & paper\",\"Mental\"]",
    "  independence: [\"Independent\",\"Peer pair\",\"Small group\",\"Teacher-guided\"]",
    "  evidence: [\"# attempts\",\"# correct\",\"Add quote\"]",
    "  subjective: []",
    "- microcopy_key values: about_how_long | how_was_this_done | add_tiny_evidence | objective_line_invite",
    "- Do not infer a duration; only suggest if missing.",
    "- Prefer high precision. If unsure, return an empty array.",
    "",
    "Example (one-shot):",
    "INPUT:",
    "{\"note_text\":\"STUDENT_A used number rods today.\",\"context\":{\"classroomId\":\"allstars\",\"programId\":\"adolescent\"}}",
    "OUTPUT:",
    "{\"nudges\":[",
    "  {\"id\":\"duration\",\"reason\":\"Activity noted without a time range.\",\"confidence\":0.86,\"microcopy_key\":\"about_how_long\",\"chips\":[\"<5m\",\"5–10m\",\"10–20m\",\"20m+\"],\"append_line\":\"Duration: 10–20 min\",\"metadata\":{\"duration_range\":\"10–20m\"}},",
    "  {\"id\":\"modality\",\"reason\":\"Math work without modality context.\",\"confidence\":0.62,\"microcopy_key\":\"how_was_this_done\",\"chips\":[\"Material\",\"Pen & paper\",\"Mental\"],\"append_line\":\"Modality: Material\",\"metadata\":{\"modality\":\"Material\"}}",
    "]}",
    "",
    "Return only JSON. No extra text."
  ].join("\n");
}

function coachUserPrompt(payload) {
  return [
    "INPUT:",
    JSON.stringify(payload)
  ].join("\n");
}

export const aiCoachReview = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 60, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    if (!OPENAI_API_KEY) throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");

    const note_text = typeof data?.note_text === "string" ? data.note_text : "";
    const ctx = (data && data.context && typeof data.context === "object") ? data.context : {};
    const classroomId = typeof ctx.classroomId === "string" ? ctx.classroomId : null;
    const programId = typeof ctx.programId === "string" ? ctx.programId : null;
    if (!note_text.trim()) return { nudges: [], status: "ok", latency_ms: 0 };

    // Cache
    const key = coachCacheKey(note_text, { classroomId, programId });
    const cached = coachCache.get(key);
    if (cached && (Date.now() - cached.ts < COACH_TTL_MS)) {
      return { ...cached.data, status: "ok", cache: true };
    }

    const payload = { note_text, context: { classroomId, programId } };
    const messages = [
      { role: "system", content: coachSystemPrompt() },
      { role: "user", content: coachUserPrompt(payload) },
    ];

    const body = {
      model: COACH_MODEL_INFO.model,
      temperature: COACH_MODEL_INFO.temperature,
      max_tokens: COACH_MODEL_INFO.max_tokens,
      messages,
    };

    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 9000); // ~9s budget
    const t0 = Date.now();
    let response;
    try {
      response = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(to);
      if (e?.name === "AbortError") return { nudges: [], status: "timeout", latency_ms: Date.now() - t0 };
      console.error("[aiCoachReview] network error", e);
      return { nudges: [], status: "error", reason: "net", latency_ms: Date.now() - t0 };
    }
    clearTimeout(to);

    const latency_ms = Date.now() - t0;
    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      console.error("[aiCoachReview] OpenAI error", response.status, txt?.slice?.(0, 200));
      return { nudges: [], status: "error", reason: "ai", latency_ms };
    }

    let content;
    try {
      const json = await response.json();
      content = json?.choices?.[0]?.message?.content || "";
    } catch {
      return { nudges: [], status: "error", reason: "parse_ai", latency_ms };
    }
    
    try {
      const parsed = JSON.parse(content);
      const out = { nudges: Array.isArray(parsed?.nudges) ? parsed.nudges : [] };
      coachCache.set(key, { ts: Date.now(), data: out });
      return { ...out, status: "ok", latency_ms, promptVersion: 1 };
    } catch {
      return { nudges: [], status: "error", reason: "parse_json", latency_ms };
    }    
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
