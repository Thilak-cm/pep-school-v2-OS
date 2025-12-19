// ChildChat.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Paper,
  Avatar,
} from '@mui/material';
import {
  Send as SendIcon,
  SmartToy as AssistantIcon,
  Person as UserIcon,
} from '@mui/icons-material';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';

function ChildChat({ student }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const studentId = student?.id || student?.uid || null;

  const getStudentName = (s) => {
    if (!s) return 'Student';
    return s.displayName || s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Student';
  };

  // Set up real-time listener for chat messages
  useEffect(() => {
    if (!studentId) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, 'students', studentId, 'chat_messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'), limit(100));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const messageList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setMessages(messageList);
        // Scroll to bottom when new messages arrive
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      },
      (err) => {
        console.error('Error loading chat messages:', err);
        setError('Failed to load chat messages.');
      }
    );

    return () => unsubscribe();
  }, [studentId]);

  // Scroll to bottom on mount and when loading changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSendMessage = async () => {
    const trimmedMessage = inputValue.trim();
    if (!trimmedMessage || loading) {
      return;
    }

    if (!studentId) {
      setError('Student ID is missing.');
      return;
    }

    setLoading(true);
    setError('');
    setInputValue('');

    try {
      const childChatFn = httpsCallable(cloudFunctions, 'childChat');
      const result = await childChatFn({
        studentId,
        message: trimmedMessage,
      });

      // Message is already saved by the backend, so the real-time listener will update the UI
      if (result.data?.success) {
        // Success - message will appear via real-time listener
      }
    } catch (err) {
      console.error('Error sending message:', err);
      
      // Parse Firebase error
      let errorMessage = 'Failed to send message. Please try again.';
      if (err?.code === 'functions/invalid-argument') {
        errorMessage = err?.message || 'Invalid request. Please check your input.';
      } else if (err?.code === 'functions/permission-denied') {
        errorMessage = 'You don\'t have permission to access this chat.';
      } else if (err?.code === 'functions/unavailable') {
        errorMessage = 'Unable to connect to AI service. Please check your connection.';
      } else if (err?.code === 'functions/internal') {
        errorMessage = err?.message || 'AI service error occurred. Please try again.';
      } else if (err?.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      // Restore input value on error
      setInputValue(trimmedMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
      
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  if (!studentId) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Student information is missing.</Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        pb: 12, // Space for floating input bubble above footer
      }}
    >
      {/* Error Display */}
      {error && (
        <Box sx={{ p: 2, pb: 1 }}>
          <Alert 
            severity="error" 
            onClose={() => setError('')}
            sx={{ mb: 0 }}
          >
            {error}
          </Alert>
        </Box>
      )}

      {/* Messages List - Full width, scrollable */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 2,
          py: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        {messages.length === 0 && !loading && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="body2" color="text.secondary">
              Start a conversation about {getStudentName(student)}!
            </Typography>
          </Box>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <Box
              key={msg.id}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                width: '100%',
                px: { xs: 1, sm: 2 },
                mb: 2,
              }}
            >
              {/* Avatar above message */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  mb: 0.5,
                }}
              >
                <Avatar 
                  sx={{ 
                    bgcolor: isUser ? '#64748b' : '#6366f1', 
                    width: 28, 
                    height: 28, 
                    flexShrink: 0 
                  }}
                >
                  {isUser ? (
                    <UserIcon fontSize="small" />
                  ) : (
                    <AssistantIcon fontSize="small" />
                  )}
                </Avatar>
              </Box>

              {/* Message content - full width */}
              {isUser ? (
                // User message: Bubble
                <Paper
                  sx={{
                    p: 2,
                    backgroundColor: '#4f46e5',
                    color: '#fff',
                    borderRadius: 3,
                    boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
                    maxWidth: '95%',
                    width: 'fit-content',
                    alignSelf: 'flex-end',
                  }}
                >
                  <Typography 
                    variant="body1" 
                    sx={{ 
                      whiteSpace: 'pre-wrap', 
                      wordBreak: 'break-word',
                      lineHeight: 1.6,
                      fontSize: '0.95rem',
                    }}
                  >
                    {msg.content}
                  </Typography>
                </Paper>
              ) : (
                // AI message: Plain text, full width
                <Box sx={{ width: '100%', maxWidth: '95%' }}>
                  <Typography 
                    variant="body1" 
                    sx={{ 
                      whiteSpace: 'pre-wrap', 
                      wordBreak: 'break-word',
                      lineHeight: 1.7,
                      fontSize: '0.95rem',
                      color: '#1e293b',
                    }}
                  >
                    {msg.content}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      display: 'block',
                      mt: 1,
                      opacity: 0.6,
                      fontSize: '0.7rem',
                      color: '#64748b',
                    }}
                  >
                    {formatTimestamp(msg.timestamp)}
                  </Typography>
                </Box>
              )}
            </Box>
          );
        })}

        {/* Coach Pepper themed loading state - Plain text style */}
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', px: { xs: 1, sm: 2 }, mb: 2 }}>
            {/* Avatar above loading message */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 0.5 }}>
              <Avatar sx={{ bgcolor: '#6366f1', width: 28, height: 28, flexShrink: 0 }}>
                <AssistantIcon fontSize="small" />
              </Avatar>
            </Box>
            {/* Loading message - full width */}
            <Box sx={{ width: '100%', maxWidth: '95%', display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CircularProgress 
                size={18} 
                sx={{ 
                  color: '#6366f1',
                  '& .MuiCircularProgress-circle': {
                    strokeLinecap: 'round',
                  }
                }} 
              />
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', color: '#64748b' }}>
                Coach Pepper is thinking...
              </Typography>
            </Box>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Floating Input Bubble - ChatGPT style */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 80, // Above app footer with some spacing
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: { xs: 'calc(100vw - 32px)', sm: '388px' }, // 420px - 32px padding
          zIndex: 1000,
          '@media (max-width: 599px)': {
            '@supports (padding: env(safe-area-inset-bottom))': {
              bottom: 'calc(80px + env(safe-area-inset-bottom))',
            },
          },
        }}
      >
        <Paper
          elevation={3}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 1,
            borderRadius: 4,
            backgroundColor: '#fff',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
            border: '1px solid #e2e8f0',
          }}
        >
          <TextField
            fullWidth
            multiline
            maxRows={4}
            placeholder="Ask a question about this student..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={loading}
            variant="standard"
            InputProps={{
              disableUnderline: true,
              sx: {
                fontSize: '0.95rem',
                px: 1.5,
                py: 1,
                '&::placeholder': {
                  opacity: 0.6,
                },
              },
            }}
            sx={{
              flex: 1,
              '& .MuiInputBase-root': {
                minHeight: '44px',
              },
            }}
          />
          <Button
            variant="contained"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || loading}
            sx={{
              minWidth: '40px',
              width: '40px',
              height: '40px',
              backgroundColor: inputValue.trim() ? '#4f46e5' : '#cbd5e1',
              borderRadius: '50%',
              '&:hover': {
                backgroundColor: inputValue.trim() ? '#4338ca' : '#cbd5e1',
              },
              '&:disabled': {
                backgroundColor: '#cbd5e1',
              },
              boxShadow: inputValue.trim() ? '0 2px 8px rgba(79, 70, 229, 0.3)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {loading ? (
              <CircularProgress size={18} sx={{ color: '#fff' }} />
            ) : (
              <SendIcon fontSize="small" />
            )}
          </Button>
        </Paper>
      </Box>
    </Box>
  );
}

export default ChildChat;
