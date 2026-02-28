import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  MenuItem,
  Chip,
  CircularProgress,
  Paper,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  InputAdornment,
  Dialog,
  Collapse,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Stack,
  Autocomplete,
  Tooltip
} from '@mui/material';
import {
  ExpandMore,
  ExpandLess,
  Group,
  Person,
  Search,
  Mic,
  Close,
  AutoFixHigh
} from '@mui/icons-material';
import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  doc,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import useNotify from '../notifications/useNotify';
import { genericFuzzySearch } from '../utils/fuzzySearch';
import VoiceRecorder from '../VoiceRecorder';
import { enqueueSaveQueueItems } from '../services/saveQueue';
import { cleanUpText } from '../textCleanup';
import { trackEvent, lengthBucket } from '../utils/analytics';
import {
  LESSON_PROGRAM_DIMENSIONS,
  LESSON_RATING_OPTIONS,
  LESSON_RATING_LABELS,
  LESSON_RATING_COLORS,
  deriveDimensionKeyFromProgram,
  normalizeClassroomId
} from '../utils/lessonNoteConstraints';

const SECTION_IDS = {
  setup: 'setup',
  defaults: 'defaults',
  overrides: 'overrides'
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

const buildGroupId = () => `group_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const ratingButtonStyles = (value, selected) => {
  const active = selected === value;
  const color = LESSON_RATING_COLORS[value] || '#475569';
  const wide = value === 'partial';
  return {
    variant: active ? 'contained' : 'outlined',
    sx: {
      minWidth: wide ? 40 : 40,
      borderColor: color,
      color: active ? '#fff' : color,
      backgroundColor: active ? color : '#fff',
      fontWeight: 700,
      textTransform: 'none',
      borderRadius: 2,
      '&:hover': {
        backgroundColor: active ? color : `${color}14`
      }
    }
  };
};

function LessonNoteWizard({
  currentUser,
  userRole,
  onCancel,
  onSaved,
  onDirtyChange,
  initialClassroomId = null,
  initialStudentId = null,
  editObservation = null
}) {
  const notify = useNotify();
  const [context, setContext] = useState({
    lessonTitle: '',
    lessonDescription: '',
    groupComment: '',
    classroomId: initialClassroomId || ''
  });
  const [lessonMode, setLessonMode] = useState('individual'); // 'individual' | 'group'
  const [classrooms, setClassrooms] = useState([]);
  const [students, setStudents] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [dimensionDefaults, setDimensionDefaults] = useState({});
  const [studentOverrides, setStudentOverrides] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [expandedAliases, setExpandedAliases] = useState({});
  const [autoScrolled, setAutoScrolled] = useState({ defaults: false, overrides: false });
  const [studentsLocked, setStudentsLocked] = useState(false); // user confirms selection in group mode
  const [lessonConfig, setLessonConfig] = useState(null);
  const [dictationOpen, setDictationOpen] = useState(false);
  const [dictationTarget, setDictationTarget] = useState(null);
  const [dictationSelection, setDictationSelection] = useState({ start: null, end: null });
  const [descriptionCleaning, setDescriptionCleaning] = useState(false);
  const [descriptionCleanedOnce, setDescriptionCleanedOnce] = useState(false);
  const [descriptionPrevText, setDescriptionPrevText] = useState('');
  const [groupCommentCleaning, setGroupCommentCleaning] = useState(false);
  const [groupCommentCleanedOnce, setGroupCommentCleanedOnce] = useState(false);
  const [groupCommentPrevText, setGroupCommentPrevText] = useState('');
  const initialPrefillDoneRef = useRef(false);
  const editPrefillDoneRef = useRef(false);
  const inputRefs = useRef({
    lessonDescription: null,
    groupComment: null,
    studentComment: {}
  });

  const setupRef = useRef(null);
  const defaultsRef = useRef(null);
  const overridesRef = useRef(null);
  const modeLockedRef = useRef(false);
  const lastSelectionRef = useRef([]);

  const markDirty = () => {
    if (!isDirty) setIsDirty(true);
  };

  useEffect(() => {
    if (typeof onDirtyChange === 'function') {
      onDirtyChange(isDirty);
    }
  }, [isDirty, onDirtyChange]);

  // Load lesson note config (titles + dimensions) from Firestore
  useEffect(() => {
    const loadConfig = async () => {
      try {
        setLoading(true);
        const ref = doc(db, 'config', 'lessonNote');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setLessonConfig(snap.data() || {});
        } else {
          setLessonConfig(null);
        }
      } catch {
        setLessonConfig(null);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const classroomQuery =
          userRole === 'teacher'
            ? query(collection(db, 'classrooms'), where('teacherIds', 'array-contains', currentUser.uid))
            : query(collection(db, 'classrooms'), where('status', '==', 'active'));

        const classroomSnap = await getDocs(classroomQuery);
        const classList = classroomSnap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((cls) => (cls.status || 'active') !== 'archived');
        setClassrooms(classList);

        // Auto-select classroom when only one option exists
        if (classList.length === 1) {
          setContext((prev) => ({ ...prev, classroomId: prev.classroomId || classList[0].id }));
        }

        // Default group vs individual toggle based on programs (only if user hasn't touched it)
        if (!modeLockedRef.current && classList.length > 0) {
          const programs = new Set(classList.map((cls) => String(cls.programId || '').toLowerCase()));
          const programList = [...programs];
          const hasMixedPrograms = programList.length > 1;
          const allGroupFriendly = programList.length > 0 && programList.every((p) => p.includes('elementary') || p.includes('adolescent'));
          const isGroupDefault = hasMixedPrograms || allGroupFriendly;
          setLessonMode(isGroupDefault ? 'group' : 'individual');
        }

        const studentsSnap = await getDocs(collection(db, 'students'));
        const rawStudents = studentsSnap.docs.map((docSnap) => {
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
            ? rawStudents.filter((stu) => allowedClassroomIds.has(stu.classroomId))
            : rawStudents.filter(
                (stu) => !stu.classroomId || allowedClassroomIds.size === 0 || allowedClassroomIds.has(stu.classroomId)
              );
        scopedStudents.sort((a, b) => getStudentDisplayName(a).localeCompare(getStudentDisplayName(b)));
        setStudents(scopedStudents);

        const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        const aliasMap = userSnap.exists() ? userSnap.data().studentAliases || {} : {};
        const aliasList = Object.values(aliasMap).map((alias) => ({
          ...alias,
          studentIds: Array.isArray(alias.studentIds) ? alias.studentIds : []
        }));
        aliasList.sort((a, b) => a.name.localeCompare(b.name));
        setAliases(aliasList);
      } catch {
        notify.error('Unable to load classrooms, students, or groups.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentUser?.uid, notify, userRole]);

  // Reset selections when classroom or dimension set changes
  useEffect(() => {
    if (editObservation) return;
    setSelectedStudents([]);
    setStudentOverrides({});
    setSearchQuery('');
    setAutoScrolled({ defaults: false, overrides: false });
    setStudentsLocked(lessonMode === 'individual');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.classroomId, editObservation]);

  // Reset defaults when program changes
  const selectedClassroom = useMemo(
    () => classrooms.find((cls) => cls.id === context.classroomId),
    [classrooms, context.classroomId]
  );
  const dimensionKey = deriveDimensionKeyFromProgram(selectedClassroom?.programId);

  const getConfiguredDimensions = (programId) => {
    if (!lessonConfig || !programId) return null;
    const key = `lesson_${programId}_dimensions`;
    const list = lessonConfig[key];
    if (Array.isArray(list) && list.length > 0) {
      return list.map((d) => String(d || '')).filter(Boolean);
    }
    return null;
  };

  const dimensionList = useMemo(() => {
    const programId = selectedClassroom?.programId;
    const configured = getConfiguredDimensions(programId);
    if (configured && configured.length > 0) return configured;
    return LESSON_PROGRAM_DIMENSIONS[dimensionKey] || LESSON_PROGRAM_DIMENSIONS.primary;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassroom?.programId, lessonConfig, dimensionKey]);

  useEffect(() => {
    if (editObservation) return;
    setDimensionDefaults({});
    setStudentOverrides({});
  }, [dimensionKey, editObservation]);

  useEffect(() => {
    // Reset lock and scroll anchors when mode changes
    if (editObservation) return;
    setStudentsLocked(lessonMode === 'individual');
    setAutoScrolled({ defaults: false, overrides: false });
  }, [lessonMode, editObservation]);

  useEffect(() => {
    if (editObservation) return;
    // Unlock selection when students change in group mode
    const prev = lastSelectionRef.current.join('|');
    const now = [...selectedStudents].sort().join('|');
    if (lessonMode === 'group' && prev !== now) {
      setStudentsLocked(false);
      setAutoScrolled({ defaults: false, overrides: false });
    }
    lastSelectionRef.current = [...selectedStudents].sort();
  }, [selectedStudents, lessonMode, editObservation]);

  // Prefill classroom/student when context is known (e.g., student timeline/dashboard/classroom timeline)
  useEffect(() => {
    if (editObservation) return;
    if (initialPrefillDoneRef.current) return;

    const targetStudentId = initialStudentId || null;
    const targetStudent = targetStudentId
      ? students.find((s) => s.id === targetStudentId)
      : null;
    if (targetStudentId && !targetStudent) return; // wait for roster to load

    const targetClassroomId = targetStudent
      ? normalizeClassroomId(targetStudent.classroomId) || initialClassroomId || null
      : initialClassroomId || null;

    // Ensure classroom is applied first so dependent UI unlocks
    if (targetClassroomId && context.classroomId !== targetClassroomId) {
      setContext((prev) => ({ ...prev, classroomId: targetClassroomId }));
      return;
    }

    // When a specific student is provided, default to individual mode
    if (targetStudentId && lessonMode !== 'individual') {
      setLessonMode('individual');
      setStudentsLocked(true);
    }

    // Apply student selection once classroom is aligned (if provided)
    if (targetStudent && !selectedStudents.includes(targetStudent.id)) {
      setSelectedStudents([targetStudent.id]);
      setStudentsLocked(lessonMode === 'individual');
    }

    if (targetClassroomId || targetStudentId) {
      initialPrefillDoneRef.current = true;
    }
  }, [
    initialClassroomId,
    initialStudentId,
    context.classroomId,
    students,
    selectedStudents,
    lessonMode,
    editObservation
  ]);

  const studentsById = useMemo(
    () => Object.fromEntries(students.map((stu) => [stu.id, stu])),
    [students]
  );

  const studentsByClassroom = useMemo(() => {
    const grouped = {};
    students.forEach((student) => {
      if (!student.classroomId) return;
      if (!grouped[student.classroomId]) grouped[student.classroomId] = [];
      grouped[student.classroomId].push(student);
    });
    Object.values(grouped).forEach((list) =>
      list.sort((a, b) => getStudentDisplayName(a).localeCompare(getStudentDisplayName(b)))
    );
    return grouped;
  }, [students]);

  const studentsInClass = useMemo(() => {
    if (!context.classroomId) return [];
    return studentsByClassroom[context.classroomId] || [];
  }, [context.classroomId, studentsByClassroom]);

  // Prefill values for editing an existing lesson note
  useEffect(() => {
    if (!editObservation || editPrefillDoneRef.current) return;
    const targetStudentId = editObservation.studentId || editObservation.parentStudentId;
    if (!targetStudentId) return;
    const targetStudent = students.find((s) => s.id === targetStudentId);
    if (!targetStudent) return; // wait for roster

    const targetClassroomId = normalizeClassroomId(editObservation.classroomId) || targetStudent.classroomId || '';
    setContext((prev) => ({
      ...prev,
      classroomId: targetClassroomId || prev.classroomId || '',
      lessonTitle: editObservation.lessonTitle || '',
      lessonDescription: editObservation.lessonDescription || '',
      groupComment: editObservation.groupComment || '',
    }));
    setLessonMode('individual');
    modeLockedRef.current = true;
    setStudentsLocked(true);
    setSelectedStudents([targetStudentId]);

    const ratings = editObservation.ratings || {};
    const defaults = editObservation.groupDefaults || {};
    setDimensionDefaults(defaults);
    setStudentOverrides({
      [targetStudentId]: {
        dimensions: ratings,
        comment: editObservation.studentComment || '',
      }
    });

    initialPrefillDoneRef.current = true;
    editPrefillDoneRef.current = true;
  }, [editObservation, students]);

  const searchDisabled = !context.classroomId;
  const searchActive = searchQuery.trim().length > 0 && !searchDisabled;

  const matchingStudents = useMemo(() => {
    if (!searchActive) return [];
    const q = searchQuery.trim().toLowerCase();
    return studentsInClass.filter((stu) => getStudentDisplayName(stu).toLowerCase().includes(q));
  }, [searchActive, searchQuery, studentsInClass]);

  const aliasMatches = useMemo(() => {
    if (!searchActive) return [];
    const q = searchQuery.trim().toLowerCase();
    return aliases
      .map((alias) => {
        const memberIds = alias.studentIds || [];
        const inClassMembers = memberIds.filter((id) => studentsById[id]?.classroomId === context.classroomId);
        const outOfClassMembers = memberIds.filter((id) => studentsById[id] && studentsById[id].classroomId !== context.classroomId);
        const matchByName = alias.name.toLowerCase().includes(q);
        const matchByMember = inClassMembers.some((id) =>
          getStudentDisplayName(studentsById[id]).toLowerCase().includes(q)
        );
        return {
          ...alias,
          inClassMembers,
          outOfClassMembers,
          hasMatch: matchByName || matchByMember
        };
      })
      .filter((alias) => alias.hasMatch);
  }, [aliases, context.classroomId, searchActive, searchQuery, studentsById]);

  const selectedStudentEntities = useMemo(() => {
    const lookup = new Map(studentsInClass.map((stu) => [stu.id, stu]));
    return selectedStudents
      .map((id) => lookup.get(id))
      .filter(Boolean)
      .sort((a, b) => getStudentDisplayName(a).localeCompare(getStudentDisplayName(b)));
  }, [selectedStudents, studentsInClass]);

  const isEditMode = !!editObservation;
  const showDefaults = lessonMode === 'group';
  const effectiveDefaults = showDefaults ? dimensionDefaults : {};

  const baseSetupComplete =
    Boolean(context.lessonTitle.trim()) &&
    Boolean(context.classroomId) &&
    selectedStudents.length > 0;
  const selectionFinalized = lessonMode === 'group' ? studentsLocked : true;
  const setupComplete = baseSetupComplete && selectionFinalized;
  const defaultsComplete = showDefaults ? dimensionList.every((dimension) => !!effectiveDefaults[dimension]) : true;
  const showDefaultsSection = showDefaults && setupComplete;
  const showOverridesSection = setupComplete && defaultsComplete;

  // Check if all dimensions have been explicitly selected for all selected students
  const allDimensionsSelected = useMemo(() => {
    if (!showOverridesSection || selectedStudents.length === 0) return false;
    return selectedStudents.every((studentId) => {
      return dimensionList.every((dimension) => {
        // Check if dimension has been explicitly set (not relying on defaults)
        return studentOverrides[studentId]?.dimensions?.[dimension] !== undefined;
      });
    });
  }, [showOverridesSection, selectedStudents, dimensionList, studentOverrides]);

  const scrollToSection = (ref) => {
    if (!ref?.current) return;
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (showDefaultsSection && !autoScrolled.defaults) {
      scrollToSection(defaultsRef);
      setAutoScrolled((prev) => ({ ...prev, defaults: true }));
    }
  }, [showDefaultsSection, autoScrolled.defaults]);

  useEffect(() => {
    if (showOverridesSection && !autoScrolled.overrides) {
      scrollToSection(overridesRef);
      setAutoScrolled((prev) => ({ ...prev, overrides: true }));
    }
  }, [showOverridesSection, autoScrolled.overrides]);

  const toggleLessonMode = (_, next) => {
    if (isEditMode) return;
    if (!next) return;
    setLessonMode(next);
    modeLockedRef.current = true;
    markDirty();
  };

  const setContextField = (field, value) => {
    setContext((prev) => ({ ...prev, [field]: value }));
    markDirty();
  };

  const handleConfirmStudents = () => {
    if (isEditMode) return;
    setStudentsLocked(true);
  };

  const toggleStudent = (studentId) => {
    if (isEditMode) return;
    if (lessonMode === 'individual') {
      setSelectedStudents((prev) => (prev.includes(studentId) ? [] : [studentId]));
      return;
    }
    setSelectedStudents((prev) => {
      const exists = prev.includes(studentId);
      if (exists) {
        return prev.filter((id) => id !== studentId);
      }
      return [...prev, studentId];
    });
    markDirty();
  };

  const toggleAliasSelection = (alias) => {
    if (isEditMode) return;
    if (lessonMode === 'individual') return;
    const members = alias.inClassMembers || [];
    if (members.length === 0) return;
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      const allSelected = members.every((id) => next.has(id));
      if (allSelected) {
        members.forEach((id) => next.delete(id));
      } else {
        members.forEach((id) => next.add(id));
      }
      return Array.from(next);
    });
    setExpandedAliases((prev) => ({ ...prev, [alias.id]: true }));
    markDirty();
  };

  const toggleAliasExpanded = (aliasId) => {
    setExpandedAliases((prev) => ({ ...prev, [aliasId]: !prev[aliasId] }));
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

  const getTargetValue = (target) => {
    if (!target) return '';
    if (target.field === 'lessonDescription') return context.lessonDescription || '';
    if (target.field === 'groupComment') return context.groupComment || '';
    if (target.field === 'studentComment') return studentOverrides[target.studentId]?.comment || '';
    return '';
  };

  const getInputElementForTarget = (target) => {
    if (!target) return null;
    if (target.field === 'lessonDescription') return inputRefs.current.lessonDescription;
    if (target.field === 'groupComment') return inputRefs.current.groupComment;
    if (target.field === 'studentComment') {
      return inputRefs.current.studentComment?.[target.studentId] || null;
    }
    return null;
  };

  const insertAtSelection = (baseValue, insertText, selection) => {
    if (!insertText) return baseValue;
    const start = Number.isInteger(selection?.start) ? selection.start : baseValue.length;
    const end = Number.isInteger(selection?.end) ? selection.end : baseValue.length;
    return `${baseValue.slice(0, start)}${insertText}${baseValue.slice(end)}`;
  };

  const openDictationFor = (target) => {
    const inputEl = getInputElementForTarget(target);
    const start = inputEl && Number.isInteger(inputEl.selectionStart) ? inputEl.selectionStart : null;
    const end = inputEl && Number.isInteger(inputEl.selectionEnd) ? inputEl.selectionEnd : null;
    setDictationSelection({ start, end });
    setDictationTarget(target);
    setDictationOpen(true);
  };

  const closeDictation = () => {
    setDictationOpen(false);
    setDictationTarget(null);
    setDictationSelection({ start: null, end: null });
  };

  const handleDictationSave = (transcriptionData) => {
    const insertText = transcriptionData?.text?.trim();
    if (!insertText || !dictationTarget) {
      closeDictation();
      return;
    }

    const currentValue = getTargetValue(dictationTarget);
    const nextValue = insertAtSelection(currentValue, insertText, dictationSelection);

    if (dictationTarget.field === 'lessonDescription') {
      setContextField('lessonDescription', nextValue);
    } else if (dictationTarget.field === 'groupComment') {
      setContextField('groupComment', nextValue);
    } else if (dictationTarget.field === 'studentComment') {
      setStudentComment(dictationTarget.studentId, nextValue);
    }

    closeDictation();
  };

  const handlePolishDescription = async () => {
    const text = context.lessonDescription || '';
    if (!text.trim() || descriptionCleaning || descriptionCleanedOnce) return;
    try {
      setDescriptionCleaning(true);
      trackEvent('polish_click', {
        source: 'lesson_description',
        component: 'LessonNotes.ShortDescription',
        length_bucket: lengthBucket(text.length),
      });
      const t0 = performance.now();
      const cleaned = await cleanUpText(text);
      if (cleaned && cleaned !== text) {
        setDescriptionPrevText(text);
        setContextField('lessonDescription', cleaned);
        setDescriptionCleanedOnce(true);
      } else {
        setDescriptionCleanedOnce(false);
      }
      const dt = Math.round(performance.now() - t0);
      trackEvent('polish_success', {
        source: 'lesson_description',
        component: 'LessonNotes.ShortDescription',
        length_bucket: lengthBucket(text.length),
        latency_ms: dt,
      });
    } catch {
      notify.error('Unable to polish text. Please try again.');
      trackEvent('polish_error', {
        source: 'lesson_description',
        component: 'LessonNotes.ShortDescription',
        length_bucket: lengthBucket(text.length),
        error: 'cleanup_failed',
      });
    } finally {
      setDescriptionCleaning(false);
    }
  };

  const handleUndoPolishDescription = () => {
    if (!descriptionPrevText) return;
    setContextField('lessonDescription', descriptionPrevText);
    setDescriptionPrevText('');
    setDescriptionCleanedOnce(false);
    trackEvent('polish_undo', {
      source: 'lesson_description',
      component: 'LessonNotes.ShortDescription',
      length_bucket: lengthBucket(descriptionPrevText.length),
    });
  };

  const handlePolishGroupComment = async () => {
    const text = context.groupComment || '';
    if (!text.trim() || groupCommentCleaning || groupCommentCleanedOnce) return;
    try {
      setGroupCommentCleaning(true);
      trackEvent('polish_click', {
        source: 'lesson_group_comment',
        component: 'LessonNotes.GroupComment',
        length_bucket: lengthBucket(text.length),
      });
      const t0 = performance.now();
      const cleaned = await cleanUpText(text);
      if (cleaned && cleaned !== text) {
        setGroupCommentPrevText(text);
        setContextField('groupComment', cleaned);
        setGroupCommentCleanedOnce(true);
      } else {
        setGroupCommentCleanedOnce(false);
      }
      const dt = Math.round(performance.now() - t0);
      trackEvent('polish_success', {
        source: 'lesson_group_comment',
        component: 'LessonNotes.GroupComment',
        length_bucket: lengthBucket(text.length),
        latency_ms: dt,
      });
    } catch {
      notify.error('Unable to polish text. Please try again.');
      trackEvent('polish_error', {
        source: 'lesson_group_comment',
        component: 'LessonNotes.GroupComment',
        length_bucket: lengthBucket(text.length),
        error: 'cleanup_failed',
      });
    } finally {
      setGroupCommentCleaning(false);
    }
  };

  const handleUndoPolishGroupComment = () => {
    if (!groupCommentPrevText) return;
    setContextField('groupComment', groupCommentPrevText);
    setGroupCommentPrevText('');
    setGroupCommentCleanedOnce(false);
    trackEvent('polish_undo', {
      source: 'lesson_group_comment',
      component: 'LessonNotes.GroupComment',
      length_bucket: lengthBucket(groupCommentPrevText.length),
    });
  };

  const _GetRatingForStudent = (studentId, dimension) => {
    const studentValue = studentOverrides[studentId]?.dimensions?.[dimension];
    if (studentValue) return studentValue;
    return effectiveDefaults[dimension] || 'na';
  };

  // Lesson title suggestions – only for toddler & primary
  const selectedProgramId = selectedClassroom?.programId || null;

  const getTitlesForProgram = (programId) => {
    if (!lessonConfig || !programId) return [];
    const key = `lesson_${programId}_titles`;
    const list = lessonConfig[key];
    if (!Array.isArray(list)) return [];
    return list.map((t) => String(t || '')).filter(Boolean).sort((a, b) => a.localeCompare(b));
  };

  const titleOptions = useMemo(() => {
    if (!selectedProgramId) return [];
    if (selectedProgramId !== 'toddler' && selectedProgramId !== 'primary') return [];
    return getTitlesForProgram(selectedProgramId);
  }, [selectedProgramId, lessonConfig]);

  const normalizedTitleSet = useMemo(() => {
    const set = new Set();
    titleOptions.forEach((t) => {
      set.add(String(t).trim().toLowerCase());
    });
    return set;
  }, [titleOptions]);

  const isCustomTitle = useMemo(() => {
    if (!context.lessonTitle || !selectedProgramId) return false;
    if (selectedProgramId !== 'toddler' && selectedProgramId !== 'primary') return false;
    const normalized = String(context.lessonTitle).trim().toLowerCase();
    if (!normalized) return false;
    return !normalizedTitleSet.has(normalized);
  }, [context.lessonTitle, selectedProgramId, normalizedTitleSet]);

  const handleSave = async () => {
    if (saving) return;
    
    // Check if nothing has changed
    if (!isDirty) {
      notify.warning('No changes to save.');
      return;
    }
    
    // Edit mode validation
    if (isEditMode && selectedStudents.length === 0) {
      notify.warning('Please select the student for this lesson note.');
      return;
    }
    
    // Setup validation - check individual requirements for clearer messages
    if (!context.lessonTitle.trim()) {
      notify.warning('Please enter a lesson title.');
      return;
    }
    if (!context.classroomId) {
      notify.warning('Please select a classroom.');
      return;
    }
    if (selectedStudents.length === 0) {
      notify.warning('Please select at least one student.');
      return;
    }
    
    // Group mode: check if student selection is finalized
    if (lessonMode === 'group' && !studentsLocked) {
      notify.warning('Please confirm your student selection by clicking "Done selecting students".');
      return;
    }
    
    // Group mode: check if defaults are complete
    if (lessonMode === 'group' && !defaultsComplete) {
      const missingDimensions = dimensionList.filter((dim) => !effectiveDefaults[dim]);
      if (missingDimensions.length === 1) {
        notify.warning(`Please set a rating for the "${missingDimensions[0]}" dimension.`);
      } else {
        notify.warning(`Please set ratings for all dimensions: ${missingDimensions.join(', ')}`);
      }
      return;
    }
    
    // Check if all dimensions are selected for all students
    // In group mode with complete defaults, students can inherit defaults, so skip this check
    // In individual mode, require explicit ratings for all dimensions
    if (lessonMode === 'individual' && !allDimensionsSelected) {
      const missingStudents = selectedStudents.filter((studentId) => {
        return !dimensionList.every((dimension) => {
          return studentOverrides[studentId]?.dimensions?.[dimension] !== undefined;
        });
      });
      if (missingStudents.length === 1) {
        const studentName = getStudentDisplayName(studentsById[missingStudents[0]]);
        notify.warning(`Please complete all ratings for ${studentName}.`);
      } else {
        notify.warning(`Please complete all ratings for ${missingStudents.length} student(s).`);
      }
      return;
    }

    try {
      setSaving(true);
      const ratingsForStudent = {};
      dimensionList.forEach((dimension) => {
        const overrideValue = studentOverrides[selectedStudents[0]]?.dimensions?.[dimension];
        const baseValue = effectiveDefaults[dimension] || 'na';
        ratingsForStudent[dimension] = overrideValue || baseValue;
      });

      if (isEditMode) {
        const studentId = selectedStudents[0];
        const obsId = editObservation?.id;
        if (!studentId || !obsId) throw new Error('Missing lesson note to edit.');
        const ref = doc(db, 'students', studentId, 'observations', obsId);
        const payload = {
          classroomId: context.classroomId,
          lessonTitle: context.lessonTitle.trim(),
          lessonDescription: context.lessonDescription.trim() || null,
          groupComment: context.groupComment.trim() || null,
          programId: selectedClassroom?.programId || null,
          dimensionOrder: dimensionList,
          groupDefaults: effectiveDefaults,
          ratings: ratingsForStudent,
          studentComment: studentOverrides[studentId]?.comment?.trim() || null,
          lessonMode: 'individual',
          updatedAt: serverTimestamp(),
          lastEditedBy: currentUser?.uid || null,
          lastEditedAt: serverTimestamp(),
        };
        await updateDoc(ref, payload);
        notify.success('Lesson note updated.');
        setIsDirty(false);
        onSaved?.({ observationId: obsId, studentId });
      } else {
        const groupId = lessonMode === 'group' ? buildGroupId() : undefined;
        const queueGroupId = `lesson_save_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const queueEntries = selectedStudents.map((studentId) => {
          const ratings = {};
          dimensionList.forEach((dimension) => {
            const overrideValue = studentOverrides[studentId]?.dimensions?.[dimension];
            const baseValue = effectiveDefaults[dimension] || 'na';
            ratings[dimension] = overrideValue || baseValue;
          });

          return {
            kind: 'lesson',
            studentId,
            groupId: queueGroupId,
            title: 'Lesson note save',
            summary: context.lessonTitle.trim(),
            payload: {
              studentId,
              classroomId: context.classroomId,
              lessonTitle: context.lessonTitle.trim(),
              lessonDescription: context.lessonDescription.trim() || null,
              groupComment: context.groupComment.trim() || null,
              programId: selectedClassroom?.programId || null,
              dimensionOrder: dimensionList,
              ...(showDefaults ? { groupDefaults: effectiveDefaults } : {}),
              ratings,
              studentComment: studentOverrides[studentId]?.comment?.trim() || null,
              attendanceStatus: 'present',
              lessonMode,
              ...(groupId ? { groupId } : {}),
              createdBy: currentUser?.uid || 'unknown',
              createdByName: currentUser?.displayName || 'Unknown Teacher',
              createdByEmail: currentUser?.email || 'unknown@email.com',
            }
          };
        });

        enqueueSaveQueueItems(queueEntries);
        notify.success('Lesson note saving in the background — you may continue your work', {
          duration: 4000,
        });
        setIsDirty(false);
        onSaved?.();
      }
    } catch {
      notify.error('Unable to save lesson note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Shared scrollbar styling for dropdowns/lists
  const scrollListSx = {
    maxHeight: 220,
    overflowY: 'scroll',
    scrollbarWidth: 'auto',
    scrollbarGutter: 'stable both-edges',
    '&::-webkit-scrollbar': {
      width: 12
    },
    '&::-webkit-scrollbar-track': {
      backgroundColor: '#e5e7eb',
      borderRadius: 999
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: '#111827',
      borderRadius: 999,
      border: '3px solid #e5e7eb',
      boxShadow: 'inset 0 0 2px rgba(0,0,0,0.2)'
    }
  };

  const renderStudentRow = (student, { dense = false, disabled = false } = {}) => {
    const checked = selectedStudents.includes(student.id);
    const isDisabled = disabled || isEditMode;
    return (
      <ListItem
        key={student.id}
        button
        disabled={isDisabled}
        onClick={() => !isDisabled && toggleStudent(student.id)}
        sx={{
          px: dense ? 1 : 1.5,
          py: dense ? 0.5 : 1,
          borderRadius: 1,
          opacity: isDisabled ? 0.6 : 1,
          '&:hover': { backgroundColor: '#f8fafc' }
        }}
      >
        <Checkbox
          edge="start"
          tabIndex={-1}
          disableRipple
          checked={checked}
          onClick={(e) => {
            e.stopPropagation();
            toggleStudent(student.id);
          }}
          disabled={disabled}
        />
        <ListItemText
          primary={getStudentDisplayName(student)}
          secondary={studentsById[student.id]?.classroomId === context.classroomId ? selectedClassroom?.name : 'Different classroom'}
          primaryTypographyProps={{ fontWeight: 600 }}
        />
      </ListItem>
    );
  };

  if (loading) {
    return (
      <Box sx={{ py: 6, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, flexDirection: 'column' }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Coach Pepper is loading lesson notes...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {isEditMode && (
        <Chip
          label="Editing existing lesson note"
          color="warning"
          size="small"
          sx={{ alignSelf: 'flex-start' }}
        />
      )}
      <Paper id={SECTION_IDS.setup} ref={setupRef} sx={{ p: 2, borderRadius: 2, border: '1px solid #e2e8f0' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Lesson context & students
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Fill the basics, then pick students or a saved group.
            </Typography>
          </Box>
          <ToggleButtonGroup
            value={lessonMode}
            exclusive
            onChange={toggleLessonMode}
            size="small"
            disabled={isEditMode}
          >
            <ToggleButton value="individual">Individual</ToggleButton>
            <ToggleButton value="group">Group</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
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
          {(selectedProgramId === 'toddler' || selectedProgramId === 'primary') && titleOptions.length > 0 ? (
            <Autocomplete
              freeSolo
              options={titleOptions}
              value={context.lessonTitle}
              onChange={(_, newValue) => {
                if (typeof newValue === 'string') {
                  setContextField('lessonTitle', newValue);
                } else if (newValue == null) {
                  setContextField('lessonTitle', '');
                }
              }}
              onInputChange={(_, newInputValue) => {
                setContextField('lessonTitle', newInputValue || '');
              }}
              filterOptions={(options, state) => {
                const input = (state.inputValue || '').trim();
                if (!input) {
                  return options;
                }
                const data = options.map((title) => ({ title }));
                const results = genericFuzzySearch(data, input, [{ name: 'title', weight: 1.0 }]);
                return results.map((r) => r.title);
              }}
              ListboxProps={{
                sx: {
                  maxHeight: 240, // show roughly 5 items at once
                  overflowY: 'scroll',
                  scrollbarWidth: 'auto',
                  scrollbarGutter: 'stable both-edges',
                  '&::-webkit-scrollbar': {
                    width: 12
                  },
                  '&::-webkit-scrollbar-track': {
                    backgroundColor: '#e5e7eb',
                    borderRadius: 999
                  },
                  '&::-webkit-scrollbar-thumb': {
                    backgroundColor: '#6366f1',
                    borderRadius: 999,
                    border: '3px solid #e5e7eb',
                    boxShadow: 'inset 0 0 2px rgba(0,0,0,0.2)'
                  }
                }
              }}
              componentsProps={{
                paper: {
                  sx: {
                    maxHeight: 240,
                    overflowY: 'visible',
                    scrollbarGutter: 'stable both-edges'
                  }
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  fullWidth
                  label="Lesson Title"
                  required
                />
              )}
            />
          ) : (
            <TextField
              fullWidth
              label="Lesson Title"
              required
              value={context.lessonTitle}
              onChange={(e) => setContextField('lessonTitle', e.target.value)}
            />
          )}
          {isCustomTitle && (
            <Box sx={{ mt: 0.5 }}>
              <Chip
                label="Custom title"
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.75rem', color: '#64748b', borderColor: '#cbd5e1' }}
              />
            </Box>
          )}
          <TextField
            fullWidth
            label="Short Description (optional)"
            multiline
            minRows={2}
            placeholder="Add a short description (optional)"
            value={context.lessonDescription}
            onChange={(e) => {
              setContextField('lessonDescription', e.target.value);
              if (descriptionCleanedOnce) {
                setDescriptionCleanedOnce(false);
                setDescriptionPrevText('');
              }
            }}
            inputRef={(el) => {
              inputRefs.current.lessonDescription = el;
            }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip
                      title="Add text first to polish with AI"
                      disableHoverListener={!!context.lessonDescription.trim()}
                      disableFocusListener={!!context.lessonDescription.trim()}
                    >
                      <span>
                        <IconButton
                          aria-label="Polish short description with AI"
                          onClick={handlePolishDescription}
                          disabled={!context.lessonDescription.trim() || descriptionCleaning || descriptionCleanedOnce}
                          size="small"
                          sx={{
                            border: 1,
                            borderColor: 'divider',
                            bgcolor: 'action.hover',
                            color: descriptionCleanedOnce ? '#059669' : descriptionCleaning ? '#7c3aed' : !context.lessonDescription.trim() ? 'text.disabled' : '#7c3aed'
                          }}
                        >
                          {descriptionCleaning ? <CircularProgress size={16} color="inherit" /> : <AutoFixHigh fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                    <IconButton
                      aria-label="Dictate short description"
                      onClick={() => openDictationFor({ field: 'lessonDescription' })}
                      color="primary"
                      size="small"
                      sx={{
                        border: 1,
                        borderColor: 'divider',
                        bgcolor: 'action.hover'
                      }}
                    >
                      <Mic fontSize="small" />
                    </IconButton>
                  </Box>
                </InputAdornment>
              )
            }}
          />
          {descriptionCleanedOnce && descriptionPrevText && (
            <Button
              variant="text"
              onClick={handleUndoPolishDescription}
              sx={{ color: '#64748b', textTransform: 'none', minWidth: 'auto', px: 1, alignSelf: 'flex-start', mt: -1 }}
            >
              Undo polish
            </Button>
          )}
          {lessonMode === 'group' && (
            <>
              <TextField
                fullWidth
                label="Group Comment (optional)"
                multiline
                minRows={2}
                placeholder="Add a note that appears for every student (optional)"
                helperText="Optional note that appears for every student"
                value={context.groupComment}
                onChange={(e) => {
                  setContextField('groupComment', e.target.value);
                  if (groupCommentCleanedOnce) {
                    setGroupCommentCleanedOnce(false);
                    setGroupCommentPrevText('');
                  }
                }}
                inputRef={(el) => {
                  inputRefs.current.groupComment = el;
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip
                          title="Add text first to polish with AI"
                          disableHoverListener={!!context.groupComment.trim()}
                          disableFocusListener={!!context.groupComment.trim()}
                        >
                          <span>
                            <IconButton
                              aria-label="Polish group comment with AI"
                              onClick={handlePolishGroupComment}
                              disabled={!context.groupComment.trim() || groupCommentCleaning || groupCommentCleanedOnce}
                              size="small"
                              sx={{
                                border: 1,
                                borderColor: 'divider',
                                bgcolor: 'action.hover',
                                color: groupCommentCleanedOnce ? '#059669' : groupCommentCleaning ? '#7c3aed' : !context.groupComment.trim() ? 'text.disabled' : '#7c3aed'
                              }}
                            >
                              {groupCommentCleaning ? <CircularProgress size={16} color="inherit" /> : <AutoFixHigh fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <IconButton
                          aria-label="Dictate group comment"
                          onClick={() => openDictationFor({ field: 'groupComment' })}
                          color="primary"
                          size="small"
                          sx={{
                            border: 1,
                            borderColor: 'divider',
                            bgcolor: 'action.hover'
                          }}
                        >
                          <Mic fontSize="small" />
                        </IconButton>
                      </Box>
                    </InputAdornment>
                  )
                }}
              />
              {groupCommentCleanedOnce && groupCommentPrevText && (
                <Button
                  variant="text"
                  onClick={handleUndoPolishGroupComment}
                  sx={{ color: '#64748b', textTransform: 'none', minWidth: 'auto', px: 1, alignSelf: 'flex-start', mt: -1 }}
                >
                  Undo polish
                </Button>
              )}
            </>
          )}

          <TextField
            fullWidth
            placeholder="Search student or group"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={searchDisabled}
            InputProps={{
              startAdornment: <Search fontSize="small" sx={{ mr: 1, color: '#94a3b8' }} />
            }}
          />

          {searchActive && (
            <Stack spacing={1.5} sx={{ mt: 1.5 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Students
                </Typography>
                <Paper variant="outlined" sx={{ ...scrollListSx, borderRadius: 2 }}>
                  {matchingStudents.length > 0 ? (
                    <List dense disablePadding>
                      {matchingStudents.map((student) => renderStudentRow(student))}
                    </List>
                  ) : (
                    <Box sx={{ p: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        No students match this search.
                      </Typography>
                    </Box>
                  )}
                </Paper>
              </Box>

              {aliasMatches.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    Groups
                  </Typography>
                  <Stack spacing={1}>
                    {aliasMatches.map((alias) => {
                      const inClassMembers = (alias.inClassMembers || []).map((id) => studentsById[id]).filter(Boolean);
                      const outOfClassMembers = (alias.outOfClassMembers || []).map((id) => studentsById[id]).filter(Boolean);
                      const checkedCount = inClassMembers.filter((stu) => selectedStudents.includes(stu.id)).length;
                      const allSelected = inClassMembers.length > 0 && checkedCount === inClassMembers.length;
                      const partiallySelected = checkedCount > 0 && !allSelected;
                      return (
                        <Paper key={alias.id} variant="outlined" sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              px: 1.5,
                              py: 1
                            }}
                          >
                            <ListItemIcon sx={{ minWidth: 32, color: '#4f46e5' }}>
                              <Group />
                            </ListItemIcon>
                            <ListItemText
                              primary={alias.name}
                              secondary={`${checkedCount}/${inClassMembers.length} in this classroom`}
                              primaryTypographyProps={{ fontWeight: 700 }}
                            />
                            <Checkbox
                              edge="end"
                              checked={allSelected}
                              indeterminate={partiallySelected}
                              onChange={() => toggleAliasSelection(alias)}
                              disabled={lessonMode === 'individual'}
                            />
                            <IconButton onClick={() => toggleAliasExpanded(alias.id)} size="small" disabled={lessonMode === 'individual'}>
                              {expandedAliases[alias.id] ? <ExpandLess /> : <ExpandMore />}
                            </IconButton>
                          </Box>
                          <Collapse in={expandedAliases[alias.id]} timeout="auto" unmountOnExit>
                            <Divider />
                            <List dense disablePadding sx={scrollListSx}>
                              {inClassMembers.map((student) => renderStudentRow(student, { dense: true }))}
                              {outOfClassMembers.map((student) => (
                                <ListItem key={student.id} dense sx={{ px: 1.5, py: 1, opacity: 0.5 }}>
                                  <Checkbox edge="start" disabled />
                                  <ListItemText
                                    primary={getStudentDisplayName(student)}
                                    secondary="Not in selected classroom"
                                  />
                                </ListItem>
                              ))}
                              {inClassMembers.length === 0 && (
                                <ListItem dense sx={{ px: 1.5, py: 1 }}>
                                  <ListItemText
                                    primary="No students from this group belong to the selected classroom."
                                    primaryTypographyProps={{ color: 'text.secondary' }}
                                  />
                                </ListItem>
                              )}
                            </List>
                          </Collapse>
                        </Paper>
                      );
                    })}
                  </Stack>
                </Box>
              )}
            </Stack>
          )}

          {selectedStudents.length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {selectedStudentEntities.map((stu) => (
                <Chip
                  key={stu.id}
                  label={getStudentDisplayName(stu)}
                  onDelete={() => toggleStudent(stu.id)}
                  color="primary"
                  variant="outlined"
                  size="small"
                />
              ))}
            </Stack>
          )}

          {lessonMode === 'group' && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleConfirmStudents}
                disabled={!baseSetupComplete || studentsLocked}
              >
                {studentsLocked ? 'Students locked' : 'Done selecting students'}
              </Button>
            </Box>
          )}
        </Box>
      </Paper>

      {showDefaultsSection && (
        <Paper
          id={SECTION_IDS.defaults}
          ref={defaultsRef}
          sx={{
            p: 2,
            borderRadius: 2,
            border: '1px solid #e2e8f0',
            backgroundColor: setupComplete ? 'white' : '#f8fafc',
            opacity: setupComplete ? 1 : 0.6
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Group defaults
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Set baseline ratings for the whole group. You can override individuals below.
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={2}>
            {dimensionList.map((dimension) => {
              const selected = dimensionDefaults[dimension];
              return (
                <Box key={dimension}>
                  <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
                    {dimension}
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {LESSON_RATING_OPTIONS.map((option) => {
                      const props = ratingButtonStyles(option.value, selected);
                      return (
                        <Button
                          key={`${dimension}-${option.value}`}
                          {...props}
                          onClick={() => setDefaultRating(dimension, option.value)}
                        >
                          {option.label}
                        </Button>
                      );
                    })}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}

      {showOverridesSection && (
        <Paper
          id={SECTION_IDS.overrides}
          ref={overridesRef}
          sx={{
            p: 2,
            borderRadius: 2,
            border: '1px solid #e2e8f0',
            backgroundColor: defaultsComplete ? 'white' : '#f8fafc',
            opacity: defaultsComplete ? 1 : 0.6
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            Individual tweaks
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Adjust ratings or add comments for specific students.
          </Typography>
          <Divider sx={{ mb: 2 }} />
          {selectedStudentEntities.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Select at least one student to add ratings.
            </Typography>
          ) : (
            <Box sx={{ maxHeight: 420, overflowY: 'auto', pr: 0.5 }}>
              <Stack spacing={2}>
                {selectedStudentEntities.map((student) => (
                  <Paper key={student.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, border: '1px solid #e2e8f0' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Person fontSize="small" sx={{ color: '#4f46e5' }} />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {getStudentDisplayName(student)}
                        </Typography>
                      </Box>
                      <Chip
                        label={selectedClassroom?.name || student.classroomId}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                    <Stack spacing={1.5}>
                      {dimensionList.map((dimension) => {
                        const overrideRating = studentOverrides[student.id]?.dimensions?.[dimension];
                        // In group mode, show defaults if no override; in individual mode, show nothing if no override
                        const displayRating = overrideRating !== undefined 
                          ? overrideRating 
                          : (lessonMode === 'group' ? (effectiveDefaults[dimension] || null) : null);
                        return (
                          <Box key={`${student.id}-${dimension}`}>
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>
                              {dimension}
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                              {LESSON_RATING_OPTIONS.map((option) => {
                                const props = ratingButtonStyles(option.value, displayRating);
                                return (
                                  <Button
                                    key={`${student.id}-${dimension}-${option.value}`}
                                    {...props}
                                    onClick={() => setStudentRating(student.id, dimension, option.value)}
                                  >
                                    {option.label}
                                  </Button>
                                );
                              })}
                            </Stack>
                          </Box>
                        );
                      })}
                    </Stack>
                    <TextField
                      fullWidth
                      label="Student comment (optional)"
                      multiline
                      minRows={1}
                      placeholder="Add a student-specific comment (optional)"
                      value={studentOverrides[student.id]?.comment || ''}
                      onChange={(e) => setStudentComment(student.id, e.target.value)}
                      sx={{ mt: 1 }}
                      inputRef={(el) => {
                        if (!inputRefs.current.studentComment) {
                          inputRefs.current.studentComment = {};
                        }
                        inputRefs.current.studentComment[student.id] = el;
                      }}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              aria-label={`Dictate comment for ${getStudentDisplayName(student)}`}
                              onClick={() => openDictationFor({ field: 'studentComment', studentId: student.id })}
                            color="primary"
                            size="small"
                            sx={{
                              border: 1,
                              borderColor: 'divider',
                              bgcolor: 'action.hover'
                            }}
                            >
                              <Mic fontSize="small" />
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                    />
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}
        </Paper>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
        <Button variant="outlined" color="error" onClick={onCancel}>
          Discard
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Lesson Note'}
        </Button>
      </Box>

      <Dialog
        open={dictationOpen}
        onClose={closeDictation}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden'
          }
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.5, py: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Dictate for lesson note
          </Typography>
          <IconButton aria-label="Close dictation" onClick={closeDictation}>
            <Close />
          </IconButton>
        </Box>
        <Divider />
        <Box sx={{ p: 2 }}>
          <VoiceRecorder
            variant="cardless"
            onSave={handleDictationSave}
            onNext={closeDictation}
            autoAdvanceOnSave
          />
        </Box>
      </Dialog>
    </Box>
  );
}

export default LessonNoteWizard;
