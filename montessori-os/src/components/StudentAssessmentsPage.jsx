import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Stack, Tab, Tabs, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { Download } from 'lucide-react';
import { db, storage } from '../firebase';

export default function StudentAssessmentsPage({ student }) {
  const [tab, setTab] = useState(0);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadUrls, setDownloadUrls] = useState({});
  const studentId = student?.id;

  useEffect(() => {
    let active = true;
    if (!studentId) return undefined;
    getDocs(query(collection(db, 'students', studentId, 'observations'), where('type', '==', 'assessment')))
      .then((snapshot) => { if (active) setNotes(snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}))); })
      .catch(() => { if (active) setNotes([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [studentId]);

  const downloadOriginal = async (record) => {
    const path = record.originalFile?.storagePath;
    if (!path) return;
    try {
      const url = downloadUrls[path] || await getDownloadURL(storageRef(storage, path));
      setDownloadUrls((current) => ({...current, [path]: url}));
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch { /* actionable failure is handled by the page-level empty state */ }
  };

  const grouped = useMemo(() => {
    const map = new Map();
    notes.filter((note) => (tab === 0 ? note.assessmentKind !== 'medical' : note.assessmentKind === 'medical')).forEach((note) => {
      const key = note.sourceId || note.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(note);
    });
    return [...map.values()];
  }, [notes, tab]);

  return (
    <Box sx={{maxWidth: 760, mx: 'auto', width: '100%', py: 2}}>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{mb: 2}}><Tab label="Structured" /><Tab label="Medical" /></Tabs>
      {loading && <CircularProgress size={24} />}
      {!loading && grouped.length === 0 && <Typography color="text.secondary">No assessments yet.</Typography>}
      <Stack spacing={2}>{grouped.map((records) => {
        const first = records[0];
        return <Card key={first.sourceId || first.id}><CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start"><Box><Typography variant="h6">{first.assessmentName || first.name || 'Assessment'}</Typography><Typography color="text.secondary">{first.assessmentDescription || first.description || ''}</Typography><Typography variant="body2" color="text.secondary">Conducted by {first.createdByName || first.uploadedByName || first.createdByEmail || 'Unknown teacher'}</Typography></Box><Chip label={`${records.length} record${records.length === 1 ? '' : 's'}`} size="small" /></Stack>
          <Divider sx={{my: 1.5}} />
          {records.map((record, index) => {
            const results = Object.entries(record.values || record.results || {}).sort(([a], [b]) => {
              const aNumber = Number(String(a).match(/\d+/)?.[0]);
              const bNumber = Number(String(b).match(/\d+/)?.[0]);
              return (Number.isNaN(aNumber) ? Number.MAX_SAFE_INTEGER : aNumber)
                - (Number.isNaN(bNumber) ? Number.MAX_SAFE_INTEGER : bNumber);
            });
            return <Box key={record.id} sx={{py: 0.75}}>
              <Typography variant="body2" sx={{fontWeight: 600, mb: 0.75}}>Record {index + 1} of {records.length}</Typography>
              {results.length > 0 && <TableContainer>
                <Table size="small" aria-label={`Results for record ${index + 1}`}>
                  <TableHead><TableRow><TableCell sx={{fontWeight: 700}}>Result</TableCell><TableCell sx={{fontWeight: 700}}>Value</TableCell></TableRow></TableHead>
                  <TableBody>{results.map(([label, value]) => <TableRow key={label}><TableCell>{label}</TableCell><TableCell>{String(value)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </TableContainer>}
              {record.originalFile?.storagePath && <Button size="small" startIcon={<Download size={15} />} onClick={() => downloadOriginal(record)}>Download original</Button>}
            </Box>;
          })}
        </CardContent></Card>;
      })}</Stack>
    </Box>
  );
}
