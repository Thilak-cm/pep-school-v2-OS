import React, { useState } from 'react';
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Button,
  Stepper,
  Step,
  StepLabel
} from '@mui/material';
import {
  Close,
  KeyboardVoice,
  Image,
  TextFields
} from '@mui/icons-material';
import VoiceRecorder from '../VoiceRecorder';
import ClassroomStudentPicker from './ClassroomStudentPicker';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { storage } from '../firebase';
import { ref, uploadBytes } from 'firebase/storage';
import { db } from '../firebase';

const STEP_NOTE_TYPE = 'noteType';
const STEP_RECORD = 'record';
const STEP_RECIPIENTS = 'recipients';

const steps = ['Type', 'Record', 'Recipients'];

function AddNoteModal({
  open,
  onClose,
  initialClassrooms = [],
  initialStudents = [],
  currentUser
}) {
  const [step, setStep] = useState(STEP_NOTE_TYPE);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [selectedClassrooms, setSelectedClassrooms] = useState(initialClassrooms);
  const [selectedStudents, setSelectedStudents] = useState(initialStudents);
  const [saving, setSaving] = useState(false);

  const handleClose = () => {
    setStep(STEP_NOTE_TYPE);
    onClose();
  };

  const handleSelectVoice = () => {
    setStep(STEP_RECORD);
  };

  const handleVoiceSave = (blob, duration, selectedTags = []) => {
    setRecordedBlob(blob);
    setRecordedDuration(duration);
    setStep(STEP_RECIPIENTS);
  };

  const handleRecipientsNext = async () => {
    try {
      setSaving(true);
      const promises = selectedStudents.map(async (stuId) => {
        const docRef = await addDoc(collection(db, 'observations'), {
          student_uid: stuId,
          classroom_id: selectedClassrooms[0] || null,
          staff_uid: currentUser?.uid || 'unknown',
          timestamp: serverTimestamp(),
          text: '(transcribing...)',
          duration_sec: recordedDuration,
          tags: [],
          type: 'voice'
        });
        const storageRef = ref(storage, `voice_notes/${stuId}/${docRef.id}.webm`);
        await uploadBytes(storageRef, recordedBlob);
      });
      await Promise.all(promises);
      handleClose();
    } catch (err) {
      console.error('save note error', err);
      alert('Error saving note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{
        sx: {
          maxWidth: 343,
          width: 'calc(100% - 32px)',
          mx: 'auto',
          borderRadius: 3,
          overflow: 'visible'
        }
      }}
    >
      <Box sx={{ px: 3, pt: 3 }}>
        <Stepper activeStep={step === STEP_NOTE_TYPE ? 0 : step === STEP_RECORD ? 1 : 2} alternativeLabel>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      {step === STEP_NOTE_TYPE && (
        <Box
          sx={{
            position: 'relative',
            p: 3,
            pt: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            alignItems: 'center'
          }}
        >
          <IconButton
            aria-label="Close"
            onClick={handleClose}
            sx={{
              position: 'absolute',
              top: 12,
              right: 12,
              color: '#1e293b',
              '&:hover': { backgroundColor: '#f1f5f9' }
            }}
          >
            <Close sx={{ fontSize: 28 }} />
          </IconButton>
          <Typography variant="h6" sx={{ mb: 1 }}>
            What type of note do you want to add?
          </Typography>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              width: '100%'
            }}
          >
            {/* Image Note (coming soon) */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                opacity: 0.5,
                border: '1px solid #e2e8f0',
                borderRadius: 2,
                p: 2,
                width: '100%'
              }}
            >
              <Image sx={{ fontSize: 32 }} />
              <Box>
                <Typography variant="body1">Image</Typography>
                <Typography variant="caption" color="text.secondary">
                  Coming soon
                </Typography>
              </Box>
            </Box>
            {/* Text Note (coming soon) */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                opacity: 0.5,
                border: '1px solid #e2e8f0',
                borderRadius: 2,
                p: 2,
                width: '100%'
              }}
            >
              <TextFields sx={{ fontSize: 32 }} />
              <Box>
                <Typography variant="body1">Text Note</Typography>
                <Typography variant="caption" color="text.secondary">
                  Coming soon
                </Typography>
              </Box>
            </Box>
            {/* Voice Note (active) */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                border: '1px solid #4f46e5',
                borderRadius: 2,
                p: 2,
                width: '100%',
                cursor: 'pointer',
                backgroundColor: '#f8fafc',
                '&:hover': { backgroundColor: '#eef2ff' }
              }}
              onClick={handleSelectVoice}
              aria-label="Add voice note"
            >
              <KeyboardVoice sx={{ fontSize: 32, color: '#4f46e5' }} />
              <Box>
                <Typography variant="body1" sx={{ color: '#4f46e5' }}>
                  Voice Note
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Record audio note
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {step === STEP_RECORD && (
        <Box sx={{ p: 3 }}>
          <VoiceRecorder 
            onSave={handleVoiceSave} 
            onNext={() => setStep(STEP_RECIPIENTS)}
          />
        </Box>
      )}

      {step === STEP_RECIPIENTS && (
        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Typography variant="h6">Select classroom(s) and student(s)</Typography>
          <ClassroomStudentPicker
            selectedClassrooms={selectedClassrooms}
            onClassroomsChange={setSelectedClassrooms}
            selectedStudents={selectedStudents}
            onStudentsChange={setSelectedStudents}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
            <Button variant="text" onClick={() => setStep(STEP_RECORD)}>Back</Button>
            <Button
              variant="contained"
              disabled={saving || selectedClassrooms.length === 0 || selectedStudents.length === 0}
              onClick={handleRecipientsNext}
            >
              {saving ? <CircularProgress size={24} /> : 'Save'}
            </Button>
          </Box>
        </Box>
      )}
    </Dialog>
  );
}

export default AddNoteModal; 