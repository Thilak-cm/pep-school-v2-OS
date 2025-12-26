import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  IconButton,
  ClickAwayListener,
} from '@mui/material';
import { Send, Add, Chat, ArrowDropDown } from '@mui/icons-material';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions, auth } from '../firebase';
import CopyToClipboardButton from './CopyToClipboardButton';

// Basic markdown formatting function
const formatMessage = (text) => {
  if (!text) return '';
  
  // Split by lines to handle bullets and paragraphs
  const lines = text.split('\n');
  const formatted = [];
  let inList = false;
  let listItems = [];
  let listType = null; // 'ul' or 'ol'
  
  const flushList = () => {
    if (listItems.length > 0) {
      const ListComponent = listType === 'ol' ? 'ol' : 'ul';
      formatted.push(
        <Box key={`list-${formatted.length}`} component={ListComponent} sx={{ m: 0, pl: 2, mb: 1 }}>
          {listItems}
        </Box>
      );
      listItems = [];
      inList = false;
      listType = null;
    }
  };
  
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    // Handle bullet points (- or *)
    if (trimmed.match(/^[-*]\s+/)) {
      const content = trimmed.replace(/^[-*]\s+/, '');
      if (!inList || listType !== 'ul') {
        flushList();
        inList = true;
        listType = 'ul';
      }
      listItems.push(
        <Box key={`item-${index}`} component="li" sx={{ mb: 0.5 }}>
          {formatInlineMarkdown(content)}
        </Box>
      );
    } else if (trimmed.match(/^\d+\.\s+/)) {
      // Handle numbered lists
      const content = trimmed.replace(/^\d+\.\s+/, '');
      if (!inList || listType !== 'ol') {
        flushList();
        inList = true;
        listType = 'ol';
      }
      listItems.push(
        <Box key={`item-${index}`} component="li" sx={{ mb: 0.5 }}>
          {formatInlineMarkdown(content)}
        </Box>
      );
    } else {
      // Flush any pending list
      flushList();
      
      if (trimmed.startsWith('###')) {
        // H3 headers
        const content = trimmed.replace(/^###\s+/, '');
        formatted.push(
          <Typography key={index} variant="subtitle2" sx={{ fontWeight: 600, mt: index > 0 ? 1.5 : 0, mb: 0.5 }}>
            {formatInlineMarkdown(content)}
          </Typography>
        );
      } else if (trimmed.startsWith('##')) {
        // H2 headers
        const content = trimmed.replace(/^##\s+/, '');
        formatted.push(
          <Typography key={index} variant="subtitle1" sx={{ fontWeight: 600, mt: index > 0 ? 1.5 : 0, mb: 0.5 }}>
            {formatInlineMarkdown(content)}
          </Typography>
        );
      } else if (trimmed.startsWith('#')) {
        // H1 headers
        const content = trimmed.replace(/^#\s+/, '');
        formatted.push(
          <Typography key={index} variant="h6" sx={{ fontWeight: 600, mt: index > 0 ? 1.5 : 0, mb: 0.5 }}>
            {formatInlineMarkdown(content)}
          </Typography>
        );
      } else if (trimmed) {
        // Regular paragraph
        formatted.push(
          <Box key={index} component="p" sx={{ m: 0, mb: 1 }}>
            {formatInlineMarkdown(trimmed)}
          </Box>
        );
      } else {
        // Empty line
        formatted.push(<br key={index} />);
      }
    }
  });
  
  // Flush any remaining list
  flushList();
  
  return formatted;
};

// Format inline markdown (bold, italic, code)
const formatInlineMarkdown = (text) => {
  if (!text) return '';
  
  const parts = [];
  let currentIndex = 0;
  
  // Match **bold**, *italic*, `code`, and regular text
  const patterns = [
    { regex: /\*\*([^*]+)\*\*/g, type: 'bold' },
    { regex: /\*([^*]+)\*/g, type: 'italic' },
    { regex: /`([^`]+)`/g, type: 'code' },
  ];
  
  const matches = [];
  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: pattern.type,
        content: match[1],
        fullMatch: match[0],
      });
    }
  });
  
  // Sort matches by start position
  matches.sort((a, b) => a.start - b.start);
  
  // Remove overlapping matches (prefer bold over italic)
  const filteredMatches = [];
  matches.forEach((match) => {
    const overlaps = filteredMatches.some(
      (m) => match.start < m.end && match.end > m.start
    );
    if (!overlaps) {
      filteredMatches.push(match);
    }
  });
  
  // Build formatted parts
  filteredMatches.forEach((match) => {
    // Add text before match
    if (match.start > currentIndex) {
      parts.push(text.substring(currentIndex, match.start));
    }
    
    // Add formatted match
    if (match.type === 'bold') {
      parts.push(<strong key={`bold-${match.start}`}>{match.content}</strong>);
    } else if (match.type === 'italic') {
      parts.push(<em key={`italic-${match.start}`}>{match.content}</em>);
    } else if (match.type === 'code') {
      parts.push(
        <Box
          key={`code-${match.start}`}
          component="code"
          sx={{
            backgroundColor: 'rgba(0,0,0,0.1)',
            padding: '0.1em 0.3em',
            borderRadius: '0.25em',
            fontSize: '0.9em',
            fontFamily: 'monospace',
          }}
        >
          {match.content}
        </Box>
      );
    }
    
    currentIndex = match.end;
  });
  
  // Add remaining text
  if (currentIndex < text.length) {
    parts.push(text.substring(currentIndex));
  }
  
  return parts.length > 0 ? parts : text;
};

function ChildChat({ student }) {
  // State
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [inputMessage, setInputMessage] = useState('');
  const [chatDropdownOpen, setChatDropdownOpen] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [selectedChatName, setSelectedChatName] = useState('New Chat');

  // Refs
  const messagesEndRef = useRef(null);
  const chatsUnsubscribeRef = useRef(null);
  const messagesUnsubscribeRef = useRef(null);
  const chatDropdownAnchorRef = useRef(null);

  // Get student display name
  const getStudentDisplayName = () => {
    if (!student) return 'Student';
    return (
      student.displayName ||
      student.name ||
      `${student.firstName || ''} ${student.lastName || ''}`.trim() ||
      'Student'
    );
  };

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load chats list
  useEffect(() => {
    if (!student?.id) {
      setError('Student information is required');
      setLoading(false);
      setLoadingChats(false);
      return;
    }

    setLoadingChats(true);
    setError('');

    const chatsRef = collection(db, 'students', student.id, 'chats');

    // Try query with orderBy first, fallback to fetching all if index missing
    const loadChats = async () => {
      try {
        let snapshot;
        try {
          const q = query(
            chatsRef,
            where('deleted', '==', false),
            orderBy('createdAt', 'desc')
          );
          snapshot = await getDocs(q);
        } catch (indexError) {
          // Fallback: fetch all and filter/sort in memory
          console.warn('[ChildChat] Query with orderBy failed, using fallback:', indexError.message);
          const allSnapshot = await getDocs(chatsRef);
          snapshot = allSnapshot;
        }

        const chatsList = [];
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          // Filter out deleted chats if using fallback
          if (data.deleted === true) {
            return;
          }
          chatsList.push({
            id: doc.id,
            name: data.name || 'New Chat',
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
            lastMessagePreview: data.lastMessagePreview || '',
            messageCount: data.messageCount || 0,
          });
        });

        // Sort by createdAt desc if using fallback
        if (chatsList.length > 0 && chatsList[0].createdAt) {
          chatsList.sort((a, b) => {
            const aTime = a.createdAt?.toMillis
              ? a.createdAt.toMillis()
              : (a.createdAt?.seconds || 0) * 1000;
            const bTime = b.createdAt?.toMillis
              ? b.createdAt.toMillis()
              : (b.createdAt?.seconds || 0) * 1000;
            return bTime - aTime; // Descending order
          });
        }

        setChats(chatsList);

        // Select most recent chat or set to null if none exist
        if (chatsList.length > 0) {
          setSelectedChatId(chatsList[0].id);
          setSelectedChatName(chatsList[0].name);
        } else {
          setSelectedChatId(null);
          setSelectedChatName('New Chat');
        }
      } catch (err) {
        console.error('[ChildChat] Error loading chats:', err);
        setError('Failed to load chats. Please try again.');
      } finally {
        setLoadingChats(false);
        setLoading(false);
      }
    };

    loadChats();

    // Set up real-time listener for chats
    let unsubscribe;
    try {
      const q = query(chatsRef, where('deleted', '==', false), orderBy('createdAt', 'desc'));
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const chatsList = [];
          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            chatsList.push({
              id: doc.id,
              name: data.name || 'New Chat',
              createdAt: data.createdAt || null,
              updatedAt: data.updatedAt || null,
              lastMessagePreview: data.lastMessagePreview || '',
              messageCount: data.messageCount || 0,
            });
          });

          // Sort by createdAt desc
          if (chatsList.length > 0 && chatsList[0].createdAt) {
            chatsList.sort((a, b) => {
              const aTime = a.createdAt?.toMillis
                ? a.createdAt.toMillis()
                : (a.createdAt?.seconds || 0) * 1000;
              const bTime = b.createdAt?.toMillis
                ? b.createdAt.toMillis()
                : (b.createdAt?.seconds || 0) * 1000;
              return bTime - aTime;
            });
          }

          setChats(chatsList);

          // Update selected chat name if it changed
          if (selectedChatId) {
            const selectedChat = chatsList.find((c) => c.id === selectedChatId);
            if (selectedChat) {
              setSelectedChatName(selectedChat.name);
            }
          }

          // If selected chat was deleted, select most recent
          if (selectedChatId && !chatsList.find((c) => c.id === selectedChatId)) {
            if (chatsList.length > 0) {
              setSelectedChatId(chatsList[0].id);
              setSelectedChatName(chatsList[0].name);
            } else {
              setSelectedChatId(null);
              setSelectedChatName('New Chat');
            }
          }
        },
        (err) => {
          console.error('[ChildChat] Error in chats listener:', err);
        }
      );
    } catch (err) {
      // If index doesn't exist, skip real-time updates for chats
      console.warn('[ChildChat] Could not set up chats listener:', err);
    }

    chatsUnsubscribeRef.current = unsubscribe;

    return () => {
      if (chatsUnsubscribeRef.current) {
        chatsUnsubscribeRef.current();
      }
    };
  }, [student?.id, selectedChatId]);

  // Load messages for selected chat
  useEffect(() => {
    if (!student?.id || !selectedChatId) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    setLoadingMessages(true);
    setError('');

    // Clean up previous listener
    if (messagesUnsubscribeRef.current) {
      messagesUnsubscribeRef.current();
      messagesUnsubscribeRef.current = null;
    }

    const messagesRef = collection(
      db,
      'students',
      student.id,
      'chats',
      selectedChatId,
      'messages'
    );

    try {
      const q = query(messagesRef, orderBy('timestamp', 'asc'));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const messagesList = [];
          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            messagesList.push({
              id: doc.id,
              role: data.role || 'user',
              content: data.content || '',
              timestamp: data.timestamp || null,
              authorName: data.authorName || null,
              model: data.model || null,
            });
          });

          setMessages(messagesList);
          setLoadingMessages(false);

          // Auto-scroll to bottom after a short delay
          setTimeout(() => {
            scrollToBottom();
          }, 100);
        },
        (err) => {
          console.error('[ChildChat] Error loading messages:', err);
          setError('Failed to load messages. Please try again.');
          setLoadingMessages(false);
        }
      );

      messagesUnsubscribeRef.current = unsubscribe;
    } catch (err) {
      console.error('[ChildChat] Error setting up messages listener:', err);
      setError('Failed to load messages. Please try again.');
      setLoadingMessages(false);
    }

    return () => {
      if (messagesUnsubscribeRef.current) {
        messagesUnsubscribeRef.current();
      }
    };
  }, [student?.id, selectedChatId]);

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  // Handle send message
  const handleSendMessage = async () => {
    const messageText = inputMessage.trim();
    if (!messageText) {
      return;
    }

    if (!student?.id) {
      setError('Student information is required');
      return;
    }

    setSending(true);
    setError('');

    // Optimistically add user message
    const tempUserMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: Timestamp.now(),
      authorName: auth.currentUser?.displayName || null,
    };
    setMessages((prev) => [...prev, tempUserMessage]);
    setInputMessage('');

    try {
      const childChatFn = httpsCallable(cloudFunctions, 'childChat');
      const result = await childChatFn({
        studentId: student.id,
        message: messageText,
        chatId: selectedChatId || null, // null = auto-create/find
      });

      const responseData = result.data;

      if (!responseData.success) {
        throw new Error(responseData.error || 'Failed to send message');
      }

      // Update selectedChatId if a new chat was created
      if (responseData.chatId && responseData.chatId !== selectedChatId) {
        setSelectedChatId(responseData.chatId);
        // Update chat name from chats list
        const newChat = chats.find((c) => c.id === responseData.chatId);
        if (newChat) {
          setSelectedChatName(newChat.name);
        }
      }

      // Remove temp message (real message will come via listener)
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));

      // Scroll to bottom
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    } catch (err) {
      console.error('[ChildChat] Error sending message:', err);

      // Remove temp message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));

      // Restore input message
      setInputMessage(messageText);

      // Extract error message
      let errorMessage = 'Failed to send message. Please try again.';
      if (err?.code === 'functions/unauthenticated') {
        errorMessage = 'You must be signed in to send messages.';
      } else if (err?.code === 'functions/permission-denied') {
        errorMessage = 'You do not have permission to send messages.';
      } else if (err?.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setSending(false);
    }
  };

  // Handle create new chat
  const handleCreateNewChat = () => {
    setSelectedChatId(null);
    setMessages([]);
    setInputMessage('');
    setSelectedChatName('New Chat');
    setChatDropdownOpen(false);
  };

  // Handle chat selection
  const handleSelectChat = (chatId) => {
    const chat = chats.find((c) => c.id === chatId);
    setSelectedChatId(chatId);
    setSelectedChatName(chat?.name || 'New Chat');
    setChatDropdownOpen(false);
  };

  // Handle key press in input
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sending && inputMessage.trim()) {
        handleSendMessage();
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chatsUnsubscribeRef.current) {
        chatsUnsubscribeRef.current();
      }
      if (messagesUnsubscribeRef.current) {
        messagesUnsubscribeRef.current();
      }
    };
  }, []);

  // Validation: student required
  if (!student?.id) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Student information is required to start a chat.</Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: '375px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f8fafc',
        position: 'relative',
      }}
    >
      {/* Floating Chat Dropdown - Pinned below AppHeader */}
      <Box
        sx={{
          position: 'fixed',
          top: { xs: 'calc(64px + env(safe-area-inset-top, 0px))', sm: '64px' },
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          width: '100%',
          maxWidth: '375px',
          px: 2,
          pt: 1,
          pb: 0.5,
          backgroundColor: 'transparent',
        }}
      >
        <ClickAwayListener onClickAway={() => setChatDropdownOpen(false)}>
          <Box>
            <Paper
              ref={chatDropdownAnchorRef}
              elevation={1}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 0.75,
                borderRadius: '24px',
                backgroundColor: 'white',
                border: '1px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                '&:hover': {
                  backgroundColor: 'grey.50',
                },
              }}
              onClick={() => setChatDropdownOpen(!chatDropdownOpen)}
            >
              <Typography variant="body2" sx={{ fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedChatName}
              </Typography>
              <ArrowDropDown sx={{ fontSize: 18, color: 'text.secondary' }} />
            </Paper>

            {/* Simplified Dropdown Menu */}
            {chatDropdownOpen && (
              <Paper
                elevation={3}
                sx={{
                  position: 'absolute',
                  top: '100%',
                  left: 16,
                  right: 16,
                  mt: 0.5,
                  maxHeight: '250px',
                  overflowY: 'auto',
                  borderRadius: 2,
                  backgroundColor: 'white',
                }}
              >
                {loadingChats ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                    <CircularProgress size={20} />
                  </Box>
                ) : (
                  <List sx={{ py: 0.5 }}>
                    <ListItemButton
                      onClick={handleCreateNewChat}
                      dense
                      sx={{
                        borderRadius: 1,
                        mx: 0.5,
                        backgroundColor: selectedChatId === null ? 'primary.light' : 'transparent',
                        '&:hover': {
                          backgroundColor: 'grey.100',
                        },
                      }}
                    >
                      <ListItemText
                        primary="New Chat"
                        primaryTypographyProps={{
                          variant: 'body2',
                          fontWeight: selectedChatId === null ? 600 : 400,
                        }}
                      />
                    </ListItemButton>
                    {chats.map((chat) => (
                      <ListItemButton
                        key={chat.id}
                        onClick={() => handleSelectChat(chat.id)}
                        dense
                        sx={{
                          borderRadius: 1,
                          mx: 0.5,
                          backgroundColor: chat.id === selectedChatId ? 'primary.light' : 'transparent',
                          '&:hover': {
                            backgroundColor: 'grey.100',
                          },
                        }}
                      >
                        <ListItemText
                          primary={chat.name}
                          primaryTypographyProps={{
                            variant: 'body2',
                            fontWeight: chat.id === selectedChatId ? 600 : 400,
                          }}
                        />
                      </ListItemButton>
                    ))}
                  </List>
                )}
              </Paper>
            )}
          </Box>
        </ClickAwayListener>
      </Box>

      {/* Messages Area */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          p: 2,
          pt: { xs: 'calc(64px + 56px + env(safe-area-inset-top, 0px))', sm: 'calc(64px + 56px)' },
          pb: { xs: 'calc(80px + env(safe-area-inset-bottom, 0px))', sm: '80px' },
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        {loadingMessages && messages.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <CircularProgress />
          </Box>
        ) : selectedChatId === null ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              textAlign: 'center',
              p: 3,
            }}
          >
            <Chat sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Start a new conversation
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Ask Coach Pepper about {getStudentDisplayName()}'s progress, development, or observations.
            </Typography>
          </Box>
        ) : messages.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              textAlign: 'center',
              p: 3,
            }}
          >
            <Chat sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              No messages yet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Start the conversation by asking a question about {getStudentDisplayName()}.
            </Typography>
          </Box>
        ) : (
          <>
            {messages.map((message) => (
              <Box
                key={message.id}
                sx={{
                  display: 'flex',
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                  mb: 1,
                  position: 'relative',
                  width: '100%',
                }}
              >
                {message.role === 'user' ? (
                  // User message: Show in a bubble
                  <Paper
                    elevation={0}
                    sx={{
                      maxWidth: '88%',
                      p: 1.5,
                      backgroundColor: 'primary.main',
                      color: 'white',
                      borderRadius: 2,
                      position: 'relative',
                    }}
                  >
                    {message.authorName && (
                      <Typography variant="caption" sx={{ opacity: 0.8, display: 'block', mb: 0.5 }}>
                        {message.authorName}
                      </Typography>
                    )}
                    <Box
                      component="div"
                      sx={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        '& ul': {
                          margin: 0,
                          paddingLeft: 2,
                          listStyleType: 'disc',
                        },
                        '& ol': {
                          margin: 0,
                          paddingLeft: 2,
                        },
                        '& p': {
                          margin: 0,
                          marginBottom: 1,
                          '&:last-child': {
                            marginBottom: 0,
                          },
                        },
                      }}
                    >
                      {formatMessage(message.content)}
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        mt: 0.5,
                      }}
                    >
                      {message.timestamp && (
                        <Typography
                          variant="caption"
                          sx={{
                            opacity: 0.7,
                            fontSize: '0.7rem',
                          }}
                        >
                          {formatTimestamp(message.timestamp)}
                        </Typography>
                      )}
                      <CopyToClipboardButton
                        text={message.content}
                        ariaLabel="Copy message"
                        sx={{
                          backgroundColor: 'rgba(255,255,255,0.15)',
                          border: 'none',
                          minWidth: 28,
                          minHeight: 28,
                          borderRadius: '50%',
                          padding: 0.5,
                          opacity: 0.8,
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            backgroundColor: 'rgba(255,255,255,0.25)',
                            opacity: 1,
                            transform: 'scale(1.05)',
                          },
                          '&:active': {
                            transform: 'scale(0.95)',
                          },
                        }}
                      />
                    </Box>
                  </Paper>
                ) : (
                  // Assistant message: Full width, no bubble
                  <Box
                    sx={{
                      width: '100%',
                      p: 1.5,
                      position: 'relative',
                    }}
                  >
                    <Box
                      component="div"
                      sx={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        color: 'text.primary',
                        '& ul': {
                          margin: 0,
                          paddingLeft: 2,
                          listStyleType: 'disc',
                        },
                        '& ol': {
                          margin: 0,
                          paddingLeft: 2,
                        },
                        '& p': {
                          margin: 0,
                          marginBottom: 1,
                          '&:last-child': {
                            marginBottom: 0,
                          },
                        },
                      }}
                    >
                      {formatMessage(message.content)}
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        mt: 0.5,
                      }}
                    >
                      {message.timestamp && (
                        <Typography
                          variant="caption"
                          sx={{
                            opacity: 0.7,
                            fontSize: '0.7rem',
                          }}
                        >
                          {formatTimestamp(message.timestamp)}
                        </Typography>
                      )}
                      <CopyToClipboardButton
                        text={message.content}
                        ariaLabel="Copy message"
                        sx={{
                          backgroundColor: 'rgba(0,0,0,0.05)',
                          border: '1px solid #e2e8f0',
                          minWidth: 24,
                          minHeight: 24,
                          '&:hover': {
                            backgroundColor: '#f8fafc',
                          },
                        }}
                      />
                    </Box>
                  </Box>
                )}
              </Box>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </Box>

      {/* Floating Input Area - Fixed at bottom */}
      <Box
        sx={{
          position: 'fixed',
          bottom: { xs: 'calc(80px + env(safe-area-inset-bottom, 0px))', sm: '80px' },
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '375px',
          zIndex: 1000,
          px: 2,
          pb: { xs: 'env(safe-area-inset-bottom, 0px)', sm: 0 },
        }}
      >
        {error && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}
        <Paper
          elevation={4}
          sx={{
            p: 1,
            borderRadius: '24px',
            backgroundColor: 'white',
            border: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            gap: 1,
            alignItems: 'flex-end',
          }}
        >
          <TextField
            fullWidth
            multiline
            maxRows={4}
            placeholder="Type your message..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={sending}
            variant="standard"
            InputProps={{
              disableUnderline: true,
            }}
            sx={{
              '& .MuiInputBase-root': {
                backgroundColor: 'grey.50',
                borderRadius: '20px',
                px: 1.5,
                py: 1,
              },
            }}
          />
          <IconButton
            color="primary"
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || sending}
            aria-label="Send message"
            sx={{
              minWidth: 44,
              minHeight: 44,
              backgroundColor: 'primary.main',
              color: 'white',
              '&:hover': {
                backgroundColor: 'primary.dark',
              },
              '&:disabled': {
                backgroundColor: 'grey.300',
                color: 'grey.500',
              },
            }}
          >
            {sending ? <CircularProgress size={20} color="inherit" /> : <Send />}
          </IconButton>
        </Paper>
      </Box>
    </Box>
  );
}

export default ChildChat;
