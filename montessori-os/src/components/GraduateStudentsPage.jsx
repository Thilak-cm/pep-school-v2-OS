import React, { useEffect, useMemo, useState } from 'react';
import { 
  Box,
  Typography,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Checkbox,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Alert,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Backdrop
} from '@mui/material';
import { 
  collection, doc, getDocs, getDoc, query, where, orderBy, limit, writeBatch, serverTimestamp, increment
} from 'firebase/firestore';
import { db } from '../firebase';
import useNotify from '../notifications/useNotify.js';
import { reportCaughtError } from '../utils/reportCaughtError.js';

function ymdTodayIST() {
  // Use local date as string (admins are in IST). Keep simple.
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addOneDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Use UTC date math to avoid local TZ artifacts
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export default function GraduateStudentsPage({ currentUser, userRole }) {
  const notify = useNotify();
  const [loading, setLoading] = useState(true);
  const [classrooms, setClassrooms] = useState([]);
  const [sourceClassroomId, setSourceClassroomId] = useState('');
  const [destClassroomId, setDestClassroomId] = useState('');
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'selected' | 'unselected'
  const [lastDayStr, setLastDayStr] = useState(ymdTodayIST());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { ok: N, failed: [{id, reason}] }

  const newStartDate = useMemo(() => addOneDay(lastDayStr), [lastDayStr]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'classrooms'));
        const cls = snap.docs.map(d => ({ id: d.id, ...(d.data()||{}) }));
        // Sort by programId then name for nicer UX
        cls.sort((a,b) => (a.programId||'').localeCompare(b.programId||'') || (a.name||a.id).localeCompare(b.name||b.id));
        setClassrooms(cls);
      } catch (e) {
        reportCaughtError(e, 'GraduateStudentsPage', 'swallow-only try/catch at L77');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load students when source changes
  useEffect(() => {
    if (!sourceClassroomId) {
      setStudents([]);
      setSelectedIds([]);
      return;
    }
    (async () => {
      try {
        const q = query(collection(db, 'students'), where('classroomId', '==', sourceClassroomId));
        const snap = await getDocs(q);
        const rows = snap.docs.map(d => ({ id: d.id, ...(d.data()||{}) }));
        rows.sort((a,b) => (a.displayName||`${a.firstName||''} ${a.lastName||''}`).localeCompare(b.displayName||`${b.firstName||''} ${b.lastName||''}`));
        setStudents(rows);
        setSelectedIds([]);
      } catch (e) {
        reportCaughtError(e, 'GraduateStudentsPage', 'swallow-only try/catch at L99');
      }
    })();
  }, [sourceClassroomId]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const filteredStudents = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    let arr = students;
    if (filterMode === 'selected') arr = arr.filter(s => selectedIds.includes(s.id));
    if (filterMode === 'unselected') arr = arr.filter(s => !selectedIds.includes(s.id));
    if (!q) return arr;
    return arr.filter((s) => {
      const label = (s.displayName || `${s.firstName || ''} ${s.lastName || ''}` || s.id).toLowerCase();
      return label.includes(q);
    });
  }, [students, search, filterMode, selectedIds]);

  const selectAll = () => setSelectedIds((prev) => {
    const ids = new Set(prev);
    for (const s of filteredStudents) ids.add(s.id);
    return Array.from(ids);
  });
  const clearAll = () => setSelectedIds([]);

  const handleSubmit = async () => {
    if (!sourceClassroomId || !destClassroomId || selectedIds.length === 0) return;
    setSubmitting(true);
    setResult(null);

    try {
      const srcName = classrooms.find(c => c.id === sourceClassroomId)?.name || sourceClassroomId;
      const dstName = classrooms.find(c => c.id === destClassroomId)?.name || destClassroomId;
      // Fetch dest classroom branch (optional consistency)
      let destBranchId = null;
      try {
        const destRef = doc(db, 'classrooms', destClassroomId);
        const destSnap = await getDoc(destRef);
        if (destSnap.exists()) destBranchId = destSnap.data()?.branchId || null;
      } catch {}

      const batch = writeBatch(db);
      const failures = [];
      let successCount = 0;

      for (const studentId of selectedIds) {
        try {
          // Verify student's current classroom still matches source
          const stuRef = doc(db, 'students', studentId);
          const stuSnap = await getDoc(stuRef);
          if (!stuSnap.exists()) { failures.push({ id: studentId, reason: 'missing student' }); continue; }
          const stu = stuSnap.data() || {};
          if (stu.classroomId !== sourceClassroomId) { failures.push({ id: studentId, reason: 'moved since selection' }); continue; }

          // Find active placement (endDate == null)
          const activeQ = query(collection(db, 'students', studentId, 'placements'), where('endDate', '==', null), limit(1));
          const activeSnap = await getDocs(activeQ);
          if (activeSnap.empty) { failures.push({ id: studentId, reason: 'no active placement' }); continue; }
          const activeDoc = activeSnap.docs[0];

          // Close old placement
          batch.update(activeDoc.ref, {
            endDate: lastDayStr,
            status: 'ended',
            updatedAt: serverTimestamp(),
          });

          // Create new placement
          const placementId = `${newStartDate}__${destClassroomId}`;
          const newRef = doc(db, 'students', studentId, 'placements', placementId);
          batch.set(newRef, {
            classroomId: destClassroomId,
            startDate: newStartDate,
            endDate: null,
            status: 'active',
            ...(note ? { note } : {}),
            createdAt: serverTimestamp(),
          });

          // Update student current classroom (and branch if known)
          const updatePayload = { classroomId: destClassroomId, updatedAt: serverTimestamp() };
          if (destBranchId) updatePayload.branchId = destBranchId;
          batch.set(stuRef, updatePayload, { merge: true });

          successCount++;
        } catch (e) {
          failures.push({ id: studentId, reason: e?.message || 'error' });
        }
      }

      // Update denormalized studentCount on source and destination classrooms
      if (successCount > 0) {
        const srcRef = doc(db, 'classrooms', sourceClassroomId);
        const dstRef = doc(db, 'classrooms', destClassroomId);
        batch.set(srcRef, { studentCount: increment(-successCount), updatedAt: serverTimestamp() }, { merge: true });
        batch.set(dstRef, { studentCount: increment(successCount), updatedAt: serverTimestamp() }, { merge: true });
      }

      await batch.commit();
      setResult({ ok: successCount, failed: failures });
      if (successCount > 0) {
        notify.success(`${successCount} student(s) graduated from ${srcName} to ${dstName}.`);
      }
      // Refresh list and clear selections
      if (successCount > 0) {
        const q2 = query(collection(db, 'students'), where('classroomId', '==', sourceClassroomId));
        const snap2 = await getDocs(q2);
        const updated = snap2.docs.map(d => ({ id: d.id, ...(d.data()||{}) }));
        setStudents(updated);
        setSelectedIds([]);
      }
    } catch (e) {
      setResult({ ok: 0, failed: selectedIds.map(id => ({ id, reason: e?.message || 'batch failed' })) });
    } finally {
      setSubmitting(false);
    }
  };

  const destOptions = useMemo(() => classrooms.filter(c => !!c?.id && c.id !== sourceClassroomId), [classrooms, sourceClassroomId]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Backdrop open={submitting} sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CircularProgress color="inherit" size={28} />
          <Typography variant="body2" sx={{ textAlign: 'center' }}>
            Coach Pepper is graduating these students — hold on for a few seconds please…
          </Typography>
        </Box>
      </Backdrop>
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Graduate Students</Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
            Pick a source classroom, select students, choose a destination and the last day in the current classroom. New placement starts on the next day.
          </Typography>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4, gap: 2, flexDirection: 'column' }}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary">
                Coach Pepper is loading classrooms and students...
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <InputLabel id="src-classroom-label">Source Classroom</InputLabel>
                  <Select
                    labelId="src-classroom-label"
                    label="Source Classroom"
                    value={sourceClassroomId}
                    onChange={(e) => setSourceClassroomId(e.target.value)}
                  >
                    {classrooms.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {(c.name || c.id)}{c.programId ? ` · ${c.programId}` : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <InputLabel id="dst-classroom-label">Destination Classroom</InputLabel>
                  <Select
                    labelId="dst-classroom-label"
                    label="Destination Classroom"
                    value={destClassroomId}
                    onChange={(e) => setDestClassroomId(e.target.value)}
                    disabled={!sourceClassroomId}
                  >
                    {destOptions.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {(c.name || c.id)}{c.programId ? ` · ${c.programId}` : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  label="Last day in current classroom"
                  type="date"
                  size="small"
                  value={lastDayStr}
                  onChange={(e) => setLastDayStr(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />

                <TextField
                  label="Optional note"
                  size="small"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  sx={{ minWidth: 260, flex: 1 }}
                />
              </Box>

              <Typography variant="body2" sx={{ color: '#64748b' }}>
                New placement start date: <strong>{newStartDate}</strong>
              </Typography>

              <Divider sx={{ my: 1 }} />

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Students in source classroom ({filteredStudents.length}/{students.length})
                </Typography>
                <TextField
                  placeholder="Search students by name"
                  size="small"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  sx={{ minWidth: 240 }}
                />
                <ToggleButtonGroup
                  size="small"
                  value={filterMode}
                  exclusive
                  onChange={(e, val) => { if (val) setFilterMode(val); }}
                >
                  <ToggleButton value="all">All</ToggleButton>
                  <ToggleButton value="selected">Selected</ToggleButton>
                  <ToggleButton value="unselected">Unselected</ToggleButton>
                </ToggleButtonGroup>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="text" size="small" onClick={selectAll} disabled={filteredStudents.length === 0}>Select all</Button>
                  <Button variant="text" size="small" onClick={clearAll} disabled={selectedIds.length === 0}>Clear</Button>
                </Box>
              </Box>

              <Card variant="outlined" sx={{ mb: 8 }}>
                <List dense>
                  {students.length === 0 && (
                    <ListItem>
                      <ListItemText primary="No students found in this classroom." />
                    </ListItem>
                  )}
                  {filteredStudents.map((s) => {
                    const label = s.displayName || [s.firstName, s.lastName].filter(Boolean).join(' ') || s.id;
                    const checked = selectedIds.includes(s.id);
                    return (
                      <ListItem key={s.id} button onClick={() => toggleSelect(s.id)}>
                        <ListItemIcon>
                          <Checkbox
                            edge="start"
                            tabIndex={-1}
                            disableRipple
                            checked={checked}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelect(s.id);
                            }}
                          />
                        </ListItemIcon>
                        <ListItemText primary={label} secondary={s.classroomId ? `Current: ${s.classroomId}` : null} />
                      </ListItem>
                    );
                  })}
                </List>
              </Card>

              {result && (
                <Box>
                  {result.ok > 0 && (
                    <Alert severity="success" sx={{ mb: 1 }}>{result.ok} student(s) graduated.</Alert>
                  )}
                  {result.failed?.length > 0 && (
                    <Alert severity="warning">
                      {result.failed.length} failed: {result.failed.slice(0,3).map(f => f.id).join(', ')}{result.failed.length > 3 ? '…' : ''}
                    </Alert>
                  )}
                </Box>
              )}

              <Box sx={{ position: 'sticky', bottom: 0, display: 'flex', justifyContent: 'flex-end', gap: 1, py: 1, background: 'linear-gradient(to top, rgba(248,250,252,1), rgba(248,250,252,0.8), rgba(248,250,252,0))' }}>
                <Button
                  variant="contained"
                  color="primary"
                  disabled={submitting || !sourceClassroomId || !destClassroomId || selectedIds.length === 0}
                  onClick={async () => {
                    const confirm = window.confirm(`Graduate ${selectedIds.length} student(s) from ${sourceClassroomId} to ${destClassroomId}?\nLast day: ${lastDayStr} | New start: ${newStartDate}`);
                    if (!confirm) return;
                    await handleSubmit();
                  }}
                >
                  {submitting ? 'Graduating…' : `Graduate (${selectedIds.length})`}
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
