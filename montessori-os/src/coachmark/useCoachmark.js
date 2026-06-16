import { useCallback } from 'react';
import { useCoachmarkContext } from './CoachmarkProvider';

/**
 * Convenience hook for standalone (non-tour) coachmarks.
 *
 * @param {string} key — the coachmarkKey to check/dismiss
 * @returns {{ isDismissed: boolean, dismiss: () => void }}
 */
export default function useCoachmark(key) {
  const { isDismissed: checkDismissed, dismissCoachmark } = useCoachmarkContext();

  const isDismissed = checkDismissed(key);
  const dismiss = useCallback(() => dismissCoachmark(key), [dismissCoachmark, key]);

  return { isDismissed, dismiss };
}
