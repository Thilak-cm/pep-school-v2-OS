import { useState, useRef, useCallback, useEffect } from 'react';
import { translateAudioToEnglish, validateAudioForTranscription } from '../whisperSTT';
import { friendlyFunctionError } from '../utils/cloudFunctionErrors';
import { reportCaughtError } from '../utils/reportCaughtError.js';

const MAX_RECORDING_TIME = 300; // 5 minutes

/**
 * Hook that encapsulates inline voice recording + Whisper transcription.
 *
 * @param {Object} opts
 * @param {(text: string) => void} opts.onTranscribed — called with transcribed text
 * @returns hook state + actions consumed by InlineVoiceOverlay
 */
export default function useInlineVoice({ onTranscribed } = {}) {
  // ── State ──────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [waveformData, setWaveformData] = useState([]);
  const [showTimeLimitWarning, setShowTimeLimitWarning] = useState(false);
  const [error, setError] = useState('');

  // ── Refs ───────────────────────────────────────────────────────
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const streamRef = useRef(null);
  const discardRef = useRef(false);
  const onTranscribedRef = useRef(onTranscribed);

  // Keep callback ref fresh without triggering re-renders
  useEffect(() => { onTranscribedRef.current = onTranscribed; }, [onTranscribed]);

  // ── Helpers ────────────────────────────────────────────────────
  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetRecordingState = useCallback(() => {
    stopTimer();

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch (_e) {
        reportCaughtError(_e, 'useInlineVoice', 'resetRecordingState stop');
      }
      mediaRecorderRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      } catch (_e) {
        reportCaughtError(_e, 'useInlineVoice', 'resetRecordingState audioCtx');
      }
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop());
      } catch (_e) {
        reportCaughtError(_e, 'useInlineVoice', 'resetRecordingState stream');
      }
      streamRef.current = null;
    }

    analyserRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setIsTranscribing(false);
    setWaveformData([]);
    setShowTimeLimitWarning(false);
    audioChunksRef.current = [];
    discardRef.current = false;
  }, [stopTimer]);

  // Cleanup on unmount
  useEffect(() => () => resetRecordingState(), [resetRecordingState]);

  // ── Waveform ───────────────────────────────────────────────────
  const updateWaveform = useCallback(() => {
    if (!analyserRef.current || !streamRef.current) {
      animationFrameRef.current = null;
      return;
    }

    const isActuallyRecording = mediaRecorderRef.current?.state === 'recording';
    const isActuallyPaused = mediaRecorderRef.current?.state === 'paused';

    if (!isActuallyRecording || isActuallyPaused) {
      animationFrameRef.current = null;
      return;
    }

    const bufferLength = analyserRef.current.frequencyBinCount;
    const timeDataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(timeDataArray);

    let maxAmplitude = 0;
    for (let i = 0; i < bufferLength; i++) {
      const sample = Math.abs(timeDataArray[i] - 128);
      if (sample > maxAmplitude) maxAmplitude = sample;
    }

    const normalizedLoudness = Math.min(1, (maxAmplitude / 128) * 3);
    const numBars = 60;
    const reducedData = [];
    const baseAmplitude = normalizedLoudness * 220;

    for (let i = 0; i < numBars; i++) {
      const waveVariation = Math.sin((i / numBars) * Math.PI * 4) * 0.3 + 1;
      const barValue = Math.min(255, baseAmplitude * waveVariation);
      reducedData.push(Math.max(4, barValue));
    }

    setWaveformData(reducedData);
    animationFrameRef.current = requestAnimationFrame(updateWaveform);
  }, []);

  // ── Transcription ──────────────────────────────────────────────
  const handleTranscription = useCallback(async (blob) => {
    if (!validateAudioForTranscription(blob)) {
      setError('Audio file is not suitable for transcription. File size must be under ~9.5MB.');
      resetRecordingState();
      return;
    }

    setIsTranscribing(true);
    setError('');

    try {
      const result = await translateAudioToEnglish(blob);
      if (result.text) {
        onTranscribedRef.current?.(result.text);
      } else {
        setError('No speech detected in the recording.');
      }
    } catch (err) {
      setError(`Transcription failed: ${friendlyFunctionError(err)}`);
    } finally {
      resetRecordingState();
    }
  }, [resetRecordingState]);

  // ── Timer ──────────────────────────────────────────────────────
  // We need a ref for stopRecording to avoid circular deps
  const stopRecordingRef = useRef(null);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => {
        const next = prev + 1;
        if (next === 285) setShowTimeLimitWarning(true);
        if (next >= MAX_RECORDING_TIME) {
          stopRecordingRef.current?.();
          setError('Recording stopped at 5 minutes. Transcribing…');
          return MAX_RECORDING_TIME;
        }
        return next;
      });
    }, 1000);
  }, []);

  // ── Recording actions ──────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      try {
        mediaRecorderRef.current.stop();
        // Set isTranscribing BEFORE clearing isRecording so that `active`
        // (isRecording || isTranscribing) never flickers to false — which
        // would trigger consumers to clear their callback targets prematurely.
        setIsTranscribing(true);
        setIsRecording(false);
        setIsPaused(false);
        stopTimer();
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      } catch {
        setError('Error stopping recording. Please try again.');
        resetRecordingState();
      }
    }
  }, [stopTimer, resetRecordingState]);

  // Wire up the ref so the timer can call stopRecording
  useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);

  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current || isTranscribing) return;

    resetRecordingState();

    try {
      discardRef.current = false;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/mp3')
        ? 'audio/mp3'
        : MediaRecorder.isTypeSupported('audio/mpeg')
          ? 'audio/mpeg'
          : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/webm')
              ? 'audio/webm'
              : 'audio/mp4';

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      mediaRecorderRef.current.onerror = (event) => {
        setError(`Recording error: ${event.error?.message || 'Unknown error'}`);
        resetRecordingState();
      };

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        if (discardRef.current || !mediaRecorderRef.current) {
          audioChunksRef.current = [];
          discardRef.current = false;
          resetRecordingState();
          return;
        }

        try {
          stream.getTracks().forEach(track => { if (track.readyState === 'live') track.stop(); });
        } catch (_e) {
          reportCaughtError(_e, 'useInlineVoice', 'onstop track cleanup');
        }

        if (!audioChunksRef.current || audioChunksRef.current.length === 0) {
          setError('Recording failed: No audio data captured. Please try again.');
          resetRecordingState();
          return;
        }

        const actualMime = mediaRecorderRef.current?.mimeType || 'audio/webm;codecs=opus';
        const blob = new Blob(audioChunksRef.current, { type: actualMime });

        if (!blob || blob.size === 0) {
          setError('Recording failed: Invalid audio data. Please try again.');
          resetRecordingState();
          return;
        }

        if (blob.size < 1024) {
          setError('Recording too short. Please record for at least 1 second.');
          resetRecordingState();
          return;
        }

        handleTranscription(blob);
      };

      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      setShowTimeLimitWarning(false);
      setWaveformData([]);

      mediaRecorderRef.current.start();
      await new Promise(resolve => setTimeout(resolve, 50));

      // Set up waveform analyser
      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 2048;
        analyserRef.current.smoothingTimeConstant = 0.3;
        source.connect(analyserRef.current);
        if (!animationFrameRef.current) updateWaveform();
      } catch (_audioError) {
        reportCaughtError(_audioError, 'useInlineVoice', 'waveform setup');
      }

      startTimer();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Enable mic in browser settings.');
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone.');
      } else {
        setError(`Error accessing microphone: ${err.message}`);
      }
      resetRecordingState();
    }
  }, [isTranscribing, resetRecordingState, handleTranscription, startTimer, updateWaveform]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused && typeof mediaRecorderRef.current.pause === 'function') {
      try {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        stopTimer();
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      } catch (_e) {
        reportCaughtError(_e, 'useInlineVoice', 'pauseRecording');
      }
    }
  }, [isRecording, isPaused, stopTimer]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && isPaused && typeof mediaRecorderRef.current.resume === 'function') {
      try {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        startTimer();
        if (!animationFrameRef.current) updateWaveform();
      } catch (_e) {
        reportCaughtError(_e, 'useInlineVoice', 'resumeRecording');
      }
    }
  }, [isRecording, isPaused, startTimer, updateWaveform]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      discardRef.current = true;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      stopTimer();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    } else {
      resetRecordingState();
    }
  }, [isRecording, stopTimer, resetRecordingState]);

  const clearError = useCallback(() => setError(''), []);

  // ── Public surface ─────────────────────────────────────────────
  const active = isRecording || isTranscribing;

  return {
    // state
    isRecording,
    isPaused,
    recordingTime,
    isTranscribing,
    waveformData,
    showTimeLimitWarning,
    error,
    active, // convenience: true when recording OR transcribing

    // actions
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    clearError,

    // utils
    formatTime,
  };
}
