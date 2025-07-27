import React, { useState, useEffect } from 'react';
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Button,
  Stepper,
  Step,
  StepLabel,
  TextField
} from '@mui/material';
import {
  Close,
  KeyboardVoice,
  Image,
  TextFields
} from '@mui/icons-material';
import VoiceRecorder from '../VoiceRecorder';
import ClassroomStudentPicker from './ClassroomStudentPicker';
import { collection, addDoc, serverTimestamp, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

// TextInput Component
function TextInput({ onSave, onNext, onBack }) {
  const [text, setText] = useState('');
  const [wordCount, setWordCount] = useState(0);

  const handleTextChange = (event) => {
    const newText = event.target.value;
    setText(newText);
    setWordCount(newText.trim() ? newText.trim().split(/\s+/).length : 0);
  };

  const handleSave = () => {
    if (!text.trim()) {
      alert('Please enter some text before continuing.');
      return;
    }
    onSave({ text: text.trim() });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h6" sx={{ textAlign: 'center', mb: 2 }}>
        Write your observation
      </Typography>
      
      <TextField
        multiline
        rows={6}
        fullWidth
        value={text}
        onChange={handleTextChange}
        placeholder="Enter your observation here..."
        variant="outlined"
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 2,
          }
        }}
      />
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button 
          variant="text" 
          onClick={onBack}
          sx={{ color: '#64748b' }}
        >
          Back
        </Button>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {wordCount} word{wordCount !== 1 ? 's' : ''}
          </Typography>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!text.trim()}
            sx={{
              backgroundColor: '#4f46e5',
              '&:hover': { backgroundColor: '#4338ca' }
            }}
          >
            Next
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

const STEP_NOTE_TYPE = 'noteType';
const STEP_RECORD = 'record';
const STEP_TEXT_INPUT = 'textInput';
const STEP_RECIPIENTS = 'recipients';

const steps = ['Type', 'Input', 'Recipients'];

function AddNoteModal({
  open,
  onClose,
  initialClassrooms = [],
  initialStudents = [],
  currentUser
}) {
  const [step, setStep] = useState(STEP_NOTE_TYPE);
  const [transcriptionData, setTranscriptionData] = useState(null);
  const [textData, setTextData] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState(initialStudents);
  const [saving, setSaving] = useState(false);

  // Update selectedStudents when initialStudents prop changes
  useEffect(() => {
    setSelectedStudents(initialStudents);
  }, [initialStudents]);

  const handleClose = () => {
    setStep(STEP_NOTE_TYPE);
    // Reset all state when closing
    setTranscriptionData(null);
    setTextData(null);
    setSelectedStudents(initialStudents);
    setSaving(false);
    onClose();
  };

  const handleSelectVoice = () => {
    setStep(STEP_RECORD);
  };

  const handleSelectText = () => {
    setStep(STEP_TEXT_INPUT);
  };

  const handleVoiceSave = (transcriptionData) => {
    setTranscriptionData(transcriptionData);
    setStep(STEP_RECIPIENTS);
  };

  const handleTextSave = (textData) => {
    setTextData(textData);
    setStep(STEP_RECIPIENTS);
  };

  const handleRecipientsNext = async () => {
    const noteData = transcriptionData || textData;
    if (!noteData) {
      alert('No note data available. Please try again.');
      return;
    }

    try {
      setSaving(true);
      const promises = selectedStudents.map(async (stuId) => {
        // Get student data to find classroomId
        const studentDoc = await getDoc(doc(db, 'students', stuId));
        const studentData = studentDoc.data();
        
        const observationData = {
          studentId: stuId,
          teacherId: currentUser?.uid || 'unknown',
          classroomId: studentData?.classroomId || 'unknown',
          timestamp: serverTimestamp(),
          text: noteData.text,
          tags: [],
          type: transcriptionData ? 'voice' : 'text',
          isStarred: false,
          isPrivate: false,
          isDraft: false,
          editCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        // Add voice-specific fields only for voice notes
        if (transcriptionData) {
          observationData.duration = transcriptionData.duration;
          observationData.sttConfidence = transcriptionData.sttConfidence;
          observationData.sttAlternatives = transcriptionData.sttAlternatives;
          observationData.languageCode = transcriptionData.languageCode;
        }
        
        await addDoc(collection(db, 'observations'), observationData);
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
      scroll="body"
      PaperProps={{
        sx: {
          // Mobile: full screen modal
          width: { xs: '100vw', sm: 'calc(100% - 32px)' },
          height: { xs: '100vh', sm: 'auto' },
          maxWidth: { xs: 'none', sm: 400 },
          maxHeight: { xs: 'none', sm: '90vh' },
          margin: 'auto',
          borderRadius: { xs: 0, sm: 3 },
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }
      }}
      sx={{
        '& .MuiDialog-container': {
          alignItems: 'center',
          justifyContent: 'center',
          display: 'flex',
          padding: 0
        }
      }}
    >
      {/* Fixed Header with Stepper */}
      <Box sx={{ 
        px: 3, 
        pt: 3, 
        pb: 1,
        borderBottom: '1px solid #e2e8f0',
        backgroundColor: 'white',
        zIndex: 1
      }}>
        <Stepper activeStep={
          step === STEP_NOTE_TYPE ? 0 : 
          (step === STEP_RECORD || step === STEP_TEXT_INPUT) ? 1 : 2
        } alternativeLabel>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      {/* Scrollable Content */}
      <Box sx={{ 
        flex: 1, 
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {step === STEP_NOTE_TYPE && (
          <Box
            sx={{
              position: 'relative',
              p: 3,
              pt: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              alignItems: 'center',
              minHeight: 'fit-content'
            }}
          >
            <IconButton
              aria-label="Close"
              onClick={handleClose}
              sx={{
                position: 'absolute',
                top: 8,
                right: 12,
                color: '#1e293b',
                '&:hover': { backgroundColor: '#f1f5f9' }
              }}
            >
              <Close sx={{ fontSize: 28 }} />
            </IconButton>
            <Typography variant="h6" sx={{ mb: 1, mt: 2 }}>
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
              {/* Text Note (active) */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  border: '1px solid #e2e8f0',
                  borderRadius: 2,
                  p: 2,
                  width: '100%',
                  cursor: 'pointer',
                  backgroundColor: 'white',
                  '&:hover': { 
                    backgroundColor: '#f8fafc',
                    border: '1px solid #4f46e5'
                  }
                }}
                onClick={handleSelectText}
                aria-label="Add text note"
              >
                <TextFields sx={{ fontSize: 32, color: '#64748b' }} />
                <Box>
                  <Typography variant="body1" sx={{ color: '#1e293b' }}>
                    Text Note
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Write text note
                  </Typography>
                </Box>
              </Box>
              {/* Voice Note (active) */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  border: '1px solid #e2e8f0',
                  borderRadius: 2,
                  p: 2,
                  width: '100%',
                  cursor: 'pointer',
                  backgroundColor: 'white',
                  '&:hover': { 
                    backgroundColor: '#f8fafc',
                    border: '1px solid #4f46e5'
                  }
                }}
                onClick={handleSelectVoice}
                aria-label="Add voice note"
              >
                <KeyboardVoice sx={{ fontSize: 32, color: '#64748b' }} />
                <Box>
                  <Typography variant="body1" sx={{ color: '#1e293b' }}>
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
          <Box sx={{ p: 3, flex: 1 }}>
            <VoiceRecorder 
              onSave={handleVoiceSave} 
              onNext={() => setStep(STEP_RECIPIENTS)}
            />
          </Box>
        )}

        {step === STEP_TEXT_INPUT && (
          <Box sx={{ p: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <TextInput 
              onSave={handleTextSave} 
              onNext={() => setStep(STEP_RECIPIENTS)}
              onBack={() => setStep(STEP_NOTE_TYPE)}
            />
          </Box>
        )}

        {step === STEP_RECIPIENTS && (
          <Box sx={{ 
            p: 3, 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 3,
            minHeight: 'fit-content'
          }}>
            <Typography variant="h6">Select classroom(s) and student(s)</Typography>
            <Box sx={{ flex: 1, minHeight: 300 }}>
              <ClassroomStudentPicker
                selectedStudents={selectedStudents}
                onStudentsChange={setSelectedStudents}
              />
            </Box>
            {/* Fixed bottom action bar */}
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              pt: 2,
              borderTop: '1px solid #e2e8f0',
              backgroundColor: 'white',
              position: 'sticky',
              bottom: 0,
            }}>
              <Button 
                variant="text" 
                onClick={() => setStep(transcriptionData ? STEP_RECORD : STEP_TEXT_INPUT)}
              >
                Back
              </Button>
              <Button
                variant="contained"
                disabled={saving || selectedStudents.length === 0}
                onClick={handleRecipientsNext}
                sx={{ minWidth: 120 }}
              >
                {saving ? <CircularProgress size={24} /> : 'Save Note'}
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Dialog>
  );
}

export default AddNoteModal; 