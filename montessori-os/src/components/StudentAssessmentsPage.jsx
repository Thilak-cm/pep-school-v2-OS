import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogContentText, DialogTitle, Divider,
  Stack, Tab, Tabs, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Typography,
} from '@mui/material';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Eye, Trash2 } from 'lucide-react';
import { cloudFunctions, db } from '../firebase';
import useNotify from '../notifications/useNotify.js';
import AssessmentMatrixSheet from './AssessmentMatrixSheet.jsx';
import MedicalPdfSheet from './MedicalPdfSheet.jsx';

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTimestamp(value) {
  const millis = timestampMillis(value);
  return millis ? new Date(millis).toLocaleDateString() : 'Date unavailable';
}

function formatDateRange(value, fallback) {
  if (!value?.startDate) return formatTimestamp(fallback);
  return value.startDate === value.endDate
    ? value.startDate
    : `${value.startDate} – ${value.endDate}`;
}

function recordResults(record, definitions) {
  if (Array.isArray(record.results) && record.results.length) {
    return record.results.map((result) => ({
      number: result.resultNumber,
      label: result.label || `Result ${result.resultNumber}`,
      value: result.sourceValue ?? '',
    }));
  }
  const definitionMap = new Map((definitions || []).map((definition) => (
    [definition.label, definition.description || definition.label]
  )));
  return Object.entries(record.values || {}).map(([label, value]) => ({
    number: Number(String(label).match(/\d+/)?.[0]) || Number.MAX_SAFE_INTEGER,
    label: definitionMap.get(label) || label,
    value,
  })).sort((a, b) => a.number - b.number);
}

export default function StudentAssessmentsPage({ student, assessmentDeepLink, userRole }) {
  const [tab, setTab] = useState(assessmentDeepLink?.assessmentKind === 'medical' ? 1 : 0);
  const [notes, setNotes] = useState([]);
  const [sources, setSources] = useState({});
  const [sourceErrors, setSourceErrors] = useState({});
  const [sourceLoading, setSourceLoading] = useState({});
  const [sourceRetryVersion, setSourceRetryVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState('');
  const [matrixView, setMatrixView] = useState(null);
  const [medicalView, setMedicalView] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const notify = useNotify();
  const studentId = student?.id;
  const canDelete = userRole === 'superadmin' || userRole === 'classroomadmin';

  useEffect(() => {
    let active = true;
    if (!studentId) {
      setLoading(false);
      setError('Choose a student before opening assessments.');
      return undefined;
    }
    setLoading(true);
    setError('');
    getDocs(query(
      collection(db, 'students', studentId, 'observations'),
      where('type', '==', 'assessment'),
    ))
      .then((snapshot) => {
        if (!active) return;
        setNotes(snapshot.docs.map((assessmentDoc) => ({
          id: assessmentDoc.id,
          ...assessmentDoc.data(),
        })).filter((record) => (
          record.assessmentKind !== 'medical' || record.uploadStatus === 'ready'
        )));
      })
      .catch((loadError) => {
        if (active) setError(loadError?.message || 'Assessments could not be loaded.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [studentId]);

  const structuredGroups = useMemo(() => {
    const grouped = new Map();
    notes.filter((note) => note.assessmentKind === 'structured').forEach((note) => {
      const sourceId = note.sourceId || note.id;
      if (!grouped.has(sourceId)) grouped.set(sourceId, []);
      grouped.get(sourceId).push(note);
    });
    return [...grouped.entries()].map(([sourceId, records]) => ({
      sourceId,
      records: records.sort((a, b) => (
        (a.sourceProvenance?.segment || 0) - (b.sourceProvenance?.segment || 0)
      )),
    })).sort((a, b) => (
      timestampMillis(b.records[0]?.observedAt) - timestampMillis(a.records[0]?.observedAt)
    ));
  }, [notes]);

  const medicalRecords = useMemo(() => notes
    .filter((note) => note.assessmentKind === 'medical' && note.uploadStatus === 'ready')
    .sort((a, b) => timestampMillis(b.observedAt) - timestampMillis(a.observedAt)), [notes]);

  useEffect(() => {
    let active = true;
    if (!studentId || !structuredGroups.length) {
      setSources({});
      setSourceErrors({});
      setSourceLoading({});
      return undefined;
    }
    const sourceIds = structuredGroups.map(({sourceId}) => sourceId);
    setSourceLoading(Object.fromEntries(sourceIds.map((sourceId) => (
      [sourceId, true]
    ))));
    const getSource = httpsCallable(cloudFunctions, 'getStructuredAssessmentSource');
    Promise.all(structuredGroups.map(async ({sourceId}) => {
      try {
        const result = await getSource({studentId, sourceId});
        return {sourceId, source: result.data?.source || null, error: ''};
      } catch (sourceError) {
        return {
          sourceId,
          source: null,
          error: sourceError?.message || 'Source details could not be loaded.',
        };
      }
    })).then((entries) => {
      if (!active) return;
      setSources(Object.fromEntries(entries
        .filter(({source}) => source)
        .map(({sourceId, source}) => [sourceId, source])));
      setSourceErrors(Object.fromEntries(entries
        .filter(({error: sourceError}) => sourceError)
        .map(({sourceId, error: sourceError}) => [sourceId, sourceError])));
      setSourceLoading({});
    });
    return () => { active = false; };
  }, [studentId, structuredGroups, sourceRetryVersion]);

  useEffect(() => {
    if (!assessmentDeepLink) return;
    let targetTab = assessmentDeepLink.assessmentKind === 'medical' ? 1 : 0;
    if (!assessmentDeepLink.assessmentKind && assessmentDeepLink.observationId) {
      const target = notes.find((note) => note.id === assessmentDeepLink.observationId);
      if (target?.assessmentKind === 'medical') targetTab = 1;
    }
    setTab(targetTab);
    const targetId = targetTab === 0
      ? assessmentDeepLink.sourceId
      : assessmentDeepLink.observationId;
    if (!targetId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`assessment-${targetId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [assessmentDeepLink, notes]);

  const deleteAssessment = async (payload, key) => {
    setDeleting(key);
    try {
      const removeAssessment = httpsCallable(cloudFunctions, 'deleteAssessment');
      await removeAssessment(payload);
      setNotes((current) => current.filter((record) => (
        payload.assessmentKind === 'medical'
          ? record.id !== payload.observationId
          : record.sourceId !== payload.sourceId
      )));
      notify.success('Assessment deleted.');
    } catch (deleteError) {
      notify.error(deleteError?.message || 'The assessment could not be deleted.');
    } finally {
      setDeleting('');
    }
  };

  return (
    <Box sx={{maxWidth: 760, mx: 'auto', width: '100%', py: 2}}>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{mb: 2}}>
        <Tab label="Structured" />
        <Tab label="Medical" />
      </Tabs>
      {loading && <CircularProgress size={24} />}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && tab === 0 && structuredGroups.length === 0 && (
        <Typography color="text.secondary">No structured assessments yet.</Typography>
      )}
      {!loading && !error && tab === 1 && medicalRecords.length === 0 && (
        <Typography color="text.secondary">No medical assessments yet.</Typography>
      )}

      {tab === 0 && (
        <Stack spacing={2}>{structuredGroups.map(({sourceId, records}) => {
          const first = records[0];
          const source = sources[sourceId];
          const definitions = source?.resultDefinitions || first.resultDefinitions || [];
          return (
            <Card
              id={`assessment-${sourceId}`}
              key={sourceId}
              sx={assessmentDeepLink?.sourceId === sourceId ? {outline: '2px solid', outlineColor: 'primary.main'} : undefined}
            >
              <CardContent>
                <Stack direction={{xs: 'column', sm: 'row'}} justifyContent="space-between" alignItems={{sm: 'flex-start'}} gap={1}>
                  <Box>
                    <Typography variant="h6">{first.assessmentName || 'Assessment'}</Typography>
                    <Typography variant="body2" color="text.secondary">{formatDateRange(first.assessmentDate, first.observedAt)}</Typography>
                    {first.assessmentDescription && <Typography sx={{mt: 0.5}}>{first.assessmentDescription}</Typography>}
                  </Box>
                  <Chip label={`${records.length} record${records.length === 1 ? '' : 's'}`} size="small" />
                </Stack>
                {sourceLoading[sourceId] && (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{mt: 1}}>
                    <CircularProgress size={16} />
                    <Typography variant="body2">Loading source details…</Typography>
                  </Stack>
                )}
                {sourceErrors[sourceId] && (
                  <Alert
                    severity="error"
                    sx={{mt: 1}}
                    action={(
                      <Button
                        color="inherit"
                        size="small"
                        onClick={() => setSourceRetryVersion((value) => value + 1)}
                      >
                        Retry source details
                      </Button>
                    )}
                  >
                    {sourceErrors[sourceId]} Results remain available, but source context and view access could not be verified.
                  </Alert>
                )}
                {source && (
                  <Box sx={{mt: 1}}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Worksheet: {source.worksheetName || 'Unavailable'} · Uploaded by {source.uploaderName} · {source.studentCount} student{source.studentCount === 1 ? '' : 's'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Source: {source.sourceFileName || 'Unavailable'} · Published {formatTimestamp(source.publishedAt)}
                    </Typography>
                    <Button
                      size="small"
                      startIcon={<Eye size={15} />}
                      onClick={() => setMatrixView({sourceId})}
                    >
                      View assessment
                    </Button>
                    {canDelete && (
                      <Button
                        size="small"
                        color="error"
                        startIcon={<Trash2 size={15} />}
                        disabled={deleting === sourceId}
                        onClick={() => setConfirmDelete({
                          payload: {assessmentKind: 'structured', sourceId},
                          key: sourceId,
                          title: 'Delete assessment for all students?',
                          message: `Deleting "${first.assessmentName || 'this assessment'}" removes it for all ${source.studentCount || records.length} student${(source.studentCount || records.length) === 1 ? '' : 's'} who took it, not just ${student?.displayName || 'this student'}. This cannot be undone.`,
                        })}
                      >
                        {deleting === sourceId ? 'Deleting…' : 'Delete assessment'}
                      </Button>
                    )}
                  </Box>
                )}
                <Divider sx={{my: 1.5}} />
                {records.map((record, index) => {
                  const results = recordResults(record, definitions);
                  return (
                    <Box key={record.id} sx={{py: 0.75}}>
                      {records.length > 1 && (
                        <Typography variant="body2" sx={{fontWeight: 650, mb: 0.75}}>{index + 1} of {records.length}</Typography>
                      )}
                      <TableContainer>
                        <Table size="small" aria-label={`Results for record ${index + 1}`}>
                          <TableHead><TableRow><TableCell sx={{fontWeight: 700}}>Result</TableCell><TableCell sx={{fontWeight: 700}}>Value</TableCell></TableRow></TableHead>
                          <TableBody>{results.map((result) => (
                            <TableRow key={result.number}>
                              <TableCell>{result.label}</TableCell>
                              <TableCell sx={{whiteSpace: 'pre-wrap'}}>{String(result.value)}</TableCell>
                            </TableRow>
                          ))}</TableBody>
                        </Table>
                      </TableContainer>
                      {index < records.length - 1 && <Divider sx={{mt: 1.5}} />}
                    </Box>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}</Stack>
      )}

      {tab === 1 && (
        <Stack spacing={2}>{medicalRecords.map((record) => (
          <Card
            id={`assessment-${record.id}`}
            key={record.id}
            sx={assessmentDeepLink?.observationId === record.id ? {outline: '2px solid', outlineColor: 'primary.main'} : undefined}
          >
            <CardContent>
              <Typography variant="h6">{record.assessmentName || 'Medical assessment'}</Typography>
              <Typography variant="body2" color="text.secondary">Report date: {formatTimestamp(record.observedAt)}</Typography>
              {record.assessmentDescription && <Typography sx={{mt: 0.75}}>{record.assessmentDescription}</Typography>}
              <Typography variant="caption" color="text.secondary" display="block" sx={{mt: 1}}>
                Uploaded by {record.createdByName || 'Unknown uploader'} · {record.originalFile?.originalFilename || 'PDF'}
              </Typography>
              <Button
                size="small"
                startIcon={<Eye size={15} />}
                onClick={() => setMedicalView({
                  observationId: record.id,
                  title: record.assessmentName || 'Medical assessment',
                })}
              >
                View medical assessment
              </Button>
              {canDelete && (
                <Button
                  size="small"
                  color="error"
                  startIcon={<Trash2 size={15} />}
                  disabled={deleting === record.id}
                  onClick={() => setConfirmDelete({
                    payload: {assessmentKind: 'medical', studentId, observationId: record.id},
                    key: record.id,
                    title: 'Delete medical assessment?',
                    message: `Delete this medical assessment and its attached PDF for ${student?.displayName || 'this student'}? This is a personal record and does not affect other students. This cannot be undone.`,
                  })}
                >
                  {deleting === record.id ? 'Deleting…' : 'Delete assessment'}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}</Stack>
      )}

      <AssessmentMatrixSheet
        open={!!matrixView}
        onClose={() => setMatrixView(null)}
        sourceId={matrixView?.sourceId}
        studentId={studentId}
        focusStudentId={studentId}
      />
      <MedicalPdfSheet
        open={!!medicalView}
        onClose={() => setMedicalView(null)}
        studentId={studentId}
        observationId={medicalView?.observationId}
        title={medicalView?.title}
      />

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>{confirmDelete?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirmDelete?.message}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              const {payload, key} = confirmDelete;
              setConfirmDelete(null);
              deleteAssessment(payload, key);
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
