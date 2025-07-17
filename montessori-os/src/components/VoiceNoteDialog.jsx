// VoiceNoteDialog.jsx
import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Box,
  Typography,
  CircularProgress
} from '@mui/material';
import { Mic, Stop } from '@mui/icons-material';

const MAX_SEC = 30;

function VoiceNoteDialog({ open, onClose, onSave }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const startRec = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const b = new Blob(chunksRef.current, { type: rec.mimeType });
      setBlob(b);
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(timerRef.current);
    };
    rec.start();
    mediaRef.current = rec;
    setRecording(true);
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SEC) {
          stopRec();
          return MAX_SEC;
        }
        return s + 1;
      });
    }, 1000);
  };

  const stopRec = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const reset = () => {
    setBlob(null);
    setSeconds(0);
    setRecording(false);
  };

  const handleSave = () => {
    if (blob) onSave(blob, seconds);
    reset();
  };

  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} fullWidth>
      <DialogTitle>Record Voice Note (max 30 s)</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2 }}>
          <Typography variant="h6">{seconds}s</Typography>
          {!recording && !blob && (
            <IconButton color="primary" onClick={startRec} aria-label="Start recording" size="large">
              <Mic sx={{ fontSize: 48 }} />
            </IconButton>
          )}
          {recording && (
            <IconButton color="error" onClick={stopRec} aria-label="Stop recording" size="large">
              <Stop sx={{ fontSize: 48 }} />
            </IconButton>
          )}
          {!recording && blob && (
            <Typography variant="body2">Recorded {seconds}s – ready to save</Typography>
          )}
          {recording && <CircularProgress size={24} sx={{ mt: 1 }} />}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { reset(); onClose(); }}>Cancel</Button>
        <Button onClick={handleSave} disabled={!blob} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export default VoiceNoteDialog; 