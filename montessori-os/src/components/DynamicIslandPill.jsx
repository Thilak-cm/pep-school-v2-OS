// DynamicIslandPill.jsx — Rotating alert pill for Home page (PEP-213, PEP-296)
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { keyframes } from '@emotion/react';
import { Box, Typography, ButtonBase, IconButton } from '@mui/material';
import { Flag, Calendar, ShieldCheck, ChevronUp, ChevronDown } from '../icons';
import { useAlertBus } from '../hooks/useAlertBus';
import { dismissAlert } from '../utils/alertService';
import NewFeaturePill from './NewFeaturePill';

// ── Constants ──────────────────────────────────────────────────────────────────

const ROTATION_MS = 10000;
const PILL_HEIGHT = 72;
const CARD_GAP = 6;
const SWIPE_THRESHOLD = 25;
const PEEK_EDGE = 12;
const PEEK_RESTORE_MS = 2000;

// ── Icon map for CTA buttons ──────────────────────────────────────────────────

const ICON_MAP = {
  Flag: <Flag size={16} />,
  Calendar: <Calendar size={16} />,
  ShieldCheck: <ShieldCheck size={16} />,
};

// ── Progress bar animation ─────────────────────────────────────────────────────

const progressFill = keyframes`
  from { width: 0%; }
  to   { width: 100%; }
`;


// ── Component ──────────────────────────────────────────────────────────────────

function DynamicIslandPill({ onNavigateToStudent, onNavigate, classrooms = [] }) {
  const { alerts, loading } = useAlertBus(classrooms);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const directionRef = useRef(1); // 1 = forward (down), -1 = backward (up)
  const timerRef = useRef(null);
  const pauseTimerRef = useRef(null);
  const snapBackTimerRef = useRef(null);

  // Peek state — tap to shrink current card and reveal neighbor edges
  const [peeking, setPeeking] = useState(false);
  const peekTimerRef = useRef(null);

  // Swipe state
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartRef = useRef({ y: 0, time: 0 });
  const containerRef = useRef(null);

  // Clamp activeIndex when alerts array shrinks
  useEffect(() => {
    if (alerts.length > 0 && activeIndex >= alerts.length) {
      setActiveIndex(alerts.length - 1);
    }
  }, [alerts.length, activeIndex]);

  // ── Auto-rotation timer ─────────────────────────────────────────────────

  useEffect(() => {
    if (alerts.length <= 1 || paused || isDragging) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => {
        const dir = directionRef.current;
        const next = prev + dir;
        if (next >= alerts.length) {
          // Hit the end — reverse to go up
          directionRef.current = -1;
          setAnimKey((k) => k + 1);
          return prev - 1;
        }
        if (next < 0) {
          // Hit the start — reverse to go down
          directionRef.current = 1;
          setAnimKey((k) => k + 1);
          return prev + 1;
        }
        setAnimKey((k) => k + 1);
        return next;
      });
    }, ROTATION_MS);
    return () => clearInterval(timerRef.current);
  }, [alerts.length, paused, isDragging]);

  // ── Navigation helpers ───────────────────────────────────────────────────

  const goNext = useCallback(() => {
    setActiveIndex((prev) => {
      if (prev >= alerts.length - 1) return prev;
      setAnimKey((k) => k + 1);
      return prev + 1;
    });
    setPeeking(false);
    setPaused(true);
    clearTimeout(pauseTimerRef.current);
    clearTimeout(peekTimerRef.current);
    pauseTimerRef.current = setTimeout(() => setPaused(false), 3000);
  }, [alerts.length]);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => {
      if (prev <= 0) return prev;
      setAnimKey((k) => k + 1);
      return prev - 1;
    });
    setPeeking(false);
    setPaused(true);
    clearTimeout(pauseTimerRef.current);
    clearTimeout(peekTimerRef.current);
    pauseTimerRef.current = setTimeout(() => setPaused(false), 3000);
  }, []);

  // ── Touch/swipe handlers ────────────────────────────────────────────────

  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    touchStartRef.current = { y: touch.clientY, time: Date.now() };
    setIsDragging(true);
    setPaused(true);
    clearTimeout(pauseTimerRef.current);
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging) return;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    setDragOffset(dy);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;

    if (Math.abs(dragOffset) > SWIPE_THRESHOLD) {
      if (dragOffset < 0) goNext();
      else goPrev();
    } else {
      // Snap back — resume after delay
      clearTimeout(snapBackTimerRef.current);
      snapBackTimerRef.current = setTimeout(() => setPaused(false), 2000);
    }

    setDragOffset(0);
    setIsDragging(false);
  }, [isDragging, dragOffset, goNext, goPrev]);

  // ── Peek tap — shrink card to reveal neighbor edges ──────────────────────

  const handlePeekTap = useCallback(() => {
    if (alerts.length <= 1) return;
    setPeeking((prev) => {
      const next = !prev;
      clearTimeout(peekTimerRef.current);
      if (next) {
        // Auto-restore after delay
        peekTimerRef.current = setTimeout(() => setPeeking(false), PEEK_RESTORE_MS);
        setPaused(true);
      } else {
        setPaused(false);
      }
      return next;
    });
  }, [alerts.length]);

  // ── Cleanup all timers on unmount ────────────────────────────────────────────
  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearTimeout(pauseTimerRef.current);
    clearTimeout(snapBackTimerRef.current);
    clearTimeout(peekTimerRef.current);
  }, []);

  // ── CTA handler — type-dispatch routing (PEP-296) ──────────────────────

  const handleCtaTap = useCallback((e, alert) => {
    e.stopPropagation();
    const { ctaRoute, ctaParams } = alert;

    // Student dashboard navigation (red flags, interviews)
    if (ctaRoute === 'studentDashboard' && ctaParams?.studentId) {
      onNavigateToStudent?.({
        studentId: ctaParams.studentId,
        studentName: ctaParams.studentName,
        classroomId: ctaParams.classroomId,
      });
      return;
    }

    // Dismiss broadcast/system/agent alerts on CTA tap (acknowledgment actions)
    if (['broadcast', 'system', 'agent'].includes(alert.colorKey) && alert.id && alert._source === 'alerts') {
      dismissAlert(alert.id);
    }

    // Generic screen navigation (alerts page, interviews page, etc.)
    if (ctaRoute && onNavigate) {
      onNavigate(ctaRoute, ctaParams);
    }
  }, [onNavigateToStudent, onNavigate]);


  // ── Loading state — pill-shaped placeholder ──────────────────────────────

  if (loading) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="overline" sx={{ fontWeight: 700, color: 'var(--color-text)', letterSpacing: 1 }}>
            Quick alerts
          </Typography>
          <NewFeaturePill />
        </Box>
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', height: PILL_HEIGHT, borderRadius: '22px',
          background: 'var(--color-surface, #f5f5f5)',
          border: '1px solid var(--color-border, rgba(0,0,0,0.1))',
          px: 2.5,
        }}>
          <Typography sx={{
            fontSize: '0.82rem', color: 'var(--color-text-soft)',
            fontWeight: 500,
          }}>
            Coach Pepper is scanning for alerts...
          </Typography>
        </Box>
      </Box>
    );
  }

  // ── Empty state — plain text, no pill ────────────────────────────────────

  if (alerts.length === 0) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography variant="overline" sx={{ fontWeight: 700, color: 'var(--color-text)', letterSpacing: 1 }}>
            Quick alerts
          </Typography>
          <NewFeaturePill />
        </Box>
        <Typography sx={{ color: 'var(--color-text-soft)', fontSize: '0.85rem' }}>
          All clear this week
        </Typography>
      </Box>
    );
  }

  // ── Clamped carousel: single copy, no wrap ──────────────────────────────────
  const cardHeight = peeking ? PILL_HEIGHT - 2 * PEEK_EDGE : PILL_HEIGHT;
  const cardGap = peeking ? 2 : CARD_GAP;
  const stride = cardHeight + cardGap;
  const baseOffset = -activeIndex * stride;
  const peekShift = peeking ? PEEK_EDGE : 0;
  const carouselY = baseOffset + dragOffset + peekShift;

  const multipleAlerts = alerts.length > 1;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="overline" sx={{ fontWeight: 700, color: 'var(--color-text)', letterSpacing: 1 }}>
          Quick alerts
        </Typography>
        <NewFeaturePill />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* ── Carousel viewport — fixed border container ── */}
        <Box
          ref={containerRef}
          onClick={handlePeekTap}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          sx={{
            flex: 1, minWidth: 0,
            height: PILL_HEIGHT,
            overflow: 'hidden',
            borderRadius: '22px',
            border: multipleAlerts ? '1px solid var(--color-border, rgba(0,0,0,0.1))' : 'none',
            position: 'relative',
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          {/* ── Sliding track — single copy, clamped ── */}
          <Box
            sx={{
              position: 'absolute', left: 0, right: 0,
              transform: `translateY(${carouselY}px)`,
              transition: isDragging
                ? 'none'
                : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {alerts.map((alert, i) => (
              <Box key={i} sx={{
                height: cardHeight,
                mb: `${cardGap}px`,
                transition: 'height 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
              }}>
                <AlertCard
                  alert={alert}
                  onCtaTap={handleCtaTap}
                  alerts={alerts}
                  activeIndex={activeIndex}
                  animKey={animKey}
                  paused={paused || isDragging}
                  compact={peeking}
                />
              </Box>
            ))}
          </Box>
        </Box>

        {/* ── Up/Down nav buttons ── */}
        {multipleAlerts && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flexShrink: 0 }}>
            <IconButton
              onClick={goPrev}
              disabled={activeIndex <= 0}
              size="small"
              sx={{
                width: 32, height: 32,
                backgroundColor: 'transparent',
                color: 'var(--color-text-soft)',
                border: '1px solid var(--color-border, rgba(0,0,0,0.1))',
                borderRadius: '10px',
                '&:hover': { backgroundColor: 'var(--color-bg-hover, rgba(0,0,0,0.04))', color: 'var(--color-text)' },
                '&.Mui-disabled': { opacity: 0.3 },
              }}
              aria-label="Previous alert"
            >
              <ChevronUp size={18} />
            </IconButton>
            <IconButton
              onClick={goNext}
              disabled={activeIndex >= alerts.length - 1}
              size="small"
              sx={{
                width: 32, height: 32,
                backgroundColor: 'transparent',
                color: 'var(--color-text-soft)',
                border: '1px solid var(--color-border, rgba(0,0,0,0.1))',
                borderRadius: '10px',
                '&:hover': { backgroundColor: 'var(--color-bg-hover, rgba(0,0,0,0.04))', color: 'var(--color-text)' },
                '&.Mui-disabled': { opacity: 0.3 },
              }}
              aria-label="Next alert"
            >
              <ChevronDown size={18} />
            </IconButton>
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ── AlertCard sub-component ──────────────────────────────────────────────────

function AlertCard({ alert, onCtaTap, alerts, activeIndex, animKey, paused, compact = false, sx = {} }) {
  const alertColor = alert.color || { label: 'var(--color-error)', cta: 'var(--color-error)', ctaBg: 'var(--color-error)', dot: 'var(--color-error)' };
  const showIndicators = alerts && alerts.length > 1;
  const ctaIcon = typeof alert.ctaIcon === 'string' ? ICON_MAP[alert.ctaIcon] : alert.ctaIcon;

  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', height: '100%', borderRadius: compact ? '14px' : '22px',
        background: 'var(--color-surface, #f5f5f5)',
        border: compact ? 'none' : '1px solid var(--color-border, rgba(0,0,0,0.1))',
        px: 2.5, py: compact ? 0.5 : 1.5,
        position: 'relative', overflow: 'hidden',
        boxSizing: 'border-box',
        transition: 'border-radius 0.35s ease, padding 0.35s ease',
        ...sx,
      }}
    >
      {/* ── Text content ── */}
      <Box sx={{ flex: 1, minWidth: 0, mr: 1.5 }}>
        <Typography sx={{
          fontSize: '0.65rem', fontWeight: 800, letterSpacing: 1.2,
          textTransform: 'uppercase', color: alertColor.label,
          lineHeight: 1,
        }}>
          {alert.label}{alert.labelDetail ? ` · ${alert.labelDetail}` : ''}
        </Typography>
        <Typography sx={{
          fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text)',
          lineHeight: 1.3, mt: 0.25,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {alert.title}
        </Typography>
        <Typography sx={{
          fontSize: '0.72rem', color: 'var(--color-text-soft)',
          lineHeight: 1.2, mt: 0.15,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {alert.subtitle}
        </Typography>
      </Box>

      {/* ── CTA + dot indicators column ── */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, gap: 0.5 }}>
        <ButtonBase
          onClick={(e) => onCtaTap(e, alert)}
          sx={{
            display: 'flex', alignItems: 'center', gap: 0.75,
            px: 2, py: 0.75, borderRadius: '14px',
            backgroundColor: alertColor.ctaBg,
            color: '#fff', fontSize: '0.8rem', fontWeight: 700,
            '&:hover': { opacity: 0.9 },
          }}
        >
          {ctaIcon}
          {alert.ctaLabel}
        </ButtonBase>

        {showIndicators && (
          <Box sx={{
            display: 'flex', gap: '5px', alignItems: 'center', justifyContent: 'center',
          }}>
            {alerts.map((a, i) => (
              <Box
                key={i}
                sx={{
                  height: 6,
                  width: i === activeIndex ? 18 : 6,
                  borderRadius: i === activeIndex ? '3px' : '50%',
                  backgroundColor: i === activeIndex
                    ? (a.color?.dot || 'var(--color-text)')
                    : 'var(--color-text-soft, rgba(0,0,0,0.3))',
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* ── Progress bar ── */}
      {showIndicators && !paused && (
        <Box sx={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 2, backgroundColor: 'var(--color-border, rgba(0,0,0,0.08))',
        }}>
          <Box
            key={animKey}
            sx={{
              height: '100%',
              backgroundColor: alertColor.dot,
              animation: `${progressFill} ${ROTATION_MS}ms linear`,
              opacity: 0.6,
            }}
          />
        </Box>
      )}
    </Box>
  );
}

export default DynamicIslandPill;
