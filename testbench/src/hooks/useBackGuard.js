/**
 * #136: Back-navigation guard for workbenches with unsaved work.
 *
 * Registers a guard via the backGuardRef pattern from App.jsx.
 * When the user clicks the AppBar back arrow with unsaved work,
 * the guard fires and sets `blocked` to true so the workbench
 * can show a confirmation dialog.
 */
import { useState, useEffect, useRef } from "react";

export default function useBackGuard(registerBackGuard, onBack, hasUnsaved) {
  const [blocked, setBlocked] = useState(false);

  const guardRef = useRef(null);
  guardRef.current = () => {
    if (hasUnsaved) {
      setBlocked(true);
    } else {
      onBack?.();
    }
  };

  useEffect(() => {
    registerBackGuard?.(() => guardRef.current());
    return () => registerBackGuard?.(null);
  }, [registerBackGuard]);

  function confirmLeave() {
    setBlocked(false);
    onBack?.();
  }

  function cancelLeave() {
    setBlocked(false);
  }

  return { blocked, confirmLeave, cancelLeave };
}
