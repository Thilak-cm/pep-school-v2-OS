// OpenAI Whisper Speech-to-Text API Service
// Simple, direct audio transcription without chunking

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_SPEECH_TO_TEXT_API_KEY;
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';

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
  
  // OpenAI Whisper accepts up to 25MB files
  if (audioBlob.size > 25 * 1024 * 1024) {
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
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured. Please set VITE_OPENAI_SPEECH_TO_TEXT_API_KEY in your .env file.');
  }

  try {
    // Validate audio file
    if (!validateAudioForTranscription(audioBlob)) {
      throw new Error('Audio file is not suitable for transcription. File size must be under 25MB.');
    }

    // Convert to MP3 if needed
    const mp3Blob = await convertToMP3(audioBlob);
    
    // Create FormData for OpenAI API
    const formData = new FormData();
    
    // Generate timestamped filename
    const timestamp = Date.now();
    const filename = `recording_${timestamp}.mp3`;
    
    formData.append('file', mp3Blob, filename);
    formData.append('model', 'whisper-1');
    
    // Add context prompt to improve transcription accuracy for educational observations
    formData.append('prompt', "This is a Montessori teacher recording educational observations about student learning and development. Content includes Montessori methodology, curriculum areas, student names, developmental milestones, and classroom activities.");
    
    // Add language hint if specified (OpenAI will auto-detect if not provided)
    if (languageCode && languageCode !== 'en-US') {
      formData.append('language', languageCode.split('-')[0]); // Convert 'en-US' to 'en'
    }

    console.log('Sending transcription request to OpenAI Whisper:', {
      filename,
      fileSize: mp3Blob.size,
      fileType: mp3Blob.type,
      languageCode
    });

    // Make API request
    const response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI Whisper API Error:', errorData);
      throw new Error(`OpenAI Whisper API error: ${errorData.error?.message || response.statusText}`);
    }

    const result = await response.json();
    console.log('OpenAI Whisper transcription result:', result);

    // OpenAI returns: { text: "transcribed text" }
    if (result.text) {
      return {
        text: result.text.trim(),
        languageCode: languageCode
      };
    } else {
      return {
        text: '', // No speech detected
        languageCode: languageCode
      };
    }

  } catch (error) {
    console.error('OpenAI Whisper transcription error:', error);
    throw error;
  }
};

/**
 * Get supported audio formats for OpenAI Whisper
 * @returns {Object} Supported formats and their configurations
 */
export const getSupportedAudioFormats = () => {
  return {
    'audio/mp3': {
      description: 'MP3 audio format',
      maxSize: '25MB'
    },
    'audio/mpeg': {
      description: 'MPEG audio format', 
      maxSize: '25MB'
    },
    'audio/wav': {
      description: 'WAV audio format',
      maxSize: '25MB'
    },
    'audio/webm': {
      description: 'WebM audio format',
      maxSize: '25MB'
    },
    'audio/m4a': {
      description: 'M4A audio format',
      maxSize: '25MB'
    }
  };
};
