// StudentTimeline.jsx (refactored)
import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Fab,
  Dialog
} from '@mui/material';
import { ArrowBack, Add, Image, TextFields, KeyboardVoice, Close } from '@mui/icons-material';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { storage } from '../firebase';
import { ref, uploadBytes } from 'firebase/storage';
import VoiceRecorder from '../VoiceRecorder';

function StudentTimeline({ student, onBack }) {
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteTypeDialogOpen, setNoteTypeDialogOpen] = useState(false);
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);

  useEffect(() => {
    if (!student) return;
    const q = query(
      collection(db, 'observations'),
      where('student_uid', '==', student.uid || student.id),
      orderBy('timestamp', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setObservations(list);
      setLoading(false);
    });
    return () => unsub();
  }, [student]);

  const handleSaveVoice = async (blob, duration) => {
    try {
      // create placeholder doc
      const docRef = await addDoc(collection(db, 'observations'), {
        student_uid: student.uid || student.id,
        staff_uid: 'admin-1',
        classroom_id: null,
        timestamp: serverTimestamp(),
        text: '(transcribing...)',
        duration_sec: duration,
        tags: [],
        type: 'voice'
      });
      const storageRef = ref(storage, `voice_notes/${student.uid || student.id}/${docRef.id}.webm`);
      await uploadBytes(storageRef, blob);
      // Cloud Function will handle transcription and update doc
    } catch (err) {
      console.error('upload err', err);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'relative', pb: 8 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton aria-label="Go back" onClick={onBack}>
          <ArrowBack />
        </IconButton>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <List>
          {observations.map((obs) => (
            <ListItem key={obs.id} alignItems="flex-start">
              <ListItemText
                primary={obs.text || '(transcribing…)'}
                secondary={new Date(obs.timestamp?.seconds * 1000).toLocaleString()}
              />
            </ListItem>
          ))}
          {observations.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              No observations yet.
            </Typography>
          )}
        </List>
      )}

      {/* Add Note FAB */}
      <Fab
        color="primary"
        sx={{ position: 'absolute', bottom: 24, right: 16, zIndex: 1200 }}
        aria-label="Add note"
        onClick={() => setNoteTypeDialogOpen(true)}
      >
        <Add />
      </Fab>

      {/* Note Type Selection Dialog */}
      <Dialog
        open={noteTypeDialogOpen}
        onClose={() => setNoteTypeDialogOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            maxWidth: 343,
            width: 'calc(100% - 32px)',
            mx: 'auto',
            borderRadius: 3
          }
        }}
      >
        <Box sx={{ position: 'relative', p: 3, pt: 8, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
          <IconButton
            aria-label="Close"
            onClick={() => setNoteTypeDialogOpen(false)}
            sx={{ position: 'absolute', top: 12, right: 12, color: '#1e293b', '&:hover': { backgroundColor: '#f1f5f9' } }}
          >
            <Close sx={{ fontSize: 28 }} />
          </IconButton>
          <Typography variant="h6" sx={{ mb: 1 }}>
            What type of note do you want to add?
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
            {/* Image Note (coming soon) */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, opacity: 0.5, border: '1px solid #e2e8f0', borderRadius: 2, p: 2, width: '100%' }}>
              <Image sx={{ fontSize: 32 }} />
              <Box>
                <Typography variant="body1">Image</Typography>
                <Typography variant="caption" color="text.secondary">Coming soon</Typography>
              </Box>
            </Box>
            {/* Text Note (coming soon) */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, opacity: 0.5, border: '1px solid #e2e8f0', borderRadius: 2, p: 2, width: '100%' }}>
              <TextFields sx={{ fontSize: 32 }} />
              <Box>
                <Typography variant="body1">Text Note</Typography>
                <Typography variant="caption" color="text.secondary">Coming soon</Typography>
              </Box>
            </Box>
            {/* Voice Note (active) */}
            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid #4f46e5', borderRadius: 2, p: 2, width: '100%', cursor: 'pointer', backgroundColor: '#f8fafc', '&:hover': { backgroundColor: '#eef2ff' } }}
              onClick={() => { setNoteTypeDialogOpen(false); setVoiceDialogOpen(true); }}
              aria-label="Add voice note"
            >
              <KeyboardVoice sx={{ fontSize: 32, color: '#4f46e5' }} />
              <Box>
                <Typography variant="body1" sx={{ color: '#4f46e5' }}>Voice Note</Typography>
                <Typography variant="caption" color="text.secondary">Record audio note</Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </Dialog>

      {/* Voice Recorder Dialog */}
      <VoiceRecorder
        dialog
        open={voiceDialogOpen}
        onClose={() => setVoiceDialogOpen(false)}
        onSave={handleSaveVoice}
        DialogProps={{
          PaperProps: {
            sx: {
              maxWidth: 343,
              width: 'calc(100% - 32px)',
              mx: 'auto',
              borderRadius: 3
            }
          },
          showCloseButton: true,
          closeButtonSx: { position: 'absolute', top: 12, right: 12, color: '#1e293b', '&:hover': { backgroundColor: '#f1f5f9' } },
          closeIconSx: { fontSize: 28 }
        }}
      />
    </Box>
  );
}

export default StudentTimeline; 