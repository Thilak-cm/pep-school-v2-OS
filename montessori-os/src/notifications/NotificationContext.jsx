import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/*
  Global Notification System
  Operations currently wired:
  - Notes: create, edit, delete (with Undo), reassign
  - Export: student timeline (success / no data / error)
  - Voice Recorder: mic permission/no device errors, auto-stop at 5m, transcription failures
  - Admin: user created (success) and common errors
  - Copy: "Copied to clipboard" (2s)

  Patterns:
  - Use ids to dedupe related banners (e.g., delete-<noteId>, export-<studentId>-<type>)
  - Success 2.5–3s, warnings/errors 3.5–4.5s
  - Undo only for destructive reversible actions (delete)
*/

// Notification shape:
// {
//   key: string,
//   id?: string,
//   message: string,
//   variant: 'success' | 'error' | 'warning' | 'info',
//   duration: number,
//   onFinalize?: () => void,
//   onUndo?: () => void,
//   actionLabel?: string,
//   ariaLive?: 'polite' | 'assertive',
// }

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [items, setItems] = useState([]); // array of notifs (max 4)
  const keyCounter = useRef(0);
  const postUpdateQueue = useRef([]);

  useEffect(() => {
    if (postUpdateQueue.current.length === 0) return;
    const pending = postUpdateQueue.current;
    postUpdateQueue.current = [];
    pending.forEach((fn) => {
      try { fn(); } catch (_) { /* noop */ }
    });
  }, [items]);

  const removeByKey = useCallback((key, { finalize } = { finalize: false }) => {
    setItems((prev) => {
      const target = prev.find((n) => n.key === key);
      if (!target) return prev;
      // Call finalize if requested
      if (finalize && typeof target.onFinalize === 'function') {
        postUpdateQueue.current.push(target.onFinalize);
      }
      return prev.filter((n) => n.key !== key);
    });
  }, []);

  const undoByKey = useCallback((key) => {
    setItems((prev) => {
      const target = prev.find((n) => n.key === key);
      if (!target) return prev;
      if (typeof target.onUndo === 'function') {
        postUpdateQueue.current.push(target.onUndo);
      }
      return prev.filter((n) => n.key !== key);
    });
  }, []);

  const notify = useCallback((message, opts = {}) => {
    const {
      variant = 'info',
      duration = 6000,
      id,
      onFinalize,
      onUndo,
      actionLabel = onUndo ? 'Undo' : undefined,
      ariaLive,
    } = opts;

    setItems((prev) => {
      // If an id matches, update existing and reset duration by replacing the item
      if (id) {
        const existingIndex = prev.findIndex((n) => n.id === id);
        if (existingIndex !== -1) {
          const updated = [...prev];
          const existing = updated[existingIndex];
          updated[existingIndex] = {
            ...existing,
            message,
            variant,
            duration,
            onFinalize,
            onUndo,
            actionLabel: actionLabel,
            ariaLive,
            // bump key to force remount and reset timer
            key: `n_${Date.now()}_${keyCounter.current++}`,
          };
          return updated;
        }
      }

      // Enforce max 4 by dropping oldest (FIFO) and finalizing it
      const next = [...prev];
      if (next.length >= 4) {
        const oldest = next.shift();
        if (oldest && typeof oldest.onFinalize === 'function') {
          postUpdateQueue.current.push(oldest.onFinalize);
        }
      }

      next.push({
        key: `n_${Date.now()}_${keyCounter.current++}`,
        id,
        message,
        variant,
        duration,
        onFinalize,
        onUndo,
        actionLabel,
        ariaLive,
      });
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    items,
    notify,
    removeByKey,
    undoByKey,
  }), [items, notify, removeByKey, undoByKey]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotificationContext must be used within NotificationProvider');
  return ctx;
}
