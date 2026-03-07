import React, { useEffect, useState } from 'react';
import useNotify from '../notifications/useNotify';
import {
  Box,
  Typography,
  Button,
  Stack,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  CircularProgress,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  Description as ReportIcon,
  Visibility as ViewIcon,
  Add as AddIcon,
  DeleteOutline as DeleteIcon,
} from '@mui/icons-material';
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';
import { buildReportList } from '../utils/reportUtils';
import { trackEvent } from '../utils/analytics';
import { isAdminRole } from '../utils/roleUtils';
import ReportGenerateDialog from './ReportGenerateDialog';
import ReportPreviewDialog from './ReportPreviewDialog';

function formatReportDate(date) {
  if (!date) return 'Unknown date';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

export default function ReportsPage({ studentId, studentLabel = 'Student', userRole }) {
  const notify = useNotify();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Generate dialog state
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Preview dialog state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  // Draft report state (generated but not yet saved to Firestore)
  const [draftReport, setDraftReport] = useState(null);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Delete state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState(null);
  const [deletingIds, setDeletingIds] = useState(new Set());

  // Load all past reports from subcollection
  useEffect(() => {
    if (!studentId) {
      setReports([]);
      setLoading(false);
      return;
    }

    let active = true;
    const loadReports = async () => {
      try {
        setLoading(true);
        const ref = collection(db, 'students', studentId, 'ai_summaries');
        const snap = await getDocs(ref);
        if (!active) return;
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setReports(buildReportList(docs));
      } catch {
        if (active) setError('Failed to load reports.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadReports();
    return () => { active = false; };
  }, [studentId]);

  const handleGenerate = async ({ dateRangeStart, dateRangeEnd }) => {
    try {
      setError('');
      setGenerating(true);
      trackEvent('report_generate_start', { studentId }).catch(() => {});
      const call = httpsCallable(cloudFunctions, 'generateStudentReport');
      const result = await call({ studentId, dateRangeStart, dateRangeEnd });
      const draft = {
        // No id — this is a draft, not yet in Firestore
        generatedAt: result.data.generatedAt ? new Date(result.data.generatedAt) : new Date(),
        noteCount: result.data.noteCount ?? null,
        reportText: result.data.reportText || '',
        status: result.data.status || null,
        missingInputFlags: result.data.missingInputFlags || [],
        sentimentScore: result.data.sentimentScore ?? null,
        areaBalanceScore: result.data.areaBalanceScore ?? null,
        dateRangeStart: result.data.dateRangeStart || null,
        dateRangeEnd: result.data.dateRangeEnd || null,
        programId: result.data.programId || '',
        model: result.data.model || '',
        sourceNoteIds: result.data.sourceNoteIds || [],
        generatedBy: result.data.generatedBy || '',
        driveDocLink: null,
      };
      setDraftReport(draft);
      setSelectedReport(draft);
      setGenerateOpen(false);
      setPreviewOpen(true);
      trackEvent('report_generate_success', { studentId }).catch(() => {});
    } catch (e) {
      setGenerateOpen(false);
      setError(e?.message || 'Failed to generate report.');
      trackEvent('report_generate_error', { studentId, error: e?.message }).catch(() => {});
    } finally {
      setGenerating(false);
    }
  };

  const handleExportToDrive = async () => {
    if (!studentId) return;
    const isDraft = !selectedReport?.id;

    try {
      setExporting(true);
      trackEvent('report_export_start', { studentId, isDraft }).catch(() => {});
      const call = httpsCallable(cloudFunctions, 'exportReportToDrive');

      if (isDraft) {
        // Draft path: send full payload, server creates Drive doc + Firestore doc atomically
        const result = await call({ studentId, reportPayload: selectedReport });
        const savedReport = {
          ...selectedReport,
          id: result.data.docId,
          driveDocLink: result.data.driveDocLink,
        };
        setSelectedReport(savedReport);
        setReports((prev) => [savedReport, ...prev]);
        setDraftReport(null);
      } else {
        // Existing report path: pass reportDocId as before
        const result = await call({ studentId, reportDocId: selectedReport.id });
        const link = result.data.driveDocLink;
        setSelectedReport((prev) => ({ ...prev, driveDocLink: link }));
        setReports((prev) =>
          prev.map((r) => (r.id === selectedReport.id ? { ...r, driveDocLink: link } : r))
        );
      }
      trackEvent('report_export_success', { studentId }).catch(() => {});
    } catch (e) {
      setError(e?.message || 'Failed to export to Drive.');
      trackEvent('report_export_error', { studentId, error: e?.message }).catch(() => {});
    } finally {
      setExporting(false);
    }
  };

  const handleViewReport = (report) => {
    setSelectedReport(report);
    setPreviewOpen(true);
  };

  const handleDeleteClick = (report) => {
    setReportToDelete(report);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!reportToDelete?.id || !studentId) return;
    const target = reportToDelete;
    setDeleteConfirmOpen(false);
    setReportToDelete(null);

    // Optimistically remove from list and show info toast
    setReports((prev) => prev.filter((r) => r.id !== target.id));
    setDeletingIds((prev) => new Set(prev).add(target.id));
    notify.info('Deleting report…', { duration: 2000 });
    trackEvent('report_deleted', { studentId, reportDocId: target.id }).catch(() => {});

    try {
      const call = httpsCallable(cloudFunctions, 'deleteStudentReport');
      await call({ studentId, reportDocId: target.id });
      notify.success('Report deleted', { duration: 3000 });
    } catch (e) {
      // Restore the report on failure
      setReports((prev) => {
        if (prev.some((r) => r.id === target.id)) return prev;
        return [...prev, target].sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0));
      });
      notify.error(e?.message || 'Failed to delete report.');
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
    }
  };

  return (
    <>
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, px: 2, py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setGenerateOpen(true)}
          disabled={generating || !studentId}
          sx={{
            textTransform: 'none',
            borderRadius: 2,
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
            '&:hover': {
              background: 'linear-gradient(135deg, #047857 0%, #065f46 100%)',
            },
          }}
        >
          Generate Report
        </Button>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {!loading && reports.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <ReportIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
          <Typography variant="body1" sx={{ color: '#94a3b8' }}>
            No reports yet
          </Typography>
          <Typography variant="body2" sx={{ color: '#cbd5e1', mt: 0.5 }}>
            Generate a report to see it here
          </Typography>
        </Box>
      )}

      {!loading && reports.length > 0 && (
        <List disablePadding>
          {reports.map((report) => (
            <ListItem
              key={report.id}
              sx={{
                borderRadius: 2,
                border: '1px solid #e2e8f0',
                mb: 1,
                '&:hover': { backgroundColor: 'rgba(5, 150, 105, 0.04)' },
                py: 1,
              }}
            >
              <ListItemText
                primary={formatReportDate(report.generatedAt)}
                secondary={
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25 }}>
                    {report.noteCount != null && (
                      <Chip label={`${report.noteCount} notes`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                    )}
                    {report.status === 'no_notes' && (
                      <Chip label="No notes" size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                    )}
                  </Stack>
                }
                primaryTypographyProps={{ variant: 'body2', fontWeight: 600, color: '#1e293b' }}
                secondaryTypographyProps={{ component: 'div' }}
              />
              <ListItemSecondaryAction>
                <IconButton
                  size="small"
                  onClick={() => handleViewReport(report)}
                  sx={{ color: '#4f46e5' }}
                  aria-label={`View report from ${formatReportDate(report.generatedAt)}`}
                >
                  <ViewIcon fontSize="small" />
                </IconButton>
                {isAdminRole(userRole) && (
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteClick(report)}
                    disabled={deletingIds.has(report.id)}
                    sx={{ color: '#ef4444', ml: 0.5 }}
                    aria-label={`Delete report from ${formatReportDate(report.generatedAt)}`}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}
    </Box>

      <ReportGenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerate={handleGenerate}
        generating={generating}
        studentLabel={studentLabel}
      />

      <ReportPreviewDialog
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          if (draftReport) setDraftReport(null);
        }}
        reportText={selectedReport?.reportText || ''}
        missingInputFlags={selectedReport?.missingInputFlags || []}
        generatedAt={selectedReport?.generatedAt || null}
        studentLabel={studentLabel}
        noteCount={selectedReport?.noteCount ?? null}
        onExportToDrive={handleExportToDrive}
        exporting={exporting}
        driveDocLink={selectedReport?.driveDocLink || null}
        isDraft={!!draftReport}
      />

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <DialogTitle>Delete Report</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will delete the report and trash the Google Drive copy if exported. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
