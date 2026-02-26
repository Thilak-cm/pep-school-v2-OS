// Lightweight Firebase Analytics wrapper with safe guards
// - Initializes only in browser and when supported
// - No-ops when unsupported or disabled

import app from '../firebase';
// Pull the app version from the web app package.json for a stable user property
import { version as APP_VERSION } from '../../package.json';

let _analyticsPromise = null;

async function ensureAnalytics() {
  if (typeof window === 'undefined') return null; // SSR/Node guard
  
  // Disable analytics in development to reduce console noise
  if (import.meta.env.DEV) return null;
  
  if (_analyticsPromise) return _analyticsPromise;

  _analyticsPromise = (async () => {
    try {
      const { isSupported, getAnalytics } = await import('firebase/analytics');
      const supported = await isSupported();
      if (!supported) return null;
      return getAnalytics(app);
    } catch (_e) {
      // Most commonly due to ad/script blockers
      return null;
    }
  })();

  return _analyticsPromise;
}

export async function setAnalyticsUserId(uid) {
  if (!uid) return;
  const analytics = await ensureAnalytics();
  if (!analytics) return;
  const { setUserId } = await import('firebase/analytics');
  setUserId(analytics, uid);
}

export async function trackEvent(name, params = {}) {
  const analytics = await ensureAnalytics();
  if (!analytics) return;
  const { logEvent } = await import('firebase/analytics');
  try {
    logEvent(analytics, name, params);
  } catch (_) {
    // swallow; analytics is best-effort
  }
}

// Small helper to bucketize text length without sending raw text
export function lengthBucket(len) {
  if (len == null || Number.isNaN(len)) return 'unknown';
  if (len < 50) return 's';
  if (len < 200) return 'm';
  if (len < 600) return 'l';
  return 'xl';
}

export async function setUserProperty(key, value) {
  if (!key) return;
  const analytics = await ensureAnalytics();
  if (!analytics) return;
  const { setUserProperties } = await import('firebase/analytics');
  try {
    setUserProperties(analytics, { [key]: value });
  } catch (_) {
    // no-op
  }
}

export async function setUserPropertiesBulk(obj = {}) {
  const analytics = await ensureAnalytics();
  if (!analytics) return;
  const { setUserProperties } = await import('firebase/analytics');
  try {
    setUserProperties(analytics, obj);
  } catch (_) {
    // no-op
  }
}

// Set the app version as a persistent user property for report breakdowns
export async function setAppVersionProperty() {
  await setUserProperty('app_version', APP_VERSION);
}
