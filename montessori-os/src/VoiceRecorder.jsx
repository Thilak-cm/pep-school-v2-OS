import React, { useState, useRef, useEffect } from 'react';
import { transcribeAudio, validateAudioForTranscription } from './speechToText';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Paper,
  Divider
} from '@mui/material';
import {
  Mic,
  Stop,
  PlayArrow,
  Pause,
  Refresh,
  ContentCopy,
  CheckCircle,
  Error,
  Warning
} from '@mui/icons-material';

const VoiceRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const audioChunksRef = useRef([]);

  const MAX_RECORDING_TIME = 30; // 30 seconds

  useEffect(() => {
    // Cleanup function
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      // Request microphone access with specific constraints
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      
      // Get supported MIME types
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : 'audio/mp4';
      
      // Create MediaRecorder instance with proper MIME type
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      
      console.log('MediaRecorder created with MIME type:', mimeType);
      console.log('MediaRecorder state:', mediaRecorderRef.current.state);

      // Handle data available event
      mediaRecorderRef.current.ondataavailable = (event) => {
        console.log('Data available:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle stop event
      mediaRecorderRef.current.onstop = () => {
        // Use the actual MIME type from MediaRecorder or default to webm
        const mimeType = mediaRecorderRef.current.mimeType || 'audio/webm;codecs=opus';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        console.log('Recording stopped:', {
          mimeType,
          blobSize: audioBlob.size,
          chunksCount: audioChunksRef.current.length,
          audioUrl
        });
        
        setAudioBlob(audioBlob);
        setAudioUrl(audioUrl);
        
        // Automatically start transcription
        handleTranscription(audioBlob);
        
        // Stop all audio tracks
        stream.getTracks().forEach(track => track.stop());
      };

      // Start recording
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prevTime) => {
          const newTime = prevTime + 1;
          
          // Auto-stop at 30 seconds
          if (newTime >= MAX_RECORDING_TIME) {
            stopRecording();
            return MAX_RECORDING_TIME;
          }
          
          return newTime;
        });
      }, 1000);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Error accessing microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const playAudio = () => {
    if (audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const resetRecording = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setIsPlaying(false);
    setTranscription('');
    setTranscriptionError('');
  };

  const handleTranscription = async (audioBlob) => {
    if (!validateAudioForTranscription(audioBlob)) {
      setTranscriptionError('Audio file is not suitable for transcription.');
      return;
    }

    setIsTranscribing(true);
    setTranscriptionError('');

    try {
      const transcribedText = await transcribeAudio(audioBlob);
      setTranscription(transcribedText);
      
      if (!transcribedText) {
        setTranscriptionError('No speech detected in the recording.');
      }
    } catch (error) {
      console.error('Transcription failed:', error);
      setTranscriptionError(`Transcription failed: ${error.message}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card
      sx={{
        maxWidth: '100%',
        width: '100%',
        borderRadius: '16px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e2e8f0',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <CardContent sx={{ pb: 2, textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
        <Typography
          variant="h6"
          component="h3"
          sx={{
            margin: '0 0 8px 0',
            color: '#1e293b',
            fontWeight: '600'
          }}
        >
          Voice Recorder
        </Typography>
        <Typography
          variant="body2"
          sx={{
            margin: 0,
            color: '#64748b',
            fontSize: '0.9rem'
          }}
        >
          Record up to 30 seconds of audio
        </Typography>
      </CardContent>
      
      {/* Recording Status */}
      <Box
        sx={{
          padding: 3,
          textAlign: 'center',
          backgroundColor: isRecording ? '#fef3f2' : '#f8fafc'
        }}
      >
        <Typography
          variant="h3"
          sx={{
            fontSize: '2rem',
            fontWeight: '700',
            color: isRecording ? '#dc2626' : '#1e293b',
            marginBottom: '12px',
            fontFamily: 'monospace'
          }}
        >
          {formatTime(recordingTime)} / {formatTime(MAX_RECORDING_TIME)}
        </Typography>
        
        {/* Recording Indicator */}
        {isRecording && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              marginBottom: 2
            }}
          >
            <Box
              sx={{
                width: '12px',
                height: '12px',
                backgroundColor: '#dc2626',
                borderRadius: '50%',
                animation: 'pulse 2s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%, 100%': {
                    opacity: 1,
                    transform: 'scale(1)',
                  },
                  '50%': {
                    opacity: 0.5,
                    transform: 'scale(1.1)',
                  },
                },
              }}
            />
            <Typography
              sx={{
                color: '#dc2626',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}
            >
              Recording...
            </Typography>
          </Box>
        )}

        {/* Recording Controls */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: 1.5
          }}
        >
          {!isRecording ? (
            <Button
              variant="contained"
              onClick={startRecording}
              startIcon={<Mic />}
              sx={{
                backgroundColor: '#4f46e5',
                color: 'white',
                padding: '16px 32px',
                fontSize: '1rem',
                fontWeight: '600',
                borderRadius: '12px',
                boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1)',
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: '#4338ca',
                  transform: 'translateY(-1px)',
                },
                transition: 'all 0.2s ease'
              }}
            >
              Start Recording
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={stopRecording}
              startIcon={<Stop />}
              sx={{
                backgroundColor: '#dc2626',
                color: 'white',
                padding: '16px 32px',
                fontSize: '1rem',
                fontWeight: '600',
                borderRadius: '12px',
                boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1)',
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: '#b91c1c',
                  transform: 'translateY(-1px)',
                },
                transition: 'all 0.2s ease'
              }}
            >
              Stop Recording
            </Button>
          )}
        </Box>
      </Box>

      {/* Audio Playback */}
      {audioUrl && (
        <Box
          sx={{
            padding: 3,
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #e2e8f0'
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 2
            }}
          >
            <Typography
              variant="h6"
              component="h4"
              sx={{
                margin: 0,
                color: '#1e293b',
                fontSize: '1rem',
                fontWeight: '600'
              }}
            >
              Recorded Audio
            </Typography>
            <Chip
              label={`${audioBlob ? (audioBlob.size / 1024).toFixed(1) : 0} KB`}
              size="small"
              sx={{
                backgroundColor: '#e2e8f0',
                color: '#64748b',
                fontSize: '0.875rem'
              }}
            />
          </Box>
          
          <audio 
            ref={audioRef}
            src={audioUrl}
            onEnded={() => setIsPlaying(false)}
            style={{ 
              width: '100%', 
              marginBottom: '16px',
              borderRadius: '8px'
            }}
            controls
          />
          
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}
          >
            <Button
              variant="contained"
              onClick={playAudio}
              disabled={isPlaying}
              startIcon={<PlayArrow />}
              size="small"
              sx={{
                backgroundColor: isPlaying ? '#e2e8f0' : '#059669',
                color: isPlaying ? '#64748b' : 'white',
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: isPlaying ? '#e2e8f0' : '#047857',
                },
                '&:disabled': {
                  backgroundColor: '#e2e8f0',
                  color: '#64748b'
                }
              }}
            >
              Play
            </Button>
            
            <Button
              variant="contained"
              onClick={stopAudio}
              disabled={!isPlaying}
              startIcon={<Pause />}
              size="small"
              sx={{
                backgroundColor: !isPlaying ? '#e2e8f0' : '#f59e0b',
                color: !isPlaying ? '#64748b' : 'white',
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: !isPlaying ? '#e2e8f0' : '#d97706',
                },
                '&:disabled': {
                  backgroundColor: '#e2e8f0',
                  color: '#64748b'
                }
              }}
            >
              Stop
            </Button>
            
            <Button
              variant="contained"
              onClick={resetRecording}
              startIcon={<Refresh />}
              size="small"
              sx={{
                backgroundColor: '#64748b',
                color: 'white',
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: '#475569',
                }
              }}
            >
              Reset
            </Button>
          </Box>
        </Box>
      )}

      {/* Transcription Section */}
      {(audioUrl || isTranscribing || transcription || transcriptionError) && (
        <Box
          sx={{
            padding: 3,
            backgroundColor: '#f0f9ff',
            borderTop: '1px solid #e2e8f0'
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 2
            }}
          >
            <Typography
              variant="h6"
              component="h4"
              sx={{
                margin: 0,
                color: '#1e293b',
                fontSize: '1rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}
            >
              <CheckCircle sx={{ fontSize: 16 }} />
              Transcription
            </Typography>
            {isTranscribing && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  color: '#059669',
                  fontSize: '0.875rem'
                }}
              >
                <CircularProgress size={12} sx={{ color: '#059669' }} />
                Processing...
              </Box>
            )}
          </Box>

          {/* Transcription Content */}
          {isTranscribing && (
            <Paper
              sx={{
                padding: 2,
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                textAlign: 'center',
                color: '#64748b'
              }}
            >
              Converting speech to text...
            </Paper>
          )}

          {transcriptionError && (
            <Alert
              severity="error"
              icon={<Error />}
              sx={{
                marginBottom: 2,
                '& .MuiAlert-message': {
                  fontSize: '0.875rem'
                }
              }}
            >
              {transcriptionError}
            </Alert>
          )}

          {transcription && !isTranscribing && !transcriptionError && (
            <Paper
              sx={{
                padding: 2,
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                marginBottom: 2
              }}
            >
              <Typography
                sx={{
                  color: '#1e293b',
                  fontSize: '0.875rem',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}
              >
                {transcription}
              </Typography>
            </Paper>
          )}

          {/* Transcription Actions */}
          {transcription && !isTranscribing && (
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                justifyContent: 'center',
                flexWrap: 'wrap'
              }}
            >
              <Button
                variant="contained"
                onClick={() => navigator.clipboard.writeText(transcription)}
                startIcon={<ContentCopy />}
                size="small"
                sx={{
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: '#4338ca',
                  }
                }}
              >
                Copy Text
              </Button>
              
              <Button
                variant="contained"
                onClick={() => handleTranscription(audioBlob)}
                startIcon={<Refresh />}
                size="small"
                sx={{
                  backgroundColor: '#059669',
                  color: 'white',
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: '#047857',
                  }
                }}
              >
                Retry
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Card>
  );
};

export default VoiceRecorder; 