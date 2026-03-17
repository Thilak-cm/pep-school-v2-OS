import {
  arrayUnion,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { deleteObject, ref, uploadBytesResumable } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, cloudFunctions } from '../firebase';
import { buildMediaDocData } from '../utils/mediaDocBuilder';

const STORAGE_KEY = 'pep_save_queue_v1';
const STORAGE_VERSION = 1;
const COMPLETED_RETENTION_MS = 2 * 60 * 60 * 1000;
const FAILED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const NETWORK_BACKOFF_BASE_MS = 1200;
const NETWORK_BACKOFF_CAP_MS = 12000;
const DEFAULT_MAX_ATTEMPTS = 5;
const MEDIA_MAX_ATTEMPTS = 6;
const MEDIA_DOC_PROPAGATION_WAIT_MS = 350;
const REPORT_EXPORT_MAX_ATTEMPTS = 3;

export const SAVE_QUEUE_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

const RETRYABLE_UPLOAD_ERROR_CODES = new Set([
  'storage/retry-limit-exceeded',
  'storage/network-request-failed',
  'storage/canceled',
  'storage/unknown',
  'storage/unauthorized',
]);

const state = {
  items: [],
  processing: false,
  initialized: false,
  retryTimer: null,
};

const listeners = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const now = () => Date.now();

const sanitizeError = (error) => ({
  code: String(error?.code || '').trim() || null,
  message: String(error?.message || error || 'Unknown error').trim(),
});

const getCode = (error) => String(error?.code || '').toLowerCase();

const isProbablyNetworkError = (error) => {
  const code = getCode(error);
  const message = String(error?.message || '').toLowerCase();
  if (!code && !message) return false;
  return (
    code.includes('network') ||
    code.includes('unavailable') ||
    code.includes('deadline-exceeded') ||
    code.includes('resource-exhausted') ||
    code.includes('aborted') ||
    code.includes('timeout') ||
    code.includes('failed-precondition') ||
    message.includes('network') ||
    message.includes('offline') ||
    message.includes('timeout')
  );
};

const shouldRetryUpload = (error, attemptIndex, maxAttempts) => {
  if (attemptIndex >= maxAttempts - 1) return false;
  return RETRYABLE_UPLOAD_ERROR_CODES.has(getCode(error));
};

const shouldAutoRetryQueueItem = (item, error) => {
  if (!isProbablyNetworkError(error)) return false;
  if (item.kind === 'media') return false;
  return item.attempts < item.maxAttempts;
};

const pruneItems = (items) => {
  const current = now();
  return items.filter((item) => {
    if (item.status === SAVE_QUEUE_STATUS.COMPLETED) {
      return current - item.updatedAt <= COMPLETED_RETENTION_MS;
    }
    if (item.status === SAVE_QUEUE_STATUS.FAILED) {
      return current - item.updatedAt <= FAILED_RETENTION_MS;
    }
    return true;
  });
};

const serializeItem = (item) => {
  if (!item.persistent) return null;
  return {
    ...item,
    payload: item.payload,
  };
};

const persist = () => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const serializableItems = pruneItems(state.items)
      .map(serializeItem)
      .filter(Boolean);
    const payload = {
      version: STORAGE_VERSION,
      items: serializableItems,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // no-op: queue still works in-memory
  }
};

const emit = () => {
  const snapshot = getSaveQueueSnapshot();
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // no-op
    }
  });
};

const commitState = () => {
  state.items = pruneItems(state.items);
  persist();
  emit();
};

const hydrate = () => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.items)) return;
    state.items = parsed.items.map((item) => ({
      ...item,
      status:
        item.status === SAVE_QUEUE_STATUS.PROCESSING
          ? SAVE_QUEUE_STATUS.PENDING
          : item.status,
      updatedAt: now(),
    }));
  } catch {
    state.items = [];
  }
};

const ensureOnlineListener = () => {
  if (typeof window === 'undefined') return;
  if (ensureOnlineListener.attached) return;
  window.addEventListener('online', () => {
    processQueue();
  });
  ensureOnlineListener.attached = true;
};

const clearRetryTimer = () => {
  if (state.retryTimer) {
    clearTimeout(state.retryTimer);
    state.retryTimer = null;
  }
};

const scheduleRetryTimer = () => {
  clearRetryTimer();
  const pendingFuture = state.items
    .filter((item) => item.status === SAVE_QUEUE_STATUS.PENDING && Number.isFinite(item.nextAttemptAt))
    .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)[0];
  if (!pendingFuture) return;
  const delay = Math.max(0, pendingFuture.nextAttemptAt - now());
  state.retryTimer = setTimeout(() => {
    state.retryTimer = null;
    processQueue();
  }, delay);
};

const updateItem = (itemId, updater) => {
  const index = state.items.findIndex((item) => item.id === itemId);
  if (index === -1) return null;
  const current = state.items[index];
  const next = updater(current);
  if (!next) return null;
  state.items[index] = {
    ...next,
    updatedAt: now(),
  };
  return state.items[index];
};

const getNextRunnableItem = () => {
  const current = now();
  return state.items.find((item) => {
    if (item.status !== SAVE_QUEUE_STATUS.PENDING) return false;
    if (item.nextAttemptAt && item.nextAttemptAt > current) return false;
    return true;
  });
};

const deriveObservationPayload = async (payload, item) => {
  const studentId = payload.studentId || item.studentId;
  if (!studentId) throw new Error('Missing student id');

  let classroomId = payload.classroomId;
  if (!classroomId) {
    const studentSnap = await getDoc(doc(db, 'students', studentId));
    if (!studentSnap.exists()) throw new Error('Student record not found. Please refresh and retry.');
    classroomId = studentSnap.data()?.classroomId || 'unknown';
  }

  const noteType = payload.noteType || 'voice';
  const observationId = payload.observationId || `obs_${item.id}`;
  const observationRef = doc(db, 'students', studentId, 'observations', observationId);
  const observationData = {
    studentId,
    classroomId,
    type: noteType,
    text: payload.text || '',
    observedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: payload.createdBy || 'unknown',
    createdByName: payload.createdByName || 'Unknown Teacher',
    createdByEmail: payload.createdByEmail || 'unknown@email.com',
    ...(payload.groupId ? { groupId: payload.groupId } : {}),
    ...(Array.isArray(payload.linkedLessonObservationId) && payload.linkedLessonObservationId.length > 0
      ? { linkedLessonObservationId: payload.linkedLessonObservationId }
      : {}),
  };

  if (typeof payload.durationSec === 'number') {
    observationData.durationSec = payload.durationSec;
  }
  if (typeof payload.sttConfidence === 'number') {
    observationData.sttConfidence = payload.sttConfidence;
  }
  if (payload.detectedLanguage != null && payload.detectedLanguage !== '') {
    observationData.detectedLanguage = payload.detectedLanguage;
  }
  if (payload.coach && typeof payload.coach === 'object') {
    observationData.coach = payload.coach;
  }

  const cleaned = Object.fromEntries(
    Object.entries(observationData).filter(([, value]) => value !== undefined)
  );
  await deleteDoc(observationRef).catch(() => {});
  await setDoc(observationRef, cleaned);

  const backlinkIds = Array.isArray(payload.lessonBacklinkIds) ? payload.lessonBacklinkIds : [];
  if (backlinkIds.length > 0) {
    await Promise.allSettled(
      backlinkIds.map(async (lessonId) => {
        if (!lessonId) return;
        const lessonRef = doc(db, 'students', studentId, 'observations', lessonId);
        await updateDoc(lessonRef, {
          linkedObservations: arrayUnion(observationId),
        });
      })
    );
  }

  return { observationId, studentId };
};

const deriveLessonPayload = async (payload, item) => {
  const studentId = payload.studentId || item.studentId;
  if (!studentId) throw new Error('Missing student id');
  if (!payload.classroomId) throw new Error('Missing classroom id for lesson save.');

  const observationId = payload.observationId || `lesson_${item.id}`;
  const observationRef = doc(db, 'students', studentId, 'observations', observationId);
  const lessonData = {
    studentId,
    classroomId: payload.classroomId,
    type: 'lesson',
    lessonTitle: payload.lessonTitle || '',
    lessonDescription: payload.lessonDescription || null,
    groupComment: payload.groupComment || null,
    programId: payload.programId || null,
    dimensionOrder: payload.dimensionOrder || [],
    ...(payload.groupDefaults ? { groupDefaults: payload.groupDefaults } : {}),
    ratings: payload.ratings || {},
    studentComment: payload.studentComment || null,
    attendanceStatus: payload.attendanceStatus || 'present',
    lessonMode: payload.lessonMode || 'individual',
    ...(payload.groupId ? { groupId: payload.groupId } : {}),
    createdBy: payload.createdBy || 'unknown',
    createdByName: payload.createdByName || 'Unknown Teacher',
    createdByEmail: payload.createdByEmail || 'unknown@email.com',
    observedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const cleaned = Object.fromEntries(
    Object.entries(lessonData).filter(([, value]) => value !== undefined && value !== null)
  );
  await deleteDoc(observationRef).catch(() => {});
  await setDoc(observationRef, cleaned);
  return { observationId, studentId };
};

const uploadMediaFile = (storagePath, source, mediaId, studentId) => {
  const storageRef = ref(storage, storagePath);
  const payload = source.blob || source.file;
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, payload, {
      contentType: source.contentType,
      customMetadata: {
        mediaId,
        studentId,
      },
    });
    task.on(
      'state_changed',
      () => {},
      async (error) => {
        await deleteObject(storageRef).catch(() => {});
        reject(error);
      },
      () => {
        resolve();
      }
    );
  });
};

const uploadMediaFileWithRetry = async (storagePath, source, mediaId, studentId) => {
  let lastError = null;
  for (let attempt = 0; attempt < MEDIA_MAX_ATTEMPTS; attempt += 1) {
    try {
      await uploadMediaFile(storagePath, source, mediaId, studentId);
      return;
    } catch (error) {
      lastError = error;
      if (!shouldRetryUpload(error, attempt, MEDIA_MAX_ATTEMPTS)) break;
      const baseDelayMs = Math.min(3500, 450 * (2 ** attempt));
      const jitterMs = Math.floor(Math.random() * 150);
      await sleep(baseDelayMs + jitterMs);
    }
  }
  throw lastError;
};

const deriveMediaPayload = async (payload, item) => {
  const studentId = payload.studentId || item.studentId;
  if (!studentId) throw new Error('Missing student id');
  if (!payload.source || !(payload.source.file || payload.source.blob)) {
    throw new Error('Media source is missing. Please re-select the file and retry.');
  }

  let classroomId = payload.classroomId;
  if (!classroomId) {
    const studentSnap = await getDoc(doc(db, 'students', studentId));
    if (!studentSnap.exists()) throw new Error('Student record not found. Please refresh and retry.');
    classroomId = studentSnap.data()?.classroomId;
    if (!classroomId) {
      throw new Error('Student is missing classroom assignment. Please ask an admin to update the student profile.');
    }
  }

  const mediaId = payload.mediaId || `media_${item.id}`;
  const mediaRef = doc(db, 'students', studentId, 'media', mediaId);
  const storagePath = `students/${studentId}/media/${mediaId}/original.${payload.source.extension}`;

  await deleteDoc(mediaRef).catch(() => {});
  await deleteObject(ref(storage, storagePath)).catch(() => {});

  const docData = {
    ...buildMediaDocData({ ...payload, studentId, classroomId }, mediaId, storagePath),
    observedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(mediaRef, docData);
  await sleep(MEDIA_DOC_PROPAGATION_WAIT_MS);

  try {
    await uploadMediaFileWithRetry(storagePath, payload.source, mediaId, studentId);
    return { mediaId, storagePath, studentId };
  } catch (error) {
    await updateDoc(mediaRef, {
      status: 'failed',
      errorCode: String(error?.code || 'upload_failed').toLowerCase(),
      errorMessage: String(error?.message || 'Upload failed'),
      updatedAt: serverTimestamp(),
    }).catch(async () => {
      await deleteDoc(mediaRef).catch(() => {});
    });
    throw error;
  }
};

const deriveReportExportPayload = async (payload) => {
  const call = httpsCallable(cloudFunctions, 'exportReportToDrive', { timeout: 120_000 });
  const result = await call({
    studentId: payload.studentId,
    reportPayload: payload.reportPayload,
  });
  return { docId: result.data.docId, driveDocLink: result.data.driveDocLink };
};

const runItem = async (item) => {
  if (item.kind === 'text_voice') return deriveObservationPayload(item.payload, item);
  if (item.kind === 'lesson') return deriveLessonPayload(item.payload, item);
  if (item.kind === 'media') return deriveMediaPayload(item.payload, item);
  if (item.kind === 'report_export') return deriveReportExportPayload(item.payload);
  throw new Error(`Unsupported queue item type: ${item.kind}`);
};

const processQueue = async () => {
  if (state.processing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    scheduleRetryTimer();
    return;
  }

  const nextItem = getNextRunnableItem();
  if (!nextItem) {
    scheduleRetryTimer();
    return;
  }

  state.processing = true;
  updateItem(nextItem.id, (item) => ({
    ...item,
    status: SAVE_QUEUE_STATUS.PROCESSING,
    attempts: item.attempts + 1,
    nextAttemptAt: null,
    lastError: null,
  }));
  commitState();

  try {
    const result = await runItem(nextItem);
    updateItem(nextItem.id, (item) => ({
      ...item,
      status: SAVE_QUEUE_STATUS.COMPLETED,
      result: result || null,
      lastError: null,
    }));
    commitState();
  } catch (error) {
    const retryable = shouldAutoRetryQueueItem(nextItem, error);
    if (retryable) {
      updateItem(nextItem.id, (item) => {
        const backoff = Math.min(
          NETWORK_BACKOFF_CAP_MS,
          NETWORK_BACKOFF_BASE_MS * (2 ** Math.max(0, item.attempts - 1))
        );
        return {
          ...item,
          status: SAVE_QUEUE_STATUS.PENDING,
          nextAttemptAt: now() + backoff,
          lastError: sanitizeError(error),
        };
      });
    } else {
      updateItem(nextItem.id, (item) => ({
        ...item,
        status: SAVE_QUEUE_STATUS.FAILED,
        nextAttemptAt: null,
        lastError: sanitizeError(error),
      }));
    }
    commitState();
  } finally {
    state.processing = false;
    setTimeout(() => {
      processQueue();
    }, 0);
  }
};

const ensureInitialized = () => {
  if (state.initialized) return;
  hydrate();
  state.initialized = true;
  ensureOnlineListener();
  commitState();
  processQueue();
};

const buildQueueItem = (entry) => {
  const createdAt = now();
  return {
    id: entry.id || `sq_${Math.random().toString(36).slice(2, 10)}_${createdAt.toString(36)}`,
    groupId: entry.groupId || null,
    kind: entry.kind,
    studentId: entry.studentId,
    studentName: entry.studentName || '',
    title: entry.title || '',
    summary: entry.summary || '',
    status: SAVE_QUEUE_STATUS.PENDING,
    attempts: 0,
    maxAttempts: Number.isFinite(entry.maxAttempts) ? entry.maxAttempts : DEFAULT_MAX_ATTEMPTS,
    nextAttemptAt: null,
    lastError: null,
    payload: entry.payload || {},
    persistent: entry.persistent !== false,
    createdAt,
    updatedAt: createdAt,
    result: null,
  };
};

export const getSaveQueueSnapshot = () => state.items.map((item) => ({ ...item }));

export const subscribeSaveQueue = (listener) => {
  ensureInitialized();
  listeners.add(listener);
  try {
    listener(getSaveQueueSnapshot());
  } catch {
    // no-op
  }
  return () => {
    listeners.delete(listener);
  };
};

export const enqueueSaveQueueItems = (entries = []) => {
  ensureInitialized();
  const normalized = entries
    .filter((entry) => entry && entry.kind && entry.studentId)
    .map(buildQueueItem);
  if (normalized.length === 0) return [];
  state.items = [...state.items, ...normalized];
  commitState();
  processQueue();
  return normalized.map((item) => item.id);
};

export const retrySaveQueueItem = (itemId) => {
  ensureInitialized();
  const item = updateItem(itemId, (current) => {
    if (!current) return current;
    return {
      ...current,
      status: SAVE_QUEUE_STATUS.PENDING,
      nextAttemptAt: null,
      lastError: null,
      attempts: 0,
      result: null,
    };
  });
  if (!item) return false;
  commitState();
  processQueue();
  return true;
};

export const retryAllFailedForStudent = (studentId) => {
  ensureInitialized();
  if (!studentId) return 0;
  let retried = 0;
  state.items = state.items.map((item) => {
    if (item.studentId !== studentId || item.status !== SAVE_QUEUE_STATUS.FAILED) return item;
    retried += 1;
    return {
      ...item,
      status: SAVE_QUEUE_STATUS.PENDING,
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      result: null,
      updatedAt: now(),
    };
  });
  if (retried > 0) {
    commitState();
    processQueue();
  }
  return retried;
};

export const clearCompletedForStudent = (studentId) => {
  ensureInitialized();
  const before = state.items.length;
  state.items = state.items.filter((item) => {
    if (item.studentId !== studentId) return true;
    return item.status !== SAVE_QUEUE_STATUS.COMPLETED;
  });
  if (state.items.length !== before) {
    commitState();
  }
};

export { REPORT_EXPORT_MAX_ATTEMPTS };

export const initSaveQueue = () => {
  ensureInitialized();
};
