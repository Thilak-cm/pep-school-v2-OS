import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  Stepper,
  Step,
  StepLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Autocomplete,
  TextField,
  LinearProgress,
  Tooltip,
  Paper,
} from '@mui/material';
import {
  CloudUpload,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  Edit,
  Check,
  Close,
  DoneAll,
} from '@mui/icons-material';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { isSuperAdmin } from '../utils/roleUtils';
import { parseCSV, validateCSV, extractUniqueNames, applyDefaultDate } from '../utils/csvParser';
import {
  matchStudentNames,
  buildObservationDoc,
  buildLessonDoc,
  checkDuplicates,
  CONFIDENCE,
} from './BulkUploadPage.helpers';
import useNotify from '../notifications/useNotify.js';

const STEPS = ['Upload CSV', 'Match Students', 'Review & Upload', 'Results'];
const BATCH_CHUNK_SIZE = 20;

export default function BulkUploadPage({ currentUser, userRole }) {
  const notify = useNotify();
  const [activeStep, setActiveStep] = useState(0);

  // Step 0: Upload state
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');

  // Step 1: Matching state
  const [allStudents, setAllStudents] = useState([]);
  const [matchResults, setMatchResults] = useState([]);
  const [editingIdx, setEditingIdx] = useState(-1);

  // Step 2: Review state
  const [reviewRows, setReviewRows] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });

  // Step 3: Results state
  const [results, setResults] = useState(null);

  const isAdmin = isSuperAdmin(userRole);

  // --- Load classrooms & programs on mount ---
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const [classSnap, progSnap] = await Promise.all([
          getDocs(query(collection(db, 'classrooms'), where('status', '==', 'active'))),
          getDocs(collection(db, 'programs')),
        ]);
        setClassrooms(classSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setPrograms(progSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (_err) {
        notify.error('Failed to load classrooms/programs');
      }
    })();
  }, [isAdmin]);

  // --- Derived: programClassroomIds ---
  const programClassroomIds = useMemo(() => {
    if (!selectedProgram) return null;
    const prog = programs.find((p) => p.id === selectedProgram);
    if (!prog?.classrooms) return null;
    return prog.classrooms.map((path) => path.split('/').pop());
  }, [selectedProgram, programs]);

  // --- Step 0: File upload handler ---
  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const { rows, errors: pErrors } = parseCSV(text);
      if (pErrors.length > 0) {
        setParseErrors(pErrors);
        setParsedRows([]);
        return;
      }
      const { valid, errors: vErrors } = validateCSV(rows);
      if (!valid) {
        setParseErrors(vErrors);
        setParsedRows([]);
        return;
      }
      const filled = applyDefaultDate(rows);
      setParsedRows(filled);
      setParseErrors([]);
    };
    reader.readAsText(file);
  }, []);

  // --- Step 0 → 1: Start matching ---
  const handleStartMatching = useCallback(async () => {
    try {
      // Fetch students
      const studentsSnap = await getDocs(
        query(collection(db, 'students'), where('isActive', '==', true))
      );
      const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAllStudents(students);

      const uniqueNames = extractUniqueNames(parsedRows);
      const filter = {};
      if (selectedClassroom) filter.classroomId = selectedClassroom;
      else if (programClassroomIds) filter.programClassroomIds = programClassroomIds;

      const matches = matchStudentNames(uniqueNames, students, filter);
      setMatchResults(matches);
      setActiveStep(1);
    } catch (err) {
      notify.error('Failed to load students: ' + (err.message || ''));
    }
  }, [parsedRows, selectedClassroom, programClassroomIds, notify]);

  // --- Step 1: Match actions ---
  const handleAccept = useCallback((idx) => {
    setMatchResults((prev) => prev.map((m, i) =>
      i === idx ? { ...m, accepted: true, rejected: false } : m
    ));
  }, []);

  const handleReject = useCallback((idx) => {
    setMatchResults((prev) => prev.map((m, i) =>
      i === idx ? { ...m, accepted: false, rejected: true } : m
    ));
  }, []);

  const handleEditSelect = useCallback((idx, student) => {
    setMatchResults((prev) => prev.map((m, i) =>
      i === idx ? { ...m, match: student, confidence: CONFIDENCE.HIGH, accepted: true, rejected: false } : m
    ));
    setEditingIdx(-1);
  }, []);

  const handleAcceptAllHighConfidence = useCallback(() => {
    setMatchResults((prev) => prev.map((m) =>
      m.confidence === CONFIDENCE.HIGH && !m.rejected ? { ...m, accepted: true } : m
    ));
  }, []);

  // --- Step 1 → 2: Proceed to review ---
  const allResolved = useMemo(() => {
    return matchResults.every((m) => m.accepted || m.rejected);
  }, [matchResults]);

  const handleProceedToReview = useCallback(async () => {
    // Build mapping: csvName → studentId + metadata
    const nameMap = new Map();
    for (const m of matchResults) {
      if (m.accepted && m.match) {
        nameMap.set(m.csvName.toLowerCase(), m.match);
      }
    }

    // Map parsed rows to upload-ready rows with studentId
    const mapped = parsedRows
      .filter((row) => nameMap.has(row.student_name.toLowerCase()))
      .map((row) => {
        const student = nameMap.get(row.student_name.toLowerCase());
        return {
          ...row,
          studentId: student.id,
          classroomId: student.classroomId,
          branchId: student.branchId || null,
          programId: student.programId || null,
          studentDisplayName: student.displayName,
        };
      });

    // Check for duplicates — fetch existing observations for matched students
    const studentIds = [...new Set(mapped.map((r) => r.studentId))];
    let existingObs = [];
    try {
      // Fetch observations for each student (small volume, < 200 rows)
      const obsPromises = studentIds.map(async (sid) => {
        const obsSnap = await getDocs(collection(db, 'students', sid, 'observations'));
        return obsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      });
      const obsArrays = await Promise.all(obsPromises);
      existingObs = obsArrays.flat().map((obs) => ({
        ...obs,
        observedAt: obs.observedAt?.toDate ? obs.observedAt.toDate() : obs.observedAt,
      }));
    } catch {
      // Non-critical — proceed without duplicate detection
    }

    const flagged = checkDuplicates(mapped, existingObs);
    setReviewRows(flagged);
    setActiveStep(2);
  }, [matchResults, parsedRows]);

  // --- Step 2: Upload ---
  const duplicateCount = useMemo(() => reviewRows.filter((r) => r.isDuplicate).length, [reviewRows]);

  const handleUpload = useCallback(async () => {
    setUploading(true);
    const total = reviewRows.length;
    setUploadProgress({ done: 0, total });

    let imported = 0;
    let failed = 0;
    const groupId = `bulk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    try {
      // Split into chunks for progress updates
      for (let i = 0; i < total; i += BATCH_CHUNK_SIZE) {
        const chunk = reviewRows.slice(i, i + BATCH_CHUNK_SIZE);
        const batch = writeBatch(db);

        for (const row of chunk) {
          const obsId = `bulk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          const ref = doc(db, 'students', row.studentId, 'observations', obsId);

          let data;
          if (row.type === 'lesson') {
            data = buildLessonDoc({
              studentId: row.studentId,
              classroomId: row.classroomId,
              branchId: row.branchId,
              programId: row.programId,
              lessonTitle: row.content,
              date: row.date,
              currentUser,
              groupId,
            });
          } else {
            data = buildObservationDoc({
              studentId: row.studentId,
              classroomId: row.classroomId,
              branchId: row.branchId,
              text: row.content,
              date: row.date,
              currentUser,
              groupId,
            });
          }

          // Convert Date to Firestore Timestamp
          const firestoreData = {
            ...data,
            observedAt: Timestamp.fromDate(data.observedAt),
            createdAt: Timestamp.fromDate(data.createdAt),
            updatedAt: Timestamp.fromDate(data.updatedAt),
          };

          batch.set(ref, firestoreData);
        }

        await batch.commit();
        imported += chunk.length;
        setUploadProgress({ done: imported, total });
      }
    } catch (err) {
      failed = total - imported;
      notify.error(`Upload failed after ${imported} rows: ${err.message || 'Unknown error'}`);
    }

    setResults({
      imported,
      failed,
      duplicatesAllowed: duplicateCount,
      skipped: matchResults.filter((m) => m.rejected).length,
      total: parsedRows.length,
    });
    setUploading(false);
    setActiveStep(3);
  }, [reviewRows, currentUser, duplicateCount, matchResults, parsedRows, notify]);

  // --- Render ---
  if (!isAdmin) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Access denied. Super admins only.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 2 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step 0: Upload CSV */}
      {activeStep === 0 && (
        <Card>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="h6">Upload CSV File</Typography>
            <Typography variant="body2" color="text.secondary">
              CSV format: <code>type, student_name, date, content</code>. Type must be
              &quot;lesson&quot; or &quot;observation&quot;. Dates can be left empty (defaults to Jan 10, 2026).
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Program (optional)</InputLabel>
                <Select
                  value={selectedProgram}
                  label="Program (optional)"
                  onChange={(e) => { setSelectedProgram(e.target.value); setSelectedClassroom(''); }}
                >
                  <MenuItem value="">None</MenuItem>
                  {programs.map((p) => (
                    <MenuItem key={p.id} value={p.id}>{p.id}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Classroom (optional)</InputLabel>
                <Select
                  value={selectedClassroom}
                  label="Classroom (optional)"
                  onChange={(e) => { setSelectedClassroom(e.target.value); setSelectedProgram(''); }}
                >
                  <MenuItem value="">None</MenuItem>
                  {classrooms.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Button
              variant="outlined"
              component="label"
              startIcon={<CloudUpload />}
              sx={{ alignSelf: 'flex-start' }}
            >
              {fileName || 'Choose CSV File'}
              <input type="file" accept=".csv" hidden onChange={handleFileChange} />
            </Button>

            {parseErrors.length > 0 && (
              <Alert severity="error">
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>CSV Errors:</Typography>
                {parseErrors.slice(0, 10).map((e, i) => (
                  <Typography key={i} variant="body2">{e}</Typography>
                ))}
                {parseErrors.length > 10 && (
                  <Typography variant="body2">...and {parseErrors.length - 10} more</Typography>
                )}
              </Alert>
            )}

            {parsedRows.length > 0 && (
              <>
                <Alert severity="success">{parsedRows.length} rows parsed successfully</Alert>
                <TableContainer component={Paper} sx={{ maxHeight: 250 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Type</TableCell>
                        <TableCell>Student Name</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Content</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {parsedRows.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Chip label={row.type} size="small" color={row.type === 'lesson' ? 'primary' : 'default'} />
                          </TableCell>
                          <TableCell>{row.student_name}</TableCell>
                          <TableCell>{row.date}</TableCell>
                          <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.content}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {parsedRows.length > 10 && (
                  <Typography variant="caption" color="text.secondary">
                    Showing first 10 of {parsedRows.length} rows
                  </Typography>
                )}
                <Button variant="contained" onClick={handleStartMatching} sx={{ alignSelf: 'flex-start' }}>
                  Next: Match Students
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 1: Match Students */}
      {activeStep === 1 && (
        <Card>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="h6">
                Match Students ({matchResults.filter((m) => m.accepted).length}/{matchResults.length} matched)
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DoneAll />}
                onClick={handleAcceptAllHighConfidence}
              >
                Accept All High Confidence
              </Button>
            </Box>

            <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>CSV Name</TableCell>
                    <TableCell>Matched Student</TableCell>
                    <TableCell>Confidence</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {matchResults.map((m, idx) => (
                    <TableRow
                      key={idx}
                      sx={{
                        bgcolor: m.accepted ? 'action.selected' : m.rejected ? 'error.lighter' : 'inherit',
                        opacity: m.rejected ? 0.5 : 1,
                      }}
                    >
                      <TableCell>{m.csvName}</TableCell>
                      <TableCell>
                        {editingIdx === idx ? (
                          <Autocomplete
                            size="small"
                            options={allStudents}
                            getOptionLabel={(s) => s.displayName || `${s.firstName} ${s.lastName}`}
                            onChange={(_, val) => val && handleEditSelect(idx, val)}
                            renderInput={(params) => <TextField {...params} placeholder="Search student..." autoFocus />}
                            sx={{ minWidth: 220 }}
                          />
                        ) : (
                          m.match?.displayName || <em>No match</em>
                        )}
                      </TableCell>
                      <TableCell>
                        <ConfidenceChip confidence={m.confidence} />
                      </TableCell>
                      <TableCell align="right">
                        {!m.rejected && (
                          <>
                            {!m.accepted && (
                              <Tooltip title="Accept match">
                                <IconButton size="small" color="success" onClick={() => handleAccept(idx)} disabled={!m.match}>
                                  <Check />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title="Edit match">
                              <IconButton size="small" onClick={() => setEditingIdx(editingIdx === idx ? -1 : idx)}>
                                <Edit />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        <Tooltip title={m.rejected ? 'Undo reject' : 'Reject (skip rows)'}>
                          <IconButton
                            size="small"
                            color={m.rejected ? 'default' : 'error'}
                            onClick={() => m.rejected ? handleAccept(idx) : handleReject(idx)}
                          >
                            <Close />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="text" onClick={() => setActiveStep(0)}>Back</Button>
              <Button
                variant="contained"
                onClick={handleProceedToReview}
                disabled={!allResolved}
              >
                Next: Review & Upload
              </Button>
            </Box>
            {!allResolved && (
              <Typography variant="caption" color="text.secondary">
                Accept or reject all student matches to proceed.
              </Typography>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Review & Upload */}
      {activeStep === 2 && (
        <Card>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="h6">Review & Upload</Typography>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <StatBox label="Rows to upload" value={reviewRows.length} color="#2196f3" />
              <StatBox label="Matched students" value={matchResults.filter((m) => m.accepted).length} color="#4caf50" />
              <StatBox label="Skipped (rejected)" value={matchResults.filter((m) => m.rejected).length} color="#9e9e9e" />
              {duplicateCount > 0 && (
                <StatBox label="Potential duplicates" value={duplicateCount} color="#ff9800" />
              )}
            </Box>

            {duplicateCount > 0 && (
              <Alert severity="warning">
                {duplicateCount} row{duplicateCount > 1 ? 's' : ''} may duplicate existing records. They will still be uploaded.
              </Alert>
            )}

            {uploading && (
              <Box sx={{ width: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">Uploading...</Typography>
                  <Typography variant="body2">{uploadProgress.done}/{uploadProgress.total}</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={uploadProgress.total ? (uploadProgress.done / uploadProgress.total) * 100 : 0}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="text" onClick={() => setActiveStep(1)} disabled={uploading}>Back</Button>
              <Button
                variant="contained"
                color="primary"
                onClick={handleUpload}
                disabled={uploading || reviewRows.length === 0}
              >
                {uploading ? 'Uploading...' : `Upload ${reviewRows.length} Rows`}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Results */}
      {activeStep === 3 && results && (
        <Card>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {results.failed === 0 ? (
                <CheckCircle color="success" sx={{ fontSize: 32 }} />
              ) : (
                <Warning color="warning" sx={{ fontSize: 32 }} />
              )}
              <Typography variant="h6">
                {results.failed === 0 ? 'Upload Complete' : 'Upload Partially Complete'}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <StatBox label="Imported" value={results.imported} color="#4caf50" />
              {results.failed > 0 && <StatBox label="Failed" value={results.failed} color="#f44336" />}
              {results.duplicatesAllowed > 0 && (
                <StatBox label="Duplicates (allowed)" value={results.duplicatesAllowed} color="#ff9800" />
              )}
              {results.skipped > 0 && (
                <StatBox label="Skipped (rejected names)" value={results.skipped} color="#9e9e9e" />
              )}
            </Box>

            <Button
              variant="outlined"
              onClick={() => {
                setActiveStep(0);
                setFileName('');
                setParsedRows([]);
                setParseErrors([]);
                setMatchResults([]);
                setReviewRows([]);
                setResults(null);
                setSelectedClassroom('');
                setSelectedProgram('');
              }}
            >
              Upload Another CSV
            </Button>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

function ConfidenceChip({ confidence }) {
  const config = {
    [CONFIDENCE.HIGH]: { label: 'High', color: 'success' },
    [CONFIDENCE.MEDIUM]: { label: 'Medium', color: 'warning' },
    [CONFIDENCE.LOW]: { label: 'Low', color: 'error' },
  };
  const c = config[confidence] || config[CONFIDENCE.LOW];
  return <Chip label={c.label} size="small" color={c.color} variant="outlined" />;
}

function StatBox({ label, value, color }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: color + '12', minWidth: 100, textAlign: 'center' }}>
      <Typography variant="h5" sx={{ color, fontWeight: 700 }}>{value}</Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{label}</Typography>
    </Box>
  );
}
