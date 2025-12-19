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
        pb: 10, // Space for input area above footer
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
          py: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
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
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                alignItems: 'flex-start',
                gap: 1.5,
                width: '100%',
              }}
            >
              {!isUser && (
                <Avatar sx={{ bgcolor: '#6366f1', width: 40, height: 40, flexShrink: 0 }}>
                  <AssistantIcon />
                </Avatar>
              )}
              <Paper
                sx={{
                  p: 2.5,
                  maxWidth: isUser ? '85%' : '85%',
                  minWidth: '60%',
                  backgroundColor: isUser ? '#4f46e5' : '#f1f5f9',
                  color: isUser ? '#fff' : '#1e293b',
                  borderRadius: 3,
                  boxShadow: isUser 
                    ? '0 2px 8px rgba(79, 70, 229, 0.2)' 
                    : '0 2px 8px rgba(0, 0, 0, 0.08)',
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
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    mt: 1.5,
                    opacity: 0.7,
                    fontSize: '0.7rem',
                  }}
                >
                  {formatTimestamp(msg.timestamp)}
                </Typography>
              </Paper>
              {isUser && (
                <Avatar sx={{ bgcolor: '#64748b', width: 40, height: 40, flexShrink: 0 }}>
                  <UserIcon />
                </Avatar>
              )}
            </Box>
          );
        })}

        {/* Coach Pepper themed loading state */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 1.5, width: '100%' }}>
            <Avatar sx={{ bgcolor: '#6366f1', width: 40, height: 40, flexShrink: 0 }}>
              <AssistantIcon />
            </Avatar>
            <Paper
              sx={{
                p: 2.5,
                maxWidth: '85%',
                minWidth: '60%',
                backgroundColor: '#f1f5f9',
                borderRadius: 3,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <CircularProgress 
                size={20} 
                sx={{ 
                  color: '#6366f1',
                  '& .MuiCircularProgress-circle': {
                    strokeLinecap: 'round',
                  }
                }} 
              />
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                Coach Pepper is thinking...
              </Typography>
            </Paper>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Input Area - Rooted to bottom, above footer */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 64, // Above app footer (64px footer height)
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: { xs: '100vw', sm: '420px' },
          backgroundColor: '#fff',
          borderTop: '1px solid #e2e8f0',
          p: 2,
          zIndex: 1000,
          boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.05)',
          '@media (max-width: 599px)': {
            '@supports (padding: env(safe-area-inset-bottom))': {
              paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
            },
          },
        }}
      >
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField
            fullWidth
            multiline
            maxRows={3}
            placeholder="Ask a question about this student..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={loading}
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#f8fafc',
                borderRadius: 2,
              },
            }}
          />
          <Button
            variant="contained"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || loading}
            sx={{
              minWidth: '48px',
              width: '48px',
              height: '40px',
              backgroundColor: '#4f46e5',
              borderRadius: 2,
              '&:hover': {
                backgroundColor: '#4338ca',
              },
              '&:disabled': {
                backgroundColor: '#cbd5e1',
              },
            }}
          >
            {loading ? (
              <CircularProgress size={18} sx={{ color: '#fff' }} />
            ) : (
              <SendIcon fontSize="small" />
            )}
          </Button>
        </Box>
        <Typography 
          variant="caption" 
          sx={{ 
            display: 'block', 
            mt: 0.5, 
            color: '#64748b',
            fontSize: '0.7rem',
            textAlign: 'center',
          }}
        >
          Ask questions about {getStudentName(student)}'s development
        </Typography>
      </Box>
    </Box>
  );
}

export default ChildChat;
