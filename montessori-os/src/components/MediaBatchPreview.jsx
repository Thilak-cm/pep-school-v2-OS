import React from 'react';
import { Box, Skeleton } from '@mui/material';

export default function MediaBatchPreview({ mediaItems = [], mediaUrls = {}, onOpen }) {
  if (mediaItems.length === 0) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 0.75,
        width: '100%',
        overflowX: 'auto',
        overscrollBehaviorX: 'contain',
        pb: 0.25,
        scrollbarWidth: 'thin',
      }}
    >
      {mediaItems.map((item, index) => {
        const url = item?.storagePath ? mediaUrls[item.storagePath] : null;
        const mediaKind = String(item?.mediaKind || 'photo').toLowerCase();
        return (
          <Box
            key={item.id || `${item.storagePath}-${index}`}
            onClick={(event) => {
              if (!onOpen) return;
              event.stopPropagation();
              onOpen(index);
            }}
            sx={{ flex: '0 0 auto', width: 112, height: 84, borderRadius: 'var(--radius-sm)', overflow: 'hidden', cursor: onOpen ? 'pointer' : 'default' }}
          >
            {url && mediaKind === 'video' ? (
              <Box component="video" src={url} muted playsInline preload="metadata" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : url ? (
              <Box component="img" src={url} alt={`Media preview ${index + 1}`} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : item?.storagePath ? (
              <Skeleton variant="rounded" width="100%" height="100%" animation="wave" />
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
