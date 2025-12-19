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
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
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

  // Scroll to bottom on mount
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      // No need to manually add it here
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
        maxHeight: 'calc(100vh - 120px)',
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: '1px solid #e2e8f0' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#1e293b' }}>
          AI Chat: {getStudentName(student)}
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
          Ask questions about this student's development and observations
        </Typography>
      </Box>

      {/* Error Display */}
      {error && (
        <Box sx={{ p: 2 }}>
          <Alert 
            severity="error" 
            onClose={() => setError('')}
            sx={{ mb: 2 }}
          >
            {error}
          </Alert>
        </Box>
      )}

      {/* Messages List */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {messages.length === 0 && !loading && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              No messages yet. Start a conversation about {getStudentName(student)}!
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
                gap: 1,
              }}
            >
              {!isUser && (
                <Avatar sx={{ bgcolor: '#6366f1', width: 32, height: 32 }}>
                  <AssistantIcon fontSize="small" />
                </Avatar>
              )}
              <Paper
                sx={{
                  p: 2,
                  maxWidth: '75%',
                  backgroundColor: isUser ? '#4f46e5' : '#f1f5f9',
                  color: isUser ? '#fff' : '#1e293b',
                  borderRadius: 2,
                }}
              >
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msg.content}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    mt: 1,
                    opacity: 0.7,
                    fontSize: '0.7rem',
                  }}
                >
                  {formatTimestamp(msg.timestamp)}
                </Typography>
              </Paper>
              {isUser && (
                <Avatar sx={{ bgcolor: '#64748b', width: 32, height: 32 }}>
                  <UserIcon fontSize="small" />
                </Avatar>
              )}
            </Box>
          );
        })}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', gap: 1 }}>
            <Avatar sx={{ bgcolor: '#6366f1', width: 32, height: 32 }}>
              <AssistantIcon fontSize="small" />
            </Avatar>
            <Paper
              sx={{
                p: 2,
                backgroundColor: '#f1f5f9',
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                AI is thinking...
              </Typography>
            </Paper>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Input Area */}
      <Box
        sx={{
          p: 2,
          borderTop: '1px solid #e2e8f0',
          backgroundColor: '#fff',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            placeholder="Ask a question about this student..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={loading}
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#f8fafc',
              },
            }}
          />
          <Button
            variant="contained"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || loading}
            sx={{
              minWidth: '56px',
              height: '40px',
              backgroundColor: '#4f46e5',
              '&:hover': {
                backgroundColor: '#4338ca',
              },
            }}
          >
            {loading ? (
              <CircularProgress size={20} sx={{ color: '#fff' }} />
            ) : (
              <SendIcon />
            )}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

export default ChildChat;
