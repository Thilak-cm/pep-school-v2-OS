import { useEffect, useRef } from 'react';
import useNotify from './useNotify.js';
import { SAVE_QUEUE_STATUS, subscribeSaveQueue, retrySaveQueueItem } from '../services/saveQueue';

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

export default function SaveQueueNotificationBridge({ onNavigateToReport }) {
  const notify = useNotify();
  const initializedRef = useRef(false);
  const previousStatusByIdRef = useRef(new Map());
  const notifiedGroupKeysRef = useRef(new Set());
  const notifiedFailedIdsRef = useRef(new Set());

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
        // Mark already-failed report_export items as notified on hydration
        (items || []).forEach((item) => {
          if (item.kind === 'report_export' && item.status === SAVE_QUEUE_STATUS.FAILED) {
            notifiedFailedIdsRef.current.add(item.id);
          }
        });
        initializedRef.current = true;
        return;
      }

      // Handle report_export completions separately (with navigation action)
      (items || []).forEach((item) => {
        if (item.kind !== 'report_export') return;
        const prevStatus = previousStatusByIdRef.current.get(item.id);

        // Completion: show success toast with View action
        if (item.status === SAVE_QUEUE_STATUS.COMPLETED && prevStatus !== SAVE_QUEUE_STATUS.COMPLETED) {
          const studentName = item.studentName || 'Student';
          const toastOpts = {
            id: `report-export-${item.id}`,
            duration: 6000,
          };
          if (onNavigateToReport && item.result) {
            toastOpts.actionLabel = 'View';
            toastOpts.onUndo = () => {
              onNavigateToReport({
                studentId: item.studentId,
                studentName,
                docId: item.result.docId,
                driveDocLink: item.result.driveDocLink,
              });
            };
          }
          notify.success(`Report for ${studentName} saved and exported`, toastOpts);
          notifiedGroupKeysRef.current.add(getGroupKey(item));
        }

        // Failure: show error toast with Retry action
        if (item.status === SAVE_QUEUE_STATUS.FAILED && !notifiedFailedIdsRef.current.has(item.id)) {
          notifiedFailedIdsRef.current.add(item.id);
          const studentName = item.studentName || 'Student';
          notify.error(`Failed to export report for ${studentName}`, {
            id: `report-export-fail-${item.id}`,
            duration: 8000,
            actionLabel: 'Retry',
            onUndo: () => {
              notifiedFailedIdsRef.current.delete(item.id);
              retrySaveQueueItem(item.id);
            },
          });
        }
      });

      // Handle non-report_export completions (existing behavior)
      groupMap.forEach((groupItems, key) => {
        if (notifiedGroupKeysRef.current.has(key)) return;
        if (groupItems.length === 0) return;
        // Skip report_export items — handled above
        if (groupItems.some((item) => item.kind === 'report_export')) return;
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

      // Clean up notified failed IDs for items that no longer exist
      const currentIds = new Set((items || []).map((item) => item.id));
      notifiedFailedIdsRef.current.forEach((id) => {
        if (!currentIds.has(id)) notifiedFailedIdsRef.current.delete(id);
      });
    });

    return unsubscribe;
  }, [notify, onNavigateToReport]);

  return null;
}
