export function planMissingMediaUrlPaths(
  paths,
  { mediaUrls = {}, inFlightPaths = new Set() } = {},
) {
  const planned = [];
  const seen = new Set();

  (paths || []).forEach((path) => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    if (mediaUrls[path]) return;
    if (inFlightPaths.has(path)) return;
    planned.push(path);
  });

  return planned;
}

export async function fetchMediaUrlsWithConcurrency(
  paths,
  fetchUrl,
  { concurrency = 6, onError, onSuccess } = {},
) {
  const safePaths = Array.isArray(paths) ? paths.filter(Boolean) : [];
  if (safePaths.length === 0) return {};
  if (typeof fetchUrl !== 'function') {
    throw new TypeError('fetchUrl must be a function');
  }

  const limit = Number.isFinite(concurrency)
    ? Math.max(1, Math.floor(concurrency))
    : 6;

  const updates = {};
  let cursor = 0;

  // Simple worker pool to cap parallel async fetches.
  const worker = async () => {
    while (cursor < safePaths.length) {
      const index = cursor;
      cursor += 1;
      const path = safePaths[index];

      try {
        const url = await fetchUrl(path);
        if (url) {
          updates[path] = url;
          if (typeof onSuccess === 'function') {
            onSuccess({ path, url });
          }
        }
      } catch (error) {
        if (typeof onError === 'function') {
          onError({ path, error });
        }
      }
    }
  };

  const workerCount = Math.min(limit, safePaths.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return updates;
}
