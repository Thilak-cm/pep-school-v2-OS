import React, { useState, useEffect, useRef, useMemo } from 'react';
import { keyframes } from '@emotion/react';
import {
  Box,
  Typography,
  TextField,
  CircularProgress,
  Alert,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  IconButton,
  ClickAwayListener,
  Dialog,
  Button,
  Switch,
  Tooltip,
} from '@mui/material';
import { Send, Add, Chat, ArrowDropDown, Edit, Delete, Settings, AutoAwesome } from '@mui/icons-material';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  Timestamp,
  doc,
  updateDoc,
  serverTimestamp,
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

const stripQuotes = (text) => {
  if (!text) return text;
  return text.replace(/^["']|["']$/g, '');
};

const messageContentSx = {
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
};

// Keyframe animations for buffer stages
const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

const TypingIndicator = ({ stage = null }) => {
  const getStageContent = () => {
    switch (stage) {
      case 'creating':
        return {
          icon: <Settings sx={{ fontSize: 18, color: '#4f46e5', animation: `${spin} 2s linear infinite` }} />,
          text: 'Creating your chat...',
        };
      case 'preparing':
        return {
          icon: <AutoAwesome sx={{ fontSize: 18, color: '#4f46e5', animation: `${pulse} 1.5s ease-in-out infinite` }} />,
          text: 'Preparing context...',
        };
      case 'thinking':
      default:
        return {
          icon: <CircularProgress size={18} sx={{ color: '#4f46e5' }} />,
          text: 'Coach Pepper is thinking...',
        };
    }
  };

  const { icon, text } = getStageContent();

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'flex-start',
        mb: 1,
        width: '100%',
        p: 1.5,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {icon}
        <Typography variant="body2" color="text.secondary">
          {text}
        </Typography>
      </Box>
    </Box>
  );
};

const UserBubble = ({ message, formatTimestamp }) => (
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
      sx={messageContentSx}
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
          color: 'white',
          opacity: 0.8,
          transition: 'opacity 0.2s ease',
          '&:hover': {
            opacity: 1,
          },
        }}
      />
    </Box>
  </Paper>
);

const AssistantBubble = ({ message, formatTimestamp }) => (
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
        ...messageContentSx,
        color: 'text.primary',
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
          color: '#000000',
          opacity: 0.6,
          transition: 'opacity 0.2s ease',
          '&:hover': {
            opacity: 1,
          },
        }}
      />
    </Box>
  </Box>
);

function ChildChat({ student, startInLandingPage = false }) {
  // State
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [inputMessage, setInputMessage] = useState('');
  const [chatDropdownOpen, setChatDropdownOpen] = useState(false);
  const [assistantPending, setAssistantPending] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingChatName, setEditingChatName] = useState('');
  const [deletingChatId, setDeletingChatId] = useState(null);
  const [devMode, setDevMode] = useState(true); // Default ON - excludes observations from context
  const [bufferStage, setBufferStage] = useState(null); // 'creating' | 'preparing' | 'thinking' | null
  const [tempChatId, setTempChatId] = useState(null);
  const [isFirstMessageFlow, setIsFirstMessageFlow] = useState(false);

  // Refs
  const messagesEndRef = useRef(null);
  const chatsUnsubscribeRef = useRef(null);
  const messagesUnsubscribeRef = useRef(null);
  const startInLandingPageRef = useRef(startInLandingPage);
  const hasManuallySelectedChatRef = useRef(false);
  const lastPendingUserTimestampRef = useRef(null);
  const selectedChatIdRef = useRef(null);
  const stageTimersRef = useRef([]);

  const chatTitle = useMemo(() => {
    if (!selectedChatId) return 'New Chat';
    const selectedChat = chats.find((c) => c.id === selectedChatId);
    return stripQuotes(selectedChat?.name || 'New Chat');
  }, [chats, selectedChatId]);
  
  // Keep refs in sync
  useEffect(() => {
    startInLandingPageRef.current = startInLandingPage;
  }, [startInLandingPage]);
  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

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
      setChatsLoading(false);
      return;
    }

    setChatsLoading(true);
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
        // Skip auto-selection if startInLandingPage is true AND user hasn't manually selected a chat
        // Also skip if we're in first message flow with a temp chatId
        const currentSelected = selectedChatIdRef.current;
        const isTempChatId = currentSelected && currentSelected.startsWith('temp-');
        if (isTempChatId) {
          // Don't reset selectedChatId if we're using a temp chatId
          return;
        }
        if (startInLandingPageRef.current && !hasManuallySelectedChatRef.current) {
          setSelectedChatId(null);
        } else if (chatsList.length > 0 && !hasManuallySelectedChatRef.current) {
          setSelectedChatId(chatsList[0].id);
        } else if (!hasManuallySelectedChatRef.current) {
          setSelectedChatId(null);
        }
      } catch (err) {
        console.error('[ChildChat] Error loading chats:', err);
        setError('Failed to load chats. Please try again.');
      } finally {
        setChatsLoading(false);
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

          // If selected chat was deleted, select most recent (unless user manually selected landing page)
          const currentSelected = selectedChatIdRef.current;
          // Skip reset logic if we're in first message flow with a temp chatId
          const isTempChatId = currentSelected && currentSelected.startsWith('temp-');
          if (currentSelected && !chatsList.find((c) => c.id === currentSelected) && !isTempChatId) {
            // Only reset to landing page if user hasn't manually selected a chat
            if (startInLandingPageRef.current && !hasManuallySelectedChatRef.current) {
              setSelectedChatId(null);
            } else if (chatsList.length > 0) {
              setSelectedChatId(chatsList[0].id);
            } else {
              setSelectedChatId(null);
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
  }, [student?.id]);

  // Load messages for selected chat
  useEffect(() => {
    if (!student?.id || !selectedChatId) {
      setMessages([]);
      setMessagesLoading(false);
      setAssistantPending(false);
      return;
    }

    // Skip setting up listener for temp chatId (first message flow)
    if (selectedChatId.startsWith('temp-')) {
      setMessagesLoading(false);
      return;
    }

    setMessagesLoading(true);
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

          // If we're in first message flow and real messages arrive, remove temp messages
          if (isFirstMessageFlow && messagesList.length > 0) {
            // Real messages have arrived - remove any temp messages
            // messagesList from Firestore doesn't include temp messages, so this replaces them
            clearStageProgression();
            setIsFirstMessageFlow(false);
            setTempChatId(null);
          }

          setMessages(messagesList);
          setMessagesLoading(false);

          // Clear pending state when an assistant response arrives after the last pending user message
          if (assistantPending && lastPendingUserTimestampRef.current) {
            const hasAssistantAfterPending = messagesList.some(
              (m) =>
                m.role === 'assistant' &&
                m.timestamp &&
                (m.timestamp.toMillis?.() || m.timestamp.seconds * 1000 || 0) >
                  (lastPendingUserTimestampRef.current.toMillis?.() ||
                    lastPendingUserTimestampRef.current.seconds * 1000 ||
                    0)
            );
            if (hasAssistantAfterPending) {
              setAssistantPending(false);
              lastPendingUserTimestampRef.current = null;
            }
          }

          // Auto-scroll to bottom after a short delay
          setTimeout(() => {
            scrollToBottom();
          }, 100);
        },
        (err) => {
          console.error('[ChildChat] Error loading messages:', err);
          setError('Failed to load messages. Please try again.');
          setMessagesLoading(false);
          setAssistantPending(false);
        }
      );

      messagesUnsubscribeRef.current = unsubscribe;
    } catch (err) {
      console.error('[ChildChat] Error setting up messages listener:', err);
      setError('Failed to load messages. Please try again.');
      setMessagesLoading(false);
    }

    return () => {
      if (messagesUnsubscribeRef.current) {
        messagesUnsubscribeRef.current();
      }
    };
  }, [student?.id, selectedChatId, isFirstMessageFlow]);

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

  const isLanding = selectedChatId === null;

  // Start stage progression for first message flow
  const startStageProgression = () => {
    // Clear any existing timers
    stageTimersRef.current.forEach((timer) => clearTimeout(timer));
    stageTimersRef.current = [];

    // Stage 1: Creating (1 second)
    setBufferStage('creating');
    const timer1 = setTimeout(() => {
      setBufferStage('preparing');
      const timer2 = setTimeout(() => {
        setBufferStage('thinking');
      }, 1000); // 1 second
      stageTimersRef.current.push(timer2);
    }, 1000); // 1 second
    stageTimersRef.current.push(timer1);
  };

  // Clear stage progression timers
  const clearStageProgression = () => {
    stageTimersRef.current.forEach((timer) => clearTimeout(timer));
    stageTimersRef.current = [];
    setBufferStage(null);
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

    const isFirstMessage = selectedChatId === null;
    let localTempChatId = null;

    setSending(true);
    setAssistantPending(true);
    setError('');

    // For first message flow: create optimistic chat
    if (isFirstMessage) {
      localTempChatId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setTempChatId(localTempChatId);
      setIsFirstMessageFlow(true);
      setSelectedChatId(localTempChatId); // Switch to chat view immediately
      startStageProgression(); // Start stage progression
    }

    // Optimistically add user message
    const tempUserMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: Timestamp.now(),
      authorName: auth.currentUser?.displayName || null,
    };
    lastPendingUserTimestampRef.current = tempUserMessage.timestamp;
    setMessages((prev) => [...prev, tempUserMessage]);
    setInputMessage('');

    try {
      const childChatFn = httpsCallable(cloudFunctions, 'childChat');
      const result = await childChatFn({
        studentId: student.id,
        message: messageText,
        chatId: isFirstMessage ? null : selectedChatId, // null = auto-create/find
        forceNewChat: isFirstMessage, // Force new chat when in landing page mode
        devMode: devMode, // When true, excludes observations from context to reduce token usage
      });

      const responseData = result.data;

      if (!responseData.success) {
        throw new Error(responseData.error || 'Failed to send message');
      }

      // Clear stage progression when backend completes
      if (isFirstMessageFlow) {
        clearStageProgression();
      }

      // Update selectedChatId if a new chat was created
      if (responseData.chatId) {
        if (isFirstMessageFlow && responseData.chatId !== localTempChatId) {
          // Update from temp to real chatId
          setSelectedChatId(responseData.chatId);
          setTempChatId(null);
          // Don't clear isFirstMessageFlow yet - wait for real messages to arrive
        } else if (!isFirstMessageFlow && responseData.chatId !== selectedChatId) {
          setSelectedChatId(responseData.chatId);
        }
      }

      // Remove temp message only for existing chats (real message will come via listener)
      // For first message flow, keep temp message visible until real messages arrive
      if (!isFirstMessageFlow) {
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
      }

      // Scroll to bottom
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    } catch (err) {
      console.error('[ChildChat] Error sending message:', err);

      // Clear stage progression on error
      if (isFirstMessageFlow) {
        clearStageProgression();
      }

      // For first message flow: keep user message visible, return to landing
      if (isFirstMessageFlow) {
        // Keep temp message visible (don't remove it)
        setAssistantPending(false);
        lastPendingUserTimestampRef.current = null;
        // Return to landing page
        setSelectedChatId(null);
        setTempChatId(null);
        setIsFirstMessageFlow(false);
      } else {
        // For existing chats: remove temp message (existing behavior)
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
        setAssistantPending(false);
        lastPendingUserTimestampRef.current = null;
      }

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
    setChatDropdownOpen(false);
    hasManuallySelectedChatRef.current = true; // Mark as manual selection
  };

  // Handle chat selection
  const handleSelectChat = (chatId) => {
    setSelectedChatId(chatId);
    setChatDropdownOpen(false);
    hasManuallySelectedChatRef.current = true; // Mark as manual selection
  };

  // Handle edit chat name
  const handleEditChat = (e, chatId, chatName) => {
    e.stopPropagation(); // Prevent triggering chat selection
    setEditingChatId(chatId);
    setEditingChatName(stripQuotes(chatName));
    setEditDialogOpen(true);
  };

  // Handle save edited chat name
  const handleSaveEditChat = async () => {
    if (!editingChatId || !editingChatName.trim() || !student?.id) {
      return;
    }

    try {
      const chatRef = doc(db, 'students', student.id, 'chats', editingChatId);
      await updateDoc(chatRef, {
        name: editingChatName.trim(),
        updatedAt: serverTimestamp(),
      });
      setEditDialogOpen(false);
      setEditingChatId(null);
      setEditingChatName('');
    } catch (err) {
      console.error('[ChildChat] Error updating chat name:', err);
      setError('Failed to update chat name. Please try again.');
    }
  };

  // Handle delete chat
  const handleDeleteChat = (e, chatId) => {
    e.stopPropagation(); // Prevent triggering chat selection
    setDeletingChatId(chatId);
    setDeleteConfirmOpen(true);
  };

  // Handle confirm delete
  const handleConfirmDelete = async () => {
    if (!deletingChatId || !student?.id) {
      return;
    }

    try {
      const chatRef = doc(db, 'students', student.id, 'chats', deletingChatId);
      await updateDoc(chatRef, {
        deleted: true,
        updatedAt: serverTimestamp(),
      });
      
      // If deleted chat was selected, select most recent chat or go to landing
      if (deletingChatId === selectedChatId) {
        const remainingChats = chats.filter((c) => c.id !== deletingChatId);
        if (remainingChats.length > 0) {
          setSelectedChatId(remainingChats[0].id);
        } else {
          setSelectedChatId(null);
        }
      }
      
      setDeleteConfirmOpen(false);
      setDeletingChatId(null);
    } catch (err) {
      console.error('[ChildChat] Error deleting chat:', err);
      setError('Failed to delete chat. Please try again.');
      setDeleteConfirmOpen(false);
      setDeletingChatId(null);
    }
  };

  // Handle cancel delete
  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false);
    setDeletingChatId(null);
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
      // Clear stage timers
      stageTimersRef.current.forEach((timer) => clearTimeout(timer));
      stageTimersRef.current = [];
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
        width: '375px',
        maxWidth: '375px',
        ...(isLanding
          ? {
              // Landing mode: fixed positioning to prevent parent container scrolling
              height: { xs: 'calc(100vh - 64px - env(safe-area-inset-top, 0px))', sm: 'calc(100vh - 64px)' },
              margin: 0,
              position: 'fixed',
              top: { xs: 'calc(64px + env(safe-area-inset-top, 0px))', sm: '64px' },
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1,
            }
          : {
              // Chat mode: normal layout with margins
              height: '812px',
              margin: '40px auto',
              minHeight: '100vh',
              position: 'relative',
            }),
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f8fafc',
        overflow: 'hidden',
      }}
    >
      {/* Floating Chat Dropdown - Pinned below AppHeader */}
      <Box
        sx={{
          ...(isLanding
            ? {
                // Landing mode: positioned relative to fixed container
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 1000,
              }
            : {
                // Chat mode: fixed to viewport
                position: 'fixed',
                top: { xs: 'calc(64px + env(safe-area-inset-top, 0px))', sm: '64px' },
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
              }),
          width: '100%',
          maxWidth: '375px',
          px: 2,
          pt: 1,
          pb: 0.5,
          backgroundColor: 'transparent',
          boxSizing: 'border-box',
        }}
      >
        <ClickAwayListener onClickAway={() => setChatDropdownOpen(false)}>
          <Box sx={{ width: '100%', position: 'relative' }}>
            <Paper
              elevation={2}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0,
                px: 0,
                py: 0,
                borderRadius: '28px',
                backgroundColor: 'white',
                border: '1px solid',
                borderColor: 'rgba(0, 0, 0, 0.08)',
                width: '100%',
                transition: 'all 0.2s ease-in-out',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                  borderColor: 'rgba(0, 0, 0, 0.12)',
                  transform: 'translateY(-1px)',
                },
                '&:active': {
                  transform: 'translateY(0px)',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
                },
              }}
            >
              {/* Dropdown Toggle Area */}
              <Box
                onClick={() => setChatDropdownOpen(!chatDropdownOpen)}
                sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2.5,
                  py: 1.25,
                  cursor: 'pointer',
                  minWidth: 0,
                  '&:hover': {
                    backgroundColor: 'grey.50',
                  },
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: selectedChatId ? 500 : 400,
                    flex: 1,
                    minWidth: 0, // Critical for ellipsis to work in flex container
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: selectedChatId ? 'text.primary' : 'text.secondary',
                    fontSize: '0.95rem',
                    letterSpacing: '0.01em',
                  }}
                >
                  {selectedChatId ? chatTitle : 'Load past conversations here'}
                </Typography>
                <ArrowDropDown 
                  sx={{ 
                    fontSize: 20, 
                    color: 'text.secondary', 
                    flexShrink: 0,
                    transition: 'transform 0.2s ease-in-out',
                    transform: chatDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    opacity: 0.7,
                  }} 
                />
              </Box>
              
              {/* Divider */}
              <Box
                sx={{
                  width: '1px',
                  height: '32px',
                  backgroundColor: 'rgba(0, 0, 0, 0.08)',
                  flexShrink: 0,
                }}
              />
              
              {/* Plus Button */}
              <IconButton
                onClick={handleCreateNewChat}
                disabled={isLanding}
                aria-label="New chat"
                sx={{
                  minWidth: 48,
                  minHeight: 48,
                  width: 48,
                  height: 48,
                  borderRadius: '0 28px 28px 0',
                  color: 'primary.main',
                  flexShrink: 0,
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    backgroundColor: 'grey.50',
                  },
                  '&:active': {
                    backgroundColor: 'grey.100',
                  },
                  '&:disabled': {
                    backgroundColor: 'grey.100',
                    color: 'text.disabled',
                  },
                }}
              >
                <Add />
              </IconButton>
            </Paper>

            {/* Simplified Dropdown Menu */}
            {chatDropdownOpen && (
              <Paper
                elevation={4}
                sx={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  mt: 1,
                  maxHeight: '250px',
                  overflowY: 'auto',
                  borderRadius: '20px',
                  backgroundColor: 'white',
                  border: '1px solid',
                  borderColor: 'rgba(0, 0, 0, 0.08)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                  animation: 'fadeIn 0.2s ease-in-out',
                  '@keyframes fadeIn': {
                    from: {
                      opacity: 0,
                      transform: 'translateY(-8px)',
                    },
                    to: {
                      opacity: 1,
                      transform: 'translateY(0)',
                    },
                  },
                }}
              >
                {chatsLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                    <CircularProgress size={20} />
                  </Box>
                ) : (
                  <List sx={{ py: 1 }}>
                    {chats.map((chat) => (
                      <ListItemButton
                        key={chat.id}
                        onClick={() => handleSelectChat(chat.id)}
                        dense
                        sx={{
                          borderRadius: '12px',
                          mx: 1,
                          my: 0.25,
                          backgroundColor: chat.id === selectedChatId ? 'rgba(79, 70, 229, 0.08)' : 'transparent',
                          transition: 'all 0.15s ease-in-out',
                          '&:hover': {
                            backgroundColor: chat.id === selectedChatId ? 'rgba(79, 70, 229, 0.12)' : 'grey.50',
                            transform: 'translateX(2px)',
                          },
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          pr: 0.5,
                          py: 1,
                        }}
                      >
                        <ListItemText
                          primary={stripQuotes(chat.name)}
                          primaryTypographyProps={{
                            variant: 'body2',
                            fontWeight: chat.id === selectedChatId ? 600 : 400,
                            sx: {
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: '0.9rem',
                              color: chat.id === selectedChatId ? 'primary.main' : 'text.primary',
                            },
                          }}
                          sx={{
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                          }}
                        />
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.25,
                            flexShrink: 0,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IconButton
                            size="small"
                            onClick={(e) => handleEditChat(e, chat.id, chat.name)}
                            aria-label="Edit chat name"
                            sx={{
                              padding: 0.75,
                              color: 'text.secondary',
                              borderRadius: '8px',
                              transition: 'all 0.15s ease-in-out',
                              '&:hover': {
                                color: 'primary.main',
                                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                                transform: 'scale(1.05)',
                              },
                            }}
                          >
                            <Edit sx={{ fontSize: 18 }} />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={(e) => handleDeleteChat(e, chat.id)}
                            aria-label="Delete chat"
                            sx={{
                              padding: 0.75,
                              color: 'text.secondary',
                              borderRadius: '8px',
                              transition: 'all 0.15s ease-in-out',
                              '&:hover': {
                                color: 'error.main',
                                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                                transform: 'scale(1.05)',
                              },
                            }}
                          >
                            <Delete sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Box>
                      </ListItemButton>
                    ))}
                  </List>
                )}
              </Paper>
            )}
          </Box>
        </ClickAwayListener>
        
        {/* Dev Mode Toggle - Positioned below dropdown */}
        <Tooltip title={devMode ? 'Dev Mode: ON (observations excluded)' : 'Dev Mode: OFF (observations included)'} arrow>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 0.5,
              mt: 0.5,
              px: 2,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.7rem',
                color: 'text.secondary',
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              Dev Mode
            </Typography>
            <Switch
              checked={devMode}
              onChange={(e) => setDevMode(e.target.checked)}
              size="small"
              sx={{
                '& .MuiSwitch-thumb': {
                  width: 16,
                  height: 16,
                },
                '& .MuiSwitch-switchBase.Mui-checked': {
                  color: 'primary.main',
                },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                  backgroundColor: 'primary.main',
                },
              }}
            />
          </Box>
        </Tooltip>
      </Box>

      {/* Messages Area */}
      <Box
        sx={{
          ...(isLanding
            ? {
                // Landing page: absolutely positioned between dropdown and input, no scrolling
                position: 'absolute',
                top: '56px', // Below the dropdown (pt: 1 + pb: 0.5 + Paper py: 1 + content ≈ 56px)
                bottom: { xs: 'calc(80px + env(safe-area-inset-bottom, 0px))', sm: '80px' }, // Above footer
                left: 0,
                right: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                p: 0,
              }
            : {
                // Chat view: normal flex layout with scrolling
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                p: 2,
                pt: { xs: 'calc(64px + 56px + env(safe-area-inset-top, 0px))', sm: 'calc(64px + 56px)' },
                pb: { xs: 'calc(80px + env(safe-area-inset-bottom, 0px))', sm: '80px' },
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'stretch',
                gap: 1,
              }),
        }}
      >
        {messagesLoading && messages.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <CircularProgress />
          </Box>
        ) : isLanding ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              p: 3,
              width: '100%',
            }}
          >
            <Chat sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Start a new conversation
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Type something to start a chat or pick a past conversation from above.
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
                  <UserBubble message={message} formatTimestamp={formatTimestamp} />
                ) : (
                  <AssistantBubble message={message} formatTimestamp={formatTimestamp} />
                )}
              </Box>
            ))}
            {/* Coach Pepper loading state - shows left-aligned while waiting for assistant */}
            {assistantPending && <TypingIndicator stage={bufferStage} />}
            <div ref={messagesEndRef} />
          </>
        )}
      </Box>

      {/* Floating Input Area - Fixed at bottom */}
      <Box
        sx={{
          ...(isLanding
            ? {
                // Landing mode: positioned relative to fixed container
                position: 'absolute',
                bottom: { xs: 'calc(80px + env(safe-area-inset-bottom, 0px))', sm: '80px' },
                left: 0,
                right: 0,
                zIndex: 1000,
              }
            : {
                // Chat mode: fixed to viewport
                position: 'fixed',
                bottom: { xs: 'calc(80px + env(safe-area-inset-bottom, 0px))', sm: '80px' },
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
              }),
          width: '100%',
          maxWidth: '375px',
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
          elevation={2}
          sx={{
            p: 1,
            borderRadius: '28px',
            backgroundColor: 'white',
            border: '1px solid',
            borderColor: 'rgba(0, 0, 0, 0.08)',
            display: 'flex',
            gap: 1.5,
            alignItems: 'flex-end',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
            transition: 'all 0.2s ease-in-out',
            '&:focus-within': {
              boxShadow: '0 4px 16px rgba(79, 70, 229, 0.15)',
              borderColor: 'primary.main',
            },
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
                backgroundColor: 'transparent',
                borderRadius: '20px',
                px: 1.5,
                py: 0.75,
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
              width: 44,
              height: 44,
              backgroundColor: 'primary.main',
              color: 'white',
              borderRadius: '22px',
              transition: 'all 0.2s ease-in-out',
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
              '&:hover': {
                backgroundColor: 'primary.dark',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)',
                transform: 'translateY(-1px)',
              },
              '&:active': {
                transform: 'translateY(0px)',
                boxShadow: '0 2px 6px rgba(79, 70, 229, 0.3)',
              },
              '&:disabled': {
                backgroundColor: 'grey.300',
                color: 'grey.500',
                boxShadow: 'none',
                transform: 'none',
              },
            }}
          >
            <Send />
          </IconButton>
        </Paper>
      </Box>

      {/* Edit Chat Name Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          setEditingChatId(null);
          setEditingChatName('');
        }}
        maxWidth="xs"
        fullWidth
      >
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Edit Chat Name
          </Typography>
          <TextField
            fullWidth
            value={editingChatName}
            onChange={(e) => setEditingChatName(e.target.value)}
            placeholder="Enter chat name"
            autoFocus
            onKeyPress={(e) => {
              if (e.key === 'Enter' && editingChatName.trim()) {
                handleSaveEditChat();
              }
            }}
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button
              onClick={() => {
                setEditDialogOpen(false);
                setEditingChatId(null);
                setEditingChatName('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveEditChat}
              disabled={!editingChatName.trim()}
            >
              Save
            </Button>
          </Box>
        </Box>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleCancelDelete}
        maxWidth="xs"
        fullWidth
      >
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Delete conversation?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This conversation will be permanently deleted. This action cannot be undone.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button onClick={handleCancelDelete} variant="contained" autoFocus>
              Cancel
            </Button>
            <Button onClick={handleConfirmDelete} color="error" variant="outlined">
              Delete
            </Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}

export default ChildChat;
