import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Stepper,
  Step,
  StepLabel,
  MenuItem,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Divider
} from '@mui/material';
import {
  CheckCircle,
  Clear,
  RadioButtonUnchecked
} from '@mui/icons-material';
import {
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  doc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import useNotify from '../notifications/useNotify';
import {
  LESSON_PROGRAM_DIMENSIONS,
  LESSON_RATING_OPTIONS,
  LESSON_RATING_LABELS,
  LESSON_RATING_COLORS,
  LESSON_ATTENDANCE_LABELS,
  deriveDimensionKeyFromProgram,
  normalizeClassroomId
} from '../utils/lessonNoteConstraints';

const STEP_CONFIG = [
  { id: 'context', label: 'Lesson Context' },
  { id: 'students', label: 'Select Students' },
  { id: 'defaults', label: 'Group Defaults' },
  { id: 'exceptions', label: 'Exceptions' }
];

const RATING_SEQUENCE = LESSON_RATING_OPTIONS.map((opt) => opt.value);

const cycleRating = (current) => {
  const idx = RATING_SEQUENCE.indexOf(current);
  if (idx === -1) return RATING_SEQUENCE[0];
  return RATING_SEQUENCE[(idx + 1) % RATING_SEQUENCE.length];
};

const getStudentDisplayName = (student) => {
  if (!student) return 'Unknown student';
  return (
    student.displayName ||
    student.preferredName ||
    student.name ||
    [student.firstName, student.lastName].filter(Boolean).join(' ') ||
    student.id
  );
};

function LessonNoteWizard({
  currentUser,
  userRole,
  onCancel,
  onSaved,
  onDirtyChange
}) {
  const notify = useNotify();
  const [activeStep, setActiveStep] = useState(0);
  const [context, setContext] = useState({
    lessonTitle: '',
    lessonDescription: '',
    groupComment: '',
    classroomId: ''
  });
  const [classrooms, setClassrooms] = useState([]);
  const [studentsByClassroom, setStudentsByClassroom] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [dimensionDefaults, setDimensionDefaults] = useState({});
  const [studentOverrides, setStudentOverrides] = useState({});
  const [studentSearch, setStudentSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const scrollContainerRef = useRef(null);

  const markDirty = () => {
    if (!isDirty) {
      setIsDirty(true);
    }
  };

  useEffect(() => {
    if (typeof onDirtyChange === 'function') {
      onDirtyChange(isDirty);
    }
  }, [isDirty, onDirtyChange]);

  // Scroll to top when step changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    // Also scroll window to top as fallback
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeStep]);

  const selectedClassroom = useMemo(
    () => classrooms.find((cls) => cls.id === context.classroomId),
    [classrooms, context.classroomId]
  );

  const dimensionKey = deriveDimensionKeyFromProgram(selectedClassroom?.programId);
  const dimensionList = LESSON_PROGRAM_DIMENSIONS[dimensionKey] || LESSON_PROGRAM_DIMENSIONS.primary;

  const studentsInClass = useMemo(() => {
    if (!context.classroomId) return [];
    return studentsByClassroom[context.classroomId] || [];
  }, [context.classroomId, studentsByClassroom]);

  const filteredStudents = useMemo(() => {
    const queryText = studentSearch.trim().toLowerCase();
    if (!queryText) return studentsInClass;
    return studentsInClass.filter((student) =>
      getStudentDisplayName(student).toLowerCase().includes(queryText)
    );
  }, [studentSearch, studentsInClass]);

  const selectedStudentEntities = useMemo(() => {
    const lookup = new Map(studentsInClass.map((s) => [s.id, s]));
    return [...selectedStudents]
      .map((id) => lookup.get(id))
      .filter(Boolean)
      .sort((a, b) => getStudentDisplayName(a).localeCompare(getStudentDisplayName(b)));
  }, [selectedStudents, studentsInClass]);

  const presentCount = useMemo(() => {
    return selectedStudents.filter(
      (id) => (attendance[id] || 'present') === 'present'
    ).length;
  }, [attendance, selectedStudents]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        let classroomQuery;
        if (userRole === 'teacher') {
          classroomQuery = query(
            collection(db, 'classrooms'),
            where('teacherIds', 'array-contains', currentUser.uid)
          );
        } else {
          classroomQuery = query(
            collection(db, 'classrooms'),
            where('status', '==', 'active')
          );
        }

        const classroomSnap = await getDocs(classroomQuery);
        const classList = classroomSnap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((cls) => (cls.status || 'active') !== 'archived');
        setClassrooms(classList);

        const studentsSnap = await getDocs(collection(db, 'students'));
        const students = studentsSnap.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            classroomId: normalizeClassroomId(data.classroomId)
          };
        });

        const allowedClassroomIds = new Set(classList.map((cls) => cls.id));
        const scopedStudents =
          userRole === 'teacher'
            ? students.filter((stu) => allowedClassroomIds.has(stu.classroomId))
            : students.filter((stu) => !stu.classroomId || allowedClassroomIds.size === 0 || allowedClassroomIds.has(stu.classroomId));

        const grouped = scopedStudents.reduce((acc, student) => {
          if (!student.classroomId) return acc;
          const list = acc[student.classroomId] || [];
          list.push(student);
          acc[student.classroomId] = list;
          return acc;
        }, {});

        Object.values(grouped).forEach((list) =>
          list.sort((a, b) => getStudentDisplayName(a).localeCompare(getStudentDisplayName(b)))
        );

        setStudentsByClassroom(grouped);
      } catch (error) {
        console.error('Error loading lesson note data', error);
        notify.error('Unable to load classrooms or students.');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [currentUser?.uid, notify, userRole]);

  useEffect(() => {
    if (!context.classroomId) return;
    const students = studentsByClassroom[context.classroomId] || [];
    const nextSelection = students.map((stu) => stu.id);
    setSelectedStudents(nextSelection);
    const defaultAttendance = Object.fromEntries(
      nextSelection.map((id) => [id, 'present'])
    );
    setAttendance(defaultAttendance);
    setStudentOverrides({});
    setDimensionDefaults({});
  }, [context.classroomId, studentsByClassroom]);

  useEffect(() => {
    if (!context.classroomId) {
      setSelectedStudents([]);
      setAttendance({});
      setStudentOverrides({});
    } else {
      const allowed = new Set(studentsInClass.map((stu) => stu.id));
      setSelectedStudents((prev) => prev.filter((id) => allowed.has(id)));
    }
  }, [context.classroomId, studentsInClass]);

  const setContextField = (field, value) => {
    setContext((prev) => ({ ...prev, [field]: value }));
    markDirty();
  };

  const handleToggleStudent = (studentId) => {
    setSelectedStudents((prev) => {
      if (prev.includes(studentId)) {
        const next = prev.filter((id) => id !== studentId);
        const nextAttendance = { ...attendance };
        delete nextAttendance[studentId];
        setAttendance(nextAttendance);
        return next;
      }
      const next = [...prev, studentId];
      setAttendance((prevAttendance) => ({
        ...prevAttendance,
        [studentId]: prevAttendance[studentId] || 'present'
      }));
      return next;
    });
    markDirty();
  };

  const handleSelectAll = () => {
    const ids = studentsInClass.map((stu) => stu.id);
    setSelectedStudents(ids);
    const nextAttendance = Object.fromEntries(ids.map((id) => [id, 'present']));
    setAttendance(nextAttendance);
    markDirty();
  };

  const handleClearSelection = () => {
    setSelectedStudents([]);
    setAttendance({});
    setStudentOverrides({});
    markDirty();
  };

  const toggleAttendance = (studentId) => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: (prev[studentId] || 'present') === 'present' ? 'absent' : 'present'
    }));
    markDirty();
  };

  const setDefaultRating = (dimension, value) => {
    setDimensionDefaults((prev) => ({ ...prev, [dimension]: value }));
    markDirty();
  };

  const setStudentRating = (studentId, dimension, value) => {
    setStudentOverrides((prev) => {
      const studentEntry = prev[studentId] || {};
      const dimensions = studentEntry.dimensions || {};
      return {
        ...prev,
        [studentId]: {
          ...studentEntry,
          dimensions: { ...dimensions, [dimension]: value }
        }
      };
    });
    markDirty();
  };

  const setStudentComment = (studentId, value) => {
    setStudentOverrides((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        comment: value
      }
    }));
    markDirty();
  };

  const getRatingForStudent = (studentId, dimension) => {
    const studentValue = studentOverrides[studentId]?.dimensions?.[dimension];
    if (studentValue) return studentValue;
    return dimensionDefaults[dimension] || 'na';
  };

  const getAttendance = (studentId) => attendance[studentId] || 'present';

  const canProceedFromStep = () => {
    if (activeStep === 0) {
      return Boolean(context.lessonTitle.trim()) && Boolean(context.classroomId);
    }
    if (activeStep === 1) {
      return selectedStudents.length > 0;
    }
    if (activeStep === 2) {
      return dimensionList.every((dimension) => !!dimensionDefaults[dimension]);
    }
    return true;
  };

  const handleBack = () => {
    if (activeStep === 0) {
      onCancel();
    } else {
      setActiveStep((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (activeStep < STEP_CONFIG.length - 1) {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleSave = async () => {
    if (saving || selectedStudents.length === 0) return;
    if (presentCount === 0) {
      notify.error('Mark at least one student as present.');
      return;
    }
    if (!context.lessonTitle.trim()) {
      notify.error('Lesson title is required.');
      return;
    }
    try {
      setSaving(true);
      const batch = writeBatch(db);
      selectedStudents.forEach((studentId) => {
        const attendanceState = getAttendance(studentId);
        const ratings = {};
        dimensionList.forEach((dimension) => {
          const overrideValue = studentOverrides[studentId]?.dimensions?.[dimension];
          const baseValue = dimensionDefaults[dimension] || 'na';
          ratings[dimension] = attendanceState === 'absent' ? 'na' : (overrideValue || baseValue);
        });

        const payload = {
          studentId,
          classroomId: context.classroomId,
          type: 'lesson',
          lessonTitle: context.lessonTitle.trim(),
          lessonDescription: context.lessonDescription.trim() || null,
          groupComment: context.groupComment.trim() || null,
          programId: selectedClassroom?.programId || null,
          dimensionOrder: dimensionList,
          groupDefaults: dimensionDefaults,
          ratings,
          studentComment: studentOverrides[studentId]?.comment?.trim() || null,
          attendanceStatus: attendanceState,
          createdBy: currentUser?.uid || 'unknown',
          createdByName: currentUser?.displayName || 'Unknown Teacher',
          createdByEmail: currentUser?.email || 'unknown@email.com',
          observedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        const cleaned = Object.fromEntries(
          Object.entries(payload).filter(([, value]) => value !== undefined && value !== null)
        );

        const docRef = doc(collection(db, 'students', studentId, 'observations'));
        batch.set(docRef, cleaned);
      });
      await batch.commit();
      const firstStudentId = selectedStudents[0];
      notify.success(`Lesson note saved for ${selectedStudents.length} students.`, {
        actionLabel: firstStudentId ? 'View Note' : undefined,
        onUndo: firstStudentId
          ? () => {
              window.dispatchEvent(new CustomEvent('navigateToStudentNotes', { detail: { studentId: firstStudentId } }));
            }
          : undefined
      });
      setIsDirty(false);
      onSaved?.();
    } catch (error) {
      console.error('Error saving lesson note', error);
      notify.error('Unable to save lesson note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderContextStep = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <TextField
        fullWidth
        label="Lesson Title"
        required
        value={context.lessonTitle}
        onChange={(e) => setContextField('lessonTitle', e.target.value)}
      />
      <TextField
        fullWidth
        label="Short Description"
        multiline
        minRows={2}
        value={context.lessonDescription}
        onChange={(e) => setContextField('lessonDescription', e.target.value)}
      />
      <TextField
        fullWidth
        label="Group Comment"
        multiline
        minRows={2}
        helperText="Optional note that appears for every student"
        value={context.groupComment}
        onChange={(e) => setContextField('groupComment', e.target.value)}
      />
      <TextField
        select
        fullWidth
        label="Classroom"
        required
        value={context.classroomId}
        onChange={(e) => setContextField('classroomId', e.target.value)}
      >
        {classrooms.map((cls) => (
          <MenuItem key={cls.id} value={cls.id}>
            {cls.name || cls.id}
          </MenuItem>
        ))}
      </TextField>
    </Box>
  );

  const renderStudentsStep = () => {
    if (!context.classroomId) {
      return (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body2" color="text.secondary">
            Select a classroom first to load students.
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {selectedClassroom?.name || 'Classroom'} roster
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={handleSelectAll} size="small" variant="outlined">
              Select All
            </Button>
            <Button onClick={handleClearSelection} size="small" color="secondary">
              Clear
            </Button>
          </Box>
        </Box>
        <TextField
          fullWidth
          placeholder="Search students"
          value={studentSearch}
          onChange={(e) => setStudentSearch(e.target.value)}
        />
        <Typography variant="body2" color="text.secondary">
          Present: {presentCount}/{studentsInClass.length}
        </Typography>
        <Paper
          variant="outlined"
          sx={{
            border: '1px solid #e2e8f0',
            borderRadius: 2,
            p: 1.5,
            maxHeight: 360,
            overflowY: 'auto',
            backgroundColor: '#f8fafc'
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {filteredStudents.map((student) => {
            const selected = selectedStudents.includes(student.id);
            const status = getAttendance(student.id);
            const cardBg = selected
              ? status === 'present'
                ? '#ecfdf5'
                : '#fee2e2'
              : '#ffffff';
            const borderColor = selected ? '#4f46e5' : '#e2e8f0';
            return (
              <Paper
                key={student.id}
                variant="outlined"
                onClick={() => handleToggleStudent(student.id)}
                sx={{
                  p: 1.5,
                  borderColor,
                  backgroundColor: cardBg,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, background-color 0.2s'
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {getStudentDisplayName(student)}
                  </Typography>
                </Box>
                <Chip
                  label={LESSON_ATTENDANCE_LABELS[selected ? status : 'absent']}
                  color={
                    selected
                      ? status === 'present'
                        ? 'success'
                        : 'warning'
                      : 'error'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selected) {
                      toggleAttendance(student.id);
                    }
                  }}
                  sx={{ textTransform: 'capitalize' }}
                />
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleStudent(student.id);
                  }}
                  color={selected ? 'primary' : 'default'}
                >
                  {selected ? <CheckCircle /> : <RadioButtonUnchecked />}
                </IconButton>
              </Paper>
            );
          })}
            {filteredStudents.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No students match this search.
              </Typography>
            )}
          </Box>
        </Paper>
      </Box>
    );
  };

  const renderDefaultsStep = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="subtitle1">
        Step 2: Set group defaults. You can override individual students next.
      </Typography>
      <Divider />
      {dimensionList.map((dimension) => {
        const selected = dimensionDefaults[dimension];
        return (
          <Box key={dimension} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {dimension}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {LESSON_RATING_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={selected === option.value ? 'contained' : 'outlined'}
                  onClick={() => setDefaultRating(dimension, option.value)}
                  size="small"
                  sx={{
                    borderColor: option.color,
                    color: selected === option.value ? '#fff' : option.color,
                    backgroundColor: selected === option.value ? option.color : 'transparent'
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );

  const renderExceptionsStep = () => {
    if (selectedStudentEntities.length === 0) {
      return (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body2" color="text.secondary">
            Select at least one student to provide feedback.
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="subtitle1">
          Step 3: Override individual students if needed.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 420, overflowY: 'auto' }}>
          {selectedStudentEntities.map((student) => {
            const attendanceState = getAttendance(student.id);
            const isAbsent = attendanceState === 'absent';
            return (
              <Paper
                key={student.id}
                variant="outlined"
                sx={{
                  p: 2,
                  opacity: isAbsent ? 0.6 : 1,
                  borderColor: isAbsent ? '#cbd5f5' : '#e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {getStudentDisplayName(student)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {student.classroom_name || selectedClassroom?.name || ''}
                    </Typography>
                  </Box>
                  <Chip
                    label={LESSON_ATTENDANCE_LABELS[attendanceState]}
                    color={attendanceState === 'present' ? 'success' : 'warning'}
                    onClick={() => toggleAttendance(student.id)}
                    sx={{ textTransform: 'capitalize' }}
                  />
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1 }}>
                  {dimensionList.map((dimension) => {
                    const rating = getRatingForStudent(student.id, dimension);
                    return (
                      <Button
                        key={`${student.id}-${dimension}`}
                        variant={rating === 'na' ? 'outlined' : 'contained'}
                        onClick={() => setStudentRating(student.id, dimension, cycleRating(rating))}
                        disabled={isAbsent}
                        sx={{
                          justifyContent: 'flex-start',
                          textTransform: 'none',
                          borderColor: LESSON_RATING_COLORS[rating] || '#cbd5e1',
                          backgroundColor: LESSON_RATING_COLORS[rating] ? `${LESSON_RATING_COLORS[rating]}22` : undefined,
                          color: LESSON_RATING_COLORS[rating] || 'inherit'
                        }}
                      >
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                          <Typography variant="caption" sx={{ fontWeight: 600 }}>
                            {dimension}
                          </Typography>
                          <Typography variant="subtitle2" sx={{ fontSize: '0.75rem' }}>
                            {LESSON_RATING_LABELS[rating] || 'N/A'}
                          </Typography>
                        </Box>
                      </Button>
                    );
                  })}
                </Box>
                <TextField
                  fullWidth
                  label="Student comment (optional)"
                  multiline
                  minRows={1}
                  disabled={isAbsent}
                  value={studentOverrides[student.id]?.comment || ''}
                  onChange={(e) => setStudentComment(student.id, e.target.value)}
                />
              </Paper>
            );
          })}
        </Box>
      </Box>
    );
  };

  if (loading) {
    return (
      <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 3 }}>
        {STEP_CONFIG.map((step) => (
          <Step key={step.id}>
            <StepLabel>{step.label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Box ref={scrollContainerRef} sx={{ flex: 1, overflow: 'auto' }}>
        {activeStep === 0 && renderContextStep()}
        {activeStep === 1 && renderStudentsStep()}
        {activeStep === 2 && renderDefaultsStep()}
        {activeStep === 3 && renderExceptionsStep()}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {activeStep > 0 && (
            <Button onClick={handleBack}>
              Back
            </Button>
          )}
          <Button
            onClick={onCancel}
            variant="outlined"
            color="error"
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Discard All Progress
          </Button>
        </Box>
        {activeStep < STEP_CONFIG.length - 1 ? (
          <Button
            variant="contained"
            onClick={handleNext}
            disabled={!canProceedFromStep()}
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Lesson Note'}
          </Button>
        )}
      </Box>
    </Box>
  );
}

export default LessonNoteWizard;
