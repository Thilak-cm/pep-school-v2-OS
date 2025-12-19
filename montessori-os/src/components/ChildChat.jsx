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
  Select,
  MenuItem,
  FormControl,
  IconButton,
} from '@mui/material';
import {
  Send as SendIcon,
  SmartToy as AssistantIcon,
  Person as UserIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Close as CloseIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';

/**
 * Parse markdown and convert to React elements
 * Supports: **bold**, line breaks, numbered lists
 */
function parseMarkdown(text) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let key = 0;
  let listItems = [];
  let inList = false;

  lines.forEach((line) => {
    const trimmedLine = line.trim();

    // Check for numbered list items (e.g., "1. **text**" or "1. text")
    const listMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);
    
    if (listMatch) {
      // Start or continue a list
      if (!inList) {
        inList = true;
      }
      listItems.push(listMatch[2]);
    } else {
      // If we were building a list, render it now
      if (inList && listItems.length > 0) {
        elements.push(
          <Box key={key++} component="ul" sx={{ pl: 3, my: 1, mb: 0.5 }}>
            {listItems.map((item, idx) => (
              <Box key={idx} component="li" sx={{ mb: 0.5 }}>
                {parseBoldInText(item)}
              </Box>
            ))}
          </Box>
        );
        listItems = [];
        inList = false;
      }

      // Handle empty lines or regular text
      if (trimmedLine === '') {
        elements.push(<br key={key++} />);
      } else {
        elements.push(
          <Box key={key++} component="div" sx={{ mb: 0.5 }}>
            {parseBoldInText(trimmedLine)}
          </Box>
        );
      }
    }
  });

  // Close any remaining list
  if (inList && listItems.length > 0) {
    elements.push(
      <Box key={key++} component="ul" sx={{ pl: 3, my: 1, mb: 0.5 }}>
        {listItems.map((item, idx) => (
          <Box key={idx} component="li" sx={{ mb: 0.5 }}>
            {parseBoldInText(item)}
          </Box>
        ))}
      </Box>
    );
  }

  return elements.length > 0 ? elements : parseBoldInText(text);
}

/**
 * Parse bold text within a string and return React elements
 */
function parseBoldInText(text) {
  if (!text) return null;

  const parts = [];
  let lastIndex = 0;
  let key = 0;

  const boldPattern = /\*\*(.+?)\*\*/g;
  let match;

  while ((match = boldPattern.exec(text)) !== null) {
    // Add text before the bold
    if (match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index);
      if (beforeText) {
        parts.push(<span key={key++}>{beforeText}</span>);
      }
    }

    // Add bold text
    parts.push(
      <Typography
        key={key++}
        component="span"
        sx={{ fontWeight: 600, color: 'inherit' }}
      >
        {match[1]}
      </Typography>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      parts.push(<span key={key++}>{remainingText}</span>);
    }
  }

  return parts.length > 0 ? parts : text;
}

function ChildChat({ student }) {
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [error, setError] = useState('');
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingChatName, setEditingChatName] = useState('');
  const messagesEndRef = useRef(null);
  const studentId = student?.id || student?.uid || null;

  const getStudentName = (s) => {
    if (!s) return 'Student';
    return s.displayName || s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Student';
  };

  // Load chats for student
  useEffect(() => {
    if (!studentId) {
      setChats([]);
      setCurrentChatId(null);
      setIsLoadingChats(false);
      return;
    }

    const loadChats = async () => {
      setIsLoadingChats(true);
      try {
        const listChatsFn = httpsCallable(cloudFunctions, 'listChats');
        const result = await listChatsFn({ studentId });
        
        if (result.data?.success && result.data?.chats) {
          const chatList = result.data.chats;
          setChats(chatList);
          
          // Auto-select most recent chat if chats exist
          // Don't auto-create - wait for user to send a message
          if (chatList.length > 0) {
            setCurrentChatId(chatList[0].id);
          } else {
            // No chats exist - don't create one yet, wait for user to send message
            setCurrentChatId(null);
          }
        } else {
          // No chats found
          setChats([]);
          setCurrentChatId(null);
        }
      } catch (err) {
        setError('Failed to load chats.');
        setChats([]);
        setCurrentChatId(null);
      } finally {
        setIsLoadingChats(false);
      }
    };

    loadChats();
  }, [studentId]);

  // Set up real-time listener for chat messages
  useEffect(() => {
    if (!studentId || !currentChatId) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, 'students', studentId, 'chats', currentChatId, 'messages');
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
        setError('Failed to load chat messages.');
      }
    );

    return () => unsubscribe();
  }, [studentId, currentChatId]);

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

    // If no chat exists and chats subcollection is empty, create one before sending
    let chatIdToUse = currentChatId;
    if (!chatIdToUse && chats.length === 0) {
      // Create new chat only when user sends first message
      setIsCreatingChat(true);
      try {
        const createChatFn = httpsCallable(cloudFunctions, 'createChatFunction');
        const createResult = await createChatFn({ studentId });
        if (createResult.data?.success && createResult.data?.chatId) {
          chatIdToUse = createResult.data.chatId;
          const newChat = {
            id: chatIdToUse,
            name: 'New Chat',
            createdAt: new Date(),
            updatedAt: new Date(),
            lastMessagePreview: '',
            messageCount: 0,
          };
          setChats([newChat]);
          setCurrentChatId(chatIdToUse);
        } else {
          setError('Failed to create chat.');
          setIsCreatingChat(false);
          return;
        }
      } catch (err) {
        setError('Failed to create chat.');
        setIsCreatingChat(false);
        return;
      } finally {
        setIsCreatingChat(false);
      }
    }

    if (!chatIdToUse) {
      setError('No chat selected.');
      return;
    }

    setLoading(true);
    setError('');
    setInputValue('');

    try {
      const childChatFn = httpsCallable(cloudFunctions, 'childChat');
      const result = await childChatFn({
        studentId,
        chatId: chatIdToUse,
        message: trimmedMessage,
      });

      // Message is already saved by the backend, so the real-time listener will update the UI
      if (result.data?.success) {
        // Reload chats to get updated name and metadata
        const listChatsFn = httpsCallable(cloudFunctions, 'listChats');
        const chatResult = await listChatsFn({ studentId });
        if (chatResult.data?.success && chatResult.data?.chats) {
          setChats(chatResult.data.chats);
          // Ensure we're still on the correct chat
          if (result.data?.chatId) {
            setCurrentChatId(result.data.chatId);
          }
        }
      }
    } catch (err) {
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

  const handleCreateNewChat = async () => {
    if (!studentId || isCreatingChat) return;

    setIsCreatingChat(true);
    setError('');

    try {
      const createChatFn = httpsCallable(cloudFunctions, 'createChatFunction');
      const result = await createChatFn({ studentId });
      
      if (result.data?.success && result.data?.chatId) {
        const newChat = {
          id: result.data.chatId,
          name: 'New Chat',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessagePreview: '',
          messageCount: 0,
        };
        setChats([newChat, ...chats]);
        setCurrentChatId(newChat.id);
      }
    } catch (err) {
      setError('Failed to create new chat.');
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleDeleteChat = async (chatIdToDelete) => {
    if (!studentId || !chatIdToDelete) return;

    if (chats.length <= 1) {
      setError('Cannot delete the last chat.');
      return;
    }

    try {
      const deleteChatFn = httpsCallable(cloudFunctions, 'deleteChat');
      await deleteChatFn({ studentId, chatId: chatIdToDelete });
      
      // Remove from local state
      const updatedChats = chats.filter(c => c.id !== chatIdToDelete);
      setChats(updatedChats);
      
      // Switch to most recent chat
      if (currentChatId === chatIdToDelete && updatedChats.length > 0) {
        setCurrentChatId(updatedChats[0].id);
      }
    } catch (err) {
      setError('Failed to delete chat.');
    }
  };

  const handleStartEditChatName = (chat) => {
    setEditingChatId(chat.id);
    setEditingChatName(chat.name);
  };

  const handleSaveChatName = async (chatId) => {
    if (!studentId || !chatId || !editingChatName.trim()) return;

    const trimmedName = editingChatName.trim().substring(0, 100);

    try {
      const updateChatNameFn = httpsCallable(cloudFunctions, 'updateChatName');
      await updateChatNameFn({ studentId, chatId, name: trimmedName });
      
      // Update local state
      setChats(chats.map(c => c.id === chatId ? { ...c, name: trimmedName } : c));
      setEditingChatId(null);
      setEditingChatName('');
    } catch (err) {
      setError('Failed to update chat name.');
    }
  };

  const handleCancelEditChatName = () => {
    setEditingChatId(null);
    setEditingChatName('');
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
        pt: 10, // Space for fixed header bubble
        pb: 12, // Space for floating input bubble above footer
      }}
    >
      {/* Fixed Chat Selector Header - Floating Bubble Style */}
      <Box
        sx={{
          position: 'fixed',
          top: 60, // Below app header
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: { xs: 'calc(100vw - 32px)', sm: '388px' },
          zIndex: 1000,
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
          {editingChatId === currentChatId ? (
            // Edit mode - inline editing
            <>
              <TextField
                fullWidth
                value={editingChatName}
                onChange={(e) => setEditingChatName(e.target.value.substring(0, 100))}
                onBlur={() => handleSaveChatName(currentChatId)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveChatName(currentChatId);
                  } else if (e.key === 'Escape') {
                    handleCancelEditChatName();
                  }
                }}
                autoFocus
                variant="standard"
                InputProps={{
                  disableUnderline: true,
                  sx: {
                    fontSize: '0.95rem',
                    fontWeight: 500,
                    px: 1.5,
                    py: 1,
                  },
                }}
                sx={{
                  flex: 1,
                  '& .MuiInputBase-root': {
                    minHeight: '44px',
                  },
                }}
              />
              <IconButton
                size="small"
                onClick={() => handleSaveChatName(currentChatId)}
                sx={{
                  minWidth: '40px',
                  width: '40px',
                  height: '40px',
                  color: '#fff',
                  backgroundColor: '#4f46e5',
                  '&:hover': {
                    backgroundColor: '#4338ca',
                  },
                }}
              >
                <CheckIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={handleCancelEditChatName}
                sx={{
                  minWidth: '40px',
                  width: '40px',
                  height: '40px',
                  color: '#64748b',
                  '&:hover': {
                    color: '#1e293b',
                    backgroundColor: 'rgba(0, 0, 0, 0.04)',
                  },
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </>
          ) : (
            // View mode - dropdown selector
            <>
              <FormControl fullWidth sx={{ flex: 1 }}>
                <Select
                  value={currentChatId || ''}
                  onChange={(e) => {
                    if (e.target.value !== '__new__') {
                      setCurrentChatId(e.target.value);
                    }
                  }}
                  disabled={isCreatingChat}
                  displayEmpty
                  renderValue={(selected) => {
                    if (!selected) {
                      return (
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          {chats.length === 0 ? 'No chats yet' : 'Select a chat'}
                        </Typography>
                      );
                    }
                    const selectedChat = chats.find(c => c.id === selected);
                    return (
                      <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {selectedChat ? selectedChat.name : 'New Chat'}
                      </Typography>
                    );
                  }}
                  sx={{
                    '& .MuiSelect-select': {
                      py: 1,
                      px: 1.5,
                      minHeight: '44px',
                      display: 'flex',
                      alignItems: 'center',
                    },
                    '& .MuiOutlinedInput-notchedOutline': {
                      border: 'none',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      border: 'none',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      border: 'none',
                    },
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        borderRadius: 2,
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
                        mt: 0.5,
                      },
                    },
                  }}
                >
                  {chats.length === 0 ? (
                    <MenuItem disabled>
                      <Typography variant="body2" color="text.secondary">
                        No chats yet. Send a message to start!
                      </Typography>
                    </MenuItem>
                  ) : (
                    chats.map((chat) => (
                      <MenuItem key={chat.id} value={chat.id}>
                        <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                          {chat.name || 'New Chat'}
                        </Typography>
                      </MenuItem>
                    ))
                  )}
                  <MenuItem value="__new__" onClick={handleCreateNewChat} disabled={isCreatingChat}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AddIcon fontSize="small" />
                      <Typography variant="body2">New Chat</Typography>
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
              {currentChatId && chats.find(c => c.id === currentChatId) && (
                <>
                  <IconButton
                    size="small"
                    onClick={() => handleStartEditChatName(chats.find(c => c.id === currentChatId))}
                    sx={{
                      minWidth: '40px',
                      width: '40px',
                      height: '40px',
                      color: '#64748b',
                      '&:hover': {
                        color: '#4f46e5',
                        backgroundColor: 'rgba(79, 70, 229, 0.08)',
                      },
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  {chats.length > 1 && (
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteChat(currentChatId)}
                      sx={{
                        minWidth: '40px',
                        width: '40px',
                        height: '40px',
                        color: '#64748b',
                        '&:hover': {
                          color: '#dc2626',
                          backgroundColor: 'rgba(220, 38, 38, 0.08)',
                        },
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </>
              )}
            </>
          )}
        </Paper>
      </Box>

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
          pt: 2,
          pb: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        {/* Loading chats - Coach Pepper themed */}
        {isLoadingChats && (
          <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', width: '100%', px: { xs: 1, sm: 2 }, mb: 2, gap: 1, pt: 4 }}>
            <Avatar sx={{ bgcolor: '#6366f1', width: 28, height: 28, flexShrink: 0 }}>
              <AssistantIcon fontSize="small" />
            </Avatar>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
                Coach Pepper is loading your chats...
              </Typography>
            </Box>
          </Box>
        )}

        {/* Empty state - only show after loading completes */}
        {!isLoadingChats && messages.length === 0 && !loading && currentChatId && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="body2" color="text.secondary">
              Start a conversation about {getStudentName(student)}!
            </Typography>
          </Box>
        )}
        {!isLoadingChats && !currentChatId && !isCreatingChat && chats.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="body2" color="text.secondary">
              No chats yet. Send a message to start a conversation about {getStudentName(student)}!
            </Typography>
          </Box>
        )}
        {!isLoadingChats && !currentChatId && !isCreatingChat && chats.length > 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="body2" color="text.secondary">
              Please select a chat from the dropdown above.
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
                    component="div"
                    sx={{ 
                      whiteSpace: 'pre-wrap', 
                      wordBreak: 'break-word',
                      lineHeight: 1.6,
                      fontSize: '0.95rem',
                    }}
                  >
                    {parseMarkdown(msg.content) || msg.content}
                  </Typography>
                </Paper>
              ) : (
                // AI message: Plain text, full width
                <Box sx={{ width: '100%', maxWidth: '95%' }}>
                  <Box
                    sx={{ 
                      whiteSpace: 'pre-wrap', 
                      wordBreak: 'break-word',
                      lineHeight: 1.7,
                      fontSize: '0.95rem',
                      color: '#1e293b',
                    }}
                  >
                    {parseMarkdown(msg.content) || msg.content}
                  </Box>
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
          <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', width: '100%', px: { xs: 1, sm: 2 }, mb: 2, gap: 1 }}>
            {/* Avatar */}
            <Avatar sx={{ bgcolor: '#6366f1', width: 28, height: 28, flexShrink: 0 }}>
              <AssistantIcon fontSize="small" />
            </Avatar>
            {/* Loading message */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
            placeholder="Ask anything about this student..."
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
