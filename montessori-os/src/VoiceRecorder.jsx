import React, { useState, useRef, useEffect } from 'react';
import useNotify from './notifications/useNotify.js';
import { transcribeAudio, translateAudioToEnglish, validateAudioForTranscription } from './whisperSTT';
import { cleanUpText, localCleanupFallback } from './textCleanup';
import { db } from './firebase';
import { trackEvent, lengthBucket } from './utils/analytics';
import { collection, getDocs } from 'firebase/firestore';
import FeatureTag from './components/FeatureTag';
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
  Divider,
  Dialog,
  LinearProgress,
  TextField,
  Tooltip
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
  Warning,
  Close,
  InfoOutlined,
  Delete,
  Edit,
  ArrowForward,
  AutoFixHigh
} from '@mui/icons-material';
import Popover from '@mui/material/Popover';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';

const VoiceRecorder = ({ onSave, onNext }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [transcriptionData, setTranscriptionData] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState('');
  const [showTimeLimitWarning, setShowTimeLimitWarning] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState({ current: 0, total: 0, message: '' });
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editableText, setEditableText] = useState('');
  const [originalTranscription, setOriginalTranscription] = useState('');
  
  // AI polish state
  const [cleaning, setCleaning] = useState(false);
  const [cleanedOnce, setCleanedOnce] = useState(false);
  const [prevTranscription, setPrevTranscription] = useState('');
  
  // Confirmation dialog state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // Language override popover
  const [langAnchorEl, setLangAnchorEl] = useState(null);
  // Required spoken language selection
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [languageRequiredError, setLanguageRequiredError] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const audioChunksRef = useRef([]);

  const MAX_RECORDING_TIME = 300; // 5 minutes (300 seconds)

  useEffect(() => {
    // Cleanup function
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const notify = useNotify();

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
      
      // Get supported MIME types - prefer MP3 for OpenAI Whisper
      const mimeType = MediaRecorder.isTypeSupported('audio/mp3') 
        ? 'audio/mp3' 
        : MediaRecorder.isTypeSupported('audio/mpeg') 
        ? 'audio/mpeg'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
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
      setShowTimeLimitWarning(false);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prevTime) => {
          const newTime = prevTime + 1;
          
          // Show warning at 4:45 (285 seconds)
          if (newTime === 285) {
            setShowTimeLimitWarning(true);
          }
          
          // Auto-stop at 5 minutes
          if (newTime >= MAX_RECORDING_TIME) {
            stopRecording();
            notify.info('Recording stopped at 5 minutes. Transcribing…', { id: 'record-autostop', duration: 4000 });
            return MAX_RECORDING_TIME;
          }
          
          return newTime;
        });
      }, 1000);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      
      // Handle specific permission errors
      if (error.name === 'NotAllowedError') {
        notify.error('Microphone access denied. Enable mic in browser settings.', { id: 'mic-permission', duration: 4500 });
      } else if (error.name === 'NotFoundError') {
        notify.error('No microphone found. Please connect a microphone.', { id: 'mic-not-found', duration: 4500 });
      } else {
        notify.error(`Error accessing microphone: ${error.message}`, { id: 'mic-generic', duration: 4500 });
      }
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
    setTranscriptionData(null);
    setTranscriptionError('');
    setShowTimeLimitWarning(false);
    setTranscriptionProgress({ current: 0, total: 0, message: '' });
    
    // Reset edit mode state
    setIsEditing(false);
    setEditableText('');
    setOriginalTranscription('');
  };

  const retryTranscription = () => {
    if (audioBlob) {
      setTranscriptionError('');
      setTranscription('');
      setTranscriptionData(null);
      setTranscriptionProgress({ current: 0, total: 0, message: '' });
      handleTranscription(audioBlob);
    }
  };

  const startEditing = () => {
    setOriginalTranscription(transcription);
    setEditableText(transcription);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setShowCancelConfirm(true);
  };

  const confirmCancelEdit = () => {
    setIsEditing(false);
    setEditableText('');
    setOriginalTranscription('');
    setShowCancelConfirm(false);
  };

  const dismissCancelConfirm = () => {
    setShowCancelConfirm(false);
  };

  const saveEditing = () => {
    if (!editableText.trim()) {
      return; // Don't save empty text
    }
    setTranscription(editableText.trim());
    setIsEditing(false);
    setEditableText('');
    setOriginalTranscription('');
  };

  // Map language codes/names to simple display names
  const languageName = (code) => {
    if (!code) return null;
    const v = String(code).toLowerCase();
    const base = v.includes('-') ? v.split('-')[0] : v;
    const map = { en: 'English', hi: 'Hindi', ta: 'Tamil', kn: 'Kannada', te: 'Telugu' };
    if (map[base]) return map[base];
    if (['english','hindi','tamil','kannada','telugu'].includes(base)) {
      return base.charAt(0).toUpperCase() + base.slice(1);
    }
    return code;
  };

  const handleSave = () => {
    // Only allow save if transcription is complete and successful
    if (!selectedLanguage) {
      setLanguageRequiredError(true);
      return;
    }
    if (onSave && transcription && !isTranscribing && !transcriptionError && transcriptionData) {
      // Pass simplified transcription data (OpenAI Whisper format)
      onSave({
        text: transcription,
        duration: recordingTime,
        // Store user-selected spoken language (required)
        languageCode: selectedLanguage,
        inputLanguage: selectedLanguage,
        spokenLanguage: selectedLanguage,
        timestamp: new Date(),
        sttProvider: 'OpenAI Whisper'
      });
    }
  };

  const handleTranscription = async (audioBlob) => {
    if (!validateAudioForTranscription(audioBlob)) {
      setTranscriptionError('Audio file is not suitable for transcription.');
      return;
    }

    setIsTranscribing(true);
    setTranscriptionError('');
          setTranscriptionProgress({ current: 0, total: 1, message: 'Starting OpenAI Whisper transcription...' });

    try {
      // Use OpenAI Whisper translation-to-English (auto language detection)
      const transcriptionResult = await translateAudioToEnglish(audioBlob);
      
      setTranscriptionData(transcriptionResult);
      setTranscription(transcriptionResult.text);
      
      if (!transcriptionResult.text) {
        setTranscriptionError('No speech detected in the recording.');
      }
      
      // OpenAI Whisper handles long audio natively - no chunking needed
      console.log('Translation to English completed with OpenAI Whisper');
      
    } catch (error) {
      console.error('Transcription failed:', error);
      setTranscriptionError(`Transcription failed: ${error.message}`);
      notify.error('Transcription failed. Please try again.', { id: 'stt-failed', duration: 4000 });
    } finally {
      setIsTranscribing(false);
      setTranscriptionProgress({ current: 0, total: 0, message: '' });
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
        {(!isRecording && !audioUrl && !transcription) && (
          <Box sx={{ mt: 0.5 }}>
            <FeatureTag flag="voiceToText" size="sm" />
            <Typography
              variant="body1"
              sx={{
                mt: 1.2,
                color: '#0f172a'
              }}
            >
              Speak your heart out in English, Tamil, Kannada, Telugu or Hindi — ChatGPT will auto‑translate, clean up and polish your speech.
            </Typography>
          </Box>
        )}
      </CardContent>

      {/* Recording Controls - Show immediately if no audio recorded yet */}
      {!audioUrl && (
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

          {/* Time Limit Warning */}
          {showTimeLimitWarning && isRecording && (
            <Alert 
              severity="warning" 
              sx={{ 
                mb: 2,
                borderRadius: 2,
                '& .MuiAlert-message': {
                  fontSize: '0.9rem'
                }
              }}
            >
              Recording will stop automatically in 15 seconds. Please finish your observation.
            </Alert>
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
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
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
          </Box>

          {/* Transcription Content */}
          {isTranscribing && (
            <Paper
              sx={{
                padding: 3,
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                textAlign: 'center',
                color: '#64748b'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 2 }}>
                <CircularProgress size={20} sx={{ color: '#059669' }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  Converting speech to text...
                </Typography>
              </Box>
              
              {/* Show chunking info if available */}
              {transcriptionData?.chunkCount > 1 && (
                <Box sx={{ mb: 2, p: 2, backgroundColor: '#f8fafc', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    Transcribing in progress...
                  </Typography>
                  {transcriptionProgress.total > 0 && (
                    <LinearProgress 
                      variant="determinate" 
                      value={(transcriptionProgress.current / transcriptionProgress.total) * 100} 
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  )}
                </Box>
              )}
              
              {/* Show fallback info if chunking failed */}
              {transcriptionData?.fallbackUsed && (
                <Box sx={{ mb: 2, p: 2, backgroundColor: '#fef3c7', borderRadius: 1, border: '1px solid #fbbf24' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Warning sx={{ fontSize: 14, color: '#f59e0b' }} />
                    Transcribing in progress...
                  </Typography>
                  {transcriptionProgress.total > 0 && (
                    <LinearProgress 
                      variant="determinate" 
                      value={(transcriptionProgress.current / transcriptionProgress.total) * 100} 
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  )}
                </Box>
              )}
              
              {/* Show general progress for all transcriptions */}
              {transcriptionProgress.message && !transcriptionData?.chunkCount && !transcriptionData?.fallbackUsed && (
                <Box sx={{ mb: 2, p: 2, backgroundColor: '#f8fafc', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    Transcribing in progress...
                  </Typography>
                  {transcriptionProgress.total > 0 && (
                    <LinearProgress 
                      variant="determinate" 
                      value={(transcriptionProgress.current / transcriptionProgress.total) * 100} 
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  )}
                </Box>
              )}
              
              <Typography variant="caption" color="text.secondary">
                This may take a few seconds
              </Typography>
            </Paper>
          )}

          {transcriptionError && (
            <>
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
              <Box sx={{ textAlign: 'center', mb: 2 }}>
                <Button
                  variant="contained"
                  onClick={retryTranscription}
                  startIcon={<Refresh />}
                  size="small"
                  sx={{
                    backgroundColor: '#dc2626',
                    color: 'white',
                    textTransform: 'none',
                    mr: 1,
                    '&:hover': {
                      backgroundColor: '#b91c1c',
                    }
                  }}
                >
                  Retry Transcription
                </Button>
                <Button
                  variant="outlined"
                  onClick={resetRecording}
                  startIcon={<Refresh />}
                  size="small"
                  sx={{
                    borderColor: '#64748b',
                    color: '#64748b',
                    textTransform: 'none',
                    '&:hover': {
                      borderColor: '#475569',
                      color: '#475569',
                    }
                  }}
                >
                  Record Again
                </Button>
              </Box>
            </>
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
              {isEditing ? (
                <TextField
                  multiline
                  rows={4}
                  fullWidth
                  value={editableText}
                  onChange={(e) => setEditableText(e.target.value)}
                  variant="outlined"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 1,
                    }
                  }}
                />
              ) : (
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
              )}
            </Paper>
          )}

          {/* Spoken Language selector - required */}
          {transcription && !isTranscribing && !transcriptionError && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                Spoken language
              </Typography>
              <TextField
                select
                size="small"
                value={selectedLanguage}
                onChange={(e) => { setSelectedLanguage(e.target.value); setLanguageRequiredError(false); }}
                sx={{ minWidth: 160, backgroundColor: 'white' }}
              >
                <MenuItem value="en">English</MenuItem>
                <MenuItem value="hi">Hindi</MenuItem>
                <MenuItem value="ta">Tamil</MenuItem>
                <MenuItem value="te">Telugu</MenuItem>
                <MenuItem value="kn">Kannada</MenuItem>
              </TextField>
              <Typography variant="caption" color="text.secondary">
                Text is translated to English
              </Typography>
              {languageRequiredError && (
                <Typography variant="caption" color="error" sx={{ ml: 1 }}>
                  Please select a language
                </Typography>
              )}
            </Box>
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
              {isEditing ? (
                <>
                  <Button
                    variant="contained"
                    color="error"
                    onClick={cancelEditing}
                    startIcon={<Close />}
                    size="small"
                    sx={{
                      backgroundColor: '#dc2626',
                      color: 'white',
                      textTransform: 'none',
                      '&:hover': {
                        backgroundColor: '#b91c1c',
                      }
                    }}
                  >
                    Cancel Edit
                  </Button>
                  
                  <Button
                    variant="contained"
                    color="success"
                    onClick={saveEditing}
                    startIcon={<CheckCircle />}
                    size="small"
                    disabled={!editableText.trim()}
                    sx={{
                      backgroundColor: editableText.trim() ? '#059669' : '#cbd5e1',
                      color: 'white',
                      textTransform: 'none',
                      '&:hover': {
                        backgroundColor: editableText.trim() ? '#047857' : '#cbd5e1',
                      }
                    }}
                  >
                    Save Edit
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outlined"
                    onClick={resetRecording}
                    startIcon={<Refresh />}
                    size="small"
                    sx={{
                      borderColor: '#64748b',
                      color: '#64748b',
                      textTransform: 'none',
                      '&:hover': {
                        borderColor: '#475569',
                        color: '#475569',
                      }
                    }}
                  >
                    Record Again
                  </Button>
                  <Tooltip title={cleanedOnce ? 'Already polished' : 'Polish with AI: grammar and structure — no length changes'}>
                    <span>
                      <Button
                        variant="contained"
                        onClick={async () => {
                          if (!transcription || cleaning || cleanedOnce) return;
                          try {
                            // Count click attempt
                            trackEvent('polish_click', {
                              source: 'voice',
                              component: 'VoiceRecorder',
                              length_bucket: lengthBucket(transcription.length),
                            });
                            const t0 = performance.now();
                            setCleaning(true);
                            setPrevTranscription(transcription);
                            const refined = await cleanUpText(transcription).catch(() => null);
                            const out = (refined || localCleanupFallback(transcription)).trim();
                            setTranscription(out);
                            setCleanedOnce(true);
                            const dt = Math.round(performance.now() - t0);
                            trackEvent('polish_success', {
                              source: 'voice',
                              component: 'VoiceRecorder',
                              length_bucket: lengthBucket(transcription.length),
                              latency_ms: dt,
                            });
                          } catch (e) {
                            console.error('Cleanup error:', e);
                            trackEvent('polish_error', {
                              source: 'voice',
                              component: 'VoiceRecorder',
                              length_bucket: lengthBucket(transcription.length),
                              error: 'cleanup_failed',
                            });
                          } finally {
                            setCleaning(false);
                          }
                        }}
                        startIcon={cleaning ? <CircularProgress size={16} color="inherit" /> : <AutoFixHigh />}
                        size="small"
                        disabled={!transcription || cleaning || cleanedOnce}
                        sx={{
                          backgroundImage: 'linear-gradient(90deg, #7c3aed, #db2777)',
                          color: 'white',
                          textTransform: 'none',
                          boxShadow: '0 6px 14px rgba(124, 58, 237, 0.35)',
                          '&:hover': {
                            backgroundImage: 'linear-gradient(90deg, #6d28d9, #be185d)',
                            boxShadow: '0 8px 18px rgba(190, 24, 93, 0.35)'
                          },
                          '&.Mui-disabled': {
                            backgroundImage: 'none',
                            backgroundColor: '#e2e8f0',
                            color: '#64748b',
                            boxShadow: 'none'
                          }
                        }}
                      >
                        {cleanedOnce ? 'Polished' : (cleaning ? 'Polishing…' : 'Polish with AI')}
                      </Button>
                    </span>
                  </Tooltip>
                  {cleanedOnce && prevTranscription && (
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => {
                        setTranscription(prevTranscription);
                        setPrevTranscription('');
                        setCleanedOnce(false);
                        trackEvent('polish_undo', {
                          source: 'voice',
                          component: 'VoiceRecorder',
                          length_bucket: lengthBucket(prevTranscription.length),
                        });
                      }}
                      sx={{ color: '#64748b' }}
                    >
                      Undo
                    </Button>
                  )}
                  
                  <Button
                    variant="contained"
                    onClick={startEditing}
                    startIcon={<Edit />}
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
                    Edit Text
                  </Button>
                </>
              )}
            </Box>
          )}

          {/* Recording complete - ready for next step */}
          {transcription && !isTranscribing && !transcriptionError && (
            <Box sx={{ mt: 3, textAlign: 'center' }}>
              {onNext && (
                <Button
                  variant="contained"
                  onClick={() => {
                    handleSave(); // Save transcription data
                    onNext(); // Move to next step
                  }}
                  endIcon={<ArrowForward />}
                  sx={{
                    backgroundColor: '#4f46e5',
                    color: 'white',
                    padding: '12px 24px',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    borderRadius: '8px',
                    textTransform: 'none',
                    '&:hover': {
                      backgroundColor: '#4338ca',
                    }
                  }}
                  disabled={!selectedLanguage}
                >
                  Select Students
                </Button>
              )}
            </Box>
          )}
        </Box>
      )}

      {/* Confirmation Dialog for Cancel Edit */}
      <Dialog
        open={showCancelConfirm}
        onClose={dismissCancelConfirm}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            maxWidth: 343,
            width: 'calc(100% - 32px)',
            mx: 'auto'
          }
        }}
      >
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ mb: 2, color: '#1e293b' }}>
            Cancel Edit?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Are you sure you want to cancel edit? All changes will be discarded!
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button
              variant="outlined"
              onClick={dismissCancelConfirm}
              sx={{
                borderColor: '#64748b',
                color: '#64748b',
                textTransform: 'none',
                '&:hover': {
                  borderColor: '#475569',
                  color: '#475569',
                }
              }}
            >
              Keep Editing
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={confirmCancelEdit}
              sx={{
                backgroundColor: '#dc2626',
                color: 'white',
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: '#b91c1c',
                }
              }}
            >
              Discard Changes
            </Button>
          </Box>
        </Box>
      </Dialog>
    </Card>
  );
};

const VoiceRecorderWrapper = (props) => {
  // If dialog prop is true, render inside a Dialog
  if (props.dialog) {
    const { open, onClose, onSave, DialogProps = {}, ...rest } = props;
    const handleSave = (blob, duration) => {
      if (onSave) onSave(blob, duration);
      if (onClose) onClose();
    };
    // Always show close button by default for consistency
    const showCloseButton = DialogProps.showCloseButton !== false;
    const closeButtonSx = DialogProps.closeButtonSx || { 
      position: 'absolute', 
      top: 12, 
      right: 12, 
      color: '#1e293b', 
      '&:hover': { backgroundColor: '#f1f5f9' },
      zIndex: 2
    };
    const closeIconSx = DialogProps.closeIconSx || { fontSize: 28 };
    return (
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            maxWidth: 343,
            width: 'calc(100% - 32px)',
            mx: 'auto',
            borderRadius: 3,
            ...((DialogProps.PaperProps && DialogProps.PaperProps.sx) || {})
          },
          ...((DialogProps && DialogProps.PaperProps) || {})
        }}
        {...DialogProps}
      >
        <Box sx={{ position: 'relative', pt: 5 }}>
          {showCloseButton && (
            <IconButton
              aria-label="Close"
              onClick={onClose}
              sx={closeButtonSx}
            >
              <Close sx={closeIconSx} />
            </IconButton>
          )}
          <VoiceRecorder onSave={handleSave} {...rest} />
        </Box>
      </Dialog>
    );
  }
  // Otherwise, render as normal
  return <VoiceRecorder {...props} />;
};

export default VoiceRecorderWrapper; 
