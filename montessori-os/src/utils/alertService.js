// alertService.js — Alert bus client utilities (PEP-296)

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

  const alertRef = doc(db, 'alerts', alertId);
  await updateDoc(alertRef, {
    [`dismissedBy.${uid}`]: serverTimestamp(),
  });
}
