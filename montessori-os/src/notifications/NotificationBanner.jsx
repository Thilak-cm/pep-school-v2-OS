import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Button, Typography } from '@mui/material';
import { keyframes } from '@emotion/react';
import CloseIcon from '@mui/icons-material/Close';
import UndoIcon from '@mui/icons-material/Undo';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import useSwipeDismiss from './useSwipeDismiss.js';

const variantIcon = {
  success: CheckCircleIcon,
  error: ErrorIcon,
  warning: WarningIcon,
  info: InfoIcon,
};

export default function NotificationBanner({
  item,
  onFinalize,
  onUndo,
  onClose,
}) {
  const { variant = 'info', message, duration = 6000, actionLabel = 'Undo', ariaLive } = item;
  const Icon = variantIcon[variant] || InfoIcon;
  const timerRef = useRef(null);
  const [exiting, setExiting] = useState(false);

  const prefersReducedMotion = (typeof window !== 'undefined' && window.matchMedia) ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

  const role = useMemo(() => (variant === 'error' ? 'alert' : 'status'), [variant]);
  const live = ariaLive || (variant === 'error' ? 'assertive' : 'polite');

  // Timer management (no pause)
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      // slide out, then finalize/remove
      setExiting(true);
      setTimeout(() => onFinalize(), 260);
    }, duration);
    return () => clearTimeout(timerRef.current);
  }, [duration, onFinalize]);

  const { dx, dragging, bind } = useSwipeDismiss({ onDismiss: onFinalize, direction: 'right' });
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Colors from MUI palette
  const paletteKey = variant;

  const shrink = useMemo(() => keyframes`
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
  `, []);

  return (
    <Box
      role={role}
      aria-live={live}
      sx={(theme) => ({
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '12px',
        boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        minHeight: 52,
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        px: 1.5,
        py: 1,
        touchAction: 'pan-y',
        transform: `translateX(${(mounted ? 0 : 24) + Math.max(0, dx) + (exiting ? 400 : 0)}px)`,
        opacity: mounted ? 1 : 0.98,
        transition: dragging ? 'none' : 'transform 260ms ease, opacity 240ms ease',
      })}
      {...bind}
    >
      {/* Receding fill overlay */}
      {!prefersReducedMotion && (
        <Box
          aria-hidden
          sx={(theme) => ({
            position: 'absolute',
            inset: 0,
            transformOrigin: 'right center',
            backgroundColor: theme.palette[paletteKey]?.light || theme.palette.primary.light,
            opacity: 0.35,
            pointerEvents: 'none',
            transform: 'scaleX(1)',
            animation: `${shrink} ${duration}ms linear forwards`,
            animationPlayState: 'running',
          })}
        />
      )}

      {/* Icon */}
      <Box sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: theme.palette[paletteKey]?.main || theme.palette.primary.main,
      })}
      >
        <Icon fontSize="small" />
      </Box>

      {/* Message */}
      <Typography variant="body2" sx={{ flex: 1, lineHeight: 1.2 }}>
        {message}
      </Typography>

      {/* Undo Action (optional) */}
      {typeof item.onUndo === 'function' && (
        <Button
          size="small"
          variant="outlined"
          color={paletteKey}
          startIcon={<UndoIcon fontSize="small" />}
          onClick={onUndo}
          aria-label="Undo"
          sx={{
            ml: 0.5,
            px: 1,
            fontWeight: 700,
            textTransform: 'none',
            borderRadius: 1.5,
            bgcolor: 'transparent',
            '&:hover': { bgcolor: 'action.hover' }
          }}
        >
          {item.actionLabel || 'Undo'}
        </Button>
      )}

      {/* Close */}
      <IconButton
        aria-label="Dismiss notification"
        edge="end"
        size="small"
        onClick={onFinalize}
        sx={{ color: 'text.secondary' }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
