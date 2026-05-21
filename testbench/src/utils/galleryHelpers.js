/**
 * PEP-241: Pure helpers for the handwriting image gallery.
 */

/**
 * Extract storage paths from media docs.
 * Each doc has media[0].storagePath — return a flat array of paths.
 */
export function extractStoragePaths(docs) {
  if (!docs) return [];
  return docs
    .map((doc) => doc?.media?.[0]?.storagePath)
    .filter(Boolean);
}

/**
 * Merge media docs with resolved download URLs into gallery items.
 * Only includes docs whose storagePath has a resolved URL in urlMap.
 */
export function buildGalleryItems(docs, urlMap) {
  if (!docs) return [];
  return docs
    .filter((doc) => {
      const path = doc?.media?.[0]?.storagePath;
      return path && urlMap[path];
    })
    .map((doc) => {
      const path = doc.media[0].storagePath;
      return {
        id: doc.id,
        url: urlMap[path],
        storagePath: path,
        observedAt: doc.observedAt?.toDate?.() ?? doc.observedAt ?? null,
        teacherComment: doc.teacherComment ?? null,
        curriculumArea: doc.curriculumArea ?? null,
        createdByName: doc.createdByName ?? null,
      };
    });
}

/**
 * Navigate gallery index by direction (+1 or -1), clamped to bounds.
 */
export function navigateGallery(current, direction, total) {
  if (total <= 0) return 0;
  const next = current + direction;
  return Math.max(0, Math.min(next, total - 1));
}
