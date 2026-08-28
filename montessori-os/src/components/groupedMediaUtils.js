const normalizeMediaKind = (kind, contentType = '') => {
  const rawKind = String(kind || '').toLowerCase();
  if (rawKind === 'photo' || rawKind === 'video' || rawKind === 'pdf') return rawKind;
  const rawType = String(contentType || '').toLowerCase();
  if (rawType.startsWith('image/')) return 'photo';
  if (rawType.startsWith('video/')) return 'video';
  if (rawType === 'application/pdf') return 'pdf';
  return 'file';
};

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export function buildMediaItemsForObservation(observation) {
  if (!observation || observation.type !== 'media') return [];
  const entries = Array.isArray(observation.media) && observation.media.length > 0
    ? observation.media
    : [{}];
  const observedAt = observation.observedAt || observation.timestamp;
  const observedAtMs = toMillis(observedAt);
  return entries.map((entry, index) => ({
    id: `${observation.id}-${index}`,
    mediaDocId: observation.id,
    mediaIndex: index,
    storagePath: entry?.storagePath || null,
    mediaKind: normalizeMediaKind(observation.mediaKind, entry?.contentType),
    status: observation.status || 'ready',
    observedAt,
    timestamp: observation.timestamp,
    observedAtMs,
    teacherComment: observation.teacherComment || '',
    sourceObservation: observation,
  }));
}

export function groupMediaObservations(observations = []) {
  const output = [];
  const batches = new Map();

  observations.forEach((observation) => {
    if (observation?.type !== 'media') {
      output.push(observation);
      return;
    }

    const mediaItems = buildMediaItemsForObservation(observation);
    const mediaKind = mediaItems[0]?.mediaKind || normalizeMediaKind(observation.mediaKind);
    // PDFs are deliberately never grouped with other media notes.
    if (!observation.batchId || mediaKind === 'pdf') {
      output.push({ ...observation, mediaItems, mediaCount: mediaItems.length });
      return;
    }

    if (!batches.has(observation.batchId)) {
      batches.set(observation.batchId, {
        ...observation,
        id: `batch-${observation.batchId}`,
        mediaItems: [],
        mediaCount: 0,
      });
    }
    const batch = batches.get(observation.batchId);
    batch.mediaItems.push(...mediaItems);
    batch.mediaCount += mediaItems.length;
  });

  batches.forEach((batch) => {
    batch.mediaItems.sort((a, b) => b.observedAtMs - a.observedAtMs || a.mediaIndex - b.mediaIndex);
    if (batch.mediaItems.length === 1) {
      output.push({ ...batch.mediaItems[0].sourceObservation, mediaItems: batch.mediaItems, mediaCount: 1 });
    } else {
      output.push(batch);
    }
  });

  return output.sort((a, b) => toMillis(b.observedAt || b.timestamp) - toMillis(a.observedAt || a.timestamp));
}
