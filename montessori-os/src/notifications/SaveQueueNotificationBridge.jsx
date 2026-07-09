import { useEffect, useRef } from 'react';
import useNotify from './useNotify.js';
import { SAVE_QUEUE_STATUS, subscribeSaveQueue, retrySaveQueueItem } from '../services/saveQueue';

const getGroupKey = (item) => item.groupId || item.id;

export default function SaveQueueNotificationBridge({ onNavigateToReport }) {
  const notify = useNotify();
  const initializedRef = useRef(false);
  const previousStatusByIdRef = useRef(new Map());
  const notifiedGroupKeysRef = useRef(new Set());
  const notifiedFailedIdsRef = useRef(new Set());

  useEffect(() => {
    const unsubscribe = subscribeSaveQueue((items) => {
      if (!initializedRef.current) {
        previousStatusByIdRef.current = new Map(
          (items || []).map((item) => [item.id, item.status])
        );
        // Mark already-failed report_export items as notified on hydration
        (items || []).forEach((item) => {
          if (item.kind === 'report_export' && item.status === SAVE_QUEUE_STATUS.FAILED) {
            notifiedFailedIdsRef.current.add(item.id);
          }
        });
        // Mark already-completed items as notified on hydration
        (items || []).forEach((item) => {
          if (item.status === SAVE_QUEUE_STATUS.COMPLETED) {
            notifiedGroupKeysRef.current.add(getGroupKey(item));
          }
        });
        initializedRef.current = true;
        return;
      }

      // Handle report_export completions (with navigation action)
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

      previousStatusByIdRef.current = new Map(
        (items || []).map((item) => [item.id, item.status])
      );

      // Clean up notified group keys for items that no longer exist
      const currentKeys = new Set((items || []).map((item) => getGroupKey(item)));
      notifiedGroupKeysRef.current.forEach((key) => {
        if (!currentKeys.has(key)) notifiedGroupKeysRef.current.delete(key);
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
