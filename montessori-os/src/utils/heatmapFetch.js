/**
 * Shared heatmap cache fetch logic (PEP-303).
 *
 * Used by both useHeatmapCache (NotificationsPage) and useAlertBus (DIP).
 * Centralised here so the role-aware query logic stays in one place.
 *
 * NOTE: The superadmin path queries `where('classroomId', '!=', null)` which
 * also returns non-heatmap statsCache docs (e.g. classroom_* from recomputeStats).
 * The client-side prefix filter handles this. If statsCache grows significantly,
 * consider adding a `type` discriminator field to heatmap docs.
 */

import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Fetch heatmap cache docs from statsCache based on role and accessible classrooms.
 *
 * @param {Object} params
 * @param {string} params.role - 'superadmin' | 'classroomadmin' | 'teacher'
 * @param {string[]} params.accessibleClassrooms - classroom IDs the user can access
 * @returns {Promise<Array<{id: string, [key: string]: any}>>} heatmap docs
 */
export async function fetchHeatmapDocs({ role, accessibleClassrooms }) {
  const statsCacheRef = collection(db, 'statsCache');
  const docs = [];

  if (role === 'superadmin') {
    const snap = await getDocs(
      query(statsCacheRef, where('classroomId', '!=', null))
    );
    for (const d of snap.docs) {
      if (d.id.startsWith('heatmap_') && d.id !== 'heatmap_meta') {
        docs.push({ id: d.id, ...d.data() });
      }
    }
  } else {
    const ids = (accessibleClassrooms || []).filter(Boolean);
    if (ids.length === 0) return docs;
    // Batch in groups of 10 (documentId() 'in' query limit)
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      const docIds = batch.map((id) => `heatmap_${id}`);
      const snap = await getDocs(
        query(statsCacheRef, where(documentId(), 'in', docIds))
      );
      snap.docs.forEach((d) => docs.push({ id: d.id, ...d.data() }));
    }
  }

  return docs;
}
