import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  ClickAwayListener,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { ChevronDown as ArrowDropDown, Pencil as Edit, Plus as Add, Send, Square as Stop, Trash2 as Delete } from '../icons';
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { CHAT_MAINTENANCE_ALLOWED_UID, default as ChatMaintenance } from './ChatMaintenance.jsx';
import { createChatIds, streamChatTurn } from '../services/chatStreamService.js';
import useInlineVoice from '../hooks/useInlineVoice';

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'pep-os';
const defaultStreamUrl = import.meta.env.DEV && import.meta.env.VITE_USE_FUNCTIONS_EMULATOR !== 'false'
  ? `http://127.0.0.1:5001/${projectId}/asia-south1/childChatStream`
  : `https://asia-south1-${projectId}.cloudfunctions.net/childChatStream`;

export default function ChildChat({ student, currentUser }) {
  const isAuthorizedTester = import.meta.env.DEV && currentUser?.uid === CHAT_MAINTENANCE_ALLOWED_UID;
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chatDropdownOpen, setChatDropdownOpen] = useState(false);
  const [editingChat, setEditingChat] = useState(null);
  const [editingChatName, setEditingChatName] = useState('');
  const [deletingChat, setDeletingChat] = useState(null);
  const abortRef = useRef(null);
  const voice = useInlineVoice({ onTranscribed: setInput });

  const loadChats = useCallback(async () => {
    if (!student?.id) return;
    const ref = collection(db, 'students', student.id, 'chats');
    let snapshot;
    try {
      snapshot = await getDocs(query(ref, where('deleted', '==', false)));
    } catch {
      snapshot = await getDocs(ref);
    }
    const next = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((chat) => chat.deleted !== true)
      .sort((a, b) => {
        const time = (value) => value?.toMillis?.() || value?.seconds * 1000 || new Date(value || 0).getTime();
        return time(b.updatedAt || b.createdAt) - time(a.updatedAt || a.createdAt);
      });
    setChats(next);
  }, [student?.id]);

  useEffect(() => {
    if (!isAuthorizedTester) return undefined;
    loadChats().catch(() => setError('Unable to load chats.'));
    return undefined;
  }, [isAuthorizedTester, loadChats]);

  useEffect(() => {
    if (!isAuthorizedTester || !student?.id || !selectedChatId) {
      setMessages([]);
      return undefined;
    }
    const ref = collection(db, 'students', student.id, 'chats', selectedChatId, 'messages');
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const next = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => {
          const time = (value) => value?.toMillis?.() || value?.seconds * 1000 || new Date(value || 0).getTime();
          return time(a.createdAt || a.timestamp) - time(b.createdAt || b.timestamp);
        });
      setMessages(next);
    }, () => setError('Unable to load messages.'));
    return unsubscribe;
  }, [isAuthorizedTester, selectedChatId, student?.id]);

  const handleNewChat = () => {
    abortRef.current?.abort();
    setSelectedChatId(null);
    setMessages([]);
    setInput('');
    setError('');
    setChatDropdownOpen(false);
  };

  const handleRenameChat = async () => {
    if (!editingChat || !editingChatName.trim() || !student?.id) return;
    await updateDoc(doc(db, 'students', student.id, 'chats', editingChat.id), {
      name: editingChatName.trim(),
      updatedAt: serverTimestamp(),
    });
    setChats((previous) => previous.map((chat) => chat.id === editingChat.id ? { ...chat, name: editingChatName.trim() } : chat));
    setEditingChat(null);
    setEditingChatName('');
  };

  const handleDeleteChat = async () => {
    if (!deletingChat || !student?.id) return;
    await updateDoc(doc(db, 'students', student.id, 'chats', deletingChat.id), {
      deleted: true,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setChats((previous) => previous.filter((chat) => chat.id !== deletingChat.id));
    if (selectedChatId === deletingChat.id) handleNewChat();
    setDeletingChat(null);
  };

  const handleSend = async () => {
    const message = input.trim();
    if (!message || !student?.id || loading) return;
    const ids = createChatIds();
    const chatId = selectedChatId || ids.chatId;
    const userId = auth.currentUser?.uid;
    if (!userId) {
      setError('You must be signed in to chat.');
      return;
    }

    setSelectedChatId(chatId);
    setInput('');
    setError('');
    setLoading(true);
    setMessages((previous) => [
      ...previous,
      { id: ids.userMessageId, role: 'user', content: message, authorId: userId, createdAt: new Date() },
      { id: `${ids.runId}-assistant`, role: 'assistant', content: '', status: 'streaming', createdAt: new Date() },
    ]);

    const token = await auth.currentUser.getIdToken();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChatTurn({
        url: import.meta.env.VITE_CHAT_STREAM_URL || defaultStreamUrl,
        token,
        signal: controller.signal,
        payload: { studentId: student.id, chatId, ...ids, message },
        onEvent: (event) => {
          if (event.event !== 'token' || typeof event.data?.text !== 'string') return;
          setMessages((previous) => previous.map((item) => item.id === `${ids.runId}-assistant`
            ? { ...item, content: `${item.content}${event.data.text}` }
            : item));
        },
      });
    } catch (streamError) {
      if (!controller.signal.aborted) setError(streamError.message || 'Chat request failed.');
      setMessages((previous) => previous.map((item) => item.id === `${ids.runId}-assistant`
        ? { ...item, status: controller.signal.aborted ? 'interrupted' : 'failed' }
        : item));
    } finally {
      abortRef.current = null;
      setLoading(false);
      loadChats().catch(() => {});
    }
  };

  if (!isAuthorizedTester) return <ChatMaintenance currentUser={currentUser} />;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', p: 1, gap: 1 }}>
      <ClickAwayListener onClickAway={() => setChatDropdownOpen(false)}>
        <Box sx={{ position: 'relative', zIndex: 2 }}>
          <Paper sx={{ display: 'flex', alignItems: 'center', borderRadius: 7, overflow: 'hidden' }}>
            <Button fullWidth onClick={() => setChatDropdownOpen((open) => !open)} sx={{ justifyContent: 'space-between', px: 2, py: 1.25, textTransform: 'none' }}>
              <Typography noWrap color={selectedChatId ? 'text.primary' : 'text.secondary'}>
                {selectedChatId ? chats.find((chat) => chat.id === selectedChatId)?.name || 'New Chat' : 'Load past conversations here'}
              </Typography>
              <ArrowDropDown size={20} style={{ transform: chatDropdownOpen ? 'rotate(180deg)' : undefined }} />
            </Button>
            <IconButton onClick={handleNewChat} aria-label="New chat"><Add /></IconButton>
          </Paper>
          {chatDropdownOpen && (
            <Paper elevation={4} sx={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, maxHeight: 280, overflowY: 'auto', borderRadius: 3 }}>
              <List dense>
                {chats.length === 0 && <ListItemText sx={{ px: 2, py: 1 }} primary="No past conversations" />}
                {chats.map((chat) => (
                  <ListItemButton key={chat.id} selected={chat.id === selectedChatId} onClick={() => { setSelectedChatId(chat.id); setChatDropdownOpen(false); }}>
                    <ListItemText primary={chat.name || 'New Chat'} />
                    <IconButton size="small" aria-label="Edit chat name" onClick={(event) => { event.stopPropagation(); setEditingChat(chat); setEditingChatName(chat.name || ''); }}><Edit size={16} /></IconButton>
                    <IconButton size="small" aria-label="Delete chat" onClick={(event) => { event.stopPropagation(); setDeletingChat(chat); }}><Delete size={16} /></IconButton>
                  </ListItemButton>
                ))}
              </List>
            </Paper>
          )}
        </Box>
      </ClickAwayListener>
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1, pb: 12 }}>
          {messages.map((message) => (
            <Paper key={message.id} sx={{ p: 1, alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{message.content || (message.status === 'streaming' ? '…' : '')}</Typography>
            </Paper>
          ))}
        </Box>
        <Box sx={{ position: 'fixed', left: '50%', bottom: { xs: '80px', sm: '80px' }, transform: 'translateX(-50%)', width: '100%', maxWidth: { xs: '100%', sm: '420px' }, px: 1, zIndex: 10, backgroundColor: 'background.default' }}>
          {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
          <Paper sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', p: 1, borderRadius: 7 }}>
            <TextField fullWidth multiline maxRows={4} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about this student…" variant="standard" InputProps={{ disableUnderline: true }} />
            {loading ? <IconButton onClick={() => abortRef.current?.abort()} aria-label="Stop response"><Stop size={20} /></IconButton> : <IconButton onClick={handleSend} disabled={!input.trim()} aria-label="Send message"><Send size={20} /></IconButton>}
            {voice.isRecording && <CircularProgress size={18} />}
          </Paper>
        </Box>
      </Box>
      <Dialog open={Boolean(editingChat)} onClose={() => setEditingChat(null)} fullWidth maxWidth="xs">
        <DialogTitle>Edit chat name</DialogTitle>
        <DialogContent><TextField autoFocus fullWidth value={editingChatName} onChange={(event) => setEditingChatName(event.target.value)} /></DialogContent>
        <DialogActions><Button onClick={() => setEditingChat(null)}>Cancel</Button><Button onClick={handleRenameChat} variant="contained">Save</Button></DialogActions>
      </Dialog>
      <Dialog open={Boolean(deletingChat)} onClose={() => setDeletingChat(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete this chat?</DialogTitle>
        <DialogActions><Button onClick={() => setDeletingChat(null)}>Cancel</Button><Button onClick={handleDeleteChat} color="error">Delete</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
