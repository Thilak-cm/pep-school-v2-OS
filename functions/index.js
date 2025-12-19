import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
// import { getAuth } from "firebase-admin/auth"; // Unused - commented out to fix lint error
// import { getStorage } from "firebase-admin/storage";
// Use v1 compatibility API for region(), https.onCall(), etc.
import * as functions from "firebase-functions/v1";
// import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";
import { COACH_MODEL_INFO } from "./config/coachConstants.js";
import { BASEBALL_CARD_DEFAULTS } from "./config/baseballCardConstants.js";
import { CHAT_MODEL_INFO, DEFAULT_CHAT_MESSAGE_LIMIT, DEFAULT_OBSERVATION_LIMIT, CHAT_SYSTEM_PROMPT } from "./config/chatConstants.js";

initializeApp({ credential: applicationDefault() });

const db = getFirestore();
// const auth = getAuth(); // Unused - commented out to fix lint error
// const storage = getStorage();

// Create transporter using SMTP credentials stored in functions config
const smtpUser = functions.config().smtp?.user; // TODO: update .config everywhere because it will be deprecated soon
const smtpPass = functions.config().smtp?.pass;
const transporter = (smtpUser && smtpPass)
  ? nodemailer.createTransport({
      service: "gmail",
      auth: { user: smtpUser, pass: smtpPass },
    })
  : null;

// Callable function: Atomic user creation with email uniqueness enforcement
export const createUserWithEmailCheck = functions.region("asia-south1").https.onCall(async (data, context) => {
  // Only allow authenticated users to create accounts
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const { email, firstName, lastName, role = "teacher", adminLevel, permissions, selectedClassrooms = [], manageableClassrooms = [] } = data;
  const normalizedRole = role === "classroomadmin" || role === "admin"
    ? "classroomadmin"
    : (role === "superadmin" ? "superadmin" : "teacher");

  const requesterSnap = await db.collection("users").doc(context.auth.uid).get();
  const requesterRole = requesterSnap.data()?.role;
  const requesterIsSuperAdmin = requesterRole === "superadmin";
  const requesterIsClassroomAdmin = requesterRole === "classroomadmin";
  if (!requesterSnap.exists || (!requesterIsSuperAdmin && !requesterIsClassroomAdmin)) {
    throw new functions.https.HttpsError("permission-denied", "Only admins can create users");
  }
  if ((normalizedRole === "classroomadmin" || normalizedRole === "superadmin") && !requesterIsSuperAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Only super admins can create admin accounts");
  }
  
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
        role: normalizedRole,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: context.auth.uid
      };

      // Add role-specific fields
      if (normalizedRole === "classroomadmin") {
        const normalizedManageableClassrooms = Array.from(new Set(
          (Array.isArray(manageableClassrooms) ? manageableClassrooms : [])
            .map((c) => String(c || "").trim())
            .filter(Boolean)
        ));
        if (normalizedManageableClassrooms.length === 0) {
          throw new functions.https.HttpsError("invalid-argument", "Classroom admins must have at least one manageable classroom");
        }
        userData.adminLevel = adminLevel || "regular";
        userData.permissions = permissions || [];
        userData.manageableClassrooms = normalizedManageableClassrooms;
      }

      const userRef = db.collection("users").doc();
      transaction.set(userRef, userData);

      // Assign teacher to classrooms if applicable
      if (normalizedRole === "teacher" && selectedClassrooms.length > 0) {
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
    if (!requesterSnap.exists || (requesterRole !== "admin" && requesterRole !== "superadmin")) {
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
const CLEANUP_MODEL_INFO = { model: "gpt-4o-mini", temperature: 0, max_tokens: 1000 };

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

async function getCoachConfigServer(docId) {
  if (!docId || typeof docId !== "string") {
    throw new Error("Invalid coach docId");
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
  
  return {
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
        config = await getCoachConfigServer(coachDocId);
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

const BASEBALL_SYSTEM_PROMPT_FALLBACK = `You are Coach Pepper, summarizing the last <WINDOW_DAYS> days of notes for ONE student.
You receive an array of notes with various fields in them. Understand them so you can generate a structured summary output.

Rules:
- Output concise JSON only. No markdown. Return exactly one JSON object matching the schema; no extra keys.
- Summaries must be grounded ONLY in provided notes. Never invent details, diagnoses, or events.
- Keep wording clear, teacher-friendly, and brief; prefer active voice.
- Bullets: 3–7 items (depends on content size). Each bullet must include a concrete evidence clause with a date (e.g., “On Nov 18 …”).
- Lesson summary: 1–2 sentence conclusion weaving the recent lessons/overall takeaway (no heading).

Output schema:
{
  "bullets": ["...", "..."],
  "lessonSummary": "..."
}`;

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

  const bullets = Array.isArray(parsed.bullets) ? parsed.bullets : [];
  const lessonSummary = typeof parsed.lessonSummary === "string" ? parsed.lessonSummary : "";

  return { bullets, lessonSummary, rawContent };
}

async function writeBaseballCardDoc(studentId, payload) {
  const ref = db.collection("students").doc(studentId).collection("ai_summaries").doc("baseball_card");
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
          bullets: [],
          lessonSummary: "",
          noteCount: 0,
          windowDays: effectiveWindowDays,
          timezone: config.timezone,
          model: config.model,
          temperature: config.temperature,
          promptVersion: prompt.version || null,
          generatedAt: new Date(),
          status: "no_notes",
        };
        if (dryRun && collectResults) {
          results.push({ studentId, status: "no_notes", payload });
        } else if (!dryRun) {
          await writeBaseballCardDoc(studentId, payload);
        }
        return;
      }

      const formatted = notes.map(formatObservationForPrompt);
      const aiResult = await callBaseballCard(formatted, config, prompt, effectiveWindowDays);

      const payload = {
        bullets: aiResult.bullets,
        lessonSummary: aiResult.lessonSummary,
        noteCount: formatted.length,
        windowDays: effectiveWindowDays,
        timezone: config.timezone,
        model: config.model,
        temperature: config.temperature,
        promptVersion: prompt.version || null,
        generatedAt: new Date(),
        status: "ok",
        sourceNoteIds: formatted.map((n) => n.id).filter(Boolean),
        rawContent: aiResult.rawContent,
      };

      if (dryRun && collectResults) {
        results.push({ studentId, status: "ok", payload });
      } else if (!dryRun) {
        await writeBaseballCardDoc(studentId, payload);
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
      bullets: result.payload?.bullets,
      lessonSummary: result.payload?.lessonSummary,
      rawContent: result.payload?.rawContent,
      generatedAt: result.payload?.generatedAt?.toISOString?.() || new Date().toISOString(),
    };
  });

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
 * Fetch recent chat messages for a student
 * @param {string} studentId - Student document ID
 * @param {number} limit - Maximum number of messages to fetch (default: 6)
 * @returns {Promise<Array>} Array of message documents { role, content, timestamp }
 */
async function fetchRecentChatMessages(studentId, limit = DEFAULT_CHAT_MESSAGE_LIMIT) {
  if (!studentId || typeof studentId !== "string") {
    throw new Error("Invalid studentId");
  }

  try {
    const messagesRef = db
      .collection("students")
      .doc(studentId)
      .collection("chat_messages");
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
 * @param {string} role - Message role ('user' or 'assistant')
 * @param {string} content - Message content
 * @param {string} model - Model used for assistant messages (optional)
 * @returns {Promise<string>} Message document ID
 */
async function saveChatMessage(studentId, role, content, model = null) {
  if (!studentId || typeof studentId !== "string") {
    throw new Error("Invalid studentId");
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
    .collection("chat_messages");

  const messageData = {
    role,
    content: content.trim(),
    timestamp: Timestamp.now(),
  };

  // Add model field for assistant messages
  if (role === "assistant" && model) {
    messageData.model = model;
  }

  const docRef = await messagesRef.add(messageData);
  return docRef.id;
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

  // Build messages array for OpenAI API
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
 * Callable Cloud Function: Child Chat
 * Handles per-student AI chat with context from observations and chat history
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

      // Fetch chat configuration from Firestore
      const chatConfig = await getChatConfigServer(programId);

      // Fetch context
      const [recentObservations, recentMessages] = await Promise.all([
        fetchRecentObservationsForChat(studentId, chatConfig.observationLimit),
        fetchRecentChatMessages(studentId, chatConfig.chatMessageLimit),
      ]);

      // Pack context with config's system prompt
      const contextPack = packChatContext(studentId, recentObservations, recentMessages, message, chatConfig.systemPrompt);

      // Save user message first
      await saveChatMessage(studentId, "user", message);

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
      const messageId = await saveChatMessage(studentId, "assistant", fullContent, chatConfig.model);

      return {
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
