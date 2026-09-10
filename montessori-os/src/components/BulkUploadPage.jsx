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
  Autocomplete,
  TextField,
  LinearProgress,
  Paper,
} from '@mui/material';
import { Upload as CloudUpload, CircleCheck as CheckCircle, TriangleAlert as Warning } from '../icons';
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
  filterStudentPool,
  buildObservationDoc,
  buildLessonDoc,
  checkDuplicates,
  ZONE,
} from './BulkUploadPage.helpers';
import StudentMatchReview from './StudentMatchReview.jsx';
import useNotify from '../notifications/useNotify.js';

const STEPS = ['Upload CSV', 'Match Students', 'Review & Upload', 'Results'];
const BATCH_CHUNK_SIZE = 20;

export default function BulkUploadPage({ currentUser, userRole }) {
  const notify = useNotify();
  const [activeStep, setActiveStep] = useState(0);

  // Step 0: Upload state
  const [fileName, setFileName] = useState('');
  const [rawParsedRows, setRawParsedRows] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [branches, setBranches] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedClassrooms, setSelectedClassrooms] = useState([]);
  const [defaultDate, setDefaultDate] = useState('');

  // Step 1: Matching state
  const [allStudents, setAllStudents] = useState([]);
  const [matchResults, setMatchResults] = useState([]);
  // Manual picks from the review UI, keyed by source name (#285).
  const [manualSelections, setManualSelections] = useState({});

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
        const [classSnap, progSnap, branchSnap] = await Promise.all([
          getDocs(query(collection(db, 'classrooms'), where('status', '==', 'active'))),
          getDocs(collection(db, 'programs')),
          getDocs(collection(db, 'branches')),
        ]);
        setClassrooms(classSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setPrograms(progSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setBranches(branchSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (_err) {
        notify.error('Failed to load classroom filters');
      }
    })();
  }, [isAdmin]);

  // --- Derived: cascading filter options ---
  const availablePrograms = useMemo(() => {
    if (!selectedBranch) return programs;
    const branchClassroomIds = new Set(
      classrooms.filter((c) => c.branchId === selectedBranch).map((c) => c.id),
    );
    return programs.filter((p) => {
      const progClassIds = (p.classrooms || []).map((path) => path.split('/').pop());
      return progClassIds.some((cid) => branchClassroomIds.has(cid));
    });
  }, [selectedBranch, programs, classrooms]);

  const availableClassrooms = useMemo(() => {
    let filtered = classrooms;
    if (selectedBranch) {
      filtered = filtered.filter((c) => c.branchId === selectedBranch);
    }
    if (selectedProgram) {
      const prog = programs.find((p) => p.id === selectedProgram);
      if (prog?.classrooms) {
        const progClassIds = new Set(prog.classrooms.map((path) => path.split('/').pop()));
        filtered = filtered.filter((c) => progClassIds.has(c.id));
      }
    }
    return filtered;
  }, [selectedBranch, selectedProgram, programs, classrooms]);

  const parsedRows = useMemo(
    () => (rawParsedRows.length > 0 ? applyDefaultDate(rawParsedRows, defaultDate) : []),
    [rawParsedRows, defaultDate],
  );

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
        setRawParsedRows([]);
        return;
      }
      const { valid, errors: vErrors } = validateCSV(rows);
      if (!valid) {
        setParseErrors(vErrors);
        setRawParsedRows([]);
        return;
      }
      setRawParsedRows(rows);
      setParseErrors([]);
    };
    reader.readAsText(file);
  }, []);

  // --- Step 0 → 1: Start matching ---
  const handleStartMatching = useCallback(async () => {
    try {
      // Fetch students
      const studentsSnap = await getDocs(
        query(collection(db, 'students'), where('status', '==', 'active'))
      );
      // classroomName feeds the shared review UI's classroom labels.
      const students = studentsSnap.docs.map((d) => {
        const data = { id: d.id, ...d.data() };
        return { ...data, classroomName: classrooms.find((c) => c.id === data.classroomId)?.name || data.classroomId };
      });
      setAllStudents(students);

      const uniqueNames = extractUniqueNames(parsedRows);
      const filter = { programClassroomIds: selectedClassrooms.map((c) => c.id) };

      const matches = matchStudentNames(uniqueNames, students, filter);
      setMatchResults(matches);
      setManualSelections({});
      setActiveStep(1);
      const autoCount = matches.filter((m) => m.zone === ZONE.AUTO).length;
      notify.success(`${autoCount}/${matches.length} students matched automatically from selected classrooms.`);
    } catch (err) {
      notify.error('Failed to load students: ' + (err.message || ''));
    }
  }, [parsedRows, selectedClassrooms, classrooms, notify]);

  // --- Step 1: Match actions ---
  const handleSelectMatch = useCallback((csvName, student) => {
    setManualSelections((current) => ({ ...current, [csvName]: student }));
  }, []);

  // Effective selection per source name: manual pick wins, else the engine's
  // pre-selected best (auto and review zones resolve with zero taps, #285).
  const selections = useMemo(() => {
    const map = {};
    for (const result of matchResults) {
      map[result.csvName] = manualSelections[result.csvName] || result.match || null;
    }
    return map;
  }, [matchResults, manualSelections]);

  // Picker scopes for the shared review component.
  const matchPool = useMemo(
    () => filterStudentPool(allStudents, { programClassroomIds: selectedClassrooms.map((c) => c.id) }),
    [allStudents, selectedClassrooms],
  );

  // Two source names resolving to one student hard-blocks proceeding (#285).
  const duplicateMappings = useMemo(() => {
    const rowsByStudent = new Map();
    for (const result of matchResults) {
      const student = selections[result.csvName];
      if (!student) continue;
      if (!rowsByStudent.has(student.id)) rowsByStudent.set(student.id, []);
      rowsByStudent.get(student.id).push(result.csvName);
    }
    return [...rowsByStudent.entries()]
      .filter(([, sourceNames]) => sourceNames.length > 1)
      .map(([studentId, sourceNames]) => ({ studentId, sourceNames }));
  }, [matchResults, selections]);

  // --- Step 1 → 2: Proceed to review ---
  // All-or-nothing: every source name must resolve to a student (#285 - no
  // reject/skip; an unmatchable name means the sheet needs fixing).
  const allResolved = useMemo(() => (
    matchResults.length > 0 && matchResults.every((m) => selections[m.csvName])
  ), [matchResults, selections]);

  const handleProceedToReview = useCallback(async () => {
    // Build mapping: csvName → studentId + metadata
    const nameMap = new Map();
    for (const m of matchResults) {
      const student = selections[m.csvName];
      if (student) {
        nameMap.set(m.csvName.toLowerCase(), student);
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
      notify.warning('Could not check for duplicates — proceeding without duplicate detection.');
    }

    const flagged = checkDuplicates(mapped, existingObs);
    setReviewRows(flagged);
    setActiveStep(2);
  }, [matchResults, selections, parsedRows, notify]);

  // --- Step 2: Upload ---
  const duplicateCount = useMemo(() => reviewRows.filter((r) => r.isDuplicate).length, [reviewRows]);

  const handleUpload = useCallback(async () => {
    setUploading(true);
    const total = reviewRows.length;
    setUploadProgress({ done: 0, total });

    let imported = 0;
    let failed = 0;

    try {
      // Split into chunks for progress updates
      for (let i = 0; i < total; i += BATCH_CHUNK_SIZE) {
        const chunk = reviewRows.slice(i, i + BATCH_CHUNK_SIZE);
        const batch = writeBatch(db);

        for (const row of chunk) {
          const idPrefix = row.type === 'lesson' ? 'lesson_bulk' : 'obs_bulk';
          const obsId = `${idPrefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
            });
          } else {
            data = buildObservationDoc({
              studentId: row.studentId,
              classroomId: row.classroomId,
              branchId: row.branchId,
              text: row.content,
              date: row.date,
              currentUser,
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

    const resultData = {
      imported,
      failed,
      duplicatesAllowed: duplicateCount,
      total: parsedRows.length,
    };
    setResults(resultData);
    setUploading(false);
    setActiveStep(3);
    if (failed === 0) {
      notify.success(`${imported} rows imported successfully!`);
    } else {
      notify.warning(`${imported} imported, ${failed} failed.`);
    }
  }, [reviewRows, currentUser, duplicateCount, parsedRows, notify]);

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

            <TableContainer component={Paper} variant="outlined" sx={{ maxWidth: 520 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Column</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Values</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell><code>type</code></TableCell>
                    <TableCell><code>lesson</code> or <code>observation</code></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><code>student_name</code></TableCell>
                    <TableCell>Student full name</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><code>date</code></TableCell>
                    <TableCell>DD-MM-YYYY (blank rows use the default date above)</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><code>content</code></TableCell>
                    <TableCell>Lesson name or observation narrative</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Branch</InputLabel>
                <Select
                  value={selectedBranch}
                  label="Branch"
                  onChange={(e) => { setSelectedBranch(e.target.value); setSelectedProgram(''); setSelectedClassrooms([]); }}
                >
                  <MenuItem value="">All branches</MenuItem>
                  {branches.map((b) => (
                    <MenuItem key={b.id} value={b.id}>{b.name || b.id}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Program</InputLabel>
                <Select
                  value={selectedProgram}
                  label="Program"
                  onChange={(e) => { setSelectedProgram(e.target.value); setSelectedClassrooms([]); }}
                >
                  <MenuItem value="">All programs</MenuItem>
                  {availablePrograms.map((p) => (
                    <MenuItem key={p.id} value={p.id}>{p.id}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Autocomplete
                multiple
                size="small"
                options={availableClassrooms}
                getOptionLabel={(c) => c.name || c.id}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                value={selectedClassrooms}
                onChange={(_, newVal) => setSelectedClassrooms(newVal)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Classrooms"
                    placeholder={selectedClassrooms.length === 0 ? 'Select classrooms...' : ''}
                    helperText={selectedClassrooms.length === 0 ? 'Select at least one classroom' : ''}
                  />
                )}
                sx={{ minWidth: 260 }}
              />
              <TextField
                size="small"
                type="date"
                label="Default date"
                value={defaultDate}
                onChange={(e) => setDefaultDate(e.target.value)}
                required
                helperText={defaultDate ? 'Used when CSV rows have no date' : 'Required - select a date'}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ minWidth: 170 }}
              />
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
                <Button
                  variant="contained"
                  onClick={handleStartMatching}
                  disabled={selectedClassrooms.length === 0 || !defaultDate}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Next: Match Students
                </Button>
                {(selectedClassrooms.length === 0 || !defaultDate) && (
                  <Typography variant="caption" color="text.secondary">
                    {selectedClassrooms.length === 0 && !defaultDate
                      ? 'Select at least one classroom and a default date to proceed.'
                      : selectedClassrooms.length === 0
                        ? 'Select at least one classroom to proceed.'
                        : 'Select a default date to proceed.'}
                  </Typography>
                )}
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
                Match Students ({matchResults.filter((m) => selections[m.csvName]).length}/{matchResults.length} matched)
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">Classrooms:</Typography>
              {selectedClassrooms.map((c) => (
                <Chip key={c.id} label={c.name || c.id} size="small" variant="outlined" />
              ))}
            </Box>

            <StudentMatchReview
              matches={matchResults}
              selections={selections}
              onSelect={handleSelectMatch}
              pool={matchPool}
              fullPool={allStudents}
            />

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="text" onClick={() => setActiveStep(0)}>Back</Button>
              <Button
                variant="contained"
                onClick={handleProceedToReview}
                disabled={!allResolved || duplicateMappings.length > 0}
              >
                Next: Review & Upload
              </Button>
            </Box>
            {!allResolved && (
              <Typography variant="caption" color="text.secondary">
                Match every name to a student to proceed. Remove names that no longer belong to an active student from the CSV and re-upload.
              </Typography>
            )}
            {duplicateMappings.length > 0 && (
              <Typography variant="caption" color="error">
                Two names are matched to the same student. Fix the highlighted rows to proceed.
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
              {/* hex required — StatBox uses hex-alpha concatenation (color + '12') */}
              <StatBox label="Rows to upload" value={reviewRows.length} color="#2196f3" />
              <StatBox label="Matched students" value={matchResults.filter((m) => selections[m.csvName]).length} color="#4caf50" />
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
                <CheckCircle style={{ color: 'var(--color-success)' }} size={32} />
              ) : (
                <Warning style={{ color: 'var(--color-warning)' }} size={32} />
              )}
              <Typography variant="h6">
                {results.failed === 0 ? 'Upload Complete' : 'Upload Partially Complete'}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {/* hex required — StatBox uses hex-alpha concatenation (color + '12') */}
              <StatBox label="Imported" value={results.imported} color="#4caf50" />
              {results.failed > 0 && <StatBox label="Failed" value={results.failed} color="#f44336" />}
              {results.duplicatesAllowed > 0 && (
                <StatBox label="Duplicates (allowed)" value={results.duplicatesAllowed} color="#ff9800" />
              )}
            </Box>

            <Button
              variant="outlined"
              onClick={() => {
                setActiveStep(0);
                setFileName('');
                setRawParsedRows([]);
                setParseErrors([]);
                setMatchResults([]);
                setManualSelections({});
                setReviewRows([]);
                setResults(null);
                setSelectedBranch('');
                setSelectedProgram('');
                setSelectedClassrooms([]);
                setDefaultDate('');
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

function StatBox({ label, value, color }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: color + '12', minWidth: 100, textAlign: 'center' }}>
      <Typography variant="h5" sx={{ color, fontWeight: 700 }}>{value}</Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{label}</Typography>
    </Box>
  );
}
