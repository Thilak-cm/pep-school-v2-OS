import { Box, Typography, Chip, Skeleton, IconButton, TextField, Button, CircularProgress } from '@mui/material';
import { ChevronLeft, ChevronRight, Sparkles as AutoAwesome, MessageCircle } from '../../icons';

export default function MediaContent({
  observation,
  mediaUrl,
  mediaImageLoaded,
  onImageLoaded,
  // Carousel
  carouselList,
  carouselIndex,
  onCarouselNavigate,
  // Edit mode
  mediaEditMode,
  mediaEditComment,
  onEditCommentChange,
  mediaEditSaving,
  onCancelEdit,
  onSaveComment,
  canEdit,
}) {
  if (!observation) return null;

  const mediaKind = (observation.mediaKind || '').toLowerCase();
  const isPhoto = mediaKind === 'photo';
  const isVideo = mediaKind === 'video';
  const hasCarousel = Array.isArray(carouselList) && carouselList.length > 1;

  // Extract filename + resolution from media metadata
  const media0 = observation.media?.[0] || {};
  const fileName = media0.originalName || media0.fileName || '';
  const resolution = media0.width && media0.height ? `${media0.width}×${media0.height}` : '';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Hero image / video */}
      <Box sx={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        {isPhoto && mediaUrl && (
          <>
            {!mediaImageLoaded && (
              <Skeleton variant="rounded" sx={{ width: '100%', height: 280, borderRadius: 2 }} animation="wave" />
            )}
            <Box
              component="img"
              src={mediaUrl}
              alt="Media"
              onLoad={() => onImageLoaded?.()}
              sx={{
                width: '100%',
                maxHeight: 380,
                objectFit: 'contain',
                borderRadius: 'var(--radius-md)',
                display: mediaImageLoaded ? 'block' : 'none',
              }}
            />
          </>
        )}
        {isVideo && mediaUrl && (
          <video
            src={mediaUrl}
            controls
            playsInline
            preload="metadata"
            style={{ width: '100%', borderRadius: 12 }}
          />
        )}
        {!mediaUrl && (
          <Box sx={{
            width: '100%',
            height: 200,
            bgcolor: 'var(--color-surface)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Typography variant="body2" color="text.secondary">
              Media loading...
            </Typography>
          </Box>
        )}

        {/* Carousel arrows */}
        {hasCarousel && (
          <>
            <IconButton
              onClick={() => onCarouselNavigate?.(-1)}
              disabled={carouselIndex <= 0}
              size="small"
              sx={{
                position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                bgcolor: 'rgba(255,255,255,0.8)', '&:hover': { bgcolor: 'rgba(255,255,255,0.95)' },
              }}
            >
              <ChevronLeft size={20} />
            </IconButton>
            <IconButton
              onClick={() => onCarouselNavigate?.(1)}
              disabled={carouselIndex >= carouselList.length - 1}
              size="small"
              sx={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                bgcolor: 'rgba(255,255,255,0.8)', '&:hover': { bgcolor: 'rgba(255,255,255,0.95)' },
              }}
            >
              <ChevronRight size={20} />
            </IconButton>
          </>
        )}
      </Box>

      {/* Filename + resolution metadata */}
      {(fileName || resolution) && (
        <Typography variant="caption" sx={{ color: 'var(--color-text-faint)', fontSize: '0.72rem', textAlign: 'right' }}>
          {[fileName, resolution].filter(Boolean).join('  ·  ')}
        </Typography>
      )}

      {/* Coach Pepper AI classification */}
      {(observation.curriculumArea || observation.handwritten || (Array.isArray(observation.materialsIdentified) && observation.materialsIdentified.length > 0)) && (
        <Box sx={{
          bgcolor: 'var(--color-bg)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border)',
          p: 1.5,
        }}>
          <Typography
            variant="caption"
            sx={{
              color: 'var(--color-text-faint)',
              fontWeight: 700,
              fontSize: '0.65rem',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              mb: 0.75,
            }}
          >
            <AutoAwesome size={12} />
            COACH PEPPER · TAGGED
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
            {observation.curriculumArea && (
              <Chip
                label={observation.curriculumArea}
                size="small"
                sx={{
                  bgcolor: 'var(--color-green-bg)',
                  color: 'var(--color-secondary-dark)',
                  fontWeight: 600,
                  fontSize: '0.72rem',
                  border: '1px solid var(--color-green-mint)',
                  height: 24,
                }}
              />
            )}
            {observation.handwritten && (
              <Chip
                label="Handwritten"
                size="small"
                sx={{
                  bgcolor: 'var(--color-blue-bg)',
                  color: 'var(--color-indigo-dark)',
                  fontWeight: 600,
                  fontSize: '0.72rem',
                  border: '1px solid var(--color-blue-soft-bg)',
                  height: 24,
                }}
              />
            )}
            {Array.isArray(observation.materialsIdentified) && observation.materialsIdentified.map((mat) => (
              <Chip
                key={`mat-${mat}`}
                label={mat}
                size="small"
                sx={{
                  bgcolor: 'var(--color-amber-bg)',
                  color: 'var(--color-amber-text)',
                  fontWeight: 600,
                  fontSize: '0.72rem',
                  border: '1px solid var(--color-amber-gold)',
                  height: 24,
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Teacher comment — view or edit */}
      {mediaEditMode ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            label="Teacher comment"
            value={mediaEditComment}
            onChange={(e) => onEditCommentChange(e.target.value)}
            multiline
            minRows={2}
            fullWidth
            disabled={mediaEditSaving}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              size="small"
              onClick={onSaveComment}
              disabled={mediaEditSaving || !canEdit}
              startIcon={mediaEditSaving ? <CircularProgress size={14} /> : null}
            >
              {mediaEditSaving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="outlined" size="small" onClick={onCancelEdit} disabled={mediaEditSaving}>
              Cancel
            </Button>
          </Box>
        </Box>
      ) : (
        observation.teacherComment && (
          <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', fontSize: '0.88rem' }}>
            <MessageCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            {observation.teacherComment}
          </Typography>
        )
      )}
    </Box>
  );
}
