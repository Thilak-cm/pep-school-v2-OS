// broadcastService.js — Broadcast alert CRUD for admin UI and future agents (PEP-307)
//
// Canonical broadcast doc contract. Any producer (admin composer, Cloud Functions,
// AI agents) should write docs matching this shape to `alerts/{autoId}`.
// The DIP reads `type: 'broadcast'` docs via useAlertBus and maps payload fields
// to display slots via alertTransforms.transformForDisplay().

import {
  collection, addDoc, doc, getDocs, deleteDoc, updateDoc,
  query, where, serverTimestamp,
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
 * @param {string} [fields.ctaLabel]     - CTA button text (default "Mark as read")
 * @param {string} fields.message        - Full message body shown in ack modal
 * @param {string} fields.senderName     - Displayed as labelDetail in DIP
 * @param {string} [fields.audience]     - Audience summary for subtitle fallback
 * @param {number} [fields.priority]     - DIP sort order: 1=Urgent, 2=High, 3=Normal, 4=Low
 * @param {boolean} [fields.dip]         - Show in DIP carousel (default true)
 * @param {Date|import('firebase/firestore').Timestamp} fields.expiresAt - Required expiry
 * @param {string[]} [fields.targetClassrooms] - Classroom IDs (empty = all)
 * @param {string[]} [fields.targetTeachers]   - Teacher UIDs (empty = all)
 * @param {string[]} [fields.targetRoles]      - Roles (empty = all)
 * @param {Date|import('firebase/firestore').Timestamp|null} [fields.startsAt] - Schedule for later (null = immediately)
 * @param {number} [fields.reach]              - Resolved audience count at publish time
 * @returns {Promise<string>} The created doc ID
 */
export async function createBroadcast(fields) {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  if (!fields.expiresAt) throw new Error('expiresAt is required');
  if (!fields.label || !fields.title || !fields.message) {
    throw new Error('label, title, and message are required');
  }

  const kind = fields.broadcastKind || 'ack';

  const alertDoc = {
    type: 'broadcast',
    broadcastKind: kind,
    dip: fields.dip ?? true,
    priority: fields.priority ?? 3,
    source: 'admin:broadcast',
    payload: {
      label: fields.label,
      title: fields.title,
      subtitle: fields.subtitle || fields.audience || 'All staff',
      ctaLabel: fields.ctaLabel || 'Mark as read',
      message: fields.message,
      senderName: fields.senderName,
      audience: fields.audience || 'All staff',
    },
    targetRoles: fields.targetRoles || [],
    targetClassrooms: fields.targetClassrooms || [],
    targetTeachers: fields.targetTeachers || [],
    dismissedBy: {},
    ...(kind === 'poll' && {
      poll: fields.poll,
      responses: {},
    }),
    expiresAt: fields.expiresAt,
    startsAt: fields.startsAt || null,
    reach: fields.reach || 0,
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
 * Update an existing broadcast alert doc.
 * Only updates payload + targeting + display fields — does not touch dismissedBy or createdAt.
 *
 * @param {string} alertId
 * @param {object} fields - Same shape as createBroadcast fields
 * @returns {Promise<void>}
 */
export async function updateBroadcast(alertId, fields) {
  if (!alertId) return;
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');

  const { resetDismissals, ...rest } = fields;
  const kind = rest.broadcastKind || 'ack';

  const updates = {
    broadcastKind: kind,
    dip: rest.dip ?? true,
    priority: rest.priority ?? 3,
    payload: {
      label: rest.label,
      title: rest.title,
      subtitle: rest.subtitle || rest.audience || 'All staff',
      ctaLabel: rest.ctaLabel || 'Mark as read',
      message: rest.message,
      senderName: rest.senderName,
      audience: rest.audience || 'All staff',
    },
    targetRoles: rest.targetRoles || [],
    targetClassrooms: rest.targetClassrooms || [],
    targetTeachers: rest.targetTeachers || [],
    expiresAt: rest.expiresAt,
    ...(rest.startsAt !== undefined && { startsAt: rest.startsAt || null }),
    ...(rest.reach !== undefined && { reach: rest.reach }),
    ...(kind === 'poll' && rest.poll && { poll: rest.poll }),
  };

  if (resetDismissals) {
    updates.dismissedBy = {};
    if (kind === 'poll') updates.responses = {};
  }

  await updateDoc(doc(db, ALERTS_COL, alertId), updates);
}

/**
 * Delete a broadcast alert doc.
 * @param {string} alertId
 */
export async function deleteBroadcast(alertId) {
  if (!alertId) return;
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  await deleteDoc(doc(db, ALERTS_COL, alertId));
}

/**
 * Toggle a broadcast's DIP visibility.
 * @param {string} alertId
 * @param {boolean} dip - true = show in DIP, false = remove from DIP
 */
export async function toggleBroadcastDip(alertId, dip) {
  if (!alertId) return;
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  await updateDoc(doc(db, ALERTS_COL, alertId), { dip });
}
