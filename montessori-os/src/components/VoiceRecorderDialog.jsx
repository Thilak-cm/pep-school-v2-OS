// VoiceRecorderDialog.jsx (wrapper)
import React from 'react';
import { Dialog } from '@mui/material';
import VoiceRecorder from '../VoiceRecorder';

function VoiceRecorderDialog({ open, onClose, onSave }) {
  const handleSave = (blob, duration) => {
    onSave(blob, duration);
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <VoiceRecorder onSave={handleSave} />
    </Dialog>
  );
}

export default VoiceRecorderDialog; 