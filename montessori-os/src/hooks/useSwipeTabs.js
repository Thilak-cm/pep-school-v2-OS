import { useCallback, useRef, useState, useEffect } from 'react';

/**
 * Hook for detecting left/right swipe gestures for tab navigation with visual feedback
 * @param {Object} options - Configuration options
 * @param {Function} options.onSwipeLeft - Callback when swiping left (next tab)
 * @param {Function} options.onSwipeRight - Callback when swiping right (previous tab)
 * @param {number} options.thresholdRatio - Minimum swipe distance as ratio of container width (default: 0.25)
 * @param {number} options.minVelocity - Minimum swipe velocity in px/ms (default: 0.3)
 * @param {number} options.maxVerticalSwipe - Maximum vertical movement to consider horizontal swipe (default: 100)
 * @returns {Object} - Bind handlers, state, and swipe delta
 */
export default function useSwipeTabs({
  onSwipeLeft,
  onSwipeRight,
  thresholdRatio = 0.25,
  minVelocity = 0.3,
  maxVerticalSwipe = 100,
} = {}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const lastTime = useRef(0);
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dx, setDx] = useState(0); // Delta X for visual feedback

  const handleStart = useCallback((e) => {
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const y = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startX.current = x;
    startY.current = y;
    lastX.current = x;
    lastY.current = y;
    lastTime.current = Date.now();
    setIsDragging(true);
    setDx(0);
  }, []);

  const handleMove = useCallback((e) => {
    if (!isDragging) return;
    
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const y = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const deltaX = x - startX.current;
    const deltaY = Math.abs(y - startY.current);
    
    // Only prevent default and update dx if horizontal movement is dominant
    if (Math.abs(deltaX) > deltaY && Math.abs(deltaX) > 10) {
      e.preventDefault();
      lastX.current = x;
      lastY.current = y;
      setDx(deltaX);
    }
  }, [isDragging]);

  const handleEnd = useCallback(() => {
    if (!isDragging) return;
    
    const containerWidth = containerRef.current?.offsetWidth || containerRef.current?.clientWidth || window.innerWidth;
    const now = Date.now();
    const deltaX = lastX.current - startX.current;
    const deltaY = Math.abs(lastY.current - startY.current);
    const deltaT = Math.max(1, now - lastTime.current);
    const velocity = Math.abs(deltaX) / deltaT; // px/ms

    // Only process horizontal swipes (ignore if vertical movement is too large)
    if (deltaY > maxVerticalSwipe) {
      setIsDragging(false);
      setDx(0);
      return;
    }

    const passedDistance = Math.abs(deltaX) > containerWidth * thresholdRatio;
    const passedVelocity = velocity > minVelocity;
    const isValidSwipe = passedDistance || passedVelocity;

    setIsDragging(false);
    setDx(0);

    if (isValidSwipe) {
      if (deltaX > 0 && typeof onSwipeRight === 'function') {
        // Swipe right = go to previous tab
        onSwipeRight();
      } else if (deltaX < 0 && typeof onSwipeLeft === 'function') {
        // Swipe left = go to next tab
        onSwipeLeft();
      }
    }
  }, [isDragging, thresholdRatio, minVelocity, maxVerticalSwipe, onSwipeLeft, onSwipeRight]);

  // Attach non-passive touch listeners for preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const touchStart = (e) => {
      handleStart(e);
    };

    const touchMove = (e) => {
      handleMove(e);
    };

    const touchEnd = () => {
      handleEnd();
    };

    // Use non-passive listeners to allow preventDefault
    container.addEventListener('touchstart', touchStart, { passive: false });
    container.addEventListener('touchmove', touchMove, { passive: false });
    container.addEventListener('touchend', touchEnd, { passive: true });
    container.addEventListener('touchcancel', touchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', touchStart);
      container.removeEventListener('touchmove', touchMove);
      container.removeEventListener('touchend', touchEnd);
      container.removeEventListener('touchcancel', touchEnd);
    };
  }, [handleStart, handleMove, handleEnd]);

  return {
    isDragging,
    dx, // Expose delta X for visual feedback
    containerRef, // Ref to attach to container
    bind: {
      ref: containerRef,
      onMouseDown: handleStart,
      onMouseMove: handleMove,
      onMouseUp: handleEnd,
      onMouseLeave: () => {
        if (isDragging) {
          handleEnd();
        }
      },
    },
  };
}
