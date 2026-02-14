import { useEffect, useRef } from 'react';
import useNotify from './useNotify.js';
import { SAVE_QUEUE_STATUS, subscribeSaveQueue } from '../services/saveQueue';

const getGroupKey = (item) => item.groupId || item.id;

const getCompletionMessage = (items) => {
  if (!Array.isArray(items) || items.length === 0) return 'Note saved.';
  const kinds = new Set(items.map((item) => item.kind));
  if (kinds.size === 1) {
    const onlyKind = Array.from(kinds)[0];
    if (onlyKind === 'media') return 'Media note saved.';
    if (onlyKind === 'lesson') return 'Lesson note saved.';
  }
  return 'Note saved.';
};

export default function SaveQueueNotificationBridge() {
  const notify = useNotify();
  const initializedRef = useRef(false);
  const previousStatusByIdRef = useRef(new Map());
  const notifiedGroupKeysRef = useRef(new Set());

  useEffect(() => {
    const unsubscribe = subscribeSaveQueue((items) => {
      const groupMap = new Map();
      (items || []).forEach((item) => {
        const key = getGroupKey(item);
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key).push(item);
      });

      if (!initializedRef.current) {
        previousStatusByIdRef.current = new Map(
          (items || []).map((item) => [item.id, item.status])
        );
        groupMap.forEach((groupItems, key) => {
          if (groupItems.length > 0 && groupItems.every((item) => item.status === SAVE_QUEUE_STATUS.COMPLETED)) {
            notifiedGroupKeysRef.current.add(key);
          }
        });
        initializedRef.current = true;
        return;
      }

      groupMap.forEach((groupItems, key) => {
        if (notifiedGroupKeysRef.current.has(key)) return;
        if (groupItems.length === 0) return;
        const allCompleted = groupItems.every((item) => item.status === SAVE_QUEUE_STATUS.COMPLETED);
        if (!allCompleted) return;
        const transitionedToCompleted = groupItems.some(
          (item) => previousStatusByIdRef.current.get(item.id) !== SAVE_QUEUE_STATUS.COMPLETED
        );
        if (!transitionedToCompleted) return;

        notifiedGroupKeysRef.current.add(key);
        notify.success(getCompletionMessage(groupItems), { duration: 2500 });
      });

      previousStatusByIdRef.current = new Map(
        (items || []).map((item) => [item.id, item.status])
      );

      const currentKeys = new Set(groupMap.keys());
      notifiedGroupKeysRef.current.forEach((key) => {
        if (!currentKeys.has(key)) {
          notifiedGroupKeysRef.current.delete(key);
        }
      });
    });

    return unsubscribe;
  }, [notify]);

  return null;
}
