/**
 * Check whether a classroom update requires Drive permission sync.
 * Returns true if teacherIds changed (and driveFolderId exists)
 * or if driveFolderId was just set for the first time.
 */
export function shouldSyncOnClassroomUpdate(before, after) {
  const hasFolder = !!after.driveFolderId;

  // driveFolderId changed (new folder set or replaced) — full reconciliation needed
  if (before.driveFolderId !== after.driveFolderId && hasFolder) return true;

  // No folder on after side — nothing to sync
  if (!hasFolder) return false;

  // programId changed while folder exists — full reconciliation to be safe
  if (before.programId !== after.programId) return true;

  // teacherIds changed while folder exists
  const beforeIds = (before.teacherIds || []).slice().sort().join(",");
  const afterIds = (after.teacherIds || []).slice().sort().join(",");
  return beforeIds !== afterIds;
}

/**
 * Check whether a user update requires Drive permission sync.
 * Returns true if role or manageableClassrooms changed.
 */
export function shouldSyncOnUserUpdate(before, after) {
  if (before.role !== after.role) return true;

  const beforeMC = (before.manageableClassrooms || []).slice().sort().join(",");
  const afterMC = (after.manageableClassrooms || []).slice().sort().join(",");
  return beforeMC !== afterMC;
}

/**
 * Diff two arrays, returning items added and removed.
 * Handles null/undefined as empty arrays.
 */
export function diffArrays(before, after) {
  const beforeSet = new Set(before || []);
  const afterSet = new Set(after || []);

  const added = [...afterSet].filter((x) => !beforeSet.has(x));
  const removed = [...beforeSet].filter((x) => !afterSet.has(x));

  return { added, removed };
}

/**
 * Compute the full set of emails that should have writer access
 * to a classroom's Drive folder.
 *
 * Rules:
 * - Teachers: UID in classroom.teacherIds → include their email
 * - Classroom admins: classroomDoc.id in user.manageableClassrooms → include
 * - Super admins: always included
 *
 * @param {object} classroomDoc - { id, programId, teacherIds, driveFolderId }
 * @param {object[]} allUsers - [{ id, email, role, manageableClassrooms }]
 * @returns {Set<string>} Set of email addresses
 */
export function computeDesiredEmails(classroomDoc, allUsers) {
  const emails = new Set();
  const teacherIdSet = new Set(classroomDoc.teacherIds || []);

  for (const user of allUsers) {
    if (!user.email) continue;

    // Super admins get access to everything
    if (user.role === "superadmin") {
      emails.add(user.email);
      continue;
    }

    // Classroom admins who manage this classroom
    if (
      user.role === "classroomadmin" &&
      Array.isArray(user.manageableClassrooms) &&
      user.manageableClassrooms.includes(classroomDoc.id)
    ) {
      emails.add(user.email);
      continue;
    }

    // Teachers assigned to this classroom
    if (teacherIdSet.has(user.id)) {
      emails.add(user.email);
    }
  }

  return emails;
}

/**
 * Build a bulk sync plan: for each classroom with a driveFolderId,
 * compute the desired set of emails.
 *
 * @param {object[]} classrooms - [{ id, programId, teacherIds, driveFolderId }]
 * @param {object[]} allUsers - [{ id, email, role, manageableClassrooms }]
 * @returns {object[]} [{ classroomId, driveFolderId, desiredEmails }]
 */
export function buildBulkSyncPlan(classrooms, allUsers) {
  return classrooms
    .filter((c) => !!c.driveFolderId)
    .map((c) => ({
      classroomId: c.id,
      driveFolderId: c.driveFolderId,
      desiredEmails: computeDesiredEmails(c, allUsers),
    }));
}

// ---------------------------------------------------------------------------
// Drive API wrappers (require authenticated Drive client)
// ---------------------------------------------------------------------------

/**
 * Grant writer permission on a Drive folder to a user by email.
 * Silently succeeds if the permission already exists.
 */
export async function grantDrivePermission(drive, folderId, email) {
  try {
    await drive.permissions.create({
      fileId: folderId,
      requestBody: {
        type: "user",
        role: "writer",
        emailAddress: email,
      },
      sendNotificationEmail: false,
      supportsAllDrives: true,
      fields: "id",
    });
  } catch (err) {
    // 409 = permission already exists, safe to ignore
    if (err.code === 409) return;
    throw err;
  }
}

/**
 * Revoke a user's permission on a Drive folder by email.
 * Lists current permissions, finds the one matching the email, deletes it.
 * Silently succeeds if no matching permission is found.
 */
export async function revokeDrivePermission(drive, folderId, email) {
  const res = await drive.permissions.list({
    fileId: folderId,
    supportsAllDrives: true,
    fields: "permissions(id,emailAddress)",
  });

  const perm = (res.data.permissions || []).find(
    (p) => p.emailAddress && p.emailAddress.toLowerCase() === email.toLowerCase(),
  );

  if (!perm) return; // No permission to revoke

  await drive.permissions.delete({
    fileId: folderId,
    permissionId: perm.id,
    supportsAllDrives: true,
  });
}

/**
 * Reconcile Drive permissions for a single classroom folder.
 * Computes desired state from Firestore, compares with current Drive
 * permissions, and adds/removes as needed.
 *
 * @param {object} drive - Authenticated Google Drive client
 * @param {object} db - Firestore instance
 * @param {string} classroomId - Classroom document ID
 * @returns {object} { granted: string[], revoked: string[] }
 */
export async function reconcileClassroomPermissions(drive, db, classroomId) {
  const classroomSnap = await db.collection("classrooms").doc(classroomId).get();
  if (!classroomSnap.exists) return { granted: [], revoked: [] };

  const classroomData = { id: classroomId, ...classroomSnap.data() };
  if (!classroomData.driveFolderId) return { granted: [], revoked: [] };

  // Load all users
  const usersSnap = await db.collection("users").get();
  const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const desiredEmails = computeDesiredEmails(classroomData, allUsers);

  // Get current Drive permissions
  const res = await drive.permissions.list({
    fileId: classroomData.driveFolderId,
    supportsAllDrives: true,
    fields: "permissions(id,emailAddress,role)",
  });

  const currentPerms = res.data.permissions || [];
  const currentEmailMap = new Map();
  for (const p of currentPerms) {
    if (p.emailAddress) {
      currentEmailMap.set(p.emailAddress.toLowerCase(), p);
    }
  }

  const granted = [];
  const revoked = [];

  // Grant missing permissions
  for (const email of desiredEmails) {
    if (!currentEmailMap.has(email.toLowerCase())) {
      await grantDrivePermission(drive, classroomData.driveFolderId, email);
      granted.push(email);
    }
  }

  // Revoke excess permissions (skip owner/organizer permissions from service account)
  const desiredEmailsLower = new Set([...desiredEmails].map((e) => e.toLowerCase()));
  for (const [email, perm] of currentEmailMap) {
    if (perm.role === "owner" || perm.role === "organizer") continue;
    if (!desiredEmailsLower.has(email)) {
      await drive.permissions.delete({
        fileId: classroomData.driveFolderId,
        permissionId: perm.id,
        supportsAllDrives: true,
      });
      revoked.push(email);
    }
  }

  return { granted, revoked };
}

/**
 * Handle diff-based permission sync when classroom teacherIds change.
 * More efficient than full reconciliation — only touches changed teachers.
 *
 * @param {object} drive - Authenticated Google Drive client
 * @param {object} db - Firestore instance
 * @param {string} driveFolderId - The classroom's Drive folder ID
 * @param {string[]} addedTeacherIds - Teacher UIDs that were added
 * @param {string[]} removedTeacherIds - Teacher UIDs that were removed
 * @param {string} classroomId - The classroom's document ID (to check admin access)
 */
export async function syncTeacherChanges(drive, db, driveFolderId, addedTeacherIds, removedTeacherIds, classroomId) {
  const results = { granted: [], revoked: [], errors: [] };

  // Grant permissions for added teachers
  for (const uid of addedTeacherIds) {
    try {
      const userSnap = await db.collection("users").doc(uid).get();
      if (!userSnap.exists || !userSnap.data().email) continue;
      await grantDrivePermission(drive, driveFolderId, userSnap.data().email);
      results.granted.push(userSnap.data().email);
    } catch (err) {
      console.warn(`[drive-perms] Failed to grant for ${uid}:`, err.message);
      results.errors.push({ uid, action: "grant", error: err.message });
    }
  }

  // Revoke permissions for removed teachers (skip if user retains access via another role)
  for (const uid of removedTeacherIds) {
    try {
      const userSnap = await db.collection("users").doc(uid).get();
      if (!userSnap.exists || !userSnap.data().email) continue;
      const userData = userSnap.data();

      // Superadmins always retain access
      if (userData.role === "superadmin") continue;

      // Classroomadmins who manage this classroom retain access
      if (
        userData.role === "classroomadmin" &&
        Array.isArray(userData.manageableClassrooms) &&
        userData.manageableClassrooms.includes(classroomId)
      ) continue;

      await revokeDrivePermission(drive, driveFolderId, userData.email);
      results.revoked.push(userData.email);
    } catch (err) {
      console.warn(`[drive-perms] Failed to revoke for ${uid}:`, err.message);
      results.errors.push({ uid, action: "revoke", error: err.message });
    }
  }

  return results;
}

/**
 * Handle permission sync when a user's role or manageableClassrooms change.
 *
 * @param {object} drive - Authenticated Google Drive client
 * @param {object} db - Firestore instance
 * @param {object} beforeData - User doc data before the change
 * @param {object} afterData - User doc data after the change
 * @param {string} uid - The user's document ID (Firestore .data() doesn't include it)
 */
export async function syncUserChanges(drive, db, beforeData, afterData, uid) {
  const email = afterData.email || beforeData.email;
  if (!email) return { granted: [], revoked: [], errors: [] };

  const results = { granted: [], revoked: [], errors: [] };

  // Determine which classrooms the user should now manage
  const afterClassroomIds = getUserManagedClassroomIds(afterData);
  const beforeClassroomIds = getUserManagedClassroomIds(beforeData);

  const { added, removed } = diffArrays(beforeClassroomIds, afterClassroomIds);

  // For superadmins: "all classrooms" means we need to query all classrooms with driveFolderId
  const needsAllClassrooms = afterData.role === "superadmin" || beforeData.role === "superadmin";

  if (needsAllClassrooms) {
    // Full reconciliation for superadmin changes
    const classroomsSnap = await db.collection("classrooms")
      .where("driveFolderId", "!=", null)
      .get();

    for (const doc of classroomsSnap.docs) {
      const folderId = doc.data().driveFolderId;
      if (!folderId) continue;

      try {
        if (afterData.role === "superadmin") {
          await grantDrivePermission(drive, folderId, email);
          results.granted.push(`${email} → ${doc.id}`);
        } else if (beforeData.role === "superadmin") {
          // Demoted from superadmin — check if they still need access via other roles
          const stillNeeded = userNeedsAccessToClassroom(afterData, doc.id, doc.data(), uid);
          if (!stillNeeded) {
            await revokeDrivePermission(drive, folderId, email);
            results.revoked.push(`${email} → ${doc.id}`);
          }
        }
      } catch (err) {
        console.warn(`[drive-perms] Failed for ${doc.id}:`, err.message);
        results.errors.push({ classroomId: doc.id, error: err.message });
      }
    }

    return results;
  }

  // Non-superadmin changes: diff-based on classroomIds
  for (const classroomId of added) {
    try {
      const classSnap = await db.collection("classrooms").doc(classroomId).get();
      if (!classSnap.exists) continue;
      const folderId = classSnap.data().driveFolderId;
      if (!folderId) continue;
      await grantDrivePermission(drive, folderId, email);
      results.granted.push(`${email} → ${classroomId}`);
    } catch (err) {
      console.warn(`[drive-perms] Failed to grant on ${classroomId}:`, err.message);
      results.errors.push({ classroomId, action: "grant", error: err.message });
    }
  }

  for (const classroomId of removed) {
    try {
      const classSnap = await db.collection("classrooms").doc(classroomId).get();
      if (!classSnap.exists) continue;
      const folderId = classSnap.data().driveFolderId;
      if (!folderId) continue;
      await revokeDrivePermission(drive, folderId, email);
      results.revoked.push(`${email} → ${classroomId}`);
    } catch (err) {
      console.warn(`[drive-perms] Failed to revoke on ${classroomId}:`, err.message);
      results.errors.push({ classroomId, action: "revoke", error: err.message });
    }
  }

  return results;
}

/**
 * Get the list of classroom IDs a classroomadmin manages.
 * manageableClassrooms contains classroom IDs (e.g. "allstars", "periwinkle").
 * For teachers, returns [] — their access is via classroom.teacherIds.
 */
function getUserManagedClassroomIds(userData) {
  if (!userData || !userData.role) return [];

  if (userData.role === "classroomadmin") {
    return userData.manageableClassrooms || [];
  }

  // Teachers don't have program IDs on their user doc —
  // access is via classroom.teacherIds, handled by the classroom trigger
  return [];
}

/**
 * Check if a user still needs access to a specific classroom after a role change.
 */
function userNeedsAccessToClassroom(userData, classroomId, classroomData, uid) {
  if (userData.role === "superadmin") return true;

  if (
    userData.role === "classroomadmin" &&
    Array.isArray(userData.manageableClassrooms) &&
    userData.manageableClassrooms.includes(classroomId)
  ) {
    return true;
  }

  // Check if user is a teacher in this classroom (use uid since userData from .data() has no id)
  if (
    uid &&
    Array.isArray(classroomData.teacherIds) &&
    classroomData.teacherIds.includes(uid)
  ) {
    return true;
  }

  return false;
}

/**
 * Revoke all Drive permissions for a deleted user across all classroom folders.
 *
 * @param {object} drive - Authenticated Google Drive client
 * @param {object} db - Firestore instance
 * @param {object} deletedUserData - The deleted user's doc data
 */
export async function revokeAllForUser(drive, db, deletedUserData) {
  const email = deletedUserData.email;
  if (!email) return { revoked: [], errors: [] };

  const results = { revoked: [], errors: [] };

  // Query classrooms with driveFolderId
  const classroomsSnap = await db.collection("classrooms")
    .where("driveFolderId", "!=", null)
    .get();

  for (const doc of classroomsSnap.docs) {
    const folderId = doc.data().driveFolderId;
    if (!folderId) continue;

    try {
      await revokeDrivePermission(drive, folderId, email);
      results.revoked.push(doc.id);
    } catch (err) {
      console.warn(`[drive-perms] Failed to revoke for deleted user on ${doc.id}:`, err.message);
      results.errors.push({ classroomId: doc.id, error: err.message });
    }
  }

  return results;
}
