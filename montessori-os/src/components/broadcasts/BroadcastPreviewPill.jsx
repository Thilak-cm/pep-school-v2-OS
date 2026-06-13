// BroadcastPreviewPill.jsx — Live preview of how teachers will see the broadcast
// Interactive: tap label to change it, tap CTA to edit CTA text.
// Presentational copy of the DIP AlertCard style — does NOT import the real carousel.

import React, { useState, useRef, useEffect } from 'react';
import { Box, Typography, ButtonBase, Popover, MenuItem, TextField } from '@mui/material';
import { labelColor, LABEL_PRESETS } from './broadcastUtils';

export default function BroadcastPreviewPill({ form, senderName, audienceSummary, onUpdateField }) {
  const [labelAnchor, setLabelAnchor] = useState(null);
  const [editingCta, setEditingCta] = useState(false);
  const [ctaDraft, setCtaDraft] = useState('');
  const ctaInputRef = useRef(null);

  const label = form.label || 'FROM OFFICE';
  const title = form.title || '';
  const subtitle = form.subtitle || `${senderName} · ${audienceSummary}`;
  const ctaLabel = form.ctaLabel || 'Mark as read';
  const lColor = labelColor(label);

  // Focus CTA input when entering edit mode
  useEffect(() => {
    if (editingCta && ctaInputRef.current) {
      ctaInputRef.current.focus();
      ctaInputRef.current.select();
    }
  }, [editingCta]);

  const handleLabelSelect = (preset) => {
    onUpdateField('label', preset);
    setLabelAnchor(null);
  };

  const handleCtaEditStart = (e) => {
    e.stopPropagation();
    setCtaDraft(ctaLabel);
    setEditingCta(true);
  };

  const handleCtaEditEnd = () => {
    const trimmed = ctaDraft.trim();
    if (trimmed) onUpdateField('ctaLabel', trimmed);
    setEditingCta(false);
  };

  return (
    <Box sx={{ mb: 2 }}>
      {/* Group label */}
      <Typography sx={{
        fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1.5,
        textTransform: 'uppercase', color: 'var(--color-text-faint)',
        mb: 0.75,
      }}>
        TEACHERS WILL SEE
      </Typography>

      {/* Preview pill */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', minHeight: 72, borderRadius: '22px',
        background: 'var(--color-surface, #f7f6f2)',
        border: '1px solid var(--color-border, rgba(0,0,0,0.1))',
        px: 2.5, py: 1.5,
        boxSizing: 'border-box',
      }}>
        {/* Text content */}
        <Box sx={{ flex: 1, minWidth: 0, mr: 1.5 }}>
          {/* Tappable label */}
          <ButtonBase
            onClick={(e) => setLabelAnchor(e.currentTarget)}
            sx={{
              display: 'inline-flex', alignItems: 'center',
              borderRadius: '4px', px: 0.5, py: 0.15, mx: -0.5,
              '&:hover': { backgroundColor: 'rgba(0,0,0,0.04)' },
            }}
          >
            <Typography sx={{
              fontSize: '0.65rem', fontWeight: 800, letterSpacing: 1.2,
              textTransform: 'uppercase', color: lColor, lineHeight: 1,
            }}>
              {label}
            </Typography>
            <Typography sx={{
              fontSize: '0.55rem', color: 'var(--color-text-faint)',
              ml: 0.5, lineHeight: 1,
            }}>
              ▾
            </Typography>
          </ButtonBase>

          {/* Label picker popover */}
          <Popover
            open={!!labelAnchor}
            anchorEl={labelAnchor}
            onClose={() => setLabelAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{ paper: { sx: { borderRadius: 2, mt: 0.5, minWidth: 160 } } }}
          >
            {LABEL_PRESETS.map(preset => (
              <MenuItem
                key={preset}
                selected={preset === label}
                onClick={() => handleLabelSelect(preset)}
                sx={{ fontSize: '0.8rem', fontWeight: 600, py: 0.75 }}
              >
                <Box sx={{
                  width: 8, height: 8, borderRadius: '50%', mr: 1,
                  backgroundColor: labelColor(preset),
                }} />
                {preset}
              </MenuItem>
            ))}
          </Popover>

          {/* Title */}
          <Typography sx={{
            fontSize: '0.9rem', fontWeight: 700, color: title ? 'var(--color-text)' : 'var(--color-text-faint)',
            lineHeight: 1.3, mt: 0.25,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {title || 'Your title here'}
          </Typography>

          {/* Subtitle */}
          <Typography sx={{
            fontSize: '0.72rem', color: 'var(--color-text-soft)',
            lineHeight: 1.2, mt: 0.15,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {subtitle}
          </Typography>
        </Box>

        {/* CTA button — tap to edit */}
        {editingCta ? (
          <TextField
            inputRef={ctaInputRef}
            value={ctaDraft}
            onChange={(e) => setCtaDraft(e.target.value)}
            onBlur={handleCtaEditEnd}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCtaEditEnd(); }}
            size="small"
            sx={{
              width: 90,
              '& .MuiInputBase-input': {
                fontSize: '0.8rem', fontWeight: 700,
                textAlign: 'center', py: 0.75, px: 1,
              },
              '& .MuiOutlinedInput-root': {
                borderRadius: '14px',
              },
            }}
          />
        ) : (
          <ButtonBase
            onClick={handleCtaEditStart}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.75,
              px: 2, py: 0.75, borderRadius: '14px',
              backgroundColor: 'var(--color-primary)',
              color: '#fff', fontSize: '0.8rem', fontWeight: 700,
              flexShrink: 0,
              '&:hover': { opacity: 0.9 },
            }}
          >
            {ctaLabel}
          </ButtonBase>
        )}
      </Box>

      {/* Caption */}
      <Typography sx={{
        fontSize: '0.65rem', color: 'var(--color-text-faint)',
        mt: 0.5, textAlign: 'center',
      }}>
        ↻ updates live as you type
      </Typography>
    </Box>
  );
}
