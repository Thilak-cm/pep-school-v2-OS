import React, { useEffect } from 'react';
import { Box } from '@mui/material';
import NotificationBanner from './NotificationBanner.jsx';
import { useNotificationContext } from './NotificationContext.jsx';

export default function NotificationStack() {
  const { items, removeByKey, undoByKey } = useNotificationContext();

  // ESC to dismiss topmost
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && items.length > 0) {
        const top = items[items.length - 1];
        removeByKey(top.key, { finalize: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, removeByKey]);

  return (
    <Box
      sx={{
        position: 'absolute',
        // Place under sticky header: 64px header + safe area + small gap
        top: 'calc(env(safe-area-inset-top) + 64px + 8px)',
        right: 'max(env(safe-area-inset-right), 8px)',
        left: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        zIndex: (theme) => (theme.zIndex.appBar + 10),
        pointerEvents: 'none', // let clicks through except banners
      }}
    >
      {items.map((n) => (
        <Box key={n.key} sx={{ width: { xs: 'calc(100vw - 24px)', sm: 360 }, alignSelf: 'flex-end', pointerEvents: 'auto' }}>
          <NotificationBanner
            item={n}
            onFinalize={() => removeByKey(n.key, { finalize: true })}
            onUndo={() => undoByKey(n.key)}
            onClose={() => removeByKey(n.key)}
          />
        </Box>
      ))}
    </Box>
  );
}

