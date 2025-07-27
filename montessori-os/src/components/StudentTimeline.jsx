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
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  Divider
} from '@mui/material';
import { ArrowBack, Mic, TextFields, Star, Edit, AccessTime } from '@mui/icons-material';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

function StudentTimeline({ student, onBack }) {
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedObservation, setSelectedObservation] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    if (!student) return;
    
    console.log('Student object:', student);
    console.log('Student ID being used:', student.sid || student.id);
    console.log('Student document ID:', student.id);
    console.log('Student SID:', student.sid);
    setLoading(true);
    
    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.warn('Observations loading timeout - forcing loading to false');
      setLoading(false);
    }, 10000); // 10 second timeout
    
    const studentIdToQuery = student.sid || student.id;
    console.log('Querying with studentId:', studentIdToQuery);
    
    const q = query(
      collection(db, 'observations'),
      where('studentId', '==', studentIdToQuery),
      orderBy('timestamp', 'desc')
    );
    
    const unsub = onSnapshot(q, (snap) => {
      console.log('Observations snapshot received:', snap.docs.length, 'documents');
      clearTimeout(timeoutId); // Clear timeout on success
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setObservations(list);
      setLoading(false);
    }, (error) => {
      console.error('Error loading observations:', error);
      clearTimeout(timeoutId); // Clear timeout on error
      setLoading(false);
    });
    
    return () => {
      clearTimeout(timeoutId);
      unsub();
    };
  }, [student]);

  const handleObservationClick = (observation) => {
    setSelectedObservation(observation);
    setDetailDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDetailDialogOpen(false);
    setSelectedObservation(null);
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'No timestamp';
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toLocaleString();
    }
    if (timestamp.toDate) {
      return timestamp.toDate().toLocaleString();
    }
    return 'Invalid timestamp';
  };

  const getObservationTypeIcon = (type) => {
    return type === 'voice' ? <Mic sx={{ fontSize: 16 }} /> : <TextFields sx={{ fontSize: 16 }} />;
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {observations.map((obs) => (
            <Card
              key={obs.id}
              onClick={() => handleObservationClick(obs)}
              sx={{
                cursor: 'pointer',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  transform: 'translateY(-1px)',
                },
                transition: 'all 0.2s ease-in-out',
              }}
              aria-label={`View details for observation from ${formatTimestamp(obs.timestamp)}`}
            >
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                  {getObservationTypeIcon(obs.type)}
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    {obs.type === 'voice' ? 'Voice Note' : 'Text Note'}
                  </Typography>
                  {obs.isStarred && (
                    <Star sx={{ fontSize: 16, color: '#f59e0b', ml: 'auto' }} />
                  )}
                </Box>
                <Typography variant="body1" sx={{ mb: 1, lineHeight: 1.5 }}>
                  {obs.text || '(transcribing…)'}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AccessTime sx={{ fontSize: 14, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    {formatTimestamp(obs.timestamp)}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          ))}
          {observations.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              No observations yet.
            </Typography>
          )}
        </Box>
      )}

      {/* Observation Detail Dialog */}
      <Dialog
        open={detailDialogOpen}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxWidth: 343,
            width: 'calc(100% - 32px)',
            mx: 'auto'
          }
        }}
      >
        {selectedObservation && (
          <>
            <DialogTitle sx={{ pb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {getObservationTypeIcon(selectedObservation.type)}
                <Typography variant="h6">
                  {selectedObservation.type === 'voice' ? 'Voice Observation' : 'Text Observation'}
                </Typography>
              </Box>
            </DialogTitle>
            <DialogContent sx={{ pb: 2 }}>
              <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.6 }}>
                {selectedObservation.text}
              </Typography>
              
              <Divider sx={{ my: 2 }} />
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AccessTime sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    {formatTimestamp(selectedObservation.timestamp)}
                  </Typography>
                </Box>
                
                {selectedObservation.type === 'voice' && selectedObservation.duration && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Mic sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">
                      Duration: {selectedObservation.duration} seconds
                    </Typography>
                  </Box>
                )}
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Edit sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    Edit count: {selectedObservation.editCount || 0}
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {selectedObservation.isStarred && (
                    <Chip 
                      icon={<Star sx={{ fontSize: 16 }} />} 
                      label="Starred" 
                      size="small" 
                      color="warning"
                    />
                  )}
                  {selectedObservation.isPrivate && (
                    <Chip 
                      label="Private" 
                      size="small" 
                      color="error"
                    />
                  )}
                  {selectedObservation.isDraft && (
                    <Chip 
                      label="Draft" 
                      size="small" 
                      color="info"
                    />
                  )}
                </Box>
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
              <Button onClick={handleCloseDialog} variant="outlined" fullWidth>
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Note creation handled by global FAB */}
    </Box>
  );
}

export default StudentTimeline; 