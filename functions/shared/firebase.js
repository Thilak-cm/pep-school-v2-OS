import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldPath } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

initializeApp({ credential: applicationDefault() });

const db = getFirestore();
const auth = getAuth();
const storage = getStorage();

function sanitizeEmailForDocId(email) {
  return email.toLowerCase().replace(/[^a-z0-9]/g, "_");
}

export { db, auth, storage, Timestamp, FieldPath, sanitizeEmailForDocId };
