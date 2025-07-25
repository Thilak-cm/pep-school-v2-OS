// StudentTimeline.jsx (refactored)
import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  CircularProgress
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

function StudentTimeline({ student, onBack }) {
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(true);

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

      {/* Note creation handled by global FAB */}
    </Box>
  );
}

export default StudentTimeline; 