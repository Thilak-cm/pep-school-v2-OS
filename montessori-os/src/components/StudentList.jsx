// StudentList.jsx
import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Card,
  CardContent,
  CircularProgress,
  TextField,
  InputAdornment,
  Checkbox,
  Button,
  Stack,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  Search,
  Notes,
  Person,
  Description as ReportIcon,
  CheckBoxOutlineBlank,
  CheckBox as CheckBoxIcon,
  SelectAll,
  Close,
} from '@mui/icons-material';
import { collection, collectionGroup, getDocs, query, where, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';
import { fuzzySearchStudents } from '../utils/fuzzySearch';
import { trackEvent } from '../utils/analytics';
import ReportGenerateDialog from './ReportGenerateDialog';
import ReportPreviewDialog from './ReportPreviewDialog';

function StudentList({ classroom, onSelectStudent }) {
  const [students, setStudents] = useState([]);
  const [classroomObservations, setClassroomObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Bulk select state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Bulk report generation state
  const [bulkGenerateOpen, setBulkGenerateOpen] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ completed: 0, total: 0 });
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkError, setBulkError] = useState('');

  // Single report preview (from bulk results)
  const [previewReport, setPreviewReport] = useState(null);

  const getStudentName = (s) =>
    s?.name || s?.displayName || [s?.firstName, s?.lastName].filter(Boolean).join(' ') || 'Unnamed Student';

  // Calculate note counts for a student
  const getStudentNoteCounts = (studentId) => {
    if (!classroomObservations || classroomObservations.length === 0) {
      return { total: 0, last7Days: 0 };
    }

    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const studentNotes = classroomObservations.filter(note => note.studentId === studentId);
    const total = studentNotes.length;

    const last7Days = studentNotes.filter(note => {
      try {
        let noteDate;
        if (note.observedAt?.toDate) {
          noteDate = note.observedAt.toDate();
        } else if (note.observedAt?.seconds) {
          noteDate = new Date(note.observedAt.seconds * 1000);
        } else if (note.observedAt) {
          noteDate = new Date(note.observedAt);
        } else if (note.timestamp?.toDate) {
          noteDate = note.timestamp.toDate();
        } else if (note.timestamp?.seconds) {
          noteDate = new Date(note.timestamp.seconds * 1000);
        } else if (note.timestamp) {
          noteDate = new Date(note.timestamp);
        } else {
          noteDate = new Date(0);
        }

        return noteDate >= lastWeek;
      } catch {
        return false;
      }
    }).length;

    return { total, last7Days };
  };

  // Format note count display with proper grammar
  const formatNoteCounts = (total, last7Days) => {
    const totalText = `${total} note${total !== 1 ? 's' : ''} overall`;
    const last7DaysText = `${last7Days} note${last7Days !== 1 ? 's' : ''} in the last 7 days`;

    return `${totalText} | ${last7DaysText}`;
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!classroom) return;

      setLoading(true);
      try {
        // Fetch students
        const studentsQuery = query(
          collection(db, 'students'),
          where('classroomId', '==', classroom.id)
        );
        const studentsSnap = await getDocs(studentsQuery);
        const studentsList = studentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setStudents(studentsList);

        // Fetch observations by studentId (not classroomId) to include notes from previous classrooms
        const studentIds = studentsList.map(s => s.id);

        if (studentIds.length === 0) {
          setClassroomObservations([]);
          setLoading(false);
          return;
        }

        // Firestore 'in' queries support up to 10 items, so we need to batch if more
        const batchSize = 10;
        const observationQueries = [];

        for (let i = 0; i < studentIds.length; i += batchSize) {
          const batch = studentIds.slice(i, i + batchSize);
          observationQueries.push(
            query(
              collectionGroup(db, 'observations'),
              where('studentId', 'in', batch),
              limit(50) // Limit to prevent excessive reads - only need recent observations for list view
            )
          );
        }

        // Execute all queries and combine results
        const allSnapshots = await Promise.all(observationQueries.map(q => getDocs(q)));
        const allObservations = [];
        allSnapshots.forEach(snapshot => {
          snapshot.docs.forEach(doc => {
            allObservations.push({
              id: doc.id,
              ...doc.data()
            });
          });
        });

        setClassroomObservations(allObservations);
      } catch {
        /* ignored */
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [classroom]);

  const toggleSelect = (studentId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === visibleStudents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleStudents.map((s) => s.id)));
    }
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedIds(new Set());
    setBulkResults(null);
    setBulkError('');
  };

  const handleBulkGenerate = async ({ dateRangeStart, dateRangeEnd }) => {
    if (!classroom?.id || selectedIds.size === 0) return;
    try {
      setBulkError('');
      setBulkGenerating(true);
      setBulkProgress({ completed: 0, total: selectedIds.size });
      trackEvent('bulk_report_generate_start', {
        classroomId: classroom.id,
        count: selectedIds.size,
      }).catch(() => {});

      const call = httpsCallable(cloudFunctions, 'generateClassroomReports');
      const result = await call({
        classroomId: classroom.id,
        studentIds: Array.from(selectedIds),
        dateRangeStart,
        dateRangeEnd,
      });

      setBulkResults(result.data);
      setBulkGenerateOpen(false);
      setBulkProgress({
        completed: result.data?.completed || 0,
        total: result.data?.total || selectedIds.size,
      });
      trackEvent('bulk_report_generate_success', {
        classroomId: classroom.id,
        completed: result.data?.completed,
        failed: result.data?.failed,
      }).catch(() => {});
    } catch (e) {
      setBulkError(e?.message || 'Failed to generate reports.');
      trackEvent('bulk_report_generate_error', {
        classroomId: classroom.id,
        error: e?.message,
      }).catch(() => {});
    } finally {
      setBulkGenerating(false);
    }
  };

  // Use fuzzy search for better matching
  const visibleStudents = fuzzySearchStudents(students, searchQuery);
  const allSelected = visibleStudents.length > 0 && selectedIds.size === visibleStudents.length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search students…"
          aria-label="Search students"
          variant="outlined"
          size="small"
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        {!bulkMode ? (
          <IconButton
            onClick={() => setBulkMode(true)}
            sx={{ color: '#4f46e5' }}
            aria-label="Enter bulk select mode"
          >
            <ReportIcon />
          </IconButton>
        ) : (
          <IconButton
            onClick={exitBulkMode}
            aria-label="Exit bulk select mode"
          >
            <Close />
          </IconButton>
        )}
      </Stack>

      {/* Bulk mode toolbar */}
      {bulkMode && !loading && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 0.5 }}>
          <Button
            size="small"
            startIcon={allSelected ? <CheckBoxIcon /> : <SelectAll />}
            onClick={toggleSelectAll}
            sx={{ textTransform: 'none', color: '#475569' }}
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </Button>
          <Box sx={{ flex: 1 }} />
          {selectedIds.size > 0 && (
            <Button
              size="small"
              variant="contained"
              startIcon={<ReportIcon />}
              onClick={() => setBulkGenerateOpen(true)}
              disabled={bulkGenerating}
              sx={{
                textTransform: 'none',
                borderRadius: 999,
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
              }}
            >
              Generate ({selectedIds.size})
            </Button>
          )}
        </Stack>
      )}

      {/* Bulk progress */}
      {bulkGenerating && (
        <Box sx={{ px: 0.5 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <CircularProgress size={16} />
            <Typography variant="body2" sx={{ color: '#4f46e5', fontWeight: 600 }}>
              Generating {bulkProgress.completed}/{bulkProgress.total}...
            </Typography>
          </Stack>
          <LinearProgress
            variant="indeterminate"
            sx={{ borderRadius: 1 }}
          />
        </Box>
      )}

      {/* Bulk results summary */}
      {bulkResults && !bulkGenerating && (
        <Alert
          severity={bulkResults.failed > 0 ? 'warning' : 'success'}
          onClose={() => setBulkResults(null)}
          sx={{ borderRadius: 2 }}
        >
          {bulkResults.completed} of {bulkResults.total} reports generated successfully
          {bulkResults.failed > 0 && `. ${bulkResults.failed} failed.`}
        </Alert>
      )}

      {bulkError && (
        <Alert severity="error" onClose={() => setBulkError('')} sx={{ borderRadius: 2 }}>
          {bulkError}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 4, gap: 2, flexDirection: 'column' }}>
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary">
            Coach Pepper is gathering students...
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {visibleStudents.map((stu) => {
            const { total, last7Days } = getStudentNoteCounts(stu.id);
            const isSelected = selectedIds.has(stu.id);

            return (
              <Card
                key={stu.id}
                onClick={() => {
                  if (bulkMode) {
                    toggleSelect(stu.id);
                  } else {
                    onSelectStudent(stu);
                  }
                }}
                sx={{
                  cursor: 'pointer',
                  '&:hover': {
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    transform: 'translateY(-1px)',
                  },
                  transition: 'all 0.2s ease-in-out',
                  ...(bulkMode && isSelected ? {
                    border: '2px solid #4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.04)',
                  } : {}),
                }}
                aria-label={bulkMode ? `${isSelected ? 'Deselect' : 'Select'} ${getStudentName(stu)}` : `Open student ${getStudentName(stu)}`}
              >
                <CardContent sx={{ p: 2 }}>
                  {/* Student Name */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    {bulkMode && (
                      <Checkbox
                        checked={isSelected}
                        size="small"
                        sx={{ p: 0, mr: 0.5 }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSelect(stu.id)}
                      />
                    )}
                    <Person sx={{ fontSize: 16, color: 'primary.main' }} />
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 600,
                        color: 'primary.main'
                      }}
                    >
                      {getStudentName(stu)}
                    </Typography>
                  </Box>

                  {/* Note Counts */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Notes sx={{ fontSize: 14, color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      {formatNoteCounts(total, last7Days)}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
          {visibleStudents.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              No students found in this classroom.
            </Typography>
          )}
        </Box>
      )}

      {/* Bulk generate dialog */}
      <ReportGenerateDialog
        open={bulkGenerateOpen}
        onClose={() => setBulkGenerateOpen(false)}
        onGenerate={handleBulkGenerate}
        generating={bulkGenerating}
        bulkCount={selectedIds.size}
      />

      {/* Single report preview from bulk results */}
      <ReportPreviewDialog
        open={Boolean(previewReport)}
        onClose={() => setPreviewReport(null)}
        reportText={previewReport?.reportText || ''}
        missingInputFlags={previewReport?.missingInputFlags || []}
        generatedAt={previewReport?.generatedAt || null}
        studentLabel={previewReport?.studentLabel || 'Student'}
        noteCount={previewReport?.noteCount ?? null}
      />
    </Box>
  );
}

export default StudentList;
