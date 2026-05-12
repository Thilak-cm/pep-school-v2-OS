import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { Send, Plus as Add, MessageCircle as Chat, ChevronDown as ArrowDropDown, Pencil as Edit, Trash2 as Delete, Mic, Pause, Play as PlayArrow, Square as Stop } from '../icons';
import { formatDate } from '../utils/dateFormat';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  addDoc,
  Timestamp,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions, auth } from '../firebase';
import { translateAudioToEnglish, validateAudioForTranscription } from '../whisperSTT';
import { friendlyFunctionError } from '../utils/cloudFunctionErrors';
import { reportCaughtError } from '../utils/reportCaughtError.js';
import { stripQuotes, ASSISTANT_TIMEOUT_MS, filterMessagesAfterStop } from './chat/chatUtils';
import { UserBubble, AssistantBubble } from './chat/MessageBubble';
import TypingIndicator from './chat/TypingIndicator';
import ScrollToBottomFab from './chat/ScrollToBottomFab';

function ChildChat({ student, startInLandingPage = false, currentRole }) {
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
  const [devMode, setDevMode] = useState(false); // Default OFF - includes observations in context
  const [isFirstMessageFlow, setIsFirstMessageFlow] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [waveformData, setWaveformData] = useState([]);
  const [showTimeLimitWarning, setShowTimeLimitWarning] = useState(false);

  // Refs
  const messagesEndRef = useRef(null);
  const chatsUnsubscribeRef = useRef(null);
  const messagesUnsubscribeRef = useRef(null);
  const startInLandingPageRef = useRef(startInLandingPage);
  const hasManuallySelectedChatRef = useRef(false);
  const lastPendingUserTimestampRef = useRef(null);
  const selectedChatIdRef = useRef(null);
  const messagesContainerRef = useRef(null);
  
  // Recording refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const streamRef = useRef(null);
  const discardRef = useRef(false);
  const stoppedRef = useRef(false);
  const lastSentUserMsgIdRef = useRef(null);
  
  const MAX_RECORDING_TIME = 300; // 5 minutes

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

  // Defensive timeout: clear assistantPending after 30s to prevent stuck spinner
  useEffect(() => {
    if (!assistantPending) return;
    const timer = setTimeout(() => {
      stoppedRef.current = true;
      setAssistantPending(false);
      lastPendingUserTimestampRef.current = null;
      setError('Response timed out. Please try again.');
    }, ASSISTANT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [assistantPending]);

  // Track scroll position for scroll-to-bottom FAB
  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollButton(distanceFromBottom > 200);
  }, []);

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
        } catch {
          // Fallback: fetch all and filter/sort in memory
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
      } catch {
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
        () => {
          /* ignored */
        }
      );
    } catch (_err) {
      reportCaughtError(_err, 'ChildChat', 'swallow-only try/catch at L644');
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
              cancelledResponseAt: data.cancelledResponseAt || null,
            });
          });

          // If we're in first message flow and real messages arrive, remove temp messages
          if (isFirstMessageFlow && messagesList.length > 0) {
            setIsFirstMessageFlow(false);
          }

          // If the user pressed Stop, suppress any new assistant messages that arrive
          // but preserve local-only messages (like the "interrupted" indicator)
          if (stoppedRef.current) {
            setMessages((prev) => filterMessagesAfterStop(prev, messagesList));
            setMessagesLoading(false);
            return;
          }

          setMessages(messagesList);
          setMessagesLoading(false);

          // Clear pending state when an assistant response arrives after the last pending user message.
          // Gate on the ref (always current) instead of assistantPending state (stale in this closure).
          if (lastPendingUserTimestampRef.current) {
            const pendingTs = lastPendingUserTimestampRef.current.toMillis?.()
              || lastPendingUserTimestampRef.current.seconds * 1000
              || 0;
            const hasAssistantAfterPending = messagesList.some(
              (m) =>
                m.role === 'assistant' &&
                m.timestamp &&
                (m.timestamp.toMillis?.() || m.timestamp.seconds * 1000 || 0) > pendingTs
            );
            if (hasAssistantAfterPending) {
              setAssistantPending(false);
              lastPendingUserTimestampRef.current = null;
              lastSentUserMsgIdRef.current = null;
            }
          }

          // Auto-scroll to bottom after a short delay
          setTimeout(() => {
            scrollToBottom();
          }, 100);
        },
        () => {
          setError('Failed to load messages. Please try again.');
          setMessagesLoading(false);
          setAssistantPending(false);
        }
      );

      messagesUnsubscribeRef.current = unsubscribe;
    } catch {
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

      // Keep relative dates as-is
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      // Use standardized format for absolute dates (date-only, no time)
      return formatDate(timestamp, false);
    } catch {
      return '';
    }
  };

  // Format recording time as M:SS
  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Start recording timer
  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setRecordingTime((prevTime) => {
        const newTime = prevTime + 1;

        // Show warning at 4:45 (285 seconds)
        if (newTime === 285) {
          setShowTimeLimitWarning(true);
        }

        // Auto-stop at 5 minutes
        if (newTime >= MAX_RECORDING_TIME) {
          stopRecording();
          setError('Recording stopped at 5 minutes. Transcribing…');
          return MAX_RECORDING_TIME;
        }

        return newTime;
      });
    }, 1000);
  };

  // Stop recording timer
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const updateWaveform = () => {
    if (!analyserRef.current || !streamRef.current) {
      animationFrameRef.current = null;
      return;
    }

    const isActuallyRecording = mediaRecorderRef.current?.state === 'recording';
    const isActuallyPaused = mediaRecorderRef.current?.state === 'paused';
    
    if (!isActuallyRecording || isActuallyPaused) {
      animationFrameRef.current = null;
      return;
    }

    const bufferLength = analyserRef.current.frequencyBinCount;
    const timeDataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(timeDataArray);
    
    let maxAmplitude = 0;
    for (let i = 0; i < bufferLength; i++) {
      const sample = Math.abs(timeDataArray[i] - 128);
      if (sample > maxAmplitude) {
        maxAmplitude = sample;
      }
    }
    
    const normalizedLoudness = Math.min(1, (maxAmplitude / 128) * 3);
    const numBars = 60;
    const reducedData = [];
    const baseAmplitude = normalizedLoudness * 220;
    
    for (let i = 0; i < numBars; i++) {
      const waveVariation = Math.sin((i / numBars) * Math.PI * 4) * 0.3 + 1;
      const barValue = Math.min(255, baseAmplitude * waveVariation);
      reducedData.push(Math.max(4, barValue));
    }
    
    setWaveformData(reducedData);
    animationFrameRef.current = requestAnimationFrame(updateWaveform);
  };

  const resetRecordingState = () => {
    stopTimer();
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch (_e) {
        reportCaughtError(_e, 'ChildChat', 'swallow-only try/catch at L879');
      }
      mediaRecorderRef.current = null;
    }
    
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      } catch (_e) {
        reportCaughtError(_e, 'ChildChat', 'swallow-only try/catch at L888');
      }
      audioContextRef.current = null;
    }
    
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop());
      } catch (_e) {
        reportCaughtError(_e, 'ChildChat', 'swallow-only try/catch at L895');
      }
      streamRef.current = null;
    }
    
    analyserRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setIsTranscribing(false);
    setWaveformData([]);
    setShowTimeLimitWarning(false);
    audioChunksRef.current = [];
    discardRef.current = false;
  };

  const startRecording = async () => {
    if (isRecording || isTranscribing) {
      return;
    }

    resetRecordingState();

    try {
      discardRef.current = false;
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });
      
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/mp3')
        ? 'audio/mp3'
        : MediaRecorder.isTypeSupported('audio/mpeg')
        ? 'audio/mpeg'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      mediaRecorderRef.current.onerror = (event) => {
        setError(`Recording error: ${event.error?.message || 'Unknown error'}`);
        resetRecordingState();
      };

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        if (discardRef.current) {
          audioChunksRef.current = [];
          discardRef.current = false;
          resetRecordingState();
          return;
        }

        try {
          stream.getTracks().forEach(track => {
            if (track.readyState === 'live') {
              track.stop();
            }
          });
        } catch (_e) {
          reportCaughtError(_e, 'ChildChat', 'swallow-only try/catch at L968');
        }

        if (!audioChunksRef.current || audioChunksRef.current.length === 0) {
          setError('Recording failed: No audio data captured. Please try again.');
          resetRecordingState();
          return;
        }

        const mimeType = mediaRecorderRef.current.mimeType || 'audio/webm;codecs=opus';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        
        if (!blob || blob.size === 0) {
          setError('Recording failed: Invalid audio data. Please try again.');
          resetRecordingState();
          return;
        }

        if (blob.size < 1024) {
          setError('Recording too short. Please record for at least 1 second.');
          resetRecordingState();
          return;
        }

        handleTranscription(blob);
      };

      // Set state BEFORE starting to avoid race conditions
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      setShowTimeLimitWarning(false);
      setWaveformData([]);

      mediaRecorderRef.current.start();
      await new Promise(resolve => setTimeout(resolve, 50));

      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
        
        const source = audioContextRef.current.createMediaStreamSource(stream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 2048;
        analyserRef.current.smoothingTimeConstant = 0.3;
        source.connect(analyserRef.current);
        
        if (!animationFrameRef.current) {
          updateWaveform();
        }
      } catch (_audioError) {
        reportCaughtError(_audioError, 'ChildChat', 'swallow-only try/catch at L1020');
      }

      startTimer();

    } catch (error) {
      
      if (error.name === 'NotAllowedError') {
        setError('Microphone access denied. Enable mic in browser settings.');
      } else if (error.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone.');
      } else {
        setError(`Error accessing microphone: ${error.message}`);
      }
      resetRecordingState();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        setIsPaused(false);
        stopTimer();
        
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      } catch {
        setError('Error stopping recording. Please try again.');
        resetRecordingState();
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused && typeof mediaRecorderRef.current.pause === 'function') {
      try {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        stopTimer();
        
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      } catch (_e) {
        reportCaughtError(_e, 'ChildChat', 'swallow-only try/catch at L1067');
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused && typeof mediaRecorderRef.current.resume === 'function') {
      try {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        startTimer();
        
        if (!animationFrameRef.current) {
          updateWaveform();
        }
      } catch (_e) {
        reportCaughtError(_e, 'ChildChat', 'swallow-only try/catch at L1081');
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      discardRef.current = true;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      stopTimer();
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    } else {
      resetRecordingState();
    }
  };

  const handleTranscription = async (blob) => {
    if (!validateAudioForTranscription(blob)) {
      setError('Audio file is not suitable for transcription. File size must be under ~9.5MB.');
      resetRecordingState();
      return;
    }

    setIsTranscribing(true);
    setError('');

    try {
      const result = await translateAudioToEnglish(blob);
      
      if (result.text) {
        setInputMessage(result.text);
      } else {
        setError('No speech detected in the recording.');
      }
    } catch (error) {
      setError(`Transcription failed: ${friendlyFunctionError(error)}`);
    } finally {
      resetRecordingState();
    }
  };

  const isLanding = selectedChatId === null;

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

    stoppedRef.current = false;
    setSending(true);
    setAssistantPending(true);
    setError('');
    setInputMessage('');

    let chatId = selectedChatId;

    try {
      // If no chat selected, create one in Firestore directly
      if (!chatId) {
        const chatsRef = collection(db, 'students', student.id, 'chats');
        const chatDoc = await addDoc(chatsRef, {
          name: 'New Chat',
          createdBy: auth.currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastMessagePreview: '',
          messageCount: 0,
          deleted: false,
        });
        chatId = chatDoc.id;
        setSelectedChatId(chatId);
      }

      // Write user message directly to Firestore
      const messagesRef = collection(db, 'students', student.id, 'chats', chatId, 'messages');
      const userMsgDoc = await addDoc(messagesRef, {
        role: 'user',
        content: messageText,
        timestamp: Timestamp.now(),
        authorId: auth.currentUser?.uid || null,
        authorName: auth.currentUser?.displayName || null,
      });
      lastPendingUserTimestampRef.current = Timestamp.now();
      lastSentUserMsgIdRef.current = { id: userMsgDoc.id, chatId };

      // onSnapshot will pick up the user message immediately — no temp messages needed.
      // Now call CF with IDs — it only does the LLM call + assistant write.
      const childChatFn = httpsCallable(cloudFunctions, 'childChat');
      const result = await childChatFn({
        studentId: student.id,
        chatId,
        userMessageId: userMsgDoc.id,
        message: messageText,
        devMode: devMode,
      });

      const responseData = result.data;

      if (!responseData.success && !responseData.cancelled) {
        throw new Error(responseData.error || 'Failed to send message');
      }

      // Scroll to bottom
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    } catch (err) {
      setAssistantPending(false);
      lastPendingUserTimestampRef.current = null;

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
    stoppedRef.current = false;
    lastSentUserMsgIdRef.current = null;
    setSelectedChatId(null);
    setMessages([]);
    setInputMessage('');
    setChatDropdownOpen(false);
    hasManuallySelectedChatRef.current = true; // Mark as manual selection
  };

  // Handle chat selection
  const handleSelectChat = (chatId) => {
    stoppedRef.current = false;
    lastSentUserMsgIdRef.current = null;
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
    } catch {
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
        deletedAt: serverTimestamp(),
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
    } catch {
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

  // Handle stop / force-exit while waiting for assistant response
  const handleStopResponse = async () => {
    stoppedRef.current = true;
    setAssistantPending(false);
    setSending(false);
    lastPendingUserTimestampRef.current = null;

    // Write cancellation flag to the last user message doc so the CF skips the assistant write.
    // Use the ref (set immediately after addDoc) instead of messages state, which may not
    // contain the user message yet if Stop is pressed before onSnapshot fires.
    const lastSent = lastSentUserMsgIdRef.current;
    lastSentUserMsgIdRef.current = null;
    if (student?.id && lastSent && lastSent.chatId) {
      try {
        const msgRef = doc(db, 'students', student.id, 'chats', lastSent.chatId, 'messages', lastSent.id);
        await updateDoc(msgRef, { cancelledResponseAt: serverTimestamp() });
      } catch (_err) {
        reportCaughtError(_err, 'ChildChat', 'cancelledResponseAt write failed');
        setError('Could not cancel — a response may still arrive.');
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
      // Cleanup recording
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mediaRecorderRef.current) {
        try {
          if (mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        } catch (_) {
          reportCaughtError(_, 'ChildChat', 'swallow-only try/catch at L1405');
        }
      }
      if (audioContextRef.current) {
        try {
          if (audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
          }
        } catch (_) {
          reportCaughtError(_, 'ChildChat', 'swallow-only try/catch at L1412');
        }
      }
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach(track => track.stop());
        } catch (_) {
          reportCaughtError(_, 'ChildChat', 'swallow-only try/catch at L1417');
        }
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
        maxWidth: { xs: '100%', sm: '420px' },
        ...(isLanding
          ? {
              // Landing mode: fixed positioning to prevent parent container scrolling
              height: '100vh',
              margin: 0,
              position: 'fixed',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1,
            }
          : {
              // Chat mode: normal layout with margins
              margin: 0,
              position: 'relative',
            }),
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.default',
        overflow: 'hidden',
      }}
    >
      {/* Floating Chat Dropdown */}
      <Box
        sx={{
          ...(isLanding
            ? {
                // Landing mode: positioned relative to fixed container, below sticky header
                position: 'absolute',
                top: 60,
                left: 0,
                right: 0,
                zIndex: 1000,
              }
            : {
                // Chat mode: fixed to viewport, below sticky header
                position: 'fixed',
                top: 60,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
              }),
          width: '100%',
          maxWidth: { xs: '100%', sm: '420px' },
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
                  size={20} style={{ color: 'var(--color-text-soft)',
                    flexShrink: 0,
                    transition: 'transform 0.2s ease-in-out',
                    transform: chatDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    opacity: 0.7 }}
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
                            <Edit size={18} />
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
                            <Delete size={18} />
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
        
        {/* Dev Mode Toggle - Superadmin only */}
        {currentRole === 'superadmin' && (
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
        )}
      </Box>

      {/* Messages Area */}
      <Box
        ref={isLanding ? undefined : messagesContainerRef}
        onScroll={isLanding ? undefined : handleMessagesScroll}
        sx={{
          ...(isLanding
            ? {
                // Landing page: absolutely positioned between dropdown and input, no scrolling
                // 48px header + 56px pill = 104px
                position: 'absolute',
                top: 'calc(60px + 56px)',
                bottom: { xs: 'calc(80px + env(safe-area-inset-bottom, 0px))', sm: '80px' },
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
                // 48px header + 56px pill = 104px
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                p: 2,
                pt: 'calc(60px + 56px)',
                pb: { xs: 'calc(80px + env(safe-area-inset-bottom, 0px))', sm: '80px' },
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'stretch',
                gap: 1.5,
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
            <Chat size={64} style={{ color: 'var(--color-text-soft)', marginBottom: 16 }} />
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
            <Chat size={64} style={{ color: 'var(--color-text-soft)', marginBottom: 16 }} />
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
                  flexDirection: 'column',
                  alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
                  position: 'relative',
                  width: '100%',
                }}
              >
                {message.role === 'user' ? (
                  <>
                    <UserBubble message={message} formatTimestamp={formatTimestamp} />
                    {message.cancelledResponseAt && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.disabled',
                          fontStyle: 'italic',
                          mt: 0.5,
                        }}
                      >
                        Response interrupted
                      </Typography>
                    )}
                  </>
                ) : (
                  <AssistantBubble message={message} formatTimestamp={formatTimestamp} />
                )}
              </Box>
            ))}
            {assistantPending && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </>
        )}
      </Box>

      {/* Scroll-to-bottom FAB */}
      {!isLanding && <ScrollToBottomFab visible={showScrollButton} onClick={scrollToBottom} />}

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
          maxWidth: { xs: '100%', sm: '420px' },
          px: 2,
          pb: { xs: 'env(safe-area-inset-bottom, 0px)', sm: 0 },
        }}
      >
        {error && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}
        {isRecording || isTranscribing ? (
          // Recording UI
          <Paper
            elevation={2}
            sx={{
              p: 2,
              borderRadius: '28px',
              backgroundColor: 'white',
              border: '1px solid',
              borderColor: 'rgba(0, 0, 0, 0.08)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
            }}
          >
            {isTranscribing ? (
              // Transcription loading state
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, py: 1 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">
                  Transcribing...
                </Typography>
              </Box>
            ) : (
              <>
                {/* Timer and Waveform Row */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  {/* Timer */}
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: '0.9rem',
                      fontWeight: 500,
                      color: 'text.primary',
                      minWidth: '40px',
                    }}
                  >
                    {formatRecordingTime(recordingTime)}
                  </Typography>

                  {/* Waveform */}
                  <Box
                    sx={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      gap: 0.5,
                      height: 32,
                      px: 1,
                      minWidth: 0,
                      overflow: 'hidden', // Prevent extending beyond box
                      maxWidth: '100%',
                    }}
                  >
                    {waveformData.length > 0 ? (
                      waveformData.map((value, index) => {
                        // Normalize amplitude (0-255) to height (3-24px)
                        const normalizedValue = Math.min(255, Math.max(0, value));
                        // Use linear mapping for direct loudness reflection
                        const height = Math.max(3, (normalizedValue / 255) * 24);
                        return (
                          <Box
                            key={index}
                            sx={{
                              width: 2,
                              minWidth: 2,
                              maxWidth: 2,
                              height: `${height}px`,
                              backgroundColor: isPaused ? 'grey.400' : 'primary.main',
                              borderRadius: 1,
                              transition: 'height 0.1s linear', // Faster, linear transition for responsiveness
                              alignSelf: 'center',
                              flexShrink: 0,
                            }}
                          />
                        );
                      })
                    ) : (
                      // Placeholder dots when no waveform data yet
                      Array.from({ length: 60 }).map((_, index) => (
                        <Box
                          key={index}
                          sx={{
                            width: 2,
                            minWidth: 2,
                            maxWidth: 2,
                            height: '4px',
                            backgroundColor: 'grey.300',
                            borderRadius: 1,
                            flexShrink: 0,
                          }}
                        />
                      ))
                    )}
                  </Box>
                </Box>

                {/* Control Buttons Row */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  {/* Trash/Delete Button */}
                  <IconButton
                    onClick={cancelRecording}
                    aria-label="Delete recording"
                    sx={{
                      minWidth: 44,
                      minHeight: 44,
                      width: 44,
                      height: 44,
                      color: 'text.primary',
                      '&:hover': {
                        backgroundColor: 'grey.100',
                      },
                    }}
                  >
                    <Delete />
                  </IconButton>

                  {/* Pause/Resume Button */}
                  {typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype.pause === 'function' ? (
                    <IconButton
                      onClick={isPaused ? resumeRecording : pauseRecording}
                      aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
                      sx={{
                        minWidth: 48,
                        minHeight: 48,
                        width: 48,
                        height: 48,
                        backgroundColor: 'error.main',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: 'error.dark',
                        },
                      }}
                    >
                      {isPaused ? <PlayArrow /> : <Pause />}
                    </IconButton>
                  ) : (
                    <Box sx={{ width: 48, height: 48 }} />
                  )}

                  {/* Send Button */}
                  <IconButton
                    onClick={stopRecording}
                    aria-label="Send recording"
                    sx={{
                      minWidth: 48,
                      minHeight: 48,
                      width: 48,
                      height: 48,
                      backgroundColor: 'success.main',
                      color: 'white',
                      '&:hover': {
                        backgroundColor: 'success.dark',
                      },
                    }}
                  >
                    <Send />
                  </IconButton>
                </Box>

                {/* Paused Indicator */}
                {isPaused && (
                  <Box sx={{ mt: 1, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                      Recording paused
                    </Typography>
                  </Box>
                )}

                {/* Time Limit Warning */}
                {showTimeLimitWarning && !isPaused && (
                  <Box sx={{ mt: 1, textAlign: 'center' }}>
                    <Typography variant="caption" color="warning.main">
                      Recording will stop at 5 minutes
                    </Typography>
                  </Box>
                )}
              </>
            )}
          </Paper>
        ) : (
          // Normal Input UI
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
              disabled={sending || isRecording}
              variant="standard"
              InputProps={{
                disableUnderline: true,
              }}
              sx={{
                '& .MuiInputBase-root': {
                  backgroundColor: 'transparent',
                  borderRadius: '20px',
                  px: 1.5,
                  py: 1.25,
                },
              }}
            />
            {assistantPending ? (
              /* Stop Button — shown while waiting for assistant response */
              <IconButton
                onClick={handleStopResponse}
                aria-label="Stop waiting for response"
                sx={{
                  minWidth: 44,
                  minHeight: 44,
                  width: 44,
                  height: 44,
                  color: 'error.main',
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    color: 'error.dark',
                    backgroundColor: 'rgba(211, 47, 47, 0.08)',
                  },
                  '&:active': {
                    transform: 'scale(0.95)',
                  },
                }}
              >
                <Stop />
              </IconButton>
            ) : (
              <>
                {/* Mic Button */}
                <IconButton
                  onClick={startRecording}
                  disabled={isRecording || sending}
                  aria-label="Start voice recording"
                  sx={{
                    minWidth: 44,
                    minHeight: 44,
                    width: 44,
                    height: 44,
                    color: 'primary.main',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      color: 'primary.dark',
                      backgroundColor: 'transparent',
                    },
                    '&:active': {
                      transform: 'scale(0.95)',
                    },
                    '&:disabled': {
                      color: 'grey.400',
                      backgroundColor: 'transparent',
                    },
                  }}
                >
                  <Mic />
                </IconButton>
                {/* Send Button */}
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
                    color: 'primary.main',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      color: 'primary.dark',
                      backgroundColor: 'transparent',
                    },
                    '&:active': {
                      transform: 'scale(0.95)',
                    },
                    '&:disabled': {
                      color: 'grey.400',
                      backgroundColor: 'transparent',
                    },
                  }}
                >
                  <Send />
                </IconButton>
              </>
            )}
          </Paper>
        )}
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
