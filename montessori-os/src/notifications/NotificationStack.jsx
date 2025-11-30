import React, { useEffect } from 'react';
import { Box, Portal } from '@mui/material';
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
    <Portal>
      <Box
        sx={{
          position: 'fixed', // keep visible even when scrolling long pages
          // Place under sticky header: 64px header + safe area + small gap
          top: 'calc(env(safe-area-inset-top) + 64px + 8px)',
          right: 0,
          left: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          alignItems: 'flex-end',
          paddingRight: { xs: 1.5, sm: 2 },
          paddingLeft: { xs: 1.5, sm: 2 },
          zIndex: (theme) => (theme.zIndex.modal + 50), // above dialogs/menus
          pointerEvents: 'none', // let clicks through except banners
        }}
      >
        {items.map((n) => (
          <Box
            key={n.key}
            sx={{
              width: '100%',
              maxWidth: { xs: 'calc(100vw - 24px)', sm: 360 },
              pointerEvents: 'auto'
            }}
          >
            <NotificationBanner
              item={n}
              onFinalize={() => removeByKey(n.key, { finalize: true })}
              onUndo={() => undoByKey(n.key)}
              onClose={() => removeByKey(n.key)}
            />
          </Box>
        ))}
      </Box>
    </Portal>
  );
}
