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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormControlLabel,
  Switch,
} from '@mui/material';
import {
  Send as SendIcon,
  SmartToy as AssistantIcon,
  Person as UserIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import { collection, query, orderBy, limit, onSnapshot, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { db, auth, app } from '../firebase';

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
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [error, setError] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [chatToDelete, setChatToDelete] = useState(null);
  const [devMode, setDevMode] = useState(true); // Dev toggle to skip observation context
  const [streamingContent, setStreamingContent] = useState(''); // Current streaming assistant message
  const [streamingMessageId, setStreamingMessageId] = useState(null); // ID of message being streamed
  const messagesEndRef = useRef(null);
  const optimisticMessagesRef = useRef(new Map()); // Track optimistic messages by content+timestamp
  const streamingContentRef = useRef(''); // Ref for streaming content (always current)
  const streamingMessageIdRef = useRef(null); // Ref for streaming message ID (always current)
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
        const chatsRef = collection(db, 'students', studentId, 'chats');
        
        // Try query with orderBy first (requires composite index)
        // If index doesn't exist, fall back to fetching all and sorting in memory
        let snapshot;
        try {
          const q = query(chatsRef, orderBy('createdAt', 'desc'));
          snapshot = await getDocs(q);
        } catch (indexError) {
          // If query fails (likely missing index), fetch all chats and filter/sort in memory
          console.warn('[loadChats] Query with orderBy failed, falling back to in-memory sort:', indexError.message);
          snapshot = await getDocs(chatsRef);
        }

        const chatList = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          // Filter out deleted chats if we're using fallback method
          if (data.deleted === true) {
            return;
          }
          chatList.push({
            id: docSnap.id,
            name: data.name || 'New Chat',
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
            lastMessagePreview: data.lastMessagePreview || '',
            messageCount: data.messageCount || 0,
          });
        });

        // Sort by createdAt desc if we used fallback method
        if (chatList.length > 0 && chatList[0].createdAt) {
          chatList.sort((a, b) => {
            const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds || 0) * 1000;
            const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds || 0) * 1000;
            return bTime - aTime; // Descending order
          });
        }

        setChats(chatList);
        // Don't auto-select - let user choose or start typing
        // currentChatId remains null to show actionable empty state
      } catch (err) {
        console.error('Failed to load chats:', err);
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
      optimisticMessagesRef.current.clear();
      return;
    }

    const messagesRef = collection(db, 'students', studentId, 'chats', currentChatId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'), limit(100));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const firestoreMessages = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Merge Firestore messages with optimistic messages
        // Remove optimistic messages that have been confirmed by Firestore
        const optimisticMap = optimisticMessagesRef.current;
        const confirmedKeys = new Set();
        
        // Check which optimistic messages have been confirmed
        firestoreMessages.forEach((msg) => {
          if (msg.role === 'user') {
            const msgTimestamp = msg.timestamp?.toDate ? msg.timestamp.toDate().getTime() : 
                               (msg.timestamp?.seconds ? msg.timestamp.seconds * 1000 : null);
            if (msgTimestamp) {
              // Check if any optimistic message matches this content and timestamp (within 5 seconds)
              optimisticMap.forEach((optimisticMsg, key) => {
                const optimisticTimestamp = optimisticMsg.timestamp?.getTime ? optimisticMsg.timestamp.getTime() : optimisticMsg.timestamp;
                const timeDiff = Math.abs(msgTimestamp - optimisticTimestamp);
                if (optimisticMsg.content === msg.content && timeDiff < 5000) {
                  confirmedKeys.add(key);
                }
              });
            }
          }
        });

        // Remove confirmed optimistic messages
        confirmedKeys.forEach(key => optimisticMap.delete(key));

        // Combine Firestore messages with remaining optimistic messages
        const optimisticArray = Array.from(optimisticMap.values());
        const currentMessages = [...firestoreMessages, ...optimisticArray];
        
        // Check if we have a recent assistant message from Firestore (streaming complete)
        const hasRecentAssistantMessage = firestoreMessages.some(msg => 
          msg.role === 'assistant' && 
          (() => {
            const msgTime = msg.timestamp?.toDate ? msg.timestamp.toDate().getTime() : 
                          (msg.timestamp?.seconds ? msg.timestamp.seconds * 1000 : 0);
            const now = Date.now();
            return now - msgTime < 5000; // 5 seconds - very recent
          })()
        );
        
        // Use refs to get current streaming state (always up-to-date)
        const currentStreamingId = streamingMessageIdRef.current;
        const currentStreamingContent = streamingContentRef.current;
        
        // If we have a recent assistant message from Firestore, clear streaming state
        if (hasRecentAssistantMessage && currentStreamingId) {
          streamingContentRef.current = '';
          streamingMessageIdRef.current = null;
          setStreamingContent('');
          setStreamingMessageId(null);
          setLoading(false);
        }
        
        // Filter out old streaming messages, but preserve current streaming message if still streaming
        const filteredMessages = currentMessages.filter(msg => {
          // Keep current streaming message if it's still being streamed
          if (msg.id === currentStreamingId && currentStreamingId) {
            return true;
          }
          // Filter out other streaming messages
          return !msg.id?.startsWith('streaming-');
        });
        
        // If we have a streaming message, merge it with current content
        let allMessages = filteredMessages;
        if (currentStreamingId && currentStreamingContent) {
          // Check if streaming message already exists in the array
          const streamingMsgIndex = allMessages.findIndex(msg => msg.id === currentStreamingId);
          if (streamingMsgIndex >= 0) {
            // Update existing streaming message with current content
            allMessages = allMessages.map((msg, idx) => 
              idx === streamingMsgIndex 
                ? { ...msg, content: currentStreamingContent }
                : msg
            );
          } else {
            // Add streaming message if it doesn't exist
            allMessages = [...allMessages, {
              id: currentStreamingId,
              role: 'assistant',
              content: currentStreamingContent,
              timestamp: new Date(),
            }];
          }
        }
        
        // Sort messages by timestamp
        allMessages = allMessages.sort((a, b) => {
          const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 
                       (a.timestamp?.seconds ? a.timestamp.seconds * 1000 : a.timestamp?.getTime ? a.timestamp.getTime() : 0);
          const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 
                       (b.timestamp?.seconds ? b.timestamp.seconds * 1000 : b.timestamp?.getTime ? b.timestamp.getTime() : 0);
          return timeA - timeB;
        });

        setMessages(allMessages);
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

  // Scroll to bottom on mount and when messages or streaming content changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleSendMessage = async () => {
    const trimmedMessage = inputValue.trim();
    if (!trimmedMessage || loading) {
      return;
    }

    if (!studentId) {
      setError('Student ID is missing.');
      return;
    }

    // If no chat is selected (landing page), create one before sending
    let chatIdToUse = currentChatId;
    if (!chatIdToUse) {
      // Create new chat when user sends first message
      setIsCreatingChat(true);
      try {
        const chatsRef = collection(db, 'students', studentId, 'chats');
        const chatData = {
          name: 'New Chat',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastMessagePreview: '',
          messageCount: 0,
          deleted: false,
        };
        const docRef = await addDoc(chatsRef, chatData);
        chatIdToUse = docRef.id;
        
        const newChat = {
          id: chatIdToUse,
          name: 'New Chat',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessagePreview: '',
          messageCount: 0,
        };
        setChats([newChat, ...chats]);
        setCurrentChatId(chatIdToUse);
      } catch (err) {
        console.error('Failed to create chat:', err);
        setError('Failed to create chat.');
        setIsCreatingChat(false);
        return;
      } finally {
        setIsCreatingChat(false);
      }
    }

    setLoading(true);
    setError('');
    setInputValue('');
    setStreamingContent('');
    setStreamingMessageId(null);
    streamingContentRef.current = '';
    streamingMessageIdRef.current = null;

    // Optimistically add user message immediately for better UX
    const currentUser = auth.currentUser;
    const optimisticMessage = {
      id: `temp-${Date.now()}-${Math.random()}`,
      role: 'user',
      content: trimmedMessage,
      timestamp: new Date(),
      authorId: currentUser?.uid || null,
      authorName: currentUser?.displayName || currentUser?.email?.split('@')[0] || null,
    };
    
    // Add to optimistic messages map
    const optimisticKey = `${trimmedMessage}-${optimisticMessage.timestamp.getTime()}`;
    optimisticMessagesRef.current.set(optimisticKey, optimisticMessage);
    
    // Immediately update UI with optimistic message
    setMessages((prevMessages) => {
      const updated = [...prevMessages, optimisticMessage].sort((a, b) => {
        const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 
                     (a.timestamp?.seconds ? a.timestamp.seconds * 1000 : a.timestamp?.getTime ? a.timestamp.getTime() : 0);
        const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 
                     (b.timestamp?.seconds ? b.timestamp.seconds * 1000 : b.timestamp?.getTime ? b.timestamp.getTime() : 0);
        return timeA - timeB;
      });
      return updated;
    });

    // Scroll to bottom immediately
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);

    // Create streaming assistant message placeholder
    const streamingMsgId = `streaming-${Date.now()}`;
    setStreamingMessageId(streamingMsgId);
    streamingMessageIdRef.current = streamingMsgId;
    streamingContentRef.current = '';
    const streamingMessage = {
      id: streamingMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, streamingMessage]);

    try {
      // Get auth token for HTTP request
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Get Functions URL
      const functions = getFunctions(app, 'asia-south1');
      const functionsUrl = `https://asia-south1-${app.options.projectId}.cloudfunctions.net/childChatStream`;
      
      // Make streaming request
      const response = await fetch(functionsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          studentId,
          chatId: chatIdToUse,
          message: trimmedMessage,
          devMode: devMode,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to send message. Please try again.';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let buffer = '';
      let currentEvent = null;
      let currentDataLines = []; // Accumulate multiple data: lines for one SSE message
      let streamDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Process any remaining data lines before ending
          if (currentDataLines.length > 0 && !streamDone) {
            const data = currentDataLines.join('\n');
            if (data !== '[DONE]') {
              accumulatedContent += data;
              streamingContentRef.current = accumulatedContent;
              setStreamingContent(accumulatedContent);
              setMessages((prev) => 
                prev.map((msg) => 
                  msg.id === streamingMsgId 
                    ? { ...msg, content: accumulatedContent }
                    : msg
                )
              );
            }
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          // Empty line indicates end of SSE message - process accumulated data lines
          if (line.trim() === '') {
            if (currentDataLines.length > 0) {
              // Concatenate multiple data: lines with newlines (SSE spec)
              const data = currentDataLines.join('\n');
              
              if (data === '[DONE]') {
                // Streaming complete
                streamDone = true;
                streamingContentRef.current = '';
                streamingMessageIdRef.current = null;
                setLoading(false);
                setStreamingContent('');
                setStreamingMessageId(null);
                // Break out of for loop, then while loop will exit
                i = lines.length; // Exit for loop
                break;
              } else if (currentEvent === 'error') {
                // Error event
                try {
                  const errorData = JSON.parse(data);
                  throw new Error(errorData.error || 'An error occurred');
                } catch (e) {
                  if (e instanceof Error && e.message !== 'Unexpected token') {
                    throw e;
                  }
                  throw new Error(data || 'An error occurred');
                }
              } else if (currentEvent === 'complete') {
                // Completion event - chat metadata already updated by backend
                // No need to reload chats here, Firestore listener will handle updates
                currentEvent = null;
                currentDataLines = [];
                continue;
              } else {
                // Text chunk - append to accumulated content
                accumulatedContent += data;
                streamingContentRef.current = accumulatedContent;
                setStreamingContent(accumulatedContent);
                
                // Update streaming message in UI immediately
                setMessages((prev) => 
                  prev.map((msg) => 
                    msg.id === streamingMsgId 
                      ? { ...msg, content: accumulatedContent }
                      : msg
                  )
                );
                
                // Scroll to bottom as content streams
                setTimeout(() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }, 50);
              }
              
              // Reset for next message
              currentDataLines = [];
              currentEvent = null;
            }
            continue;
          }
          
          // Process non-empty lines
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            // Accumulate data lines (will be processed when we hit empty line)
            const data = line.slice(6);
            currentDataLines.push(data);
          }
        }
        
        // Break out of while loop if stream is done
        if (streamDone) break;
      }

      // Remove streaming message - Firestore listener will add the real one
      streamingContentRef.current = '';
      streamingMessageIdRef.current = null;
      setMessages((prev) => prev.filter((msg) => msg.id !== streamingMsgId));
      setStreamingContent('');
      setStreamingMessageId(null);
      setLoading(false);
    } catch (err) {
      // Remove optimistic and streaming messages on error
      optimisticMessagesRef.current.delete(optimisticKey);
      setMessages((prev) => 
        prev.filter((msg) => msg.id !== optimisticMessage.id && msg.id !== streamingMsgId)
      );

      let errorMessage = 'Failed to send message. Please try again.';
      if (err?.message) {
        errorMessage = err.message;
      }

      streamingContentRef.current = '';
      streamingMessageIdRef.current = null;
      setError(errorMessage);
      setStreamingContent('');
      setStreamingMessageId(null);
      setLoading(false);
      // Restore input value on error
      setInputValue(trimmedMessage);
    }
  };

  const handleCreateNewChat = () => {
    // Just return to landing page - don't create chat doc yet
    // Chat will be created when user sends a message
    setCurrentChatId(null);
    setMessages([]);
    optimisticMessagesRef.current.clear();
  };

  const handleDeleteChatClick = (chatIdToDelete) => {
    if (!studentId || !chatIdToDelete) return;

    if (chats.length <= 1) {
      setError('Cannot delete the last chat.');
      return;
    }

    // Show confirmation dialog
    setChatToDelete(chatIdToDelete);
  };

  const handleDeleteChatConfirm = async () => {
    if (!studentId || !chatToDelete) return;

    try {
      // Soft delete: update deleted flag
      const chatRef = doc(db, 'students', studentId, 'chats', chatToDelete);
      await updateDoc(chatRef, {
        deleted: true,
        updatedAt: serverTimestamp(),
      });
      
      // Remove from local state
      const updatedChats = chats.filter(c => c.id !== chatToDelete);
      setChats(updatedChats);
      
      // Switch to most recent chat
      if (currentChatId === chatToDelete && updatedChats.length > 0) {
        setCurrentChatId(updatedChats[0].id);
      } else if (currentChatId === chatToDelete) {
        // No more chats, go back to landing page
        setCurrentChatId(null);
        setMessages([]);
      }

      // Close dialog
      setChatToDelete(null);
    } catch (err) {
      console.error('Failed to delete chat:', err);
      setError('Failed to delete chat.');
      setChatToDelete(null);
    }
  };

  const handleDeleteChatCancel = () => {
    setChatToDelete(null);
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

  const handleCopyMessage = async (messageContent, messageId) => {
    try {
      await navigator.clipboard.writeText(messageContent);
      setCopiedMessageId(messageId);
      // Reset the copied state after 2 seconds
      setTimeout(() => {
        setCopiedMessageId(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
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
        pt: 12, // Space for fixed header bubble (increased for better spacing)
        pb: 12, // Space for floating input bubble above footer
        width: '100%',
        maxWidth: '100%',
        overflowX: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Fixed Chat Selector Header - Floating Bubble Style */}
      <Box
        sx={{
          position: 'fixed',
          top: 70,
          left: '50%',
          transform: 'translateX(-50%)',
          width: { xs: 'calc(100% - 32px)', sm: '388px' },
          maxWidth: { xs: 'calc(100% - 32px)', sm: '388px' },
          zIndex: 1000,
          overflowX: 'hidden',
          boxSizing: 'border-box',
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
            width: '100%',
            maxWidth: '100%',
            overflowX: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          <FormControl fullWidth sx={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
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
                      if (isLoadingChats) {
                        return (
                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                            Loading history...
                          </Typography>
                        );
                      }
                      return (
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                          {chats.length === 0 ? 'No chats yet' : 'Continue a past conversation'}
                        </Typography>
                      );
                    }
                    const selectedChat = chats.find(c => c.id === selected);
                    const displayName = selectedChat ? (selectedChat.name || 'New Chat').replace(/^["']|["']$/g, '') : 'New Chat';
                    return (
                      <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayName}
                      </Typography>
                    );
                  }}
                  sx={{
                    width: '100%',
                    maxWidth: '100%',
                    overflowX: 'hidden',
                    '& .MuiSelect-select': {
                      py: 0,
                      pl: 1.5,
                      pr: 2, // Extra right padding for italic text overflow
                      minHeight: '44px',
                      display: 'flex',
                      alignItems: 'center',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
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
                  {isLoadingChats ? (
                    <MenuItem disabled>
                      <Typography variant="body2" color="text.secondary">
                        Loading history...
                      </Typography>
                    </MenuItem>
                  ) : chats.length === 0 ? (
                    <MenuItem disabled sx={{ pr: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        No chats yet. Send a message to start!
                      </Typography>
                    </MenuItem>
                  ) : (
                    // Sort chats so current chat appears first, then others
                    [...chats]
                      .sort((a, b) => {
                        // Current chat goes first
                        if (a.id === currentChatId) return -1;
                        if (b.id === currentChatId) return 1;
                        // Others maintain their order
                        return 0;
                      })
                      .map((chat) => {
                        const displayName = (chat.name || 'New Chat').replace(/^["']|["']$/g, '');
                        const isCurrentChat = chat.id === currentChatId;
                        return (
                          <MenuItem 
                            key={chat.id} 
                            value={chat.id}
                          >
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis', 
                                width: '100%',
                                fontWeight: isCurrentChat ? 600 : 400,
                                color: isCurrentChat ? '#4f46e5' : 'inherit',
                              }}
                            >
                              {displayName}
                            </Typography>
                          </MenuItem>
                        );
                      })
                  )}
                </Select>
              </FormControl>
              {/* Only show + button when on an existing chat (not on landing page) */}
              {currentChatId && (
                <IconButton
                  size="small"
                  onClick={handleCreateNewChat}
                  disabled={isCreatingChat}
                  sx={{
                    minWidth: '40px',
                    width: '40px',
                    height: '40px',
                    color: '#fff',
                    backgroundColor: '#4f46e5',
                    '&:hover': {
                      backgroundColor: '#4338ca',
                    },
                    '&:disabled': {
                      backgroundColor: '#cbd5e1',
                      color: '#94a3b8',
                    },
                  }}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              )}
        </Paper>
      </Box>

      {/* Dev Mode Toggle - Temporary */}
      <Box
        sx={{
          position: 'fixed',
          top: 130,
          left: '50%',
          transform: 'translateX(-50%)',
          width: { xs: 'calc(100% - 32px)', sm: '388px' },
          maxWidth: { xs: 'calc(100% - 32px)', sm: '388px' },
          zIndex: 999,
          display: 'flex',
          justifyContent: 'flex-end',
          px: 1,
        }}
      >
        <Paper
          elevation={2}
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 1.5,
            py: 0.5,
            backgroundColor: devMode ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.95)',
            borderRadius: 2,
            border: devMode ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(0, 0, 0, 0.1)',
          }}
        >
          <FormControlLabel
            control={
              <Switch
                checked={devMode}
                onChange={(e) => setDevMode(e.target.checked)}
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': {
                    color: '#f59e0b',
                  },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: '#f59e0b',
                  },
                }}
              />
            }
            label={
              <Typography 
                variant="caption" 
                sx={{ 
                  fontSize: '0.7rem', 
                  color: devMode ? '#f59e0b' : '#64748b',
                  fontWeight: devMode ? 600 : 400,
                }}
              >
                Dev Mode
              </Typography>
            }
            sx={{ m: 0 }}
          />
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
          overflowX: 'hidden',
          px: 2,
          pt: 2,
          pb: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Empty state - show immediately when no chat is selected */}
        {!currentChatId && !isCreatingChat && messages.length === 0 && !loading && (
          <Box sx={{ 
            textAlign: 'center', 
            py: 12,
            px: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}>
            <Avatar sx={{ bgcolor: '#6366f1', width: 48, height: 48, mb: 1 }}>
              <AssistantIcon />
            </Avatar>
            <Typography 
              variant="h6" 
              sx={{ 
                color: '#1e293b',
                fontWeight: 600,
                mb: 1,
              }}
            >
              Ready to chat about {getStudentName(student)}?
            </Typography>
            <Typography 
              variant="body1" 
              sx={{ 
                color: '#64748b',
                maxWidth: '320px',
                lineHeight: 1.6,
              }}
            >
              Start typing below to begin a new chat, or select an existing chat from the dropdown above.
            </Typography>
          </Box>
        )}

        {/* Empty state - when a chat is selected but has no messages */}
        {currentChatId && messages.length === 0 && !loading && (
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
                maxWidth: '100%',
                px: { xs: 1, sm: 2 },
                mb: 2,
                boxSizing: 'border-box',
                overflowX: 'hidden',
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
                    maxWidth: 'min(95%, 100%)',
                    width: 'fit-content',
                    alignSelf: 'flex-end',
                    boxSizing: 'border-box',
                    overflowWrap: 'break-word',
                    wordBreak: 'break-word',
                  }}
                >
                  <Typography 
                    variant="body1" 
                    component="div"
                    sx={{ 
                      whiteSpace: 'pre-wrap', 
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      lineHeight: 1.6,
                      fontSize: '0.95rem',
                      maxWidth: '100%',
                    }}
                  >
                    {parseMarkdown(msg.content) || msg.content}
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      mt: 1,
                      flexWrap: 'wrap',
                    }}
                  >
                    {msg.authorName && (
                      <Typography
                        variant="caption"
                        sx={{
                          opacity: 0.7,
                          fontSize: '0.7rem',
                          color: 'rgba(255, 255, 255, 0.8)',
                        }}
                      >
                        Author: {msg.authorName}
                      </Typography>
                    )}
                    <Typography
                      variant="caption"
                      sx={{
                        opacity: 0.7,
                        fontSize: '0.7rem',
                        color: 'rgba(255, 255, 255, 0.8)',
                      }}
                    >
                      {formatTimestamp(msg.timestamp)}
                    </Typography>
                  </Box>
                </Paper>
              ) : (
                // AI message: Plain text, full width
                <Box sx={{ 
                  width: '100%', 
                  maxWidth: '95%',
                  boxSizing: 'border-box',
                  overflowX: 'hidden',
                }}>
                  <Box
                    sx={{ 
                      whiteSpace: 'pre-wrap', 
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      lineHeight: 1.7,
                      fontSize: '0.95rem',
                      color: '#1e293b',
                      maxWidth: '100%',
                    }}
                  >
                    {parseMarkdown(msg.content) || msg.content}
                  </Box>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      mt: 1,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        opacity: 0.6,
                        fontSize: '0.7rem',
                        color: '#64748b',
                      }}
                    >
                      {formatTimestamp(msg.timestamp)}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => handleCopyMessage(msg.content, msg.id)}
                      sx={{
                        padding: '2px',
                        minWidth: '20px',
                        width: '20px',
                        height: '20px',
                        color: copiedMessageId === msg.id ? '#4f46e5' : '#64748b',
                        opacity: 0.6,
                        '&:hover': {
                          opacity: 1,
                          backgroundColor: 'rgba(79, 70, 229, 0.08)',
                        },
                      }}
                      aria-label="Copy message"
                    >
                      <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                    </IconButton>
                  </Box>
                </Box>
              )}
            </Box>
          );
        })}

        {/* Loading state removed - streaming content is shown in messages instead */}

        <div ref={messagesEndRef} />
      </Box>

      {/* Floating Input Bubble - ChatGPT style */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 80, // Above app footer with some spacing
          left: '50%',
          transform: 'translateX(-50%)',
          width: { xs: 'calc(100% - 32px)', sm: '388px' },
          maxWidth: { xs: 'calc(100% - 32px)', sm: '388px' },
          zIndex: 1000,
          overflowX: 'hidden',
          boxSizing: 'border-box',
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
            width: '100%',
            maxWidth: '100%',
            overflowX: 'hidden',
            boxSizing: 'border-box',
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
                overflowX: 'hidden',
                '&::placeholder': {
                  opacity: 0.6,
                },
              },
            }}
            sx={{
              flex: 1,
              minWidth: 0,
              overflowX: 'hidden',
              '& .MuiInputBase-root': {
                minHeight: '44px',
                overflowX: 'hidden',
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

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={chatToDelete !== null}
        onClose={handleDeleteChatCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">
          Delete Chat?
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Delete this chat? This cannot be undone.
            {chatToDelete && (() => {
              const chat = chats.find(c => c.id === chatToDelete);
              const name = chat ? (chat.name || 'this chat').replace(/^["']|["']$/g, '') : 'this chat';
              return ` All messages in "${name}" will be deleted.`;
            })()}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteChatCancel} color="inherit">
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteChatConfirm} 
            color="error" 
            variant="contained"
            autoFocus
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ChildChat;
