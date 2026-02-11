// Google Speech-to-Text API Service
// Note: You'll need to set up Google Cloud credentials and enable the Speech-to-Text API

const SPEECH_TO_TEXT_API_KEY = import.meta.env.VITE_GOOGLE_SPEECH_TO_TEXT_API_KEY;
const SPEECH_TO_TEXT_ENDPOINT = 'https://speech.googleapis.com/v1/speech:recognize';

// Constants for chunking
const CHUNK_DURATION_MS = 30000; // 30 seconds in milliseconds
const OVERLAP_MS = 1000; // 1 second overlap to avoid cutting words

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
 * Chunk audio blob into smaller segments for transcription
 * @param {Blob} audioBlob - The audio blob to chunk
 * @param {number} durationMs - Duration of each chunk in milliseconds
 * @param {number} overlapMs - Overlap between chunks in milliseconds
 * @returns {Promise<Array<{blob: Blob, startTime: number, endTime: number}>>} Array of audio chunks with timing info
 */
export const chunkAudioBlob = async (audioBlob, durationMs = CHUNK_DURATION_MS, overlapMs = OVERLAP_MS) => {
  return new Promise((resolve, reject) => {
    try {
      // Validate input parameters
      if (!audioBlob || audioBlob.size === 0) {
        reject(new Error('Invalid audio blob provided'));
        return;
      }
      
      if (durationMs <= 0 || overlapMs < 0) {
        reject(new Error('Invalid duration or overlap parameters'));
        return;
      }
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const fileReader = new FileReader();
      
      fileReader.onload = async (event) => {
        try {
          const arrayBuffer = event.target.result;
          
          if (arrayBuffer.byteLength === 0) {
            throw new Error('Empty audio file');
          }
          
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          // Validate audio buffer
          if (audioBuffer.length === 0) {
            throw new Error('Audio buffer is empty');
          }
          
          const chunks = [];
          const sampleRate = audioBuffer.sampleRate;
          const totalSamples = audioBuffer.length;
          const samplesPerChunk = Math.floor(durationMs * sampleRate / 1000);
          const overlapSamples = Math.floor(overlapMs * sampleRate / 1000);
          
          // Ensure minimum chunk size
          if (samplesPerChunk < 1000) { // At least 1000 samples (about 22ms at 44.1kHz)
            throw new Error('Chunk duration too short for this audio');
          }
          
          let startSample = 0;
          
          while (startSample < totalSamples) {
            const endSample = Math.min(startSample + samplesPerChunk, totalSamples);
            const chunkLength = endSample - startSample;
            
            // Skip chunks that are too small
            if (chunkLength < samplesPerChunk / 4) {
              break;
            }
            
            // Create a new audio buffer for this chunk
            const chunkBuffer = audioContext.createBuffer(
              audioBuffer.numberOfChannels,
              chunkLength,
              sampleRate
            );
            
            // Copy audio data for each channel
            for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
              const channelData = audioBuffer.getChannelData(channel);
              const chunkChannelData = chunkBuffer.getChannelData(channel);
              
              for (let i = 0; i < chunkLength; i++) {
                chunkChannelData[i] = channelData[startSample + i];
              }
            }
            
            try {
              // Convert chunk buffer to blob
              const chunkBlob = await audioBufferToWavBlob(chunkBuffer);
              
              chunks.push({
                blob: chunkBlob,
                startTime: startSample / sampleRate,
                endTime: endSample / sampleRate,
                chunkIndex: chunks.length
              });
            } catch (chunkError) {
              throw new Error(`Failed to create audio chunk: ${chunkError.message}`);
            }
            
            // Move to next chunk with overlap
            startSample = endSample - overlapSamples;
            
            // Safety check to prevent infinite loops
            if (startSample >= totalSamples) {
              break;
            }
          }
          
          if (chunks.length === 0) {
            throw new Error('No valid chunks could be created');
          }
          
          audioContext.close();
          resolve(chunks);
          
        } catch (error) {
          audioContext.close();
          reject(error);
        }
      };
      
      fileReader.onerror = (error) => {
        reject(new Error('Failed to read audio file'));
      };
      
      fileReader.readAsArrayBuffer(audioBlob);
      
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Convert AudioBuffer to Blob
 * @param {AudioBuffer} audioBuffer - The audio buffer to convert
 * @param {string} mimeType - The MIME type for the output blob
 * @returns {Promise<Blob>} The audio blob
 */
const audioBufferToBlob = async (audioBuffer, mimeType) => {
  return new Promise((resolve) => {
    // Create an offline audio context to render the buffer
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );
    
    // Create a buffer source
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start();
    
    // Render the audio
    offlineContext.startRendering().then((renderedBuffer) => {
      // Convert the rendered buffer to a blob
      const length = renderedBuffer.length;
      const sampleRate = renderedBuffer.sampleRate;
      const channels = renderedBuffer.numberOfChannels;
      
      // Create a WAV file (this is more reliable than trying to recreate the original format)
      const wavBlob = audioBufferToWavBlob(renderedBuffer);
      resolve(wavBlob);
    });
  });
};

/**
 * Convert AudioBuffer to WAV format Blob
 * @param {AudioBuffer} audioBuffer - The audio buffer to convert
 * @returns {Blob} WAV format blob
 */
const audioBufferToWavBlob = (audioBuffer) => {
  const length = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate;
  const channels = audioBuffer.numberOfChannels;
  
  // WAV file header
  const buffer = new ArrayBuffer(44 + length * channels * 2);
  const view = new DataView(buffer);
  
  // RIFF chunk descriptor
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * channels * 2, true);
  writeString(8, 'WAVE');
  
  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  
  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, length * channels * 2, true);
  
  // Write audio data
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return new Blob([buffer], { type: 'audio/wav' });
};

/**
 * Transcribe audio using chunking for longer recordings
 * @param {Blob} audioBlob - The audio blob to transcribe
 * @param {string} languageCode - Language code (default: 'en-US')
 * @param {number} maxChunkDuration - Maximum duration per chunk in milliseconds (default: 30000)
 * @param {Function} onProgress - Progress callback function (current, total, message)
 * @returns {Promise<Object>} Transcribed text with metadata
 */
export const transcribeAudioWithChunking = async (audioBlob, languageCode = 'en-US', maxChunkDuration = CHUNK_DURATION_MS, onProgress = null) => {
  try {
    // Check if we need to chunk the audio
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const durationMs = (audioBuffer.length / audioBuffer.sampleRate) * 1000;
    audioContext.close();
    
    // If audio is short enough, use regular transcription
    if (durationMs <= maxChunkDuration) {
      if (onProgress) onProgress(1, 1, 'Transcribing audio...');
      return await transcribeAudio(audioBlob, languageCode);
    }
    
    if (onProgress) onProgress(0, 0, `Chunking ${Math.ceil(durationMs / maxChunkDuration)} audio segments...`);
    
    try {
      // Try chunking first
      const chunks = await chunkAudioBlob(audioBlob, maxChunkDuration);
      
      if (onProgress) onProgress(0, chunks.length, `Starting transcription...`);
      
      // Transcribe each chunk with progress updates
      const results = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        if (onProgress) onProgress(i + 1, chunks.length, `Transcribing in progress...`);
        
        try {
          const result = await transcribeAudio(chunk.blob, languageCode);
          results.push({
            ...result,
            chunkIndex: i,
            startTime: chunk.startTime,
            endTime: chunk.endTime
          });
        } catch (error) {
          results.push({
            text: `[Transcription error in segment ${i + 1}]`,
            confidence: 0,
            alternatives: [],
            languageCode,
            chunkIndex: i,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
            error: error.message
          });
        }
      }
      
      if (onProgress) onProgress(chunks.length, chunks.length, 'Finalizing transcription...');
      
      // Stitch transcriptions together
      const stitchedText = results
        .sort((a, b) => a.chunkIndex - b.chunkIndex)
        .map(result => result.text)
        .join(' ');
      
      // Calculate overall confidence (average of successful chunks)
      const successfulResults = results.filter(r => !r.error && r.confidence !== null);
      const overallConfidence = successfulResults.length > 0
        ? successfulResults.reduce((sum, r) => sum + r.confidence, 0) / successfulResults.length
        : null;
      
      // Collect all alternatives
      const allAlternatives = results
        .filter(r => !r.error && r.alternatives)
        .flatMap(r => r.alternatives);
      
      if (onProgress) onProgress(chunks.length, chunks.length, 'Transcription complete!');
      
      return {
        text: stitchedText.trim(),
        confidence: overallConfidence,
        alternatives: allAlternatives,
        languageCode,
        chunkCount: chunks.length,
        totalDuration: durationMs / 1000,
        chunks: results
      };
      
    } catch (chunkingError) {
      if (onProgress) onProgress(0, 1, 'Chunking failed, using single transcription...');
      
      // Fallback to single transcription
      try {
        const fallbackResult = await transcribeAudio(audioBlob, languageCode);
        return {
          ...fallbackResult,
          chunkCount: 1,
          totalDuration: durationMs / 1000,
          chunks: [fallbackResult],
          fallbackUsed: true
        };
      } catch (fallbackError) {
        throw new Error(`Both chunked and single transcription failed. Original error: ${chunkingError.message}. Fallback error: ${fallbackError.message}`);
      }
    }
    
  } catch (error) {
    throw error;
  }
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
    
    // Determine encoding based on blob type
    let encoding = 'WEBM_OPUS';
    if (audioBlob.type === 'audio/wav') {
      encoding = 'LINEAR16';
    } else if (audioBlob.type.includes('webm')) {
      encoding = 'WEBM_OPUS';
    } else if (audioBlob.type.includes('mp4') || audioBlob.type.includes('m4a')) {
      encoding = 'MP3';
    }
    
    // Prepare request payload
    const requestBody = {
      config: {
        encoding: encoding,
        languageCode: languageCode,
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: false,
        enableWordConfidence: false,
        model: 'latest_long', // Better for longer audio
        useEnhanced: true, // Enhanced models for better accuracy
        sampleRateHertz: 48000, // Standard sample rate for WAV
      },
      audio: {
        content: audioContent
      }
    };

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
      throw new Error(`Speech-to-Text API error: ${errorData.error?.message || response.statusText}`);
    }

    const result = await response.json();

    // Extract transcribed text and metadata
    if (result.results && result.results.length > 0) {
      const transcript = result.results
        .map(result => result.alternatives?.[0]?.transcript)
        .filter(Boolean)
        .join(' ');
      
      // Get confidence scores
      const confidenceScores = result.results
        .map(result => result.alternatives?.[0]?.confidence)
        .filter(score => score !== undefined);
      
      const avgConfidence = confidenceScores.length > 0 
        ? confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length 
        : null;

      return {
        text: transcript.trim(),
        confidence: avgConfidence,
        alternatives: result.results.map(r => r.alternatives?.[0]).filter(Boolean),
        languageCode: languageCode
      };
    } else {
      return {
        text: '', // No speech detected
        confidence: null,
        alternatives: [],
        languageCode: languageCode
      };
    }

  } catch (error) {
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