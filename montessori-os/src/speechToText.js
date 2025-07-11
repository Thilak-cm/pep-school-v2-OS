// Google Speech-to-Text API Service
// Note: You'll need to set up Google Cloud credentials and enable the Speech-to-Text API

const SPEECH_TO_TEXT_API_KEY = import.meta.env.VITE_GOOGLE_SPEECH_TO_TEXT_API_KEY;
const SPEECH_TO_TEXT_ENDPOINT = 'https://speech.googleapis.com/v1/speech:recognize';

/**
 * Convert audio blob to base64 string
 * @param {Blob} audioBlob - The audio blob to convert
 * @returns {Promise<string>} Base64 encoded audio data
 */
const audioBlobToBase64 = async (audioBlob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result.split(',')[1]; // Remove data URL prefix
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(audioBlob);
  });
};

/**
 * Convert audio blob to base64 string for Google Speech API
 * @param {Blob} audioBlob - The audio blob to convert
 * @returns {Promise<string>} Base64 encoded audio data
 */
const audioBlobToBase64ForGoogle = async (audioBlob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Google Speech API expects base64 without data URL prefix
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(audioBlob);
  });
};

/**
 * Transcribe audio using Google Speech-to-Text API
 * @param {Blob} audioBlob - The audio blob to transcribe
 * @param {string} languageCode - Language code (default: 'en-US')
 * @returns {Promise<string>} Transcribed text
 */
export const transcribeAudio = async (audioBlob, languageCode = 'en-US') => {
  if (!SPEECH_TO_TEXT_API_KEY) {
    throw new Error('Google Speech-to-Text API key not configured. Please set VITE_GOOGLE_SPEECH_TO_TEXT_API_KEY in your .env file.');
  }

  try {
    // Convert audio blob to base64
    const audioContent = await audioBlobToBase64ForGoogle(audioBlob);
    
    // Prepare request payload
    const requestBody = {
      config: {
        encoding: 'WEBM_OPUS', // Adjust based on your audio format
        sampleRateHertz: 44100,
        languageCode: languageCode,
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: false,
        enableWordConfidence: false,
        model: 'latest_long', // Better for longer audio
        useEnhanced: true, // Enhanced models for better accuracy
      },
      audio: {
        content: audioContent
      }
    };

    console.log('Sending transcription request...');

    // Make API request
    const response = await fetch(`${SPEECH_TO_TEXT_ENDPOINT}?key=${SPEECH_TO_TEXT_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Speech-to-Text API Error:', errorData);
      throw new Error(`Speech-to-Text API error: ${errorData.error?.message || response.statusText}`);
    }

    const result = await response.json();
    console.log('Transcription result:', result);

    // Extract transcribed text
    if (result.results && result.results.length > 0) {
      const transcript = result.results
        .map(result => result.alternatives?.[0]?.transcript)
        .filter(Boolean)
        .join(' ');
      
      return transcript.trim();
    } else {
      return ''; // No speech detected
    }

  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  }
};

/**
 * Get supported audio formats for Google Speech-to-Text
 * @returns {Object} Supported formats and their configurations
 */
export const getSupportedAudioFormats = () => {
  return {
    'audio/webm;codecs=opus': {
      encoding: 'WEBM_OPUS',
      sampleRateHertz: 48000
    },
    'audio/webm': {
      encoding: 'WEBM',
      sampleRateHertz: 16000
    },
    'audio/mp4': {
      encoding: 'MP3',
      sampleRateHertz: 16000
    }
  };
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
  
  // Check if file size is reasonable (max 10MB for API)
  if (audioBlob.size > 10 * 1024 * 1024) {
    return false;
  }
  
  return true;
}; 