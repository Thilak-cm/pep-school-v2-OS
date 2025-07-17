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
  Fab
} from '@mui/material';
import { ArrowBack, Mic } from '@mui/icons-material';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { storage } from '../firebase';
import { ref, uploadBytes } from 'firebase/storage';
import VoiceRecorderDialog from './VoiceRecorderDialog';

function StudentTimeline({ student, onBack }) {
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

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

      {/* Voice note FAB (functionality implemented in next tasks) */}
      <Fab
        color="primary"
        sx={{ position: 'fixed', bottom: 80, right: 'calc(50% - 28px)' }}
        aria-label="Add voice note"
        onClick={() => setDialogOpen(true)}
      >
        <Mic />
      </Fab>
      <VoiceRecorderDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSave={handleSaveVoice} />
    </Box>
  );
}

export default StudentTimeline; 