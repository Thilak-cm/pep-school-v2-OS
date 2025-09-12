import { useCallback, useRef, useState } from 'react';

// Simple swipe-right dismiss hook with distance/velocity threshold
export default function useSwipeDismiss({ onDismiss, direction = 'right' } = {}) {
  const startX = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const thresholdRatio = 0.4; // 40% width
  const minVelocity = 0.5; // px/ms

  const handleStart = useCallback((e) => {
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    startX.current = x;
    lastX.current = x;
    lastTime.current = Date.now();
    setDragging(true);
  }, []);

  const handleMove = useCallback((e) => {
    if (!dragging) return;
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    lastX.current = x;
    setDx(x - startX.current);
  }, [dragging]);

  const handleEnd = useCallback((containerWidth) => {
    if (!dragging) return;
    const now = Date.now();
    const deltaX = lastX.current - startX.current;
    const deltaT = Math.max(1, now - lastTime.current);
    const velocity = deltaX / deltaT; // px/ms

    const passedDistance = Math.abs(deltaX) > containerWidth * thresholdRatio;
    const passedVelocity = Math.abs(velocity) > minVelocity;

    const isRight = deltaX > 0;
    const shouldDismiss = direction === 'right' ? (isRight && (passedDistance || passedVelocity)) : (!isRight && (passedDistance || passedVelocity));

    setDragging(false);
    setDx(0);

    if (shouldDismiss && typeof onDismiss === 'function') {
      onDismiss();
    }
  }, [dragging, direction, onDismiss]);

  return {
    dx,
    dragging,
    bind: {
      onMouseDown: handleStart,
      onMouseMove: handleMove,
      onMouseUp: (e) => handleEnd(e.currentTarget.offsetWidth || e.currentTarget.clientWidth || 1),
      onMouseLeave: (e) => dragging && handleEnd(e.currentTarget.offsetWidth || e.currentTarget.clientWidth || 1),
      onTouchStart: handleStart,
      onTouchMove: handleMove,
      onTouchEnd: (e) => handleEnd(e.currentTarget.offsetWidth || e.currentTarget.clientWidth || 1),
    }
  };
}

