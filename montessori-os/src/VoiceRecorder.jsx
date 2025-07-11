import React, { useState, useRef, useEffect } from 'react';
import { transcribeAudio, validateAudioForTranscription } from './speechToText';

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
    <div style={{ 
      maxWidth: '500px', 
      width: '100%',
      backgroundColor: 'white',
      borderRadius: '16px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      border: '1px solid #e2e8f0',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '24px 24px 16px 24px',
        textAlign: 'center',
        borderBottom: '1px solid #f1f5f9'
      }}>
        <h3 style={{
          margin: '0 0 8px 0',
          color: '#1e293b',
          fontSize: '1.25rem',
          fontWeight: '600'
        }}>
          Voice Recorder
        </h3>
        <p style={{
          margin: 0,
          color: '#64748b',
          fontSize: '0.9rem'
        }}>
          Record up to 30 seconds of audio
        </p>
      </div>
      
      {/* Recording Status */}
      <div style={{ 
        padding: '24px',
        textAlign: 'center',
        backgroundColor: isRecording ? '#fef3f2' : '#f8fafc'
      }}>
        <div style={{ 
          fontSize: '2rem', 
          fontWeight: '700',
          color: isRecording ? '#dc2626' : '#1e293b',
          marginBottom: '12px',
          fontFamily: 'monospace'
        }}>
          {formatTime(recordingTime)} / {formatTime(MAX_RECORDING_TIME)}
        </div>
        
        {/* Recording Indicator */}
        {isRecording && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '16px'
          }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              backgroundColor: '#dc2626',
              borderRadius: '50%',
              animation: 'pulse 2s ease-in-out infinite'
            }}></div>
            <span style={{
              color: '#dc2626',
              fontSize: '0.9rem',
              fontWeight: '500'
            }}>
              Recording...
            </span>
          </div>
        )}

        {/* Recording Controls */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center',
          gap: '12px'
        }}>
          {!isRecording ? (
            <button 
              onClick={startRecording}
              style={{
                padding: '16px 32px',
                backgroundColor: '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1)'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#4338ca';
                e.target.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#4f46e5';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C13.1 2 14 2.9 14 4V12C14 13.1 13.1 14 12 14C10.9 14 10 13.1 10 12V4C10 2.9 10.9 2 12 2Z" fill="currentColor"/>
                <path d="M19 10V12C19 15.87 15.87 19 12 19C8.13 19 5 15.87 5 12V10H7V12C7 14.76 9.24 17 12 17C14.76 17 17 14.76 17 12V10H19Z" fill="currentColor"/>
                <path d="M10 21H14V23H10V21Z" fill="currentColor"/>
              </svg>
              Start Recording
            </button>
          ) : (
            <button 
              onClick={stopRecording}
              style={{
                padding: '16px 32px',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1)'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#b91c1c';
                e.target.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#dc2626';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
              </svg>
              Stop Recording
            </button>
          )}
        </div>
      </div>

      {/* Audio Playback */}
      {audioUrl && (
        <div style={{ 
          padding: '24px',
          backgroundColor: '#f8fafc',
          borderTop: '1px solid #e2e8f0'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}>
            <h4 style={{
              margin: 0,
              color: '#1e293b',
              fontSize: '1rem',
              fontWeight: '600'
            }}>
              Recorded Audio
            </h4>
            <span style={{
              color: '#64748b',
              fontSize: '0.875rem',
              backgroundColor: '#e2e8f0',
              padding: '2px 8px',
              borderRadius: '4px'
            }}>
              {audioBlob ? (audioBlob.size / 1024).toFixed(1) : 0} KB
            </span>
          </div>
          
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
          
          <div style={{ 
            display: 'flex', 
            gap: '8px', 
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <button 
              onClick={playAudio}
              disabled={isPlaying}
              style={{
                padding: '8px 16px',
                backgroundColor: isPlaying ? '#e2e8f0' : '#059669',
                color: isPlaying ? '#64748b' : 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: isPlaying ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M8 5V19L19 12L8 5Z" fill="currentColor"/>
              </svg>
              Play
            </button>
            
            <button 
              onClick={stopAudio}
              disabled={!isPlaying}
              style={{
                padding: '8px 16px',
                backgroundColor: !isPlaying ? '#e2e8f0' : '#f59e0b',
                color: !isPlaying ? '#64748b' : 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: !isPlaying ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
              </svg>
              Stop
            </button>
            
            <button 
              onClick={resetRecording}
              style={{
                padding: '8px 16px',
                backgroundColor: '#64748b',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#475569';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#64748b';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M3 6H21V8H3V6Z" fill="currentColor"/>
                <path d="M8 11H16V13H8V11Z" fill="currentColor"/>
                <path d="M8 16H13V18H8V16Z" fill="currentColor"/>
              </svg>
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Transcription Section */}
      {(audioUrl || isTranscribing || transcription || transcriptionError) && (
        <div style={{ 
          padding: '24px',
          backgroundColor: '#f0f9ff',
          borderTop: '1px solid #e2e8f0'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}>
            <h4 style={{
              margin: 0,
              color: '#1e293b',
              fontSize: '1rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Transcription
            </h4>
            {isTranscribing && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#059669',
                fontSize: '0.875rem'
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  border: '2px solid #059669',
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                Processing...
              </div>
            )}
          </div>

          {/* Transcription Content */}
          {isTranscribing && (
            <div style={{
              padding: '16px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              textAlign: 'center',
              color: '#64748b'
            }}>
              Converting speech to text...
            </div>
          )}

          {transcriptionError && (
            <div style={{
              padding: '16px',
              backgroundColor: '#fef2f2',
              borderRadius: '8px',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '0.875rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Error
              </div>
              {transcriptionError}
            </div>
          )}

          {transcription && !isTranscribing && !transcriptionError && (
            <div style={{
              padding: '16px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              marginBottom: '16px'
            }}>
              <div style={{
                color: '#1e293b',
                fontSize: '0.875rem',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {transcription}
              </div>
            </div>
          )}

          {/* Transcription Actions */}
          {transcription && !isTranscribing && (
            <div style={{
              display: 'flex',
              gap: '8px',
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <button 
                onClick={() => navigator.clipboard.writeText(transcription)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#4338ca';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#4f46e5';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M8 4V2C8 1.44772 8.44772 1 9 1H15C15.5523 1 16 1.44772 16 2V4M19 4H5C4.44772 4 4 4.44772 4 5V19C4 19.5523 4.44772 20 5 20H19C19.5523 20 20 19.5523 20 19V5C20 4.44772 19.5523 4 19 4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Copy Text
              </button>
              
              <button 
                onClick={() => handleTranscription(audioBlob)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#047857';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#059669';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M4 4V2C4 1.44772 4.44772 1 5 1H19C19.5523 1 20 1.44772 20 2V4M19 4H5C4.44772 4 4 4.44772 4 5V19C4 19.5523 4.44772 20 5 20H19C19.5523 20 20 19.5523 20 19V5C20 4.44772 19.5523 4 19 4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M16 2V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 2V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { 
            opacity: 1;
            transform: scale(1);
          }
          50% { 
            opacity: 0.5;
            transform: scale(1.1);
          }
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default VoiceRecorder; 