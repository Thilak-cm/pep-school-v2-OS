import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  ClickAwayListener,
  Dialog,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import {
  ChevronDown as ArrowDropDown,
  MessageCircle as Chat,
  Mic,
  Pencil as Edit,
  Plus as Add,
  Send,
  Square as Stop,
  Trash2 as Delete,
} from '../icons';
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { HEADER_HEIGHT } from '../AppHeader.jsx';
import { auth, db } from '../firebase';
import { formatDate } from '../utils/dateFormat.js';
import { createChatIds } from '../services/chatStreamService.js';
import useInlineVoice from '../hooks/useInlineVoice';
import InlineVoiceOverlay from './InlineVoiceOverlay.jsx';
import { CHAT_MAINTENANCE_ALLOWED_UID, default as ChatMaintenance } from './ChatMaintenance.jsx';
import { AssistantBubble, UserBubble } from './chat/MessageBubble.jsx';
import ScrollToBottomFab from './chat/ScrollToBottomFab.jsx';
import TypingIndicator from './chat/TypingIndicator.jsx';
import { mergeMessageSnapshot, stripQuotes } from './chat/chatUtils.js';
import { canManageChildChat } from './chat/chatPermissions.js';
import {
  appendOptimisticTurn,
  applyChatStreamEvent,
  buildRetryRequest,
  reconcileMessagesWithTurns,
} from './chat/childChatState.js';
import {
  abortActiveChatRequest,
  chatErrorMessage,
  runAuthenticatedChatTurn,
} from './chat/chatTurnController.js';

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'pep-os';
const defaultStreamUrl = import.meta.env.DEV && import.meta.env.VITE_USE_FUNCTIONS_EMULATOR !== 'false'
  ? `http://127.0.0.1:5001/${projectId}/asia-south1/childChatStream`
  : `https://asia-south1-${projectId}.cloudfunctions.net/childChatStream`;

function timestampMs(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTimestamp(value) {
  const milliseconds = timestampMs(value);
  if (!milliseconds) return '';
  const date = new Date(milliseconds);
  const age = Date.now() - milliseconds;
  const minutes = Math.floor(age / 60000);
  const hours = Math.floor(age / 3600000);
  const days = Math.floor(age / 86400000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(date, false);
}

export default function ChildChat({ student, currentUser, userRole, manageableClassrooms = [] }) {
  const isAuthorizedTester = import.meta.env.DEV && currentUser?.uid === CHAT_MAINTENANCE_ALLOWED_UID;
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState('');
  const [chatDropdownOpen, setChatDropdownOpen] = useState(false);
  const [editingChat, setEditingChat] = useState(null);
  const [editingChatName, setEditingChatName] = useState('');
  const [editingError, setEditingError] = useState('');
  const [deletingChat, setDeletingChat] = useState(null);
  const [deletingError, setDeletingError] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardBottomOffset, setKeyboardBottomOffset] = useState(0);

  const abortRef = useRef(null);
  const activeTurnRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const mountedRef = useRef(false);
  const currentStudentIdRef = useRef(student?.id);
  const selectedChatIdRef = useRef(selectedChatId);
  const hasManuallySelectedChatRef = useRef(false);
  const persistedMessageIdsRef = useRef(new Set());
  const turnDocsRef = useRef([]);

  currentStudentIdRef.current = student?.id;
  selectedChatIdRef.current = selectedChatId;

  const voice = useInlineVoice({ onTranscribed: setInput });

  const chatTitle = useMemo(() => {
    if (!selectedChatId) return 'New Chat';
    return stripQuotes(chats.find((chat) => chat.id === selectedChatId)?.name || 'New Chat');
  }, [chats, selectedChatId]);

  const studentName = useMemo(() => student?.displayName
    || student?.name
    || `${student?.firstName || ''} ${student?.lastName || ''}`.trim()
    || 'this student', [student]);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const loadChats = useCallback(async () => {
    const studentId = student?.id;
    if (!studentId) return [];
    const ref = collection(db, 'students', studentId, 'chats');
    let snapshot;
    try {
      snapshot = await getDocs(query(ref, where('deleted', '==', false)));
    } catch {
      snapshot = await getDocs(ref);
    }
    const next = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((chat) => chat.deleted !== true)
      .sort((left, right) => timestampMs(right.updatedAt || right.createdAt)
        - timestampMs(left.updatedAt || left.createdAt));

    if (mountedRef.current && currentStudentIdRef.current === studentId) {
      setChats(next);
      if (!selectedChatIdRef.current && !hasManuallySelectedChatRef.current && next.length > 0) {
        setSelectedChatId(next[0].id);
      }
    }
    return next;
  }, [student?.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortActiveChatRequest(abortRef, { clear: true });
    };
  }, []);

  useEffect(() => {
    hasManuallySelectedChatRef.current = false;
    activeTurnRef.current = null;
    persistedMessageIdsRef.current = new Set();
    turnDocsRef.current = [];
    setSelectedChatId(null);
    setMessages([]);
    setInput('');
    setLoading(false);
    setError('');
    return () => {
      abortActiveChatRequest(abortRef, { clear: true });
      activeTurnRef.current = null;
    };
  }, [student?.id]);

  useEffect(() => {
    if (!isAuthorizedTester || !student?.id) return undefined;
    let active = true;
    setChatsLoading(true);
    loadChats()
      .catch(() => {
        if (active) setError('Unable to refresh conversations. Please try again.');
      })
      .finally(() => {
        if (active) setChatsLoading(false);
      });
    return () => { active = false; };
  }, [isAuthorizedTester, loadChats, student?.id]);

  useEffect(() => {
    if (!isAuthorizedTester || !student?.id || !selectedChatId) {
      persistedMessageIdsRef.current = new Set();
      turnDocsRef.current = [];
      setMessages([]);
      setMessagesLoading(false);
      return undefined;
    }

    const studentId = student.id;
    const chatId = selectedChatId;
    setMessagesLoading(true);
    const messagesRef = collection(db, 'students', studentId, 'chats', chatId, 'messages');
    const turnsRef = collection(db, 'students', studentId, 'chats', chatId, 'turns');
    let unsubscribeMessages;
    let unsubscribeTurns;
    try {
      unsubscribeMessages = onSnapshot(messagesRef, (snapshot) => {
        if (currentStudentIdRef.current !== studentId || selectedChatIdRef.current !== chatId) return;
        const incoming = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        persistedMessageIdsRef.current = new Set(incoming.map((message) => message.id));
        const activeTurn = activeTurnRef.current;
        const retainedIds = new Set();

        if (activeTurn?.studentId === studentId && activeTurn.chatId === chatId) {
          const authoritativeAssistant = incoming.find((message) => message.role === 'assistant'
            && message.id === activeTurn.assistantMessageId);
          if (authoritativeAssistant) {
            activeTurnRef.current = null;
          } else {
            retainedIds.add(activeTurn.assistantMessageId);
          }
          if (!incoming.some((message) => message.id === activeTurn.userMessageId)) {
            retainedIds.add(activeTurn.userMessageId);
          }
        }

        setMessages((previous) => reconcileMessagesWithTurns(
          mergeMessageSnapshot(previous, incoming, retainedIds),
          turnDocsRef.current,
          chatId,
          persistedMessageIdsRef.current,
        ));
        setMessagesLoading(false);
      }, () => {
        if (currentStudentIdRef.current === studentId && selectedChatIdRef.current === chatId) {
          setError('Unable to load messages. Please try again.');
          setMessagesLoading(false);
        }
      });
      unsubscribeTurns = onSnapshot(turnsRef, (snapshot) => {
        if (currentStudentIdRef.current !== studentId || selectedChatIdRef.current !== chatId) return;
        const incomingTurns = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        turnDocsRef.current = incomingTurns;
        setMessages((previous) => {
          const activeTurn = activeTurnRef.current;
          const terminalActiveTurn = activeTurn && incomingTurns.find((turn) => turn.id === activeTurn.turnId
            && ['failed', 'interrupted'].includes(turn.status));
          const activeAssistant = terminalActiveTurn && previous.find((message) => (
            message.id === terminalActiveTurn.assistantMessageId
              || message.id === `${terminalActiveTurn.runId}-assistant`
          ));
          if (terminalActiveTurn
            && !persistedMessageIdsRef.current.has(activeAssistant?.id)
            && !activeAssistant?.content) {
            activeTurnRef.current = null;
          }
          return reconcileMessagesWithTurns(
            previous,
            incomingTurns,
            chatId,
            persistedMessageIdsRef.current,
          );
        });
      }, () => {
        if (currentStudentIdRef.current === studentId && selectedChatIdRef.current === chatId) {
          setError('Unable to load response status. Please try again.');
        }
      });
    } catch {
      setError('Unable to load messages. Please try again.');
      setMessagesLoading(false);
    }
    return () => {
      unsubscribeMessages?.();
      unsubscribeTurns?.();
    };
  }, [isAuthorizedTester, selectedChatId, student?.id]);

  useEffect(() => {
    if (!messages.length) return undefined;
    const timer = setTimeout(() => scrollToBottom('auto'), 50);
    return () => clearTimeout(timer);
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    let timer;
    const handleResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const gap = window.innerHeight - viewport.height;
        const open = gap > 150;
        setIsKeyboardOpen(open);
        setKeyboardBottomOffset(open ? Math.max(0, gap - viewport.offsetTop) : 0);
      }, 120);
    };
    viewport.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      viewport.removeEventListener('resize', handleResize);
    };
  }, []);

  const leaveActiveChat = useCallback(() => {
    abortActiveChatRequest(abortRef, { clear: true });
    activeTurnRef.current = null;
    setLoading(false);
  }, []);

  const handleNewChat = () => {
    leaveActiveChat();
    hasManuallySelectedChatRef.current = true;
    setSelectedChatId(null);
    setMessages([]);
    setInput('');
    setError('');
    setChatDropdownOpen(false);
  };

  const handleSelectChat = (chatId) => {
    if (chatId !== selectedChatId) leaveActiveChat();
    hasManuallySelectedChatRef.current = true;
    setSelectedChatId(chatId);
    setChatDropdownOpen(false);
    setError('');
  };

  const handleRenameChat = async () => {
    if (!editingChat || !editingChatName.trim() || !student?.id || !canManageChildChat({
      chat: editingChat,
      currentUser,
      userRole,
      manageableClassrooms,
      studentClassroomId: student.classroomId,
    })) return;
    const name = editingChatName.trim();
    setEditingError('');
    try {
      await updateDoc(doc(db, 'students', student.id, 'chats', editingChat.id), {
        name,
        updatedAt: serverTimestamp(),
      });
      setChats((previous) => previous.map((chat) => chat.id === editingChat.id ? { ...chat, name } : chat));
      setEditingChat(null);
      setEditingChatName('');
    } catch {
      setEditingError('Unable to rename this conversation. Please try again.');
    }
  };

  const handleDeleteChat = async () => {
    if (!deletingChat || !student?.id || !canManageChildChat({
      chat: deletingChat,
      currentUser,
      userRole,
      manageableClassrooms,
      studentClassroomId: student.classroomId,
    })) return;
    setDeletingError('');
    try {
      await updateDoc(doc(db, 'students', student.id, 'chats', deletingChat.id), {
        deleted: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const remaining = chats.filter((chat) => chat.id !== deletingChat.id);
      setChats(remaining);
      if (selectedChatId === deletingChat.id) {
        leaveActiveChat();
        hasManuallySelectedChatRef.current = true;
        setSelectedChatId(remaining[0]?.id || null);
        setMessages([]);
      }
      setDeletingChat(null);
    } catch {
      setDeletingError('Unable to delete this conversation. Please try again.');
    }
  };

  const handleSend = async (retryAssistantMessage = null) => {
    const studentId = student?.id;
    if (!studentId || loading) return;
    const firebaseUser = auth.currentUser;
    if (!firebaseUser?.uid) {
      setError('You must be signed in to chat.');
      return;
    }

    const generatedIds = createChatIds();
    const retryRequest = retryAssistantMessage ? buildRetryRequest({
      messages,
      assistantMessage: retryAssistantMessage,
      chatId: selectedChatId,
      runId: generatedIds.runId,
    }) : null;
    const message = retryRequest?.message || input.trim();
    if (!message || (retryAssistantMessage && !retryRequest)) return;
    const canRetry = Boolean(retryRequest);
    const ids = retryRequest?.ids || generatedIds;
    const chatId = selectedChatId || ids.chatId;
    const createdAt = new Date();
    const assistantMessageId = `${ids.runId}-assistant`;
    const controller = new AbortController();
    abortRef.current = controller;
    activeTurnRef.current = {
      studentId,
      chatId,
      turnId: ids.turnId,
      runId: ids.runId,
      userMessageId: ids.userMessageId,
      assistantMessageId,
      message,
    };

    hasManuallySelectedChatRef.current = true;
    setSelectedChatId(chatId);
    setInput('');
    setError('');
    setLoading(true);
    setMessages((previous) => appendOptimisticTurn(previous, {
      ids: { ...ids, chatId },
      message,
      authorId: firebaseUser.uid,
      authorName: firebaseUser.displayName || null,
      createdAt,
      isRetry: canRetry,
    }));

    const isCurrentRequest = () => mountedRef.current
      && currentStudentIdRef.current === studentId
      && abortRef.current === controller;

    try {
      await runAuthenticatedChatTurn({
        currentUser: firebaseUser,
        url: import.meta.env.VITE_CHAT_STREAM_URL || defaultStreamUrl,
        signal: controller.signal,
        studentId,
        chatId,
        ids,
        message,
        onRunChange: (retryIds) => {
          if (!isCurrentRequest()) return;
          const previousAssistantId = activeTurnRef.current?.assistantMessageId;
          const nextAssistantId = `${retryIds.runId}-assistant`;
          activeTurnRef.current = {
            ...activeTurnRef.current,
            runId: retryIds.runId,
            assistantMessageId: nextAssistantId,
          };
          setMessages((previous) => previous.map((item) => item.id === previousAssistantId
            ? { ...item, id: nextAssistantId, runId: retryIds.runId, content: '', status: 'streaming' }
            : item));
        },
        onEvent: (event, eventIds) => {
          if (!isCurrentRequest()) return;
          setMessages((previous) => applyChatStreamEvent(
            previous,
            event,
            eventIds,
            ids.userMessageId,
          ));
        },
      });
    } catch (streamError) {
      if (!isCurrentRequest()) return;
      const interrupted = controller.signal.aborted;
      if (!interrupted) {
        setError(chatErrorMessage(streamError));
        setInput((draft) => draft || message);
      }
      const activeAssistantId = activeTurnRef.current?.assistantMessageId;
      setMessages((previous) => previous.map((item) => {
        if (item.id === ids.userMessageId && streamError.details?.persisted === false) {
          return { ...item, status: 'unsent' };
        }
        if (item.id === activeAssistantId) {
          return {
            ...item,
            status: interrupted || streamError.status === 'interrupted' ? 'interrupted' : 'failed',
          };
        }
        return item;
      }));
    } finally {
      if (isCurrentRequest()) {
        abortRef.current = null;
        setLoading(false);
        try {
          await loadChats();
        } catch {
          if (mountedRef.current && currentStudentIdRef.current === studentId) {
            setError((current) => current || 'The response was saved, but conversations could not be refreshed.');
          }
        }
      }
    }
  };

  const handleInputKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleMessagesScroll = () => {
    const element = messagesContainerRef.current;
    if (!element) return;
    setShowScrollButton(element.scrollHeight - element.scrollTop - element.clientHeight > 200);
  };

  if (!isAuthorizedTester) return <ChatMaintenance currentUser={currentUser} />;
  if (!student?.id) return <Alert severity="error" sx={{ m: 2 }}>Student information is required to start a chat.</Alert>;

  const isLanding = selectedChatId === null;
  const bottomOffset = isKeyboardOpen
    ? { xs: `${keyboardBottomOffset}px`, sm: '80px' }
    : { xs: 'calc(80px + env(safe-area-inset-bottom, 0px))', sm: '80px' };
  const activeAssistant = activeTurnRef.current
    ? messages.find((message) => message.id === activeTurnRef.current.assistantMessageId)
    : null;
  const showTypingIndicator = loading && !activeAssistant?.content;

  return (
    <Box sx={{ width: '100%', maxWidth: { xs: '100%', sm: '420px' }, minHeight: 'calc(100vh - 80px)', position: 'relative', bgcolor: 'background.default' }}>
      <Box sx={{ position: 'fixed', top: `calc(${HEADER_HEIGHT}px + env(safe-area-inset-top, 0px))`, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, width: '100%', maxWidth: { xs: '100%', sm: '420px' }, px: 2, pt: 1, boxSizing: 'border-box' }}>
        <ClickAwayListener onClickAway={() => setChatDropdownOpen(false)}>
          <Box sx={{ position: 'relative' }}>
            <Paper elevation={2} sx={{ display: 'flex', alignItems: 'center', borderRadius: '28px', overflow: 'hidden', border: '1px solid', borderColor: 'rgba(0,0,0,.08)', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
              <Button fullWidth onClick={() => setChatDropdownOpen((open) => !open)} sx={{ justifyContent: 'space-between', px: 2.5, py: 1.25, textTransform: 'none', minWidth: 0 }}>
                <Typography noWrap color={selectedChatId ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: selectedChatId ? 500 : 400 }}>
                  {selectedChatId ? chatTitle : 'Load past conversations here'}
                </Typography>
                <ArrowDropDown size={20} style={{ flexShrink: 0, transform: chatDropdownOpen ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
              </Button>
              <Box sx={{ width: '1px', height: 32, bgcolor: 'rgba(0,0,0,.08)' }} />
              <IconButton onClick={handleNewChat} disabled={isLanding} aria-label="New chat" sx={{ width: 48, height: 48, color: 'primary.main' }}><Add /></IconButton>
            </Paper>
            {chatDropdownOpen && (
              <Paper elevation={4} sx={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, maxHeight: 280, overflowY: 'auto', borderRadius: '20px' }}>
                {chatsLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={20} /></Box>
                ) : (
                  <List dense sx={{ py: 1 }}>
                    {chats.length === 0 && <ListItemText sx={{ px: 2, py: 1 }} primary="No past conversations" />}
                    {chats.map((chat) => {
                      const canManage = canManageChildChat({
                        chat,
                        currentUser,
                        userRole,
                        manageableClassrooms,
                        studentClassroomId: student.classroomId,
                      });
                      return (
                        <ListItemButton key={chat.id} selected={chat.id === selectedChatId} onClick={() => handleSelectChat(chat.id)} sx={{ borderRadius: 3, mx: 1 }}>
                          <ListItemText primary={stripQuotes(chat.name || 'New Chat')} primaryTypographyProps={{ noWrap: true }} />
                          {canManage && (
                            <>
                              <IconButton size="small" aria-label="Edit chat name" onClick={(event) => { event.stopPropagation(); setEditingError(''); setEditingChat(chat); setEditingChatName(stripQuotes(chat.name || '')); }}><Edit size={17} /></IconButton>
                              <IconButton size="small" aria-label="Delete chat" onClick={(event) => { event.stopPropagation(); setDeletingError(''); setDeletingChat(chat); }}><Delete size={17} /></IconButton>
                            </>
                          )}
                        </ListItemButton>
                      );
                    })}
                  </List>
                )}
              </Paper>
            )}
          </Box>
        </ClickAwayListener>
      </Box>

      <Box ref={messagesContainerRef} onScroll={handleMessagesScroll} sx={{ height: 'calc(100vh - 80px)', overflowY: isLanding ? 'hidden' : 'auto', overflowX: 'hidden', px: 2, pt: `calc(${HEADER_HEIGHT}px + 72px)`, pb: '190px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {messagesLoading && messages.length === 0 ? (
          <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>
        ) : isLanding ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', p: 3 }}>
            <Chat size={64} style={{ color: 'var(--color-text-soft)', marginBottom: 16 }} />
            <Typography variant="h6" gutterBottom>Start a new conversation</Typography>
            <Typography variant="body2" color="text.secondary">Type something to start a chat or pick a past conversation from above.</Typography>
          </Box>
        ) : messages.length === 0 ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', p: 3 }}>
            <Chat size={64} style={{ color: 'var(--color-text-soft)', marginBottom: 16 }} />
            <Typography variant="h6" gutterBottom>No messages yet</Typography>
            <Typography variant="body2" color="text.secondary">Start the conversation by asking a question about {studentName}.</Typography>
          </Box>
        ) : (
          <>
            {messages.map((message) => {
              if (message.role === 'assistant' && !message.content && message.status === 'streaming') return null;
              return (
                <Box key={message.id} sx={{ display: 'flex', flexDirection: 'column', alignItems: message.role === 'user' ? 'flex-end' : 'flex-start', width: '100%' }}>
                  {message.role === 'user'
                    ? <UserBubble message={message} formatTimestamp={formatTimestamp} />
                    : <AssistantBubble message={message} formatTimestamp={formatTimestamp} />}
                  {message.status === 'interrupted' && <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, fontStyle: 'italic' }}>Response interrupted</Typography>}
                  {message.status === 'failed' && <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>Response failed</Typography>}
                  {buildRetryRequest({ messages, assistantMessage: message, chatId: selectedChatId, runId: 'preview' }) && (
                    <Button size="small" onClick={() => handleSend(message)} disabled={loading} sx={{ mt: 0.25, textTransform: 'none' }}>Retry</Button>
                  )}
                </Box>
              );
            })}
            {showTypingIndicator && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </>
        )}
      </Box>

      {!isLanding && <ScrollToBottomFab visible={showScrollButton} onClick={scrollToBottom} isKeyboardOpen={isKeyboardOpen} />}

      <Box sx={{ position: 'fixed', left: '50%', bottom: bottomOffset, transform: 'translateX(-50%)', width: '100%', maxWidth: { xs: '100%', sm: '420px' }, px: 2, zIndex: 1000, boxSizing: 'border-box', transition: 'bottom .15s' }}>
        {(error || voice.error) && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => { setError(''); voice.clearError(); }}>{error || voice.error}</Alert>
        )}
        {voice.active ? <InlineVoiceOverlay {...voice} /> : (
          <Paper elevation={2} sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', p: 1, borderRadius: '28px', border: '1px solid', borderColor: 'rgba(0,0,0,.08)', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
            <TextField fullWidth multiline maxRows={4} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleInputKeyDown} disabled={loading} placeholder="Type your message..." variant="standard" InputProps={{ disableUnderline: true }} sx={{ '& .MuiInputBase-root': { px: 1.5, py: 1.25 } }} />
            {loading ? (
              <IconButton onClick={() => abortActiveChatRequest(abortRef)} aria-label="Stop response" sx={{ width: 44, height: 44, color: 'error.main' }}><Stop /></IconButton>
            ) : (
              <>
                <IconButton onClick={voice.startRecording} aria-label="Start voice recording" sx={{ width: 44, height: 44, color: 'primary.main' }}><Mic /></IconButton>
                <IconButton onClick={() => handleSend()} disabled={!input.trim()} aria-label="Send message" sx={{ width: 44, height: 44, color: 'primary.main' }}><Send /></IconButton>
              </>
            )}
          </Paper>
        )}
      </Box>

      <Dialog open={Boolean(editingChat)} onClose={() => setEditingChat(null)} fullWidth maxWidth="xs">
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Edit Chat Name</Typography>
          {editingError && <Alert severity="error" sx={{ mb: 2 }}>{editingError}</Alert>}
          <TextField autoFocus fullWidth value={editingChatName} onChange={(event) => setEditingChatName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleRenameChat(); }} sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button onClick={() => setEditingChat(null)}>Cancel</Button>
            <Button onClick={handleRenameChat} disabled={!editingChatName.trim()} variant="contained">Save</Button>
          </Box>
        </Box>
      </Dialog>
      <Dialog open={Boolean(deletingChat)} onClose={() => setDeletingChat(null)} fullWidth maxWidth="xs">
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Delete conversation?</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>This conversation will be removed from your chat history.</Typography>
          {deletingError && <Alert severity="error" sx={{ mb: 2 }}>{deletingError}</Alert>}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button onClick={() => setDeletingChat(null)} variant="contained" autoFocus>Cancel</Button>
            <Button onClick={handleDeleteChat} color="error" variant="outlined">Delete</Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}
