import React, { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { Download, RefreshCw as Refresh } from '../icons';
import { collection, collectionGroup, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import ExportWizard from './ExportWizard';
import { executeExportJob, filterObservationsForExport, NOTE_KIND } from '../utils/export';
import useNotify from '../notifications/useNotify';
import { isSuperAdmin, isClassroomAdmin } from '../utils/roleUtils';

const BATCH_LIMIT = 10;

const getTimestampValue = (observation) => {
  const source = observation?.observedAt || observation?.timestamp;
  if (!source) return 0;
  if (source.seconds) return source.seconds * 1000;
  if (typeof source.toDate === 'function') return source.toDate().getTime();
  if (source instanceof Date) return source.getTime();
  const parsed = Date.parse(source);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const buildGroupedByClassroom = (notes = [], classrooms = []) => {
  const classroomMeta = new Map(
    classrooms.map((cls, index) => [cls.id, { label: cls.name || cls.id, order: index }])
  );

  const groups = new Map();

  notes.forEach((note) => {
    const rawId = note.classroomId || note.classroom || note.classroomName || 'Unspecified_Classroom';
    const id = String(rawId);
    if (!groups.has(id)) {
      const meta = classroomMeta.get(id);
      groups.set(id, {
        id,
        label: meta?.label || note.classroomName || id,
        order: meta?.order ?? Number.MAX_SAFE_INTEGER,
        observations: []
      });
    }
    groups.get(id).observations.push(note);
  });

  return Array.from(groups.values()).sort((a, b) => a.order - b.order);
};

const getStudentLabel = (student = {}) => {
  const direct = student.displayName || student.name;
  if (direct) return direct;
  const names = [student.firstName, student.lastName].filter(Boolean).join(' ');
  return names || 'Student';
};

const sanitizeObservations = (items = []) => items.filter((obs) => obs?.type !== 'media');

function ReviewClassroomNotes({ currentUser, userRole, manageableClassrooms = [] }) {
  const notify = useNotify();
  const [classrooms, setClassrooms] = useState([]);
  const [students, setStudents] = useState([]);
  const [loadingClassrooms, setLoadingClassrooms] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [exportWizardOpen, setExportWizardOpen] = useState(false);
  const [exportObservations, setExportObservations] = useState([]);
  const [exportContext, setExportContext] = useState(null);
  const [exportSubjectLabel, setExportSubjectLabel] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedClassroomIds, setSelectedClassroomIds] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const isTeacher = userRole === 'teacher';
  const isClassroomAdminUser = isClassroomAdmin(userRole);
  const isSuperAdminUser = isSuperAdmin(userRole);

  const selectedClassrooms = useMemo(
    () => classrooms.filter((cls) => selectedClassroomIds.includes(cls.id)),
    [classrooms, selectedClassroomIds]
  );

  const classroomNames = useMemo(
    () => selectedClassrooms.map((cls) => cls.name || cls.id),
    [selectedClassrooms]
  );

  useEffect(() => {
    let isMounted = true;

    const loadClassrooms = async () => {
      setLoadingClassrooms(true);
      try {
        let results = [];

        if (isTeacher) {
          if (!currentUser?.uid) {
            if (isMounted) setClassrooms([]);
            return;
          }
          const snap = await getDocs(query(collection(db, 'classrooms')));
          results = snap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((cls) => (cls.status || 'active') !== 'archived')
            .filter((cls) => Array.isArray(cls.teacherIds) && cls.teacherIds.includes(currentUser.uid));
        } else if (isClassroomAdminUser) {
          const ids = (manageableClassrooms || []).filter(Boolean);
          if (!ids.length) {
            if (isMounted) setClassrooms([]);
            return;
          }

          const batches = [];
          for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
            batches.push(ids.slice(i, i + BATCH_LIMIT));
          }

          const collected = [];
          for (const batch of batches) {
            const q = query(
              collection(db, 'classrooms'),
              where(documentId(), 'in', batch),
              where('status', '==', 'active')
            );
            const snap = await getDocs(q);
            collected.push(...snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
          }

          const deduped = {};
          collected.forEach((cls) => {
            if (cls?.id) deduped[cls.id] = cls;
          });
          results = Object.values(deduped);
        } else {
          const snap = await getDocs(query(collection(db, 'classrooms'), where('status', '==', 'active')));
          results = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        }

        // Exclude adolescent classrooms and sort
        results = results
          .filter((cls) => !String(cls?.name || '').toLowerCase().includes('adolescent'))
          .sort((a, b) => (a?.name || '').localeCompare(b?.name || '', undefined, { sensitivity: 'base' }));

        if (isMounted) setClassrooms(results);
      } catch (_err) {
        notify.error('Unable to load classrooms right now. Please try again.', {
          id: 'export-classrooms-load-error',
          duration: 4000
        });
        if (isMounted) setClassrooms([]);
      } finally {
        if (isMounted) setLoadingClassrooms(false);
      }
    };

    loadClassrooms();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.uid, isTeacher, isClassroomAdminUser, manageableClassrooms, notify]);

  useEffect(() => {
    // Wait for classrooms when role needs them
    if ((isTeacher || isClassroomAdminUser) && loadingClassrooms) return;

    let isMounted = true;

    const loadStudents = async () => {
      setLoadingStudents(true);
      try {
        let results = [];

        if (isTeacher) {
          const allowedIds = classrooms.map((cls) => cls.id).filter(Boolean);
          if (!allowedIds.length) {
            if (isMounted) setStudents([]);
            return;
          }

          for (let i = 0; i < allowedIds.length; i += BATCH_LIMIT) {
            const batch = allowedIds.slice(i, i + BATCH_LIMIT);
            const q = query(collection(db, 'students'), where('classroomId', 'in', batch));
            const snap = await getDocs(q);
            results.push(...snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
          }
        } else if (isClassroomAdminUser) {
          const adminClassroomIds = classrooms.map((cls) => cls.id).filter(Boolean);
          if (!adminClassroomIds.length) {
            if (isMounted) setStudents([]);
            return;
          }

          for (let i = 0; i < adminClassroomIds.length; i += BATCH_LIMIT) {
            const batch = adminClassroomIds.slice(i, i + BATCH_LIMIT);
            const q = query(collection(db, 'students'), where('classroomId', 'in', batch));
            const snap = await getDocs(q);
            results.push(...snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
          }
        } else {
          const snap = await getDocs(collection(db, 'students'));
          results = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        }

        const deduped = new Map();
        results.forEach((stu) => {
          if (stu?.id) deduped.set(stu.id, stu);
        });

        const sorted = Array.from(deduped.values()).sort((a, b) =>
          getStudentLabel(a).localeCompare(getStudentLabel(b), undefined, { sensitivity: 'base' })
        );

        if (isMounted) setStudents(sorted);
      } catch (_err) {
        notify.error('Unable to load students right now. Please try again.', {
          id: 'export-students-load-error',
          duration: 4000
        });
        if (isMounted) setStudents([]);
      } finally {
        if (isMounted) setLoadingStudents(false);
      }
    };

    loadStudents();

    return () => {
      isMounted = false;
    };
  }, [classrooms, isTeacher, isClassroomAdminUser, loadingClassrooms, notify]);

  const handleStudentChange = (_, value) => {
    setSelectedStudent(value || null);
    if (value) {
      setSelectedClassroomIds([]);
    }
  };

  const handleClassroomsChange = (_, value = []) => {
    setSelectedClassroomIds(value.map((cls) => cls.id));
  };

  const fetchStudentObservations = async (student) => {
    const notesQuery = query(collectionGroup(db, 'observations'), where('studentId', '==', student.id));
    const snapshot = await getDocs(notesQuery);
    return sanitizeObservations(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  };

  const fetchClassroomObservations = async (classroomList = []) => {
    const observations = [];
    await Promise.all(
      classroomList.map(async (cls) => {
        const notesQuery = query(collectionGroup(db, 'observations'), where('classroomId', '==', cls.id));
        const snapshot = await getDocs(notesQuery);
        snapshot.forEach((doc) => {
          observations.push({
            id: doc.id,
            classroomName: cls.name,
            classroomId: cls.id,
            ...doc.data()
          });
        });
      })
    );
    return sanitizeObservations(observations);
  };

  const handlePrepareExport = async () => {
    if (!selectedStudent && selectedClassroomIds.length === 0) {
      notify.warning('Select a student or at least one classroom to export.', {
        id: 'export-selection-missing',
        duration: 3000
      });
      return;
    }

    setLoadingNotes(true);
    try {
      if (selectedStudent) {
        const observations = await fetchStudentObservations(selectedStudent);
        if (!observations.length) {
          notify.warning('No notes found for the selected student.', {
            id: 'export-student-empty',
            duration: 3200
          });
          return;
        }
        const sorted = observations.sort((a, b) => getTimestampValue(b) - getTimestampValue(a));
        setExportObservations(sorted);
        setExportContext({ type: 'student', student: selectedStudent });
        setExportSubjectLabel(getStudentLabel(selectedStudent));
        setExportWizardOpen(true);
        return;
      }

      const observations = await fetchClassroomObservations(selectedClassrooms);
      if (!observations.length) {
        notify.warning('No notes found for the selected classroom(s).', {
          id: 'export-classrooms-empty',
          duration: 3200
        });
        return;
      }
      const sorted = observations.sort((a, b) => getTimestampValue(b) - getTimestampValue(a));
      setExportObservations(sorted);
      setExportContext({
        type: 'classrooms',
        classroomIds: selectedClassroomIds.slice(),
        classrooms: selectedClassrooms.slice()
      });
      const label =
        selectedClassrooms.length === 1
          ? `Classroom: ${selectedClassrooms[0]?.name || 'Classroom'}`
          : `Classrooms: ${classroomNames.join(', ')}`;
      setExportSubjectLabel(label);
      setExportWizardOpen(true);
    } catch (_err) {
      notify.error('Failed to prepare notes for export. Please try again.', {
        id: 'export-prepare-error',
        duration: 4000
      });
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleRunExport = ({ noteKinds, format, dateRange }) => {
    if (!exportContext) return;
    setExporting(true);

    try {
      const filtered = filterObservationsForExport({
        observations: exportObservations,
        noteKinds,
        dateRange
      });

      if (!filtered.length) {
        notify.warning('No notes match the selected filters.', {
          id: 'export-filter-empty',
          duration: 3000
        });
        setExporting(false);
        return;
      }

      const subject =
        exportContext.type === 'student'
          ? {
              type: 'student',
              id: exportContext.student?.id,
              name: getStudentLabel(exportContext.student),
              displayName: getStudentLabel(exportContext.student),
              classroomId: exportContext.student?.classroomId || null
            }
          : {
              type: 'classroom_collection',
              classroomIds: exportContext.classroomIds || [],
              classroomNames: (exportContext.classrooms || []).map((cls) => cls.name || cls.id),
              groupedBy: 'classroom',
              selectedDateRange: {
                from: dateRange?.from || null,
                to: dateRange?.to || null
              }
            };

      const subjectTitle =
        exportContext.type === 'student'
          ? `${getStudentLabel(exportContext.student)} - Notes`
          : `${(exportContext.classrooms || []).length === 1
            ? (exportContext.classrooms || [])[0]?.name || 'Classroom'
            : `${(exportContext.classrooms || []).length} Classrooms`
          } - Notes`;

      const groupedObservations =
        exportContext.type === 'classrooms'
          ? buildGroupedByClassroom(filtered, exportContext.classrooms || [])
          : null;

      const result = executeExportJob({
        actor: currentUser,
        subject,
        data: { observations: filtered },
        noteKinds,
        format,
        dateRange,
        exportType: exportContext.type === 'student' ? 'student_export' : 'classroom_notes_export',
        textHeader: subjectTitle,
        groupedObservations
      });

      if (!result?.success) {
        throw new Error(result?.error || 'Export failed');
      }

      notify.success(`Exported ${result.observationCount} notes.`, {
        id: 'export-success',
        duration: 3500
      });
      setExportWizardOpen(false);
      setExportContext(null);
    } catch (_err) {
      notify.error('Failed to export notes. Please try again.', {
        id: 'export-error',
        duration: 4000
      });
    } finally {
      setExporting(false);
    }
  };

  const handleCloseWizard = () => {
    setExportWizardOpen(false);
    setExportContext(null);
  };

  const selectionSummary = selectedStudent
    ? `Student: ${getStudentLabel(selectedStudent)}`
    : selectedClassroomIds.length
      ? `Classrooms: ${classroomNames.join(', ')}`
      : 'No selection yet';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card sx={{ borderRadius: 2 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600, color: 'var(--color-text)' }}>
              Export Notes
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', mt: 0.5 }}>
              Choose a student or select classrooms to export observations and lesson notes in one file.
            </Typography>
          </Box>

          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>
                Student (single)
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Selecting a student ignores any classroom selection.
              </Typography>
              <Autocomplete
                options={students}
                loading={loadingStudents}
                value={selectedStudent}
                onChange={handleStudentChange}
                getOptionLabel={(option) => getStudentLabel(option)}
                isOptionEqualToValue={(option, value) => option?.id === value?.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Search student"
                    placeholder="Start typing a student name"
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {loadingStudents ? <CircularProgress color="inherit" size={18} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      )
                    }}
                  />
                )}
                clearOnBlur={false}
              />
            </Box>

            <Divider flexItem>or</Divider>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>
                Classrooms (multi-select)
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Disabled while a student is selected.
              </Typography>
              <Autocomplete
                multiple
                options={classrooms}
                value={selectedClassrooms}
                onChange={handleClassroomsChange}
                getOptionLabel={(option) => option?.name || option?.id || 'Classroom'}
                isOptionEqualToValue={(option, value) => option?.id === value?.id}
                disabled={!!selectedStudent}
                loading={loadingClassrooms}
                renderTags={(tagValue, getTagProps) =>
                  tagValue.map((option, index) => (
                    <Chip
                      {...getTagProps({ index })}
                      key={option.id}
                      label={option.name || option.id}
                      size="small"
                    />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Select classrooms"
                    placeholder="Search classrooms"
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {loadingClassrooms ? <CircularProgress color="inherit" size={18} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      )
                    }}
                  />
                )}
              />
              <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
                <Button
                  variant="text"
                  startIcon={<Refresh />}
                  onClick={() => setSelectedClassroomIds([])}
                  disabled={!!selectedStudent || loadingClassrooms || !selectedClassroomIds.length}
                  sx={{ minWidth: 'unset' }}
                >
                  Clear classrooms
                </Button>
                <Typography variant="caption" color="text.secondary">
                  {selectedStudent
                    ? 'Classroom selection is disabled when a student is chosen.'
                    : `${selectedClassroomIds.length || 0} selected`}
                </Typography>
              </Stack>
            </Box>

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              justifyContent="space-between"
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Selection
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectionSummary}
                </Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={loadingNotes ? <CircularProgress size={16} color="inherit" /> : <Download />}
                onClick={handlePrepareExport}
                disabled={loadingNotes || (!selectedStudent && selectedClassroomIds.length === 0)}
                sx={{ alignSelf: { xs: 'stretch', sm: 'auto' }, minWidth: 180 }}
              >
                {loadingNotes ? 'Preparing…' : 'Export'}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <ExportWizard
        open={exportWizardOpen}
        onClose={handleCloseWizard}
        onConfirm={handleRunExport}
        observations={exportObservations}
        defaultNoteKind={NOTE_KIND.BOTH}
        isSuperAdmin={isSuperAdminUser}
        defaultFormat="txt"
        loading={exporting}
        title="Export Notes"
        subjectLabel={exportSubjectLabel}
      />
    </Box>
  );
}

export default ReviewClassroomNotes;
