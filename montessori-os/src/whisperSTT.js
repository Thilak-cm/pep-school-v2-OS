// OpenAI Whisper Speech-to-Text API Service
// Simple, direct audio transcription and translation

import { trackEvent, lengthBucket } from './utils/analytics';
import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';
import { reportCaughtError } from './utils/reportCaughtError.js';
export const WHISPER_MODEL_INFO = { model: 'whisper-1' };


/**
 * Validate if audio blob is suitable for transcription
 * @param {Blob} audioBlob - The audio blob to validate
 * @returns {boolean} Whether the audio is suitable for transcription
 */
export const validateAudioForTranscription = (audioBlob) => {
  if (!audioBlob || audioBlob.size === 0) {
    return false;
  }
  // Using callable → keep under ~9.5MB to avoid request limits
  const MAX_BYTES = 9.5 * 1024 * 1024;
  if (audioBlob.size > MAX_BYTES) {
    return false;
  }

  return true;
};

// transcribeAudio removed in #298: unused wrapper for the deleted
// aiWhisperTranscribe CF. All voice flows use translateAudioToEnglish.

/**
 * Translate audio (Tamil/Kannada/Hindi/English) to English using Whisper
 * - Auto-detects input language when not specified by Whisper translations API
 * - Returns detected language for metadata/analytics
 * @param {Blob} audioBlob
 * @returns {Promise<{ text: string, detectedLanguage?: string, raw?: any }>}
 */
export const translateAudioToEnglish = async (audioBlob) => {
    if (!validateAudioForTranscription(audioBlob)) {
      throw new Error('Audio file is not suitable for transcription. File size must be under ~9.5MB.');
    }

    const audioBase64 = await blobToBase64(audioBlob);
    const call = httpsCallable(cloudFunctions, 'aiWhisperTranslate', { timeout: 300_000 });
    const resp = await call({ audioBase64, mimeType: audioBlob.type });
    const rawLanguage = resp?.data?.detectedLanguage;
    const detectedLanguage = normalizeLanguage(rawLanguage);
    const text = String(resp?.data?.text || '').trim();

    try {
      await trackEvent('stt_translation', {
        detected_language: detectedLanguage || rawLanguage || 'unknown',
        text_len: lengthBucket(text.length)
      });
    } catch (_) {
      reportCaughtError(_, 'whisperSTT', 'swallow-only try/catch at L89');
    }

    return { text, detectedLanguage: detectedLanguage || rawLanguage, raw: null };
};

function normalizeLanguage(value) {
  if (!value) return undefined;
  const v = String(value).toLowerCase().trim();
  // Common returns can be codes (en, ta, hi, kn) or names (english, tamil, hindi, kannada)
  if (v === 'en' || v === 'english') return 'en';
  if (v === 'ta' || v === 'tamil') return 'ta';
  if (v === 'hi' || v === 'hindi') return 'hi';
  if (v === 'kn' || v === 'kannada') return 'kn';
  if (v === 'te' || v === 'telugu') return 'te';
  return v; // fallback to whatever was provided
}

/**
 * Get supported audio formats for OpenAI Whisper
 * @returns {Object} Supported formats and their configurations
 */
export const getSupportedAudioFormats = () => {
  return {
    'audio/mp3': {
      description: 'MP3 audio format',
      maxSize: '≈9.5MB (callable limit)'
    },
    'audio/mpeg': {
      description: 'MPEG audio format', 
      maxSize: '≈9.5MB (callable limit)'
    },
    'audio/wav': {
      description: 'WAV audio format',
      maxSize: '≈9.5MB (callable limit)'
    },
    'audio/webm': {
      description: 'WebM audio format',
      maxSize: '≈9.5MB (callable limit)'
    },
    'audio/m4a': {
      description: 'M4A audio format',
      maxSize: '≈9.5MB (callable limit)'
    }
  };
};

async function blobToBase64(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
