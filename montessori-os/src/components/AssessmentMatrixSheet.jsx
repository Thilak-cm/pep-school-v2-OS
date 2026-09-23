import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Stack, SwipeableDrawer, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../firebase';

function formatDateRange(range) {
  if (!range?.startDate) return '';
  return range.startDate === range.endDate
    ? range.startDate
    : `${range.startDate} - ${range.endDate}`;
}

/**
 * #290 shared structured-assessment matrix popup. Rendered from published
 * observation data via getStructuredAssessmentSource (never the source XLSX -
 * browsers cannot view XLSX inline, and the in-app table serves Rahul's
 * "distribution across all children" need directly). Used from three entry
 * points: the assessments page View button, the student timeline, and the
 * classroom timeline.
 *
 * `studentId` must be a participating student the caller can access (the CF
 * authorizes against it). `focusStudentId` pins that student to the top row.
 */
export default function AssessmentMatrixSheet({
  open, onClose, sourceId, studentId, focusStudentId,
}) {
  const [source, setSource] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Notify App to hide the global FAB while the drawer is open (same
  // mechanism as NoteBottomSheet).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('noteDrawerToggle', { detail: { open } }));
  }, [open]);

  useEffect(() => {
    let active = true;
    if (!open || !sourceId || !studentId) return undefined;
    setLoading(true);
    setError('');
    setSource(null);
    const getSource = httpsCallable(cloudFunctions, 'getStructuredAssessmentSource');
    getSource({ studentId, sourceId, includeRecords: true })
      .then((result) => {
        if (active) setSource(result.data?.source || null);
      })
      .catch((loadError) => {
        if (active) setError(loadError?.message || 'The assessment could not be loaded.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, sourceId, studentId]);

  const definitions = useMemo(() => (
    [...(source?.resultDefinitions || [])].sort((a, b) => a.number - b.number)
  ), [source]);

  // Focus student first (highlighted), everyone else in worksheet row order.
  const rows = useMemo(() => {
    const records = source?.records || [];
    if (!focusStudentId) return records;
    return [
      ...records.filter((record) => record.studentId === focusStudentId),
      ...records.filter((record) => record.studentId !== focusStudentId),
    ];
  }, [source, focusStudentId]);

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      disableSwipeToOpen
      disableDiscovery
      PaperProps={{
        sx: {
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          // Grows with content up to near the top of the screen, then the
          // table scrolls vertically (decision from #290 speccing).
          maxHeight: 'calc(100dvh - 48px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
        <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'var(--color-border)' }} />
      </Box>

      <Box sx={{ px: 2.5, pb: 1 }}>
        {loading && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2">Loading assessment…</Typography>
          </Stack>
        )}
        {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}
        {source && (
          <>
            <Typography variant="h6">{source.assessmentName || 'Assessment'}</Typography>
            <Typography variant="body2" color="text.secondary">
              {formatDateRange(source.dateRange)}
              {source.uploaderName ? ` · Uploaded by ${source.uploaderName}` : ''}
              {` · ${source.studentCount} student${source.studentCount === 1 ? '' : 's'}`}
            </Typography>
            {source.assessmentDescription && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>{source.assessmentDescription}</Typography>
            )}
          </>
        )}
      </Box>

      {source && (
        <TableContainer sx={{ flex: 1, overflow: 'auto', overscrollBehavior: 'contain', px: 1, pb: 2 }}>
          <Table size="small" stickyHeader aria-label="Assessment results for all students">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                {/* Header shows the teacher-authored definition ("Score out of
                    10"), not "Result N" - teachers should not have to map
                    result numbers back to the metadata themselves. */}
                {definitions.map((definition) => (
                  <TableCell key={definition.number} sx={{ fontWeight: 700 }}>
                    {definition.description || `Result ${definition.number}`}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((record, index) => {
                const isFocus = focusStudentId && record.studentId === focusStudentId;
                return (
                  <TableRow
                    key={`${record.studentId}-${record.sourceRow}-${record.segment}-${index}`}
                    sx={isFocus ? { backgroundColor: 'rgba(25, 118, 210, 0.08)' } : undefined}
                  >
                    <TableCell sx={{ fontWeight: isFocus ? 700 : 400, whiteSpace: 'nowrap' }}>
                      {record.studentName}
                    </TableCell>
                    {definitions.map((definition) => (
                      <TableCell key={definition.number} sx={{ whiteSpace: 'pre-wrap' }}>
                        {String(record.values?.[`Result ${definition.number}`] ?? '')}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Box sx={{ px: 2.5, pb: 2, pt: 1 }}>
        <Button fullWidth variant="outlined" onClick={onClose}>Close</Button>
      </Box>
    </SwipeableDrawer>
  );
}
