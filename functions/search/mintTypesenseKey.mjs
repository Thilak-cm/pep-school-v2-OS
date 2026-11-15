// #331 - Callable CF: mint Typesense scoped search-only API key
//
// Scoping per role:
//   - teacher: key filtered to classroomIds where user is in teacherIds
//   - classroomadmin: key filtered to user's manageableClassrooms
//   - superadmin: unscoped key (all classrooms)

import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import { db } from "../shared/firebase.js";
import Typesense from "typesense";

const TYPESENSE_API_KEY = defineSecret("TYPESENSE_API_KEY");
const TYPESENSE_HOST = defineSecret("TYPESENSE_HOST");

const KEY_TTL_SECONDS = 3600; // 1 hour

export const mintTypesenseKey = functions
  .region("asia-south1")
  .runWith({ secrets: [TYPESENSE_API_KEY, TYPESENSE_HOST] })
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
    }

    const uid = context.auth.uid;
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      throw new functions.https.HttpsError("not-found", "User profile not found.");
    }

    const user = userSnap.data();
    const role = user.role || "teacher";

    // Build Typesense filter_by scope based on role
    let filterBy = "";

    if (role === "superadmin") {
      // Unscoped - can search all classrooms
      filterBy = "";
    } else if (role === "classroomadmin") {
      const manageableClassrooms = user.manageableClassrooms || [];
      if (manageableClassrooms.length === 0) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "No manageable classrooms assigned."
        );
      }
      filterBy = `classroomId:[${manageableClassrooms.join(",")}]`;
    } else {
      // Teacher: query classrooms where this user is in teacherIds
      const classroomsSnap = await db
        .collection("classrooms")
        .where("teacherIds", "array-contains", uid)
        .get();
      const classroomIds = classroomsSnap.docs.map((d) => d.id);
      if (classroomIds.length === 0) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Not assigned to any classrooms."
        );
      }
      filterBy = `classroomId:[${classroomIds.join(",")}]`;
    }

    const client = new Typesense.Client({
      nodes: [{ host: TYPESENSE_HOST.value(), port: 443, protocol: "https" }],
      apiKey: TYPESENSE_API_KEY.value(),
    });

    const expiresAt = Date.now() + KEY_TTL_SECONDS * 1000;

    const scopedKey = client.keys().generateScopedSearchKey(
      TYPESENSE_API_KEY.value(),
      {
        filter_by: filterBy,
        expires_at: Math.floor(expiresAt / 1000),
      }
    );

    return { key: scopedKey, expiresAt };
  });
