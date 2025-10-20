// OpenAI Whisper Speech-to-Text API Service
// Simple, direct audio transcription and translation

import { trackEvent, lengthBucket } from './utils/analytics';
import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';
export const WHISPER_MODEL_INFO = { model: 'whisper-1' };

/**
 * Convert audio blob to MP3 format for OpenAI Whisper API
 * @param {Blob} audioBlob - The audio blob to convert
 * @returns {Promise<Blob>} MP3 format blob
 */
const convertToMP3 = async (audioBlob) => {
  // If already MP3, return as is
  if (audioBlob.type === 'audio/mp3' || audioBlob.type === 'audio/mpeg') {
    return audioBlob;
  }

  // For other formats, we'll use the blob directly since OpenAI accepts multiple formats
  // This avoids complex client-side conversion that could cause issues
  return audioBlob;
};

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

/**
 * Transcribe audio using OpenAI Whisper API
 * @param {Blob} audioBlob - The audio blob to transcribe
 * @param {string} languageCode - Language code (default: 'en-US')
 * @returns {Promise<Object>} Transcribed text with metadata
 */
export const transcribeAudio = async (audioBlob, languageCode = 'en-US') => {

  try {
    // Validate audio file
    if (!validateAudioForTranscription(audioBlob)) {
      throw new Error('Audio file is not suitable for transcription. File size must be under ~9.5MB.');
    }

    const mp3Blob = await convertToMP3(audioBlob);
    const audioBase64 = await blobToBase64(mp3Blob);
    const call = httpsCallable(cloudFunctions, 'aiWhisperTranscribe');
    const resp = await call({ audioBase64, mimeType: mp3Blob.type, languageCode });
    const text = String(resp?.data?.text || '').trim();
    const out = { text, languageCode };
    try {
      await trackEvent('stt_transcription', {
        input_language_hint: languageCode || 'auto',
        text_len: lengthBucket(text.length)
      });
    } catch (_) {}
    return out;

  } catch (error) {
    console.error('OpenAI Whisper transcription error:', error);
    throw error;
  }
};

/**
 * Translate audio (Tamil/Kannada/Hindi/English) to English using Whisper
 * - Auto-detects input language when not specified by Whisper translations API
 * - Returns detected language for metadata/analytics
 * @param {Blob} audioBlob
 * @returns {Promise<{ text: string, detectedLanguage?: string, raw?: any }>}
 */
export const translateAudioToEnglish = async (audioBlob) => {

  try {
    if (!validateAudioForTranscription(audioBlob)) {
      throw new Error('Audio file is not suitable for transcription. File size must be under ~9.5MB.');
    }

    const mp3Blob = await convertToMP3(audioBlob);
    const audioBase64 = await blobToBase64(mp3Blob);
    const call = httpsCallable(cloudFunctions, 'aiWhisperTranslate');
    const resp = await call({ audioBase64, mimeType: mp3Blob.type });
    const rawLanguage = resp?.data?.detectedLanguage;
    const detectedLanguage = normalizeLanguage(rawLanguage);
    const text = String(resp?.data?.text || '').trim();

    try {
      await trackEvent('stt_translation', {
        detected_language: detectedLanguage || rawLanguage || 'unknown',
        text_len: lengthBucket(text.length)
      });
    } catch (_) {}

    return { text, detectedLanguage: detectedLanguage || rawLanguage, raw: null };
  } catch (error) {
    console.error('OpenAI Whisper translation error:', error);
    throw error;
  }
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
