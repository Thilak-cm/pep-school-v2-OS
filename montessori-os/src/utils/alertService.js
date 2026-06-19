// alertService.js — Alert bus client utilities (PEP-296, PEP-323a)

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

/**
 * Dismiss an alert for the current user.
 * Adds uid → serverTimestamp to the dismissedBy map field.
 * The alert remains visible to other users.
 */
export async function dismissAlert(alertId) {
  const uid = auth?.currentUser?.uid;
  if (!uid || !alertId) return;

  try {
    const alertRef = doc(db, 'alerts', alertId);
    await updateDoc(alertRef, {
      [`dismissedBy.${uid}`]: serverTimestamp(),
    });
  } catch {
    // Silently degrade — alert stays visible, which is safe
  }
}

/**
 * Vote on a poll broadcast and dismiss it atomically.
 * Writes responses.{uid} (vote data) and dismissedBy.{uid} (ack) in a single updateDoc.
 * One-shot: Firestore rules reject writes if responses.{uid} already exists.
 *
 * @param {string} alertId
 * @param {string[]} choices - Selected option IDs
 * @param {string} [text] - Free-text "Other" response (optional)
 */
export async function voteOnBroadcast(alertId, choices, text) {
  const uid = auth?.currentUser?.uid;
  if (!uid || !alertId) return false;

  try {
    const alertRef = doc(db, 'alerts', alertId);
    await updateDoc(alertRef, {
      [`responses.${uid}`]: {
        choices,
        ...(text && { text }),
        ts: serverTimestamp(),
      },
      [`dismissedBy.${uid}`]: serverTimestamp(),
    });
    return true;
  } catch {
    // Silently degrade — alert stays visible, which is safe
    return false;
  }
}
