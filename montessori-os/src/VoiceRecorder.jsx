import React, { useState, useRef, useEffect } from 'react';

const VoiceRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

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
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create MediaRecorder instance
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      // Handle data available event
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle stop event
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        setAudioBlob(audioBlob);
        setAudioUrl(audioUrl);
        
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
      `}</style>
    </div>
  );
};

export default VoiceRecorder; 