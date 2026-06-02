import React from 'react';
import { Box, Typography, IconButton, CircularProgress } from '@mui/material';
import { Trash2 as Delete, Mic, Pause, Play as PlayArrow, Send } from '../icons';

/**
 * Presentational overlay for inline voice recording / transcription.
 * Consumes the return value of useInlineVoice.
 *
 * Two visual states:
 *  1. Recording — timer + waveform + controls (delete / pause-resume / stop-send)
 *  2. Transcribing — spinner + "Transcribing..."
 */
export default function InlineVoiceOverlay({
  isRecording,
  isPaused,
  recordingTime,
  isTranscribing,
  waveformData,
  showTimeLimitWarning,
  stopRecording,
  pauseRecording,
  resumeRecording,
  cancelRecording,
  formatTime,
}) {
  if (isTranscribing) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          py: 1.5,
          px: 2,
          borderRadius: '16px',
          backgroundColor: 'white',
          border: '1px solid',
          borderColor: 'rgba(0, 0, 0, 0.08)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        }}
      >
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">
          Transcribing...
        </Typography>
      </Box>
    );
  }

  if (!isRecording) return null;

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: '16px',
        backgroundColor: 'white',
        border: '1px solid',
        borderColor: 'rgba(0, 0, 0, 0.08)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* Timer + Waveform row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Typography
          variant="body2"
          sx={{ fontSize: '0.9rem', fontWeight: 500, color: 'text.primary', minWidth: '40px' }}
        >
          {formatTime(recordingTime)}
        </Typography>

        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 0.5,
            height: 32,
            px: 1,
            minWidth: 0,
            overflow: 'hidden',
            maxWidth: '100%',
          }}
        >
          {waveformData.length > 0 ? (
            waveformData.map((value, index) => {
              const normalizedValue = Math.min(255, Math.max(0, value));
              const height = Math.max(3, (normalizedValue / 255) * 24);
              return (
                <Box
                  key={index}
                  sx={{
                    width: 2,
                    minWidth: 2,
                    maxWidth: 2,
                    height: `${height}px`,
                    backgroundColor: isPaused ? 'grey.400' : 'primary.main',
                    borderRadius: 1,
                    transition: 'height 0.1s linear',
                    alignSelf: 'center',
                    flexShrink: 0,
                  }}
                />
              );
            })
          ) : (
            Array.from({ length: 60 }).map((_, index) => (
              <Box
                key={index}
                sx={{
                  width: 2,
                  minWidth: 2,
                  maxWidth: 2,
                  height: '4px',
                  backgroundColor: 'grey.300',
                  borderRadius: 1,
                  flexShrink: 0,
                }}
              />
            ))
          )}
        </Box>
      </Box>

      {/* Control buttons row */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        {/* Delete */}
        <IconButton
          onClick={cancelRecording}
          aria-label="Delete recording"
          sx={{
            minWidth: 44, minHeight: 44, width: 44, height: 44,
            color: 'text.primary',
            '&:hover': { backgroundColor: 'grey.100' },
          }}
        >
          <Delete />
        </IconButton>

        {/* Pause / Resume */}
        {typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype.pause === 'function' ? (
          <IconButton
            onClick={isPaused ? resumeRecording : pauseRecording}
            aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
            sx={{
              minWidth: 48, minHeight: 48, width: 48, height: 48,
              backgroundColor: 'error.main',
              color: 'white',
              '&:hover': { backgroundColor: 'error.dark' },
            }}
          >
            {isPaused ? <PlayArrow /> : <Pause />}
          </IconButton>
        ) : (
          <Box sx={{ width: 48, height: 48 }} />
        )}

        {/* Send / finish */}
        <IconButton
          onClick={stopRecording}
          aria-label="Finish recording"
          sx={{
            minWidth: 48, minHeight: 48, width: 48, height: 48,
            backgroundColor: 'success.main',
            color: 'white',
            '&:hover': { backgroundColor: 'success.dark' },
          }}
        >
          <Send />
        </IconButton>
      </Box>

      {/* Paused indicator */}
      {isPaused && (
        <Box sx={{ mt: 1, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Recording paused
          </Typography>
        </Box>
      )}

      {/* Time limit warning */}
      {showTimeLimitWarning && !isPaused && (
        <Box sx={{ mt: 1, textAlign: 'center' }}>
          <Typography variant="caption" color="warning.main">
            Recording will stop at 5 minutes
          </Typography>
        </Box>
      )}
    </Box>
  );
}
