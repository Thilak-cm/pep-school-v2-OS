import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  LinearProgress, MenuItem, Select, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, Tabs, Tab, TextField, Tooltip, Typography,
} from '@mui/material';
import { Check, CheckCheck, HelpCircle, Pencil, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  collection, documentId, getDocs, query, where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { db, cloudFunctions, storage } from '../firebase';
import {
  parseAssessmentMatrix,
  worksheetToAssessmentMatrix,
} from '../../../functions/assessments/parser.js';
import { CONFIDENCE, matchStudentNames } from './BulkUploadPage.helpers.js';
import useNotify from '../notifications/useNotify.js';

const MAX_STRUCTURED_BYTES = 10 * 1024 * 1024;
const MAX_MEDICAL_BYTES = 25 * 1024 * 1024;
const QUERY_BATCH_SIZE = 30;
const STRUCTURED_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const TEMPLATE_ROWS = [
  ['Assessment Name', '[Enter assessment name]'],
  ['Assessment Description', '[Enter assessment description]'],
  ['Date', 'dd/mm/yyyy'],
  ['Result 1', '[Enter Result 1 description]'],
  ['Result 2', '[Enter Result 2 description]'],
  ['', ''],
  ['Name', 'Result 1', 'Result 2'],
  ['[Student name 1]', '[Result 1 value]', '[Result 2 value]'],
  ['[Student name 2]', '[Result 1 value]', '[Result 2 value]'],
];

function chunks(values, size = QUERY_BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function downloadTemplate() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(TEMPLATE_ROWS),
    'Assessment',
  );
  XLSX.writeFile(workbook, 'assessment-template.xlsx');
}

function formatDateRange(dateRange) {
  if (!dateRange?.startDate) return 'Date unavailable';
  return dateRange.startDate === dateRange.endDate
    ? dateRange.startDate
    : `${dateRange.startDate} – ${dateRange.endDate}`;
}

function formatUploadDate(value) {
  const parsed = new Date(value || '');
  return Number.isNaN(parsed.getTime())
    ? 'Upload date unavailable'
    : parsed.toLocaleDateString();
}

function callableErrors(error) {
  const errors = error?.details?.errors;
  if (Array.isArray(errors) && errors.length) return errors;
  return [{
    code: 'PUBLICATION_ERROR',
    message: error?.message || 'Assessment could not be published.',
  }];
}

function uploadWithProgress(path, file, onProgress, contentType) {
  const task = uploadBytesResumable(storageRef(storage, path), file, {
    contentType,
  });
  return new Promise((resolve, reject) => {
    task.on('state_changed', (snapshot) => {
      const progress = snapshot.totalBytes
        ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
        : 0;
      onProgress(progress);
    }, reject, resolve);
  });
}

export default function AssessmentUploadPage({
  currentUser,
  userRole,
  manageableClassrooms = [],
}) {
  const notify = useNotify();
  const inputRef = useRef(null);
  const notifiedAssessmentRef = useRef('');
  const [tab, setTab] = useState(0);
  const [students, setStudents] = useState([]);
  const [studentLoadError, setStudentLoadError] = useState('');

  const [file, setFile] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [workbook, setWorkbook] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [publicationErrors, setPublicationErrors] = useState([]);
  const [selectedSheetBlob, setSelectedSheetBlob] = useState(null);
  const [structuredProgress, setStructuredProgress] = useState(0);
  const [matchResults, setMatchResults] = useState([]);
  const [editingMatch, setEditingMatch] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState(null);

  const [medicalFile, setMedicalFile] = useState(null);
  const [medicalStudentId, setMedicalStudentId] = useState('');
  const [medicalStudentSearch, setMedicalStudentSearch] = useState('');
  const [medicalName, setMedicalName] = useState('');
  const [medicalDate, setMedicalDate] = useState('');
  const [medicalDescription, setMedicalDescription] = useState('');
  const [medicalProgress, setMedicalProgress] = useState(0);
  const [medicalError, setMedicalError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadAuthorizedStudents() {
      if (!currentUser?.uid) return;
      setStudentLoadError('');
      try {
        let classroomDocs = [];
        if (userRole === 'teacher') {
          const snapshot = await getDocs(query(
            collection(db, 'classrooms'),
            where('teacherIds', 'array-contains', currentUser.uid),
          ));
          classroomDocs = snapshot.docs;
        } else if (userRole === 'classroomadmin') {
          const snapshots = await Promise.all(chunks(manageableClassrooms).map((ids) => (
            getDocs(query(collection(db, 'classrooms'), where(documentId(), 'in', ids)))
          )));
          classroomDocs = snapshots.flatMap((snapshot) => snapshot.docs);
        } else if (userRole === 'superadmin') {
          const snapshot = await getDocs(collection(db, 'classrooms'));
          classroomDocs = snapshot.docs;
        }

        const classrooms = classroomDocs
          .map((classroomDoc) => ({id: classroomDoc.id, ...classroomDoc.data()}))
          .filter((classroom) => (classroom.status || 'active') === 'active');
        const classroomIds = classrooms.map((classroom) => classroom.id);
        const classroomNames = new Map(classrooms.map((classroom) => [
          classroom.id,
          classroom.name || classroom.displayName || classroom.id,
        ]));
        let studentDocs = [];
        if (userRole === 'superadmin') {
          const snapshot = await getDocs(query(
            collection(db, 'students'),
            where('status', '==', 'active'),
          ));
          studentDocs = snapshot.docs;
        } else if (classroomIds.length) {
          const snapshots = await Promise.all(chunks(classroomIds).map((ids) => (
            getDocs(query(collection(db, 'students'), where('classroomId', 'in', ids)))
          )));
          studentDocs = snapshots.flatMap((snapshot) => snapshot.docs);
        }
        if (!active) return;
        setStudents(studentDocs
          .map((studentDoc) => ({id: studentDoc.id, ...studentDoc.data()}))
          .filter((student) => (student.status || 'active') === 'active')
          .map((student) => ({
            ...student,
            classroomName: classroomNames.get(student.classroomId) || student.classroomId,
          })));
      } catch (error) {
        if (active) {
          setStudents([]);
          setStudentLoadError(error?.message || 'Authorized students could not be loaded.');
        }
      }
    }
    loadAuthorizedStudents();
    return () => { active = false; };
  }, [currentUser?.uid, userRole, manageableClassrooms]);

  useEffect(() => {
    if (!workbook || !sheetName) return;
    const worksheet = workbook.Sheets[sheetName];
    const matrix = worksheetToAssessmentMatrix(worksheet, XLSX);
    const nextParsed = parseAssessmentMatrix(matrix, {worksheetName: sheetName});
    setParsed(nextParsed);
    setPublicationErrors([]);
    const selectedOnly = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(selectedOnly, worksheet, sheetName);
    const selectedBytes = XLSX.write(selectedOnly, {
      bookType: 'xlsx',
      type: 'array',
      cellStyles: true,
    });
    const blob = new Blob([selectedBytes], {type: STRUCTURED_CONTENT_TYPE});
    if (blob.size > MAX_STRUCTURED_BYTES) {
      setSelectedSheetBlob(null);
      setPublicationErrors([{
        code: 'FILE_SIZE',
        message: 'The selected standalone worksheet is larger than 10 MB. Reduce it and try again.',
      }]);
      return;
    }
    setSelectedSheetBlob(blob);
  }, [workbook, sheetName]);

  useEffect(() => {
    if (!parsed || parsed.errors.length || !parsed.rows.length || !students.length) {
      setMatchResults([]);
      return;
    }
    const names = [...new Set(parsed.rows.map((row) => row.name))];
    setMatchResults(matchStudentNames(names, students, {
      requireUniqueBest: true,
    }).map((match) => ({...match, accepted: false})));
    const assessmentName = String(parsed.metadata.assessmentName || '').trim();
    if (assessmentName && notifiedAssessmentRef.current !== assessmentName) {
      notifiedAssessmentRef.current = assessmentName;
      notify.success(`${assessmentName} is ready for student matching`);
    }
  }, [parsed, students, notify]);

  const duplicateMappings = useMemo(() => {
    const rowsByStudent = new Map();
    matchResults.filter((match) => match.accepted && match.match).forEach((match) => {
      if (!rowsByStudent.has(match.match.id)) rowsByStudent.set(match.match.id, []);
      rowsByStudent.get(match.match.id).push(match.csvName);
    });
    return [...rowsByStudent.entries()]
      .filter(([, sourceNames]) => sourceNames.length > 1)
      .map(([studentId, sourceNames]) => ({studentId, sourceNames}));
  }, [matchResults]);

  const allMatchesResolved = matchResults.length > 0 && matchResults.every((match) => (
    match.accepted && match.match
  ));
  const finalReviewReady = Boolean(
    parsed &&
    parsed.rows.length &&
    !parsed.errors.length &&
    selectedSheetBlob &&
    allMatchesResolved &&
    !duplicateMappings.length,
  );
  const confirmedStudentCount = new Set(
    matchResults.filter((match) => match.accepted && match.match)
      .map((match) => match.match.id),
  ).size;
  const sourceRowCount = new Set((parsed?.rows || []).map((row) => row.sourceRow)).size;
  const multilineSplitCount = Math.max(0, (parsed?.rows?.length || 0) - sourceRowCount);

  const handleFile = async (event) => {
    const selected = event.target.files?.[0] || null;
    setFile(null);
    setWorkbook(null);
    setParsed(null);
    setPublicationErrors([]);
    setMatchResults([]);
    setSelectedSheetBlob(null);
    setStructuredProgress(0);
    if (!selected) return;
    const extension = selected.name.toLowerCase().split('.').pop();
    if (!['csv', 'xlsx'].includes(extension)) {
      setParsed({
        errors: [{
          code: 'FILE_TYPE',
          message: 'Upload a structured assessment document in CSV or XLSX format.',
        }],
        rows: [],
      });
      notify.error('Please upload a structured assessment document in CSV or XLSX format.');
      return;
    }
    if (selected.size > MAX_STRUCTURED_BYTES) {
      setParsed({
        errors: [{
          code: 'FILE_VALIDATION',
          message: 'This structured assessment document is too large to upload.',
        }],
        rows: [],
      });
      notify.error('This structured assessment document is too large to upload.');
      return;
    }
    setFile(selected);
    try {
      const bytes = await selected.arrayBuffer();
      const nextWorkbook = XLSX.read(bytes, {
        type: 'array',
        cellFormula: true,
        cellNF: true,
        cellText: true,
      });
      setWorkbook(nextWorkbook);
      setSheetName(nextWorkbook.SheetNames[0] || '');
    } catch {
      setParsed({
        errors: [{
          code: 'INVALID_WORKBOOK',
          message: 'This file could not be read. Recalculate and save it, then try again.',
        }],
        rows: [],
      });
      notify.error('The structured assessment file could not be read.');
    }
  };

  const acceptMatch = (csvName) => {
    setMatchResults((current) => current.map((entry) => (
      entry.csvName === csvName && entry.match
        ? {...entry, accepted: true}
        : entry
    )));
  };

  const acceptAllHighConfidence = () => {
    setMatchResults((current) => current.map((entry) => (
      entry.confidence === CONFIDENCE.HIGH && entry.match && !entry.ambiguous
        ? {...entry, accepted: true}
        : entry
    )));
  };

  const publishStructured = async ({skipDuplicateCheck = false} = {}) => {
    if (!finalReviewReady || !file || !selectedSheetBlob || publishing) return;
    setPublishing(true);
    setPublicationErrors([]);
    setStructuredProgress(0);
    let pendingUpload = null;
    let publicationStarted = false;
    try {
      if (!skipDuplicateCheck) {
        const checkDuplicate = httpsCallable(
          cloudFunctions,
          'findStructuredAssessmentDuplicate',
        );
        const duplicateResult = await checkDuplicate({fileName: file.name});
        if (duplicateResult.data?.duplicate) {
          setDuplicateSource(duplicateResult.data.duplicate);
          return;
        }
      }
      const mappings = matchResults.map((match) => ({
        sourceName: match.csvName,
        studentId: match.match.id,
      }));
      const createUpload = httpsCallable(
        cloudFunctions,
        'createStructuredAssessmentUpload',
      );
      const created = await createUpload({
        originalFilename: file.name,
        contentType: STRUCTURED_CONTENT_TYPE,
        sizeBytes: selectedSheetBlob.size,
      });
      pendingUpload = created.data;
      await uploadWithProgress(
        pendingUpload.storagePath,
        selectedSheetBlob,
        setStructuredProgress,
        STRUCTURED_CONTENT_TYPE,
      );
      const publishAssessment = httpsCallable(
        cloudFunctions,
        'publishStructuredAssessment',
        {timeout: 120000},
      );
      publicationStarted = true;
      const result = await publishAssessment({
        mappings,
        uploadId: pendingUpload.uploadId,
      });
      const recordCount = Number(result.data?.recordCount || 0);
      notify.success(`Published ${recordCount} assessment record${recordCount === 1 ? '' : 's'}.`);
      if (result.data?.cleanupDeferred) {
        notify.warning('The assessment is published. Temporary-file cleanup is queued for automatic retry.');
      }
      setFile(null);
      setWorkbook(null);
      setParsed(null);
      setMatchResults([]);
      setSelectedSheetBlob(null);
      setStructuredProgress(0);
      setDuplicateSource(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (error) {
      let cleanupError = null;
      if (pendingUpload?.uploadId && !publicationStarted) {
        try {
          const cancelUpload = httpsCallable(
            cloudFunctions,
            'cancelStructuredAssessmentUpload',
          );
          await cancelUpload({uploadId: pendingUpload.uploadId});
        } catch (failure) {
          cleanupError = failure;
        }
      }
      const errors = callableErrors(error);
      if (cleanupError) {
        errors.push({
          code: 'CLEANUP_DEFERRED',
          message: cleanupError?.message || 'File cleanup was queued for retry.',
        });
      }
      setPublicationErrors(errors);
      notify.error(errors[0]?.message || 'Assessment could not be published.');
    } finally {
      setPublishing(false);
    }
  };

  const handleMedicalFile = (event) => {
    const selected = event.target.files?.[0] || null;
    setMedicalError('');
    setMedicalProgress(0);
    if (!selected) {
      setMedicalFile(null);
      return;
    }
    if (selected.size > MAX_MEDICAL_BYTES) {
      setMedicalFile(null);
      notify.error('This PDF is too large to upload.');
      return;
    }
    if (selected.type !== 'application/pdf' ||
        !selected.name.toLowerCase().endsWith('.pdf')) {
      setMedicalFile(null);
      setMedicalError('Choose a PDF file.');
      return;
    }
    setMedicalFile(selected);
    setMedicalName(selected.name.replace(/\.pdf$/i, ''));
  };

  const publishMedical = async () => {
    if (!medicalFile || !medicalStudentId || !medicalName.trim() ||
        !medicalDate || publishing) return;
    setPublishing(true);
    setMedicalError('');
    setMedicalProgress(0);
    let pendingUpload = null;
    try {
      const createUpload = httpsCallable(
        cloudFunctions,
        'createMedicalAssessmentUpload',
      );
      const created = await createUpload({
        studentId: medicalStudentId,
        assessmentName: medicalName,
        assessmentDescription: medicalDescription,
        assessmentDate: medicalDate,
        originalFilename: medicalFile.name,
        contentType: medicalFile.type,
        sizeBytes: medicalFile.size,
      });
      pendingUpload = created.data;
      await uploadWithProgress(
        pendingUpload.storagePath,
        medicalFile,
        setMedicalProgress,
        'application/pdf',
      );
      const finalizeUpload = httpsCallable(
        cloudFunctions,
        'finalizeMedicalAssessmentUpload',
      );
      await finalizeUpload({
        uploadId: pendingUpload.uploadId,
      });
      notify.success('Published one medical assessment record.');
      setMedicalFile(null);
      setMedicalName('');
      setMedicalDate('');
      setMedicalDescription('');
      setMedicalProgress(0);
    } catch (error) {
      let cleanupMessage = '';
      if (pendingUpload?.uploadId) {
        const cancelUpload = httpsCallable(
          cloudFunctions,
          'cancelMedicalAssessmentUpload',
        );
        try {
          await cancelUpload({
            uploadId: pendingUpload.uploadId,
          });
        } catch (cleanupFailure) {
          cleanupMessage = cleanupFailure?.message ||
            'The upload failed and file cleanup was queued for retry.';
        }
      }
      const message = error?.message || 'Medical assessment could not be uploaded.';
      setMedicalError(cleanupMessage ? `${message} ${cleanupMessage}` : message);
      notify.error(message);
    } finally {
      setPublishing(false);
    }
  };

  const renderErrors = (errors) => errors.map((error, index) => (
    <Alert severity="error" key={`${error.code || 'error'}-${error.row || 0}-${index}`}>
      <Typography variant="body2" sx={{fontWeight: 650}}>{error.message}</Typography>
      {(error.row || error.cell) && (
        <Typography variant="caption">
          {sheetName ? `Worksheet: ${sheetName}. ` : ''}
          {error.row ? `Row ${error.row}. ` : ''}
          {error.cell ? `Cell ${error.cell}.` : ''}
        </Typography>
      )}
    </Alert>
  ));

  return (
    <Box sx={{maxWidth: 760, mx: 'auto', width: '100%', py: 2}}>
      <Card>
        <CardContent>
          <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{mb: 2}}>
            <Tab label="Structured" />
            <Tab label="Medical" />
          </Tabs>
          {studentLoadError && <Alert severity="error" sx={{mb: 2}}>{studentLoadError}</Alert>}

          {tab === 1 ? (
            <Stack spacing={2}>
              <Typography variant="h6">Medical assessment</Typography>
              <Typography color="text.secondary">
                Upload one PDF for one student. The record becomes visible only after the upload completes.
              </Typography>
              <Autocomplete
                options={students}
                value={students.find((student) => student.id === medicalStudentId) || null}
                inputValue={medicalStudentSearch}
                onInputChange={(_, value) => setMedicalStudentSearch(value)}
                onChange={(_, value) => setMedicalStudentId(value?.id || '')}
                getOptionLabel={(student) => `${student.displayName || student.name || student.id} (${student.classroomName})`}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => <TextField {...params} label="Student" placeholder="Search active students" />}
                noOptionsText="No active students in your authorized classrooms"
              />
              <Button variant="outlined" startIcon={<Upload size={18} />} component="label">
                {medicalFile ? medicalFile.name : 'Choose PDF'}
                <input hidden type="file" accept="application/pdf,.pdf" onChange={handleMedicalFile} />
              </Button>
              <TextField required label="Report name" value={medicalName} onChange={(event) => setMedicalName(event.target.value)} />
              <TextField required type="date" label="Report date" value={medicalDate} onChange={(event) => setMedicalDate(event.target.value)} InputLabelProps={{shrink: true}} />
              <TextField label="Description (optional)" value={medicalDescription} onChange={(event) => setMedicalDescription(event.target.value)} multiline minRows={2} />
              {publishing && medicalProgress > 0 && (
                <Box>
                  <LinearProgress variant="determinate" value={medicalProgress} />
                  <Typography variant="caption" color="text.secondary">Uploading PDF: {medicalProgress}%</Typography>
                </Box>
              )}
              {medicalError && <Alert severity="error">{medicalError}</Alert>}
              <Button
                variant="contained"
                disabled={!medicalFile || !medicalStudentId || !medicalName.trim() || !medicalDate || publishing}
                onClick={publishMedical}
              >
                {publishing ? (medicalProgress ? `Uploading ${medicalProgress}%` : 'Preparing upload…') : 'Publish medical assessment'}
              </Button>
            </Stack>
          ) : (
            <>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{mb: 1}}>
                <Typography variant="h6">Structured assessment</Typography>
                <IconButton onClick={() => setShowHelp((value) => !value)} aria-label="Assessment file tutorial">
                  <HelpCircle size={19} />
                </IconButton>
              </Stack>
              {showHelp && (
                <Alert severity="info" sx={{mb: 2}}>
                  Put Assessment Name, Assessment Description, Date, and contiguous Result definitions first. Leave a blank row, then add Name and every declared Result column. Aligned multiline example: <code>12 mins{String.raw`\n`}14 mins</code> and <code>Independent{String.raw`\n`}Prompted</code> create two records. Blank lines count as alignment positions; formula cells must have cached results.
                  <Button size="small" onClick={downloadTemplate} sx={{display: 'block', mt: 1, px: 0}}>Download XLSX template</Button>
                </Alert>
              )}
              <Typography color="text.secondary" sx={{mb: 2}}>
                Upload a structured assessment document. Nothing is published until every student match is accepted and the final review passes.
              </Typography>
              <Stack spacing={2}>
                <Button variant="outlined" startIcon={<Upload size={18} />} onClick={() => inputRef.current?.click()}>
                  {file ? file.name : 'Upload structured assessment document'}
                </Button>
                <input ref={inputRef} hidden type="file" accept=".csv,.xlsx" onChange={handleFile} />
                {workbook?.SheetNames?.length > 1 && (
                  <Select value={sheetName} onChange={(event) => setSheetName(event.target.value)} size="small">
                    {workbook.SheetNames.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                  </Select>
                )}
                {renderErrors([...(parsed?.errors || []), ...publicationErrors])}
                {publishing && structuredProgress > 0 && (
                  <Box>
                    <LinearProgress variant="determinate" value={structuredProgress} />
                    <Typography variant="caption" color="text.secondary">
                      Uploading selected worksheet: {structuredProgress}%
                    </Typography>
                  </Box>
                )}

                {matchResults.length > 0 && (
                  <Card variant="outlined" sx={{boxShadow: 'none'}}>
                    <CardContent sx={{'&:last-child': {pb: 2}}}>
                      <Stack direction={{xs: 'column', sm: 'row'}} justifyContent="space-between" gap={1} sx={{mb: 1}}>
                        <Typography variant="subtitle1" sx={{fontWeight: 700}}>
                          Student match review ({matchResults.filter((match) => match.accepted).length}/{matchResults.length})
                        </Typography>
                        <Button size="small" variant="outlined" startIcon={<CheckCheck size={16} />} onClick={acceptAllHighConfidence}>
                          Accept All High Confidence
                        </Button>
                      </Stack>
                      <Box sx={{overflowX: 'auto'}}>
                        <Table size="small">
                          <TableHead><TableRow><TableCell>Source name</TableCell><TableCell>Matched student</TableCell><TableCell>Confidence</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
                          <TableBody>{matchResults.map((match) => {
                            const resolvedName = match.match?.displayName || match.match?.name || 'No unique match';
                            const classroom = match.match?.classroomName || match.match?.classroomId || 'Classroom unavailable';
                            const isEditing = editingMatch === match.csvName;
                            return (
                              <TableRow key={match.csvName} sx={{bgcolor: match.accepted ? 'action.selected' : 'inherit'}}>
                                <TableCell>{match.csvName}</TableCell>
                                <TableCell>
                                  {isEditing ? (
                                    <Autocomplete
                                      size="small"
                                      options={students}
                                      value={match.match || null}
                                      getOptionLabel={(student) => `${student.displayName || student.name || student.id} (${student.classroomName || student.classroomId})`}
                                      isOptionEqualToValue={(option, value) => option.id === value.id}
                                      onChange={(_, candidate) => {
                                        if (!candidate) return;
                                        setMatchResults((current) => current.map((entry) => (
                                          entry.csvName === match.csvName
                                            ? {...entry, match: candidate, confidence: 'manual', ambiguous: false, accepted: true}
                                            : entry
                                        )));
                                        setEditingMatch(null);
                                      }}
                                      renderInput={(params) => <TextField {...params} placeholder="Search authorized students" />}
                                      sx={{minWidth: 240}}
                                    />
                                  ) : (
                                    <>
                                      {resolvedName} {match.match && <Typography component="span" variant="body2" color="text.secondary">({classroom})</Typography>}
                                      {match.candidates?.length > 0 && (
                                        <Box
                                          component="ol"
                                          aria-label={`Ranked match candidates for ${match.csvName}`}
                                          sx={{my: 0.5, pl: 2.5}}
                                        >
                                          {match.candidates.slice(0, 5).map((candidate) => (
                                            <Typography
                                              component="li"
                                              variant="caption"
                                              color="text.secondary"
                                              key={candidate.id}
                                            >
                                              {candidate.displayName || candidate.name || candidate.id}
                                              {' — '}
                                              {candidate.classroomName || candidate.classroomId || 'Classroom unavailable'}
                                            </Typography>
                                          ))}
                                        </Box>
                                      )}
                                    </>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Chip size="small" label={match.ambiguous ? 'Ambiguous' : (match.confidence || 'low')} color={match.accepted ? 'success' : 'default'} />
                                </TableCell>
                                <TableCell align="right">
                                  <Tooltip title={match.accepted ? 'Accepted' : 'Accept match'}>
                                    <span>
                                      <IconButton size="small" color="success" disabled={!match.match || match.accepted} onClick={() => acceptMatch(match.csvName)} aria-label={`Accept match for ${match.csvName}`}>
                                        <Check size={17} />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title="Choose a different student">
                                    <IconButton size="small" onClick={() => setEditingMatch(isEditing ? null : match.csvName)} aria-label={`Edit match for ${match.csvName}`}>
                                      <Pencil size={17} />
                                    </IconButton>
                                  </Tooltip>
                                </TableCell>
                              </TableRow>
                            );
                          })}</TableBody>
                        </Table>
                      </Box>
                    </CardContent>
                  </Card>
                )}

                {duplicateMappings.map((duplicate) => (
                  <Alert severity="error" key={duplicate.studentId}>
                    “{duplicate.sourceNames.join('” and “')}” resolve to the same student. Choose different students or combine repeated events into multiline values in one source row.
                  </Alert>
                ))}

                {parsed?.rows?.length > 0 && (
                  <Card variant="outlined" sx={{boxShadow: 'none'}}>
                    <CardContent>
                      <Typography variant="subtitle1" sx={{fontWeight: 700, mb: 1}}>Final review</Typography>
                      <Stack spacing={0.75}>
                        <Typography><strong>{parsed.metadata.assessmentName}</strong></Typography>
                        <Typography variant="body2">{parsed.metadata.assessmentDescription}</Typography>
                        <Typography variant="body2">Date: {formatDateRange(parsed.metadata.dateRange)}</Typography>
                        <Typography variant="body2">Worksheet: {sheetName}</Typography>
                        <Typography variant="body2">Results: {parsed.resultDefinitions.map((definition) => `${definition.label} — ${definition.description}`).join('; ')}</Typography>
                        <Typography variant="body2">Students confirmed: {confirmedStudentCount}</Typography>
                        <Typography variant="body2">Assessment records: {parsed.rows.length}</Typography>
                        <Typography variant="body2">Additional multiline records: {multilineSplitCount}</Typography>
                        <Typography variant="body2">Original file: {file?.name}</Typography>
                      </Stack>
                      {!allMatchesResolved && <Alert severity="warning" sx={{mt: 1.5}}>Accept or manually correct every student match before publishing.</Alert>}
                    </CardContent>
                  </Card>
                )}
                <Divider />
                <Button variant="contained" disabled={!finalReviewReady || publishing} onClick={() => publishStructured()}>
                  {publishing ? 'Publishing…' : 'Publish assessment'}
                </Button>
              </Stack>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(duplicateSource)} onClose={() => setDuplicateSource(null)}>
        <DialogTitle>Filename used before</DialogTitle>
        <DialogContent>
          <Typography sx={{mb: 1}}>A previously published source has the same normalized filename.</Typography>
          {duplicateSource && (
            <Stack spacing={0.5}>
              <Typography variant="body2">Assessment: {duplicateSource.assessmentName}</Typography>
              <Typography variant="body2">Date: {formatDateRange(duplicateSource.dateRange)}</Typography>
              <Typography variant="body2">Worksheet: {duplicateSource.worksheetName || 'Unavailable'}</Typography>
              <Typography variant="body2">Published: {formatUploadDate(duplicateSource.publishedAt)}</Typography>
              <Typography variant="body2">Uploader: {duplicateSource.uploaderName}</Typography>
              <Typography variant="body2">Students: {duplicateSource.studentCount}</Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDuplicateSource(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => { setDuplicateSource(null); publishStructured({skipDuplicateCheck: true}); }}>Upload anyway</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
