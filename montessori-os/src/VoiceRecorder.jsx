import React, { useState, useRef, useEffect } from 'react';
import useNotify from './notifications/useNotify.js';
import { transcribeAudio, translateAudioToEnglish, validateAudioForTranscription } from './whisperSTT';
import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';
import { cleanUpText } from './textCleanup';
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
  TextField
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
  ArrowBack,
  AutoFixHigh
} from '@mui/icons-material';
import Popover from '@mui/material/Popover';
import Checkbox from '@mui/material/Checkbox';
// MenuItem no longer needed (language selection removed)

const VoiceRecorder = ({
  onSave,
  onNext,
  onBack,
  onDirtyChange,
  exposeControls,
  variant = 'card',
  autoAdvanceOnSave = false,
  onTranscriptionStart,
  onTranscriptionError,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [transcriptionData, setTranscriptionData] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState('');
  const [showTimeLimitWarning, setShowTimeLimitWarning] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState({ current: 0, total: 0, message: '' });
  const [pauseReason, setPauseReason] = useState(null); // 'exit' | null
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editableText, setEditableText] = useState('');
  const [originalTranscription, setOriginalTranscription] = useState('');
  
  // Polish with AI state
  const [cleaning, setCleaning] = useState(false);
  const [cleanedOnce, setCleanedOnce] = useState(false);
  const [prevText, setPrevText] = useState('');
  
  // Confirmation dialog state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // Language selection removed to reduce clicks

  const mediaRecorderRef = useRef(null);
  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const audioChunksRef = useRef([]);
  const discardRef = useRef(false); // when true, discard audio on stop

  const MAX_RECORDING_TIME = 300; // 5 minutes (300 seconds)
  const autoAdvanceRef = useRef(false);

  useEffect(() => {
    // Cleanup function
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const notify = useNotify();

  const startTimer = () => {
    // Start or resume the recording timer
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
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Report dirty state to parent when any relevant state changes
  useEffect(() => {
    if (typeof onDirtyChange === 'function') {
      const dirty = (
        isRecording ||
        recordingTime > 0 ||
        !!audioBlob ||
        !!transcription ||
        isEditing
      );
      onDirtyChange(dirty);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, recordingTime, audioBlob, transcription, isEditing]);

  // Expose imperative controls to parent for pause/cancel
  useEffect(() => {
    if (typeof exposeControls === 'function') {
      exposeControls({
        pauseIfRecording: () => { if (isRecording && !isPaused) pauseRecording(); },
        pauseForExit: () => { if (isRecording && !isPaused) { setPauseReason('exit'); pauseRecording(); }},
        pauseRecording,
        resumeRecording,
        stopRecording,
        getState: () => ({ isRecording, isPaused }),
        cancelRecording: () => {
          try {
            if (mediaRecorderRef.current && isRecording) {
              discardRef.current = true;
              mediaRecorderRef.current.stop();
              setIsRecording(false);
              setIsPaused(false);
              setPauseReason(null);
              stopTimer();
            } else {
              resetRecording();
            }
          } catch (_) { /* no-op */ }
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, isPaused]);

  const startRecording = async () => {
    try {
      autoAdvanceRef.current = false;
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

      // Handle data available event
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle stop event
      mediaRecorderRef.current.onstop = () => {
        // Always stop all audio tracks
        try { stream.getTracks().forEach(track => track.stop()); } catch (_) {}

        // If discarding, skip blob creation and transcription
        if (discardRef.current) {
          audioChunksRef.current = [];
          discardRef.current = false;
          return;
        }

        // Use the actual MIME type from MediaRecorder or default to webm
        const mimeType = mediaRecorderRef.current.mimeType || 'audio/webm;codecs=opus';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        setAudioBlob(audioBlob);
        setAudioUrl(audioUrl);
        
        // Automatically start transcription
        handleTranscription(audioBlob);
      };

      // Start recording
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setIsPaused(false);
      setPauseReason(null);
      setRecordingTime(0);
      setShowTimeLimitWarning(false);

      // Start timer
      startTimer();

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
      setIsPaused(false);
      setPauseReason(null);
      stopTimer();
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused && typeof mediaRecorderRef.current.pause === 'function') {
      try {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        stopTimer();
      } catch (e) {
        console.error('Pause not supported in this browser:', e);
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused && typeof mediaRecorderRef.current.resume === 'function') {
      try {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        setPauseReason(null);
        startTimer();
      } catch (e) {
        console.error('Resume not supported in this browser:', e);
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
    autoAdvanceRef.current = false;
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setIsPlaying(false);
    setTranscription('');
    setTranscriptionData(null);
    setTranscriptionError('');
    setShowTimeLimitWarning(false);
    setTranscriptionProgress({ current: 0, total: 0, message: '' });
    setPauseReason(null);
    
    // Reset edit mode state
    setIsEditing(false);
    setEditableText('');
    setOriginalTranscription('');
    
    // Reset polish state
    setCleaning(false);
    setCleanedOnce(false);
    setPrevText('');
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
    // Reset polish state when entering edit mode
    setCleanedOnce(false);
    setPrevText('');
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
    const trimmedText = editableText.trim();
    setTranscription(trimmedText);
    // Update transcriptionData to keep it in sync
    if (transcriptionData) {
      setTranscriptionData({
        ...transcriptionData,
        text: trimmedText
      });
    }
    setIsEditing(false);
    setEditableText('');
    setOriginalTranscription('');
    // Reset polish state when editing manually
    setCleanedOnce(false);
    setPrevText('');
  };

  const handleCleanUp = async () => {
    const textToClean = isEditing ? editableText : transcription;
    if (!textToClean.trim() || cleaning || cleanedOnce) return;
    try {
      setCleaning(true);
      setPrevText(textToClean);
      const refined = await cleanUpText(textToClean).catch(() => null);
      if (refined) {
        const cleanedText = String(refined).trim();
        if (isEditing) {
          setEditableText(cleanedText);
        } else {
          setTranscription(cleanedText);
          // Update transcriptionData to keep it in sync
          if (transcriptionData) {
            setTranscriptionData({
              ...transcriptionData,
              text: cleanedText
            });
          }
        }
        setCleanedOnce(true);
      } else {
        setCleanedOnce(false);
      }
    } catch (e) {
      console.error('Cleanup error:', e);
      setCleanedOnce(false);
      notify.error('Failed to polish text. Please try again.');
    } finally {
      setCleaning(false);
    }
  };

  const handleUndoClean = () => {
    if (!prevText) return;
    if (isEditing) {
      setEditableText(prevText);
    } else {
      setTranscription(prevText);
      // Update transcriptionData to keep it in sync
      if (transcriptionData) {
        setTranscriptionData({
          ...transcriptionData,
          text: prevText
        });
      }
    }
    setPrevText('');
    setCleanedOnce(false);
  };

  // Language selection/labels removed

  const handleSave = () => {
    // Allow save once transcription is complete and successful
    if (onSave && transcription && !isTranscribing && !transcriptionError && transcriptionData) {
      // Pass simplified transcription data without language fields
      onSave({
        text: transcription,
        duration: recordingTime,
        timestamp: new Date(),
        sttProvider: 'OpenAI Whisper'
      });
    }
  };

  useEffect(() => {
    if (!autoAdvanceOnSave) return;
    if (autoAdvanceRef.current) return;
    if (isTranscribing || transcriptionError) return;
    if (!transcription || !transcriptionData) return;
    autoAdvanceRef.current = true;
    handleSave();
    if (onNext) onNext();
  }, [autoAdvanceOnSave, isTranscribing, transcription, transcriptionData, transcriptionError, onNext]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTranscription = async (audioBlob) => {
    if (!validateAudioForTranscription(audioBlob)) {
      setTranscriptionError('Audio file is not suitable for transcription.');
      if (onTranscriptionError) onTranscriptionError(new Error('invalid_audio'));
      return;
    }

    setIsTranscribing(true);
    setTranscriptionError('');
          setTranscriptionProgress({ current: 0, total: 1, message: 'Starting OpenAI Whisper transcription...' });
    if (onTranscriptionStart) onTranscriptionStart();

    try {
      // Use OpenAI Whisper translation-to-English (auto language detection)
      const transcriptionResult = await translateAudioToEnglish(audioBlob);
      
      setTranscriptionData(transcriptionResult);
      setTranscription(transcriptionResult.text);
      
      if (!transcriptionResult.text) {
        setTranscriptionError('No speech detected in the recording.');
        if (onTranscriptionError) onTranscriptionError(new Error('no_transcript'));
      }
      
    } catch (error) {
      console.error('Transcription failed:', error);
      setTranscriptionError(`Transcription failed: ${error.message}`);
      notify.error('Transcription failed. Please try again.', { id: 'stt-failed', duration: 4000 });
      if (onTranscriptionError) onTranscriptionError(error);
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
        borderRadius: variant === 'card' ? '16px' : 0,
        boxShadow: variant === 'card' ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none',
        border: variant === 'card' ? '1px solid #e2e8f0' : 'none',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: 'transparent',
      }}
    >
      {/* Top-left back button within the recorder card */}
      {onBack && (
        <IconButton
          onClick={onBack}
          aria-label="Go back"
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            color: '#64748b',
            zIndex: 2,
            '&:hover': { backgroundColor: 'rgba(100, 116, 139, 0.08)' }
          }}
        >
          <ArrowBack />
        </IconButton>
      )}
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
        {/* Removed new feature pill (feature is no longer new) */}
        {(!isRecording && !audioUrl && !transcription) && (
          <Typography
            variant="body1"
            sx={{
              mt: 1.2,
              color: '#0f172a'
            }}
          >
            Speak your heart out in{' '}
            <Box component="span" sx={{ color: 'primary.main', fontWeight: 600, display: 'inline' }}>
              English
            </Box>
            ,{' '}
            <Box component="span" sx={{ color: 'primary.main', fontWeight: 600, display: 'inline' }}>
              Tamil
            </Box>
            ,{' '}
            <Box component="span" sx={{ color: 'primary.main', fontWeight: 600, display: 'inline' }}>
              Kannada
            </Box>
            ,{' '}
            <Box component="span" sx={{ color: 'primary.main', fontWeight: 600, display: 'inline' }}>
              Malayalam
            </Box>
            ,{' '}
            <Box component="span" sx={{ color: 'primary.main', fontWeight: 600, display: 'inline' }}>
              Telugu
            </Box>
            {' or '},
            <Box component="span" sx={{ color: 'primary.main', fontWeight: 600, display: 'inline' }}>
              Hindi
            </Box>
            {' (or all together too) — ChatGPT will auto‑translate, clean up and polish your speech!'}
          </Typography>
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
                  backgroundColor: isPaused ? '#94a3b8' : '#dc2626',
                  borderRadius: '50%',
                  animation: isPaused ? 'none' : 'pulse 2s ease-in-out infinite',
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
                  color: isPaused ? '#64748b' : '#dc2626',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                {isPaused ? 'Paused' : 'Recording...'}
              </Typography>
            </Box>
          )}

          {/* Time Limit Warning */}
          {showTimeLimitWarning && isRecording && !isPaused && (
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

          {/* Paused notice triggered by exit flow */}
          {isRecording && isPaused && pauseReason === 'exit' && (
            <Alert
              severity="info"
              sx={{ mb: 2, borderRadius: 2, '& .MuiAlert-message': { fontSize: '0.85rem' } }}
            >
              Voice note paused because you started to exit. Don't forget to resume before you resume talking!
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
              <>
                {/* Pause/Resume button (if supported) */}
                {mediaRecorderRef.current && typeof mediaRecorderRef.current.pause === 'function' && typeof mediaRecorderRef.current.resume === 'function' && (
                  isPaused ? (
                    <Button
                      variant="contained"
                      onClick={resumeRecording}
                      startIcon={<PlayArrow />}
                      sx={{
                        backgroundColor: '#0ea5e9',
                        color: 'white',
                        padding: '12px 24px',
                        fontSize: '1rem',
                        fontWeight: '600',
                        borderRadius: '12px',
                        boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1)',
                        textTransform: 'none',
                        '&:hover': {
                          backgroundColor: '#0284c7',
                          transform: 'translateY(-1px)',
                        },
                        transition: 'all 0.2s ease'
                      }}
                    >
                      Resume
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      onClick={pauseRecording}
                      startIcon={<Pause />}
                      sx={{
                        borderColor: '#64748b',
                        color: '#64748b',
                        padding: '12px 24px',
                        fontSize: '1rem',
                        fontWeight: '600',
                        borderRadius: '12px',
                        textTransform: 'none',
                        '&:hover': {
                          borderColor: '#475569',
                          color: '#475569',
                          transform: 'translateY(-1px)',
                        },
                        transition: 'all 0.2s ease'
                      }}
                    >
                      Pause
                    </Button>
                  )
                )}

                {/* Stop button */}
                <Button
                  variant="contained"
                  onClick={stopRecording}
                  startIcon={<Stop />}
                  sx={{
                    backgroundColor: '#dc2626',
                    color: 'white',
                    padding: '12px 24px',
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
                  Stop
                </Button>
              </>
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
              }}
            >
              {/* Show progress bar if we have determinate progress */}
              {transcriptionProgress.total > 0 && transcriptionProgress.current > 0 ? (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#1e293b' }}>
                      Converting speech to text...
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {transcriptionProgress.current}/{transcriptionProgress.total}
                    </Typography>
                  </Box>
                  <LinearProgress 
                    variant="determinate" 
                    value={(transcriptionProgress.current / transcriptionProgress.total) * 100} 
                    sx={{ 
                      height: 8, 
                      borderRadius: 4,
                      backgroundColor: '#e2e8f0',
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: '#059669'
                      }
                    }}
                  />
                </Box>
              ) : (
                /* Show spinner if no determinate progress */
                <Box sx={{ textAlign: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 1 }}>
                    <CircularProgress size={20} sx={{ color: '#059669' }} />
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#1e293b' }}>
                      Converting speech to text...
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    This may take a few seconds
                  </Typography>
                </Box>
              )}
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

          {/* Spoken language selection removed */}

          {/* Transcription Actions */}
          {transcription && !isTranscribing && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2
              }}
            >
              {/* Polish with AI button row */}
              {!isEditing && (
                <Box
                  sx={{
                    display: 'flex',
                    gap: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    flexWrap: 'wrap'
                  }}
                >
                  <Button
                    variant="contained"
                    onClick={handleCleanUp}
                    disabled={!transcription.trim() || cleaning || cleanedOnce}
                    startIcon={cleaning ? <CircularProgress size={16} color="inherit" /> : <AutoFixHigh />}
                    sx={{
                      textTransform: 'none',
                      backgroundImage: 'linear-gradient(90deg, #7c3aed, #db2777)',
                      color: 'white',
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
                  {cleanedOnce && prevText && (
                    <Button 
                      variant="text" 
                      onClick={handleUndoClean} 
                      sx={{ color: '#64748b', textTransform: 'none' }}
                    >
                      Undo
                    </Button>
                  )}
                </Box>
              )}
              
              {/* Other action buttons */}
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
                        borderColor: '#cbd5e1',
                        color: '#475569',
                        backgroundColor: 'white',
                        textTransform: 'none',
                        '&:hover': {
                          borderColor: '#94a3b8',
                          backgroundColor: '#f8fafc',
                          color: '#334155',
                        }
                      }}
                    >
                      Record Again
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={startEditing}
                      startIcon={<Edit />}
                      size="small"
                      sx={{
                        borderColor: '#cbd5e1',
                        color: '#475569',
                        backgroundColor: 'white',
                        textTransform: 'none',
                        '&:hover': {
                          borderColor: '#94a3b8',
                          backgroundColor: '#f8fafc',
                          color: '#334155',
                        }
                      }}
                    >
                      Edit Text
                    </Button>
                  </>
                )}
              </Box>
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
                  // No longer blocked by language selection
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
