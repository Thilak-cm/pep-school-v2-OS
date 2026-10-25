// YourAssessmentLineup.jsx - #313: Class-level matrix table for a single assessment upload
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Box, Button, CircularProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography,
} from '@mui/material';
import Chip from '@mui/material/Chip';
import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../firebase';
import StudentAssessmentSheet from './StudentAssessmentSheet.jsx';

function SortIcon({ active, asc }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', verticalAlign: 'middle', lineHeight: 0.7, fontSize: '0.55rem', marginLeft: 3, position: 'relative', top: -1 }}>
      <span style={{ color: active && asc ? 'var(--color-text)' : 'var(--color-text-soft)', opacity: active && asc ? 1 : 0.35 }}>&#9650;</span>
      <span style={{ color: active && !asc ? 'var(--color-text)' : 'var(--color-text-soft)', opacity: active && !asc ? 1 : 0.35 }}>&#9660;</span>
    </span>
  );
}

// "Current value" contract (#313)
function currentValue(record, resultNumber) {
  const attempts = record.attempts || [];
  if (attempts.length > 0) {
    const last = attempts[attempts.length - 1];
    return last.values?.[resultNumber] ?? '';
  }
  const r = (record.results || []).find((res) => res.resultNumber === resultNumber);
  return r?.sourceValue ?? '';
}

export default function YourAssessmentLineup({ sourceId, userRole }) {
  const [source, setSource] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortCol, setSortCol] = useState(null); // null = name, or resultNumber
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadData = useCallback(async () => {
    if (!sourceId) return;
    try {
      setLoading(true);
      const fn = httpsCallable(cloudFunctions, 'getStructuredAssessmentSource');
      const result = await fn({ sourceId, includeRecords: true });
      const data = result.data || {};
      const src = data.source || data;
      setSource(src);
      setRecords(src.records || []);
    } catch (err) {
      console.error('[YourAssessmentLineup] load failed:', err);
      setError(err.message || 'Failed to load assessment');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey triggers reload after append
  }, [sourceId, refreshKey]);

  useEffect(() => { loadData(); }, [loadData]);

  const definitions = source?.resultDefinitions || [];

  // Sorted records
  const sortedRecords = useMemo(() => {
    const sorted = [...records];
    sorted.sort((a, b) => {
      let aVal, bVal;
      if (sortCol === null) {
        aVal = (a.studentName || '').toLowerCase();
        bVal = (b.studentName || '').toLowerCase();
      } else {
        aVal = currentValue(a, sortCol);
        bVal = currentValue(b, sortCol);
      }
      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [records, sortCol, sortAsc]);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortAsc((prev) => !prev);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  const pendingCount = records.filter((r) => r.gradeStatus === 'absent').length;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ px: 2, py: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Pending banner */}
      {pendingCount > 0 && (
        <Box sx={{
          px: 2, py: 1, borderRadius: 1.5,
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
        }}>
          <Typography variant="body2" sx={{ color: 'var(--color-warning)', fontWeight: 600 }}>
            {pendingCount} absent student{pendingCount !== 1 ? 's' : ''} pending
          </Typography>
        </Box>
      )}

      {/* Matrix table */}
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 300 }}>
          <TableHead>
            <TableRow>
              <TableCell
                onClick={() => handleSort(null)}
                sx={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', position: 'sticky', left: 0, backgroundColor: 'var(--color-paper)', zIndex: 1 }}
              >
                Name <SortIcon active={sortCol === null} asc={sortAsc} />
              </TableCell>
              {definitions.map((d) => (
                <TableCell
                  key={d.number}
                  onClick={() => handleSort(d.number)}
                  sx={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                >
                  {d.description} <SortIcon active={sortCol === d.number} asc={sortAsc} />
                </TableCell>
              ))}
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Tries</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRecords.map((record) => {
              const isAbsent = record.gradeStatus === 'absent';
              const attemptCount = (record.attempts || []).length;

              return (
                <TableRow
                  key={record.observationId || record.id}
                  onClick={() => { setSelectedRecord(record); setSheetOpen(true); }}
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { backgroundColor: 'rgba(0,0,0,0.02)' },
                    ...(isAbsent ? { opacity: 0.7 } : {}),
                  }}
                >
                  <TableCell sx={{ position: 'sticky', left: 0, backgroundColor: 'var(--color-paper)', zIndex: 1, fontSize: '0.8rem' }}>
                    {record.studentName || 'Unknown'}
                  </TableCell>
                  {definitions.map((d) => (
                    <TableCell key={d.number} sx={{ fontSize: '0.8rem' }}>
                      {isAbsent ? (
                        <Button
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem', borderStyle: 'dashed', color: 'var(--color-warning)', borderColor: 'var(--color-warning)', textTransform: 'none', minWidth: 0, py: 0.25, px: 0.75 }}
                        >
                          + add
                        </Button>
                      ) : (
                        currentValue(record, d.number) || '-'
                      )}
                    </TableCell>
                  ))}
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {isAbsent ? (
                      <Chip label="Absent" size="small" sx={{ height: 20, fontSize: '0.65rem', backgroundColor: 'rgba(245, 158, 11, 0.12)', color: 'var(--color-warning)' }} />
                    ) : (
                      attemptCount > 0 ? attemptCount + 1 : 1
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Legend */}
      <Box sx={{ display: 'flex', gap: 2, px: 1, mt: 0.5 }}>
        <Typography variant="caption" sx={{ color: 'var(--color-text-soft)' }}>
          Tap a row to view details or add a grade
        </Typography>
      </Box>

      {/* Student assessment sheet */}
      <StudentAssessmentSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setSelectedRecord(null); }}
        observation={selectedRecord}
        studentName={selectedRecord?.studentName || ''}
        userRole={userRole}
        onUpdated={() => setRefreshKey((k) => k + 1)}
      />
    </Box>
  );
}
