import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Popover, IconButton } from '@mui/material';
import { X as CloseIcon } from '../icons';
import { useCoachmarkContext } from './CoachmarkProvider';

/**
 * Pulse animation keyframes — injected once via a <style> tag.
 * The @keyframes pulse-coachmark produces a subtle scale throb on the target.
 */
const PULSE_STYLE_ID = 'coachmark-pulse-style';
function ensurePulseStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PULSE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PULSE_STYLE_ID;
  style.textContent = `
    @keyframes pulse-coachmark {
      0%   { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.35); }
      70%  { box-shadow: 0 0 0 10px rgba(79, 70, 229, 0); }
      100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
    }
  `;
  document.head.appendChild(style);
}

const PLACEMENT_MAP = {
  top: { anchorOrigin: { vertical: 'top', horizontal: 'center' }, transformOrigin: { vertical: 'bottom', horizontal: 'center' } },
  bottom: { anchorOrigin: { vertical: 'bottom', horizontal: 'center' }, transformOrigin: { vertical: 'top', horizontal: 'center' } },
  left: { anchorOrigin: { vertical: 'center', horizontal: 'left' }, transformOrigin: { vertical: 'center', horizontal: 'right' } },
  right: { anchorOrigin: { vertical: 'center', horizontal: 'right' }, transformOrigin: { vertical: 'center', horizontal: 'left' } },
};

/**
 * Reusable coachmark tooltip for feature discovery.
 *
 * Props:
 *  - coachmarkKey: string — unique ID for dismiss tracking
 *  - title: string — bold heading
 *  - body: string — description text
 *  - anchorRef: React ref to the target element
 *  - placement: 'top' | 'bottom' | 'left' | 'right' (default 'bottom')
 *  - onDismiss: optional callback after dismiss
 *  - enabled: boolean (default true) — allows call-site gating
 *  - advanceMode: 'action' | 'next' | null — for tour steps
 *  - totalSteps: number | null — total tour steps (shows progress indicator)
 *  - currentStep: number | null — zero-based current step index
 *  - onAdvance: callback for "Next" button in next-mode
 */
export default function Coachmark({
  coachmarkKey,
  title,
  body,
  anchorRef,
  placement = 'bottom',
  onDismiss,
  enabled = true,
  advanceMode = null,
  totalSteps = null,
  currentStep = null,
  onAdvance,
}) {
  const { isDismissed, dismissCoachmark } = useCoachmarkContext();
  const [visible, setVisible] = useState(false);
  const pulseApplied = useRef(false);

  // Show coachmark once anchor is mounted and key not dismissed
  useEffect(() => {
    if (!enabled || isDismissed(coachmarkKey) || !anchorRef?.current) {
      setVisible(false);
      return;
    }
    // Small delay so the anchor is painted before we position
    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, [enabled, coachmarkKey, isDismissed, anchorRef]);

  // Apply pulse animation to anchor element
  useEffect(() => {
    const el = anchorRef?.current;
    if (!el || !visible) return;
    ensurePulseStyle();
    el.style.animation = 'pulse-coachmark 2s infinite';
    el.style.position = el.style.position || 'relative';
    el.style.zIndex = '1301';
    pulseApplied.current = true;
    return () => {
      el.style.animation = '';
      el.style.zIndex = '';
      pulseApplied.current = false;
    };
  }, [visible, anchorRef]);

  const handleDismiss = () => {
    setVisible(false);
    dismissCoachmark(coachmarkKey);
    onDismiss?.();
  };

  const handleNext = () => {
    setVisible(false);
    onAdvance?.();
  };

  if (!visible || !anchorRef?.current) return null;

  const placementConfig = PLACEMENT_MAP[placement] || PLACEMENT_MAP.bottom;
  const isTour = totalSteps != null && currentStep != null;

  return (
    <>
      <Popover
        open
        anchorEl={anchorRef.current}
        anchorOrigin={placementConfig.anchorOrigin}
        transformOrigin={placementConfig.transformOrigin}
        onClose={advanceMode !== 'action' ? handleDismiss : undefined}
        disableAutoFocus
        disableEnforceFocus
        slotProps={{
          backdrop: {
            sx: {
              backgroundColor: 'rgba(0, 0, 0, 0.45)',
            },
          },
          paper: {
            sx: {
              p: 2,
              maxWidth: 280,
              borderRadius: '12px',
              backgroundColor: 'var(--color-bg, #fff)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            },
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            {title && (
              <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', mb: 0.5, color: 'var(--color-text)' }}>
                {title}
              </Typography>
            )}
            {body && (
              <Typography sx={{ fontSize: '0.8rem', color: 'var(--color-text-soft)', lineHeight: 1.4 }}>
                {body}
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={handleDismiss} sx={{ mt: -0.5, mr: -0.5 }}>
            <CloseIcon size={16} />
          </IconButton>
        </Box>

        {/* Step progress + advance controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5 }}>
          {isTour ? (
            <Typography sx={{ fontSize: '0.7rem', color: 'var(--color-text-softer, #999)', fontWeight: 600 }}>
              Step {currentStep + 1} of {totalSteps}
            </Typography>
          ) : (
            <span />
          )}

          {advanceMode === 'next' && (
            <Box
              component="button"
              onClick={handleNext}
              sx={{
                px: 1.5, py: 0.5,
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--color-primary, #4f46e5)',
                color: '#fff',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                '&:hover': { opacity: 0.9 },
              }}
            >
              Next
            </Box>
          )}

          {advanceMode === 'action' && (
            <Typography sx={{ fontSize: '0.7rem', color: 'var(--color-text-softer, #999)', fontStyle: 'italic' }}>
              Tap the highlighted element
            </Typography>
          )}
        </Box>
      </Popover>
    </>
  );
}
