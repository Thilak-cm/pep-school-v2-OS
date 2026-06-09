// broadcastService.js — Broadcast alert CRUD for admin UI and future agents (PEP-307)
//
// Canonical broadcast doc contract. Any producer (admin composer, Cloud Functions,
// AI agents) should write docs matching this shape to `alerts/{autoId}`.
// The DIP reads `type: 'broadcast'` docs via useAlertBus and maps payload fields
// to display slots via alertTransforms.transformForDisplay().

import {
  collection, addDoc, doc, getDocs, deleteDoc, updateDoc,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';

const ALERTS_COL = 'alerts';

// ── Priority constants ────────────────────────────────────────────────────────
export const BROADCAST_PRIORITIES = [
  { value: 1, label: 'Urgent' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'Low' },
];

/**
 * Create a broadcast alert doc.
 *
 * @param {object} fields
 * @param {string} fields.label          - DIP top line (e.g., "FROM OFFICE")
 * @param {string} fields.title          - DIP main line
 * @param {string} [fields.subtitle]     - DIP below line (auto-generated if omitted)
 * @param {string} [fields.ctaLabel]     - CTA button text (default "Got it")
 * @param {string} fields.message        - Full message body shown in ack modal
 * @param {string} fields.senderName     - Displayed as labelDetail in DIP
 * @param {string} [fields.audience]     - Audience summary for subtitle fallback
 * @param {number} [fields.priority]     - DIP sort order: 1=Urgent, 2=High, 3=Normal, 4=Low
 * @param {boolean} [fields.dip]         - Show in DIP carousel (default true)
 * @param {Date|import('firebase/firestore').Timestamp} fields.expiresAt - Required expiry
 * @param {string[]} [fields.targetClassrooms] - Classroom IDs (empty = all)
 * @param {string[]} [fields.targetTeachers]   - Teacher UIDs (empty = all)
 * @param {string[]} [fields.targetRoles]      - Roles (empty = all)
 * @returns {Promise<string>} The created doc ID
 */
export async function createBroadcast(fields) {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  if (!fields.expiresAt) throw new Error('expiresAt is required');
  if (!fields.label || !fields.title || !fields.message) {
    throw new Error('label, title, and message are required');
  }

  const alertDoc = {
    type: 'broadcast',
    dip: fields.dip ?? true,
    priority: fields.priority ?? 3,
    source: 'admin:broadcast',
    payload: {
      label: fields.label,
      title: fields.title,
      subtitle: fields.subtitle || fields.audience || 'All staff',
      ctaLabel: fields.ctaLabel || 'Got it',
      message: fields.message,
      senderName: fields.senderName,
      audience: fields.audience || 'All staff',
    },
    targetRoles: fields.targetRoles || [],
    targetClassrooms: fields.targetClassrooms || [],
    targetTeachers: fields.targetTeachers || [],
    dismissedBy: {},
    expiresAt: fields.expiresAt,
    createdAt: serverTimestamp(),
    createdBy: uid,
  };

  const ref = await addDoc(collection(db, ALERTS_COL), alertDoc);
  return ref.id;
}

/**
 * List all broadcast alerts (live + expired), ordered by creation date descending.
 * @returns {Promise<Array<{id: string, [key: string]: any}>>}
 */
export async function listBroadcasts() {
  const q = query(
    collection(db, ALERTS_COL),
    where('type', '==', 'broadcast'),
  );
  const snap = await getDocs(q);
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Sort client-side to avoid requiring a composite index
  docs.sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() || 0;
    const tb = b.createdAt?.toMillis?.() || 0;
    return tb - ta;
  });
  return docs;
}

/**
 * Delete a broadcast alert doc.
 * @param {string} alertId
 */
export async function deleteBroadcast(alertId) {
  if (!alertId) return;
  await deleteDoc(doc(db, ALERTS_COL, alertId));
}

/**
 * Toggle a broadcast's DIP visibility.
 * @param {string} alertId
 * @param {boolean} dip - true = show in DIP, false = remove from DIP
 */
export async function toggleBroadcastDip(alertId, dip) {
  if (!alertId) return;
  await updateDoc(doc(db, ALERTS_COL, alertId), { dip });
}
