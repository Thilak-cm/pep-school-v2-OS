import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

const CoachmarkContext = createContext(null);

/**
 * App-level provider for coachmark state — dismissed keys and active tour.
 *
 * Props:
 *  - uid: current user's Firebase uid (required for Firestore writes)
 *  - initialDismissed: map of coachmarkKey → Timestamp from user doc (loaded on login)
 *  - children
 */
export function CoachmarkProvider({ uid, initialDismissed = {}, children }) {
  const [dismissedCoachmarks, setDismissedCoachmarks] = useState(initialDismissed);

  // ── Tour state ──
  const [activeTour, setActiveTour] = useState(null);   // { id, steps: [...] }
  const [currentStep, setCurrentStep] = useState(0);
  const tourRefsRef = useRef({});  // stepKey → ref, registered by Coachmark components

  /** Persist a single coachmark key as dismissed to Firestore + local state. */
  const dismissCoachmark = useCallback(async (key) => {
    const ts = Timestamp.now();
    setDismissedCoachmarks((prev) => ({ ...prev, [key]: ts }));
    if (uid) {
      try {
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, { [`dismissedCoachmarks.${key}`]: ts });
      } catch (_err) { /* best-effort — local state already updated */ }
    }
  }, [uid]);

  /** Check if a coachmark key has been dismissed. */
  const isDismissed = useCallback((key) => !!dismissedCoachmarks[key], [dismissedCoachmarks]);

  /**
   * Start a guided tour.
   * @param {string} id — unique tour identifier (also used as dismiss key)
   * @param {Array<{ key: string, advanceMode: 'action'|'next' }>} steps
   */
  const startTour = useCallback((id, steps) => {
    if (isDismissed(id)) return;
    setActiveTour({ id, steps });
    setCurrentStep(0);
  }, [isDismissed]);

  /** Advance to the next step, or finish the tour if on the last step. */
  const advanceTour = useCallback(() => {
    if (!activeTour) return;
    const nextStep = currentStep + 1;
    if (nextStep >= activeTour.steps.length) {
      // Tour complete — dismiss and reset
      dismissCoachmark(activeTour.id);
      setActiveTour(null);
      setCurrentStep(0);
    } else {
      setCurrentStep(nextStep);
    }
  }, [activeTour, currentStep, dismissCoachmark]);

  /** Cancel tour without marking dismissed. */
  const cancelTour = useCallback(() => {
    setActiveTour(null);
    setCurrentStep(0);
  }, []);

  /** Register a ref for a tour step (called by Coachmark components). */
  const registerTourRef = useCallback((stepKey, ref) => {
    tourRefsRef.current[stepKey] = ref;
  }, []);

  /** Get the ref for a tour step. */
  const getTourRef = useCallback((stepKey) => tourRefsRef.current[stepKey] || null, []);

  const value = useMemo(() => ({
    dismissedCoachmarks,
    dismissCoachmark,
    isDismissed,
    activeTour,
    currentStep,
    startTour,
    advanceTour,
    cancelTour,
    registerTourRef,
    getTourRef,
  }), [dismissedCoachmarks, dismissCoachmark, isDismissed, activeTour, currentStep, startTour, advanceTour, cancelTour, registerTourRef, getTourRef]);

  return (
    <CoachmarkContext.Provider value={value}>
      {children}
    </CoachmarkContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCoachmarkContext() {
  const ctx = useContext(CoachmarkContext);
  if (!ctx) throw new Error('useCoachmarkContext must be used within <CoachmarkProvider>');
  return ctx;
}
