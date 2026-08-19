import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import { ArrowLeft as ArrowBack, RotateCcw, ArrowLeftRight } from '../icons';
import {
  applyEditorOperation,
  createEditorState,
  exportEditedPhoto,
  hasPixelChanges,
  resetEditorState,
} from '../utils/photoEditorTransforms.js';

export default function PhotoEditor({ open, item, onApply, onApplyFailed, onCancel, onClose }) {
  const [state, setState] = useState(() => createEditorState({ width: item?.source?.width || 1, height: item?.source?.height || 1 }));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const previewRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    if (open && item) {
      setState(createEditorState({ width: item.source.width, height: item.source.height }));
      setError('');
      setWorking(false);
    }
  }, [open, item?.id]);

  const operation = (next) => setState((current) => applyEditorOperation(current, next));

  const beginCropDrag = (event, edge) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { edge, startX: event.clientX, startY: event.clientY, crop: { ...state.crop } };
    window.addEventListener('pointermove', handleCropDrag);
    window.addEventListener('pointerup', endCropDrag, { once: true });
  };

  const handleCropDrag = (event) => {
    const drag = dragRef.current;
    const bounds = previewRef.current?.getBoundingClientRect();
    if (!drag || !bounds) return;
    const dx = ((event.clientX - drag.startX) / bounds.width) * state.originalWidth;
    const dy = ((event.clientY - drag.startY) / bounds.height) * state.originalHeight;
    const minSize = 80;
    const next = { ...drag.crop };
    if (drag.edge.includes('left')) {
      next.x = Math.max(0, Math.min(drag.crop.x + drag.crop.width - minSize, drag.crop.x + dx));
      next.width = drag.crop.width + drag.crop.x - next.x;
    }
    if (drag.edge.includes('right')) {
      next.width = Math.max(minSize, Math.min(state.originalWidth - drag.crop.x, drag.crop.width + dx));
    }
    if (drag.edge.includes('top')) {
      next.y = Math.max(0, Math.min(drag.crop.y + drag.crop.height - minSize, drag.crop.y + dy));
      next.height = drag.crop.height + drag.crop.y - next.y;
    }
    if (drag.edge.includes('bottom')) {
      next.height = Math.max(minSize, Math.min(state.originalHeight - drag.crop.y, drag.crop.height + dy));
    }
    setState((current) => ({ ...current, crop: next }));
  };

  const endCropDrag = () => {
    dragRef.current = null;
    window.removeEventListener('pointermove', handleCropDrag);
  };

  const apply = async () => {
    if (!hasPixelChanges(state) || !item?.source?.blob || working) return;
    setWorking(true);
    setError('');
    try {
      const result = await exportEditedPhoto(item.source.blob, state);
      await onApply({ ...result, editorState: state });
    } catch (err) {
      setError(err?.message || 'Could not apply photo edits.');
      onApplyFailed?.(err);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth aria-label="Photo editor" PaperProps={{ sx: { borderRadius: 3, m: 2, maxHeight: 'min(760px, calc(100% - 32px))' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <IconButton aria-label="Back" onClick={onCancel}><ArrowBack /></IconButton>
        Edit photo
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">Drag the frame edges to crop. The preview updates as you edit.</Typography>
        <Box ref={previewRef} sx={{ position: 'relative', width: '100%', maxHeight: '48vh', aspectRatio: `${state.originalWidth} / ${state.originalHeight}`, overflow: 'hidden', bgcolor: '#111', touchAction: 'none' }}>
          {item?.previewUrl && (
            <Box
              component="img"
              src={item.previewUrl}
              alt="Live edited photo preview"
              sx={{ width: '100%', height: '100%', objectFit: 'fill', transform: `rotate(${state.rotation}deg) scaleX(${state.flipX ? -1 : 1}) scaleY(${state.flipY ? -1 : 1})`, transition: 'transform 180ms ease' }}
            />
          )}
          {item?.previewUrl && (
            <Box sx={{ position: 'absolute', left: `${(state.crop.x / state.originalWidth) * 100}%`, top: `${(state.crop.y / state.originalHeight) * 100}%`, width: `${(state.crop.width / state.originalWidth) * 100}%`, height: `${(state.crop.height / state.originalHeight) * 100}%`, overflow: 'hidden', pointerEvents: 'none' }}>
              <Box
                component="img"
                src={item.previewUrl}
                alt="Edited photo crop preview"
                sx={{ position: 'absolute', left: `${(-state.crop.x / state.crop.width) * 100}%`, top: `${(-state.crop.y / state.crop.height) * 100}%`, width: `${(state.originalWidth / state.crop.width) * 100}%`, height: `${(state.originalHeight / state.crop.height) * 100}%`, maxWidth: 'none', transform: `rotate(${state.rotation}deg) scaleX(${state.flipX ? -1 : 1}) scaleY(${state.flipY ? -1 : 1})`, transformOrigin: 'center', transition: 'transform 180ms ease' }}
              />
            </Box>
          )}
          <Box sx={{ position: 'absolute', left: `${(state.crop.x / state.originalWidth) * 100}%`, top: `${(state.crop.y / state.originalHeight) * 100}%`, width: `${(state.crop.width / state.originalWidth) * 100}%`, height: `${(state.crop.height / state.originalHeight) * 100}%`, border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.52)', cursor: 'move' }}>
            {[['top-left', { top: -2, left: -2, borderTop: '4px solid white', borderLeft: '4px solid white' }], ['top-right', { top: -2, right: -2, borderTop: '4px solid white', borderRight: '4px solid white' }], ['bottom-left', { bottom: -2, left: -2, borderBottom: '4px solid white', borderLeft: '4px solid white' }], ['bottom-right', { bottom: -2, right: -2, borderBottom: '4px solid white', borderRight: '4px solid white' }]].map(([edge, position]) => (
              <Box key={`corner-${edge}`} sx={{ position: 'absolute', width: 24, height: 24, pointerEvents: 'none', ...position }} />
            ))}
            <Box sx={{ position: 'absolute', left: '33.333%', top: 0, bottom: 0, borderLeft: '1px solid rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
            <Box sx={{ position: 'absolute', left: '66.666%', top: 0, bottom: 0, borderLeft: '1px solid rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
            <Box sx={{ position: 'absolute', top: '33.333%', left: 0, right: 0, borderTop: '1px solid rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
            <Box sx={{ position: 'absolute', top: '66.666%', left: 0, right: 0, borderTop: '1px solid rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
            {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((edge) => (
              <Box key={edge} onPointerDown={(event) => beginCropDrag(event, edge)} sx={{ position: 'absolute', width: 30, height: 30, bgcolor: 'transparent', cursor: `${edge.includes('top') ? 'n' : 's'}${edge.includes('left') ? 'w' : 'e'}-resize`, ...(edge.includes('top') ? { top: -15 } : { bottom: -15 }), ...(edge.includes('left') ? { left: -15 } : { right: -15 }) }} />
            ))}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
          <Button onClick={() => operation({ type: 'rotate', degrees: -90 })} startIcon={<RotateCcw />}>Rotate left</Button>
          <Button onClick={() => operation({ type: 'rotate', degrees: 90 })} startIcon={<RotateCcw />}>Rotate right</Button>
          <Button onClick={() => operation({ type: 'flip', axis: 'horizontal' })} startIcon={<ArrowLeftRight />}>Flip horizontal</Button>
          <Button onClick={() => operation({ type: 'flip', axis: 'vertical' })}>Flip vertical</Button>
          <Button onClick={() => setState((current) => resetEditorState(current))}>Reset</Button>
        </Box>
        {error && <Typography color="error" role="alert">{error}</Typography>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={apply} disabled={!hasPixelChanges(state) || working}>{working ? 'Applying…' : 'Apply changes'}</Button>
      </DialogActions>
    </Dialog>
  );
}
