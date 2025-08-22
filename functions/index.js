import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
// import { getStorage } from "firebase-admin/storage";
import * as functions from "firebase-functions";
// import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";

initializeApp({ credential: applicationDefault() });

const db = getFirestore();
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