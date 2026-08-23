import React, { useEffect, useRef, useState } from 'react';
import { Alert, Autocomplete, Box, Button, Card, CardContent, Divider, IconButton, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tabs, Tab, TextField, Typography } from '@mui/material';
import { Check, HelpCircle, Pencil, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';
import { parseAssessmentMatrix } from '../../../functions/assessments/parser.js';
import { matchStudentNames } from './BulkUploadPage.helpers.js';
import useNotify from '../notifications/useNotify.js';

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
  ['[Student name 3]', '[Result 1 value]', '[Result 2 value]'],
];

function downloadTemplate() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(TEMPLATE_ROWS), 'Assessment');
  XLSX.writeFile(workbook, 'assessment-template.xlsx');
}

export default function AssessmentUploadPage({ currentUser, userRole, manageableClassrooms = [] }) {
  const notify = useNotify();
  const inputRef = useRef(null);
  const notifiedAssessmentRef = useRef('');
  const [file, setFile] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [description, setDescription] = useState('');
  const [workbook, setWorkbook] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [students, setStudents] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const [selectedSheetBase64, setSelectedSheetBase64] = useState('');
  const [matchResults, setMatchResults] = useState([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
  const [tab, setTab] = useState(0);
  const [medicalFile, setMedicalFile] = useState(null);
  const [medicalStudentId, setMedicalStudentId] = useState('');
  const [medicalStudentSearch, setMedicalStudentSearch] = useState('');
  const [medicalNote, setMedicalNote] = useState('');

  useEffect(() => {
    let active = true;
    async function loadAuthorizedStudents() {
      if (!currentUser?.uid) return;
      try {
        const classroomsQuery = userRole === 'teacher'
          ? query(collection(db, 'classrooms'), where('teacherIds', 'array-contains', currentUser.uid))
          : collection(db, 'classrooms');
        const classroomSnapshot = await getDocs(classroomsQuery);
        const classrooms = classroomSnapshot.docs
          .map((doc) => ({id: doc.id, ...doc.data()}))
          .filter((classroom) => userRole === 'superadmin' || userRole === 'teacher' || manageableClassrooms.includes(classroom.id));
        const classroomIds = new Set(classrooms.map((classroom) => classroom.id));
        const classroomNames = new Map(classrooms.map((classroom) => [classroom.id, classroom.name || classroom.displayName || classroom.id]));
        const studentSnapshot = await getDocs(collection(db, 'students'));
        if (active) setStudents(studentSnapshot.docs
          .map((doc) => ({id: doc.id, ...doc.data()}))
          .filter((student) => classroomIds.has(student.classroomId) && (!student.status || student.status === 'active'))
          .map((student) => ({...student, classroomName: classroomNames.get(student.classroomId) || student.classroomId})));
      } catch {
        if (active) setStudents([]);
      }
    }
    loadAuthorizedStudents();
    return () => { active = false; };
  }, [currentUser?.uid, userRole, manageableClassrooms]);
  useEffect(() => {
    if (!workbook || !sheetName) return;
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {header: 1, raw: false, defval: ''});
    setParsed(parseAssessmentMatrix(matrix, {worksheetName: sheetName}));
    const selectedOnly = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(selectedOnly, workbook.Sheets[sheetName], sheetName);
    setSelectedSheetBase64(XLSX.write(selectedOnly, {bookType: 'xlsx', type: 'base64'}));
  }, [workbook, sheetName]);
  useEffect(() => {
    if (!parsed || parsed.errors.length || !parsed.rows.length || !students.length) {
      setMatchResults([]);
      setReviewOpen(false);
      return;
    }
    const names = [...new Set(parsed.rows.map((row) => row.name))];
    setMatchResults(matchStudentNames(names, students));
    setReviewOpen(true);
    const assessmentName = String(parsed.metadata.assessmentName || '').trim();
    if (assessmentName && notifiedAssessmentRef.current !== assessmentName) {
      notifiedAssessmentRef.current = assessmentName;
      notify.success(`${assessmentName} is ready for review`);
    }
  }, [parsed, students, notify]);

  const handleFile = async (event) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected); setParsed(null);
    if (!selected) return;
    try {
      const bytes = await selected.arrayBuffer();
      const nextWorkbook = XLSX.read(bytes, {type: 'array', cellFormula: true, cellNF: true});
      setWorkbook(nextWorkbook); setSheetName(nextWorkbook.SheetNames[0] || '');
    } catch { setParsed({errors: [{message: 'This file could not be read. Recalculate and save it, then try again.'}], rows: []}); }
  };

  const publish = async () => {
    if (!parsed || parsed.errors.length || !parsed.rows.length || publishing) return;
    setPublishing(true);
    try {
      const byName = new Map(matchResults.map((match) => [match.csvName, match]));
      const rows = parsed.rows.map((row) => {
        const match = byName.get(row.name);
        if (!match?.match || match.confidence === 'low') throw new Error(`Resolve the student match for “${row.name}” before publishing.`);
        return {...row, studentId: match.match.id, classroomId: match.match.classroomId, branchId: match.match.branchId};
      });
      const call = httpsCallable(cloudFunctions, 'publishStructuredAssessment', {timeout: 120000});
      const result = await call({metadata: parsed.metadata, resultDefinitions: parsed.resultDefinitions, rows, fileName: file.name, worksheetName: sheetName, selectedSheetBase64});
      const recordCount = Number(result.data?.recordCount || 0);
      notify.success(`Published ${recordCount === 1 ? 'one assessment record' : `${recordCount} assessment records`}.`);
    } catch (error) { setParsed((current) => ({...current, errors: [{message: error.message || 'Assessment could not be published.'}, ...(current?.errors || [])]})); }
    finally { setPublishing(false); }
  };

  const publishMedical = async () => {
    if (!medicalFile || !medicalStudentId || publishing) return;
    setPublishing(true);
    try {
      const bytes = await medicalFile.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
      const call = httpsCallable(cloudFunctions, 'publishMedicalAssessment', {timeout: 120000});
      await call({studentId: medicalStudentId, fileName: medicalFile.name, fileBase64: base64, note: medicalNote});
      notify.success('Published one medical assessment record.');
      setMedicalFile(null); setMedicalNote('');
    } catch (error) { notify.error(error.message || 'Medical assessment could not be published.'); }
    finally { setPublishing(false); }
  };

  return (
    <Box sx={{maxWidth: 720, mx: 'auto', width: '100%', py: 2}}>
      <Card>
        <CardContent>
          <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{mb: 2}}><Tab label="Structured" /><Tab label="Medical" /></Tabs>
          {tab === 1 ? <Stack spacing={2}>
            <Typography variant="h6">Medical assessment</Typography>
            <Typography color="text.secondary">Upload one PDF for one student. It will be processed in the background.</Typography>
            <Autocomplete
              options={students}
              value={students.find((student) => student.id === medicalStudentId) || null}
              inputValue={medicalStudentSearch}
              onInputChange={(_, value) => setMedicalStudentSearch(value)}
              onChange={(_, value) => setMedicalStudentId(value?.id || '')}
              getOptionLabel={(student) => `${student.displayName || student.name || student.id} (${student.classroomName})`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderInput={(params) => <TextField {...params} label="Search students" placeholder="Type a student name" />}
              noOptionsText="No active students in your classroom scope"
            />
            <Button variant="outlined" startIcon={<Upload size={18} />} component="label">{medicalFile ? medicalFile.name : 'Choose PDF'}<input hidden type="file" accept="application/pdf,.pdf" onChange={(event) => setMedicalFile(event.target.files?.[0] || null)} /></Button>
            <TextField label="Optional upload note" value={medicalNote} onChange={(event) => setMedicalNote(event.target.value)} multiline minRows={2} />
            <Button variant="contained" disabled={!medicalFile || !medicalStudentId || publishing} onClick={publishMedical}>{publishing ? 'Publishing…' : 'Publish medical assessment'}</Button>
          </Stack> : <>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{mb: 1}}>
            <Typography variant="h6">Structured assessment</Typography>
            <IconButton onClick={() => setShowHelp((value) => !value)} aria-label="Assessment file tutorial"><HelpCircle size={19} /></IconButton>
          </Stack>
          {showHelp && <Alert severity="info" sx={{mb: 2}}>Put the metadata key/value rows first, leave one blank row, then add Name and the declared Result columns. Values are kept exactly as entered; each aligned nonblank line becomes one record.<Button size="small" onClick={downloadTemplate} sx={{display: 'block', mt: 1, px: 0}}>Download upload template</Button></Alert>}
          <Typography color="text.secondary" sx={{mb: 2}}>Upload a CSV or XLSX workbook. You’ll review student matches and results before anything is published.</Typography>
          <Stack spacing={2}>
            <Button variant="outlined" startIcon={<Upload size={18} />} onClick={() => inputRef.current?.click()}>
              {file ? file.name : 'Choose CSV or XLSX'}
            </Button>
            <input ref={inputRef} hidden type="file" accept=".csv,.xlsx" onChange={handleFile} />
            {workbook?.SheetNames?.length > 1 && <Select value={sheetName} onChange={(event) => setSheetName(event.target.value)} size="small">{workbook.SheetNames.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}</Select>}
            {parsed?.errors?.map((error, index) => <Alert severity="error" key={`${error.code || 'error'}-${index}`}>{error.message}</Alert>)}
            {reviewOpen && <Card variant="outlined" sx={{boxShadow: 'none'}}><CardContent sx={{'&:last-child': {pb: 2}}}>
              <Typography variant="subtitle1" sx={{fontWeight: 700, mb: 1}}>Student match review</Typography>
              <Table size="small"><TableHead><TableRow><TableCell>Uploaded name</TableCell><TableCell>Matched student</TableCell><TableCell>Confidence</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{matchResults.map((match) => {
                const resolvedName = match.match?.displayName || match.match?.name || 'No match';
                const classroom = match.match?.classroomName || match.match?.classroomId || 'Classroom unavailable';
                const isEditing = editingMatch === match.csvName;
                return <TableRow key={match.csvName}><TableCell>{match.csvName}</TableCell><TableCell>{isEditing ? <Select size="small" fullWidth value={match.match?.id || ''} onChange={(event) => {
                    const candidate = students.find((student) => student.id === event.target.value);
                    if (!candidate) return;
                    setMatchResults((current) => current.map((entry) => entry.csvName === match.csvName ? {...entry, match: candidate, confidence: 'manual'} : entry));
                    setEditingMatch(null);
                  }} sx={{mt: 1, backgroundColor: 'white'}}>
                    {[...(match.candidates || []), ...students.filter((student) => !(match.candidates || []).some((candidate) => candidate.id === student.id))].map((candidate) => <MenuItem key={candidate.id} value={candidate.id}>{candidate.displayName || candidate.name || candidate.id} ({candidate.classroomName || candidate.classroomId || 'Classroom unavailable'})</MenuItem>)}
                  </Select> : <>{resolvedName} <Typography component="span" variant="body2" color="text.secondary">({classroom})</Typography></>}</TableCell><TableCell><Typography variant="body2" sx={{textTransform: 'capitalize'}}>{match.confidence || 'low'}</Typography></TableCell><TableCell align="right"><IconButton size="small" color="success" disabled={!match.match} aria-label="Accept match"><Check size={17} /></IconButton><IconButton size="small" onClick={() => setEditingMatch(isEditing ? null : match.csvName)} aria-label="Edit match">{isEditing ? <Typography variant="caption">Done</Typography> : <Pencil size={17} />}</IconButton></TableCell></TableRow>;
              })}</TableBody></Table>
            </CardContent></Card>}
            <TextField label="Optional upload note" value={description} onChange={(event) => setDescription(event.target.value)} multiline minRows={2} />
            <Divider />
            <Button variant="contained" disabled={!reviewOpen || !parsed || parsed.errors.length > 0 || publishing} onClick={publish}>{publishing ? 'Publishing…' : 'Publish assessment'}</Button>
          </Stack>
          </>}
        </CardContent>
      </Card>
    </Box>
  );
}
