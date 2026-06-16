import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const CoachmarkContext = createContext(null);

const STORAGE_KEY = 'pep-dismissed-coachmarks';

function readDismissed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeDismissed(map) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch { /* best-effort */ }
}

/**
 * App-level provider for coachmark state — dismissed keys and active tour.
 * Permanent dismissals stored in localStorage (no Firestore dependency).
 */
export function CoachmarkProvider({ children }) {
  const [dismissedCoachmarks, setDismissedCoachmarks] = useState(readDismissed);

  // ── Tour state ──
  const [activeTour, setActiveTour] = useState(null);   // { id, steps: [...] }
  const [currentStep, setCurrentStep] = useState(0);
  const tourRefsRef = useRef({});  // stepKey → ref, registered by Coachmark components

  /** Permanently dismiss a coachmark key (persisted to localStorage). */
  const dismissCoachmark = useCallback((key) => {
    setDismissedCoachmarks((prev) => {
      const next = { ...prev, [key]: Date.now() };
      writeDismissed(next);
      return next;
    });
  }, []);

  /** Check if a coachmark key has been permanently dismissed. */
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
