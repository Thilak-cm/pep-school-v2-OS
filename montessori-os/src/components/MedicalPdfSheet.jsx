import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Stack, SwipeableDrawer, Typography,
} from '@mui/material';
import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../firebase';

/**
 * #290 medical assessment viewer. View-only for every role by product
 * decision (privacy): the CF mints a 15-minute signed URL with inline
 * disposition and this sheet renders it in an iframe. There is deliberately
 * no download affordance anywhere; "Open in browser tab" exists because some
 * mobile browsers will not render PDFs inside iframes. Browser-native save
 * cannot be technically prevented - the decision removes the deliberate
 * download path, it does not attempt DRM.
 */
export default function MedicalPdfSheet({ open, onClose, studentId, observationId, title }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Notify App to hide the global FAB while the drawer is open (same
  // mechanism as NoteBottomSheet).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('noteDrawerToggle', { detail: { open } }));
  }, [open]);

  useEffect(() => {
    let active = true;
    if (!open || !studentId || !observationId) return undefined;
    setLoading(true);
    setError('');
    setUrl('');
    const getViewUrl = httpsCallable(cloudFunctions, 'getAssessmentDownloadUrl');
    getViewUrl({ assessmentKind: 'medical', studentId, observationId })
      .then((result) => {
        if (!active) return;
        if (!result.data?.url) throw new Error('The view link was not returned.');
        setUrl(result.data.url);
      })
      .catch((loadError) => {
        if (active) setError(loadError?.message || 'The medical assessment could not be opened.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, studentId, observationId]);

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      disableSwipeToOpen
      disableDiscovery
      PaperProps={{
        sx: {
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          height: 'calc(100dvh - 48px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
        <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'var(--color-border)' }} />
      </Box>

      <Box sx={{ px: 2.5, pb: 1 }}>
        <Typography variant="h6">{title || 'Medical assessment'}</Typography>
        <Typography variant="caption" color="text.secondary">View only</Typography>
      </Box>

      {loading && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2.5, py: 2 }}>
          <CircularProgress size={18} />
          <Typography variant="body2">Preparing viewer…</Typography>
        </Stack>
      )}
      {error && <Alert severity="error" sx={{ mx: 2.5, my: 1 }}>{error}</Alert>}

      {url && (
        <Box sx={{ flex: 1, minHeight: 0, px: 1, pb: 1 }}>
          <iframe
            src={url}
            title={title || 'Medical assessment'}
            style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 }}
          />
        </Box>
      )}

      <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2, pt: 1 }}>
        {url && (
          <Button
            fullWidth
            variant="outlined"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
          >
            Open in browser tab
          </Button>
        )}
        <Button fullWidth variant="contained" onClick={onClose}>Close</Button>
      </Stack>
    </SwipeableDrawer>
  );
}
