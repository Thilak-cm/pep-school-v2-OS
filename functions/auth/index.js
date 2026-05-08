import * as functions from "firebase-functions/v1";
import { db, sanitizeEmailForDocId } from "../shared/firebase.js";

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
        // Handle role promotion (e.g. teacher → classroomadmin)
        if (normalizedRole !== existingData.role) {
          if (normalizedRole === "classroomadmin") {
            if (!isSuperAdmin) {
              throw new functions.https.HttpsError("permission-denied", "Only super admins can promote users to classroom admin");
            }
            if (normalizedManageableClassrooms.length === 0) {
              throw new functions.https.HttpsError("invalid-argument", "Classroom admins must manage at least one classroom");
            }
            updateData.role = normalizedRole;
            updateData.manageableClassrooms = normalizedManageableClassrooms;
          } else if (normalizedRole === "superadmin") {
            if (!isSuperAdmin) {
              throw new functions.https.HttpsError("permission-denied", "Only super admins can promote users to super admin");
            }
            updateData.role = normalizedRole;
          } else if (normalizedRole === "teacher") {
            if (!isSuperAdmin) {
              throw new functions.https.HttpsError("permission-denied", "Only super admins can change user roles");
            }
            updateData.role = normalizedRole;
          }
        } else if (existingData.role === "classroomadmin" && hasManageableClassroomsInput) {
          // Editing existing classroom admin's manageable classrooms (no role change)
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

        return { ok: true, uid: isMigrated ? existingDocId : null, updated: true, role: updateData.role || existingData.role };
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

  // Authorization: only admins can update user profiles
  const requesterUid = context.auth.uid;
  const requesterSnap = await db.collection("users").doc(requesterUid).get();
  const requesterRole = requesterSnap.data()?.role;
  const isSuperAdmin = requesterRole === "superadmin";
  const isClassroomAdmin = requesterRole === "classroomadmin";
  if (!requesterSnap.exists || (!isSuperAdmin && !isClassroomAdmin)) {
    throw new functions.https.HttpsError("permission-denied", "Only admins can update users");
  }

  const { uid, email, displayName, additionalData = {} } = data;

  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "User UID is required");
  }

  // Block privilege-sensitive fields in additionalData
  const forbiddenFields = ["role", "manageableClassrooms", "branchIds"];
  for (const field of forbiddenFields) {
    if (field in additionalData) {
      if (!isSuperAdmin) {
        throw new functions.https.HttpsError("permission-denied", `Only super admins can modify '${field}'`);
      }
    }
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
