import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useNotify from '../notifications/useNotify';
import {
  Box,
  Collapse,
  Typography,
  Button,
  Stack,
  List,
  ListItem,
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
import { FileText as ReportIcon, Eye as ViewIcon, Plus as AddIcon, Trash2 as DeleteIcon, ChevronDown as ExpandMoreIcon, ListChecks as ReadinessIcon, User } from '../icons';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';
import { buildReportList } from '../utils/reportUtils';
import { trackEvent } from '../utils/analytics';
import { isAdminRole } from '../utils/roleUtils';
import { friendlyFunctionError } from '../utils/cloudFunctionErrors';
import {
  enqueueSaveQueueItems,
  subscribeSaveQueue,
  SAVE_QUEUE_STATUS,
  REPORT_EXPORT_MAX_ATTEMPTS,
} from '../services/saveQueue';
import ReportGenerateDialog from './ReportGenerateDialog';
import ReportPreviewDialog from './ReportPreviewDialog';
import ReadinessCheckDialog from './ReadinessCheckDialog';

function formatReportDate(date) {
  if (!date) return 'Unknown date';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function getScoreColor(score) {
  if (score == null) return 'default';
  if (score >= 4) return 'success';
  if (score === 3) return 'warning';
  return 'error';
}

/**
 * Normalize eval scores from either flat fields (term reports via readiness)
 * or nested reportEval (baseline reports via judge). Returns a uniform shape.
 */
function getEvalScores(report) {
  if (report?.reportEval) {
    return {
      sentimentScore: report.reportEval.sentimentScore ?? null,
      areaBalanceScore: report.reportEval.areaBalanceScore ?? null,
      missingInputFlags: report.reportEval.missingInputFlags || [],
    };
  }
  return {
    sentimentScore: report?.sentimentScore ?? null,
    areaBalanceScore: report?.areaBalanceScore ?? null,
    missingInputFlags: report?.missingInputFlags || [],
  };
}

export default function ReportsPage({
  studentId,
  studentLabel = 'Student',
  userRole,
  pendingViewReportId = null,
  onPendingViewHandled,
  reportTypeFilter = null,
}) {
  const notify = useNotify();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // Generate dialog state
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Preview dialog state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  // Draft report state (generated but not yet saved to Firestore)
  const [draftReport, setDraftReport] = useState(null);

  // Export state (for non-draft synchronous export)
  const [exporting, setExporting] = useState(false);

  // Queue-based export tracking
  const [exportingCount, setExportingCount] = useState(0);

  // Delete state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState(null);
  const [deletingIds, setDeletingIds] = useState(new Set());

  // Expanded missing flags state (tracks which report IDs have expanded missing data)
  const [expandedMissing, setExpandedMissing] = useState(new Set());

  // Readiness state (PEP-68)
  const [readiness, setReadiness] = useState(null);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [newNotesSinceReport, setNewNotesSinceReport] = useState(null);
  const [rerunConfirmOpen, setRerunConfirmOpen] = useState(false);
  const [readinessNudgeOpen, setReadinessNudgeOpen] = useState(false);

  // Load all past reports from subcollection
  const loadReports = useCallback(async () => {
    if (!studentId) {
      setReports([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const ref = collection(db, 'students', studentId, 'ai_summaries');
      const snap = await getDocs(ref);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setReports(buildReportList(docs));
    } catch {
      notify.error('Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, [studentId, notify]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Load readiness doc on mount (PEP-68)
  useEffect(() => {
    if (!studentId) return;
    let active = true;
    (async () => {
      try {
        const readinessDocId = reportTypeFilter === 'baseline' ? 'baseline_report_readiness' : 'term_report_readiness';
        const readinessRef = doc(db, 'students', studentId, 'ai_summaries', readinessDocId);
        const snap = await getDoc(readinessRef);
        if (!active) return;
        if (snap.exists()) {
          const data = snap.data();
          setReadiness({
            sentimentScore: data.sentimentScore ?? null,
            areaBalanceScore: data.areaBalanceScore ?? null,
            missingInputFlags: data.missingInputFlags || [],
            noteCount: data.noteCount ?? 0,
            noteCountAtCheck: data.noteCountAtCheck ?? 0,
            checkedAt: data.checkedAt?.toDate?.() || null,
            status: data.status || 'ok',
            dateRangeStart: data.dateRangeStart?.toDate?.() || data.dateRangeStart || null,
            dateRangeEnd: data.dateRangeEnd?.toDate?.() || data.dateRangeEnd || null,
          });
        }
      } catch {
        // Non-blocking — readiness is advisory
      } finally {
        if (active) setReadinessLoading(false);
      }
    })();
    return () => { active = false; };
  }, [studentId, reportTypeFilter]);

  // Subscribe to SaveQueue for in-progress report_export items
  useEffect(() => {
    if (!studentId) return;
    const unsubscribe = subscribeSaveQueue((items) => {
      const activeExports = (items || []).filter((i) =>
        i.kind === 'report_export' &&
        i.studentId === studentId &&
        (i.status === SAVE_QUEUE_STATUS.PENDING || i.status === SAVE_QUEUE_STATUS.PROCESSING)
      );
      setExportingCount(activeExports.length);
    });
    return unsubscribe;
  }, [studentId]);

  // Subscribe to SaveQueue for completed report_export items — refresh list
  useEffect(() => {
    if (!studentId) return;
    const prevStatuses = new Map();
    const unsubscribe = subscribeSaveQueue((items) => {
      let hasNewCompletion = false;
      (items || []).forEach((item) => {
        if (item.kind !== 'report_export' || item.studentId !== studentId) return;
        const prev = prevStatuses.get(item.id);
        if (item.status === SAVE_QUEUE_STATUS.COMPLETED && prev && prev !== SAVE_QUEUE_STATUS.COMPLETED) {
          hasNewCompletion = true;
        }
        prevStatuses.set(item.id, item.status);
      });
      // Clean up IDs no longer in queue
      const currentIds = new Set((items || []).map((i) => i.id));
      prevStatuses.forEach((_, id) => {
        if (!currentIds.has(id)) prevStatuses.delete(id);
      });
      if (hasNewCompletion) {
        loadReports();
      }
    });
    return unsubscribe;
  }, [studentId, loadReports]);

  // Auto-open report dialog when navigated to via pendingViewReportId
  useEffect(() => {
    if (!pendingViewReportId || reports.length === 0) return;
    const report = reports.find((r) => r.id === pendingViewReportId);
    if (report) {
      setSelectedReport(report);
      setPreviewOpen(true);
    }
    // Always clear after first attempt — prevents stale ID matching a different student's report
    if (onPendingViewHandled) onPendingViewHandled();
  }, [pendingViewReportId, reports, onPendingViewHandled]);

  // Compute staleness (PEP-68)
  useEffect(() => {
    if (!studentId) return;
    const latestReport = reports[0]; // sorted newest-first by buildReportList
    if (latestReport?.noteCount != null && readiness?.noteCount != null) {
      const delta = readiness.noteCount - latestReport.noteCount;
      setNewNotesSinceReport(Math.max(0, delta));
    } else if (!latestReport) {
      setNewNotesSinceReport(null);
    }
  }, [studentId, reports, readiness]);

  const handleCheckReadiness = async ({ dateRangeStart, dateRangeEnd }) => {
    try {
      setReadinessLoading(true);
      const call = httpsCallable(cloudFunctions, 'checkReportReadiness', { timeout: 60_000 });
      const result = await call({ studentId, dateRangeStart, dateRangeEnd, reportType: reportTypeFilter || 'term' });
      setReadiness({
        sentimentScore: result.data.sentimentScore ?? null,
        areaBalanceScore: result.data.areaBalanceScore ?? null,
        missingInputFlags: result.data.missingInputFlags || [],
        noteCount: result.data.noteCount ?? 0,
        noteCountAtCheck: result.data.noteCountAtCheck ?? 0,
        checkedAt: result.data.checkedAt ? new Date(result.data.checkedAt) : new Date(),
        status: result.data.status || 'ok',
        dateRangeStart: dateRangeStart || null,
        dateRangeEnd: dateRangeEnd || null,
      });
      // Recompute staleness after fresh check
      const latestReport = reports[0];
      if (latestReport?.noteCount != null && result.data.noteCount != null) {
        setNewNotesSinceReport(Math.max(0, result.data.noteCount - latestReport.noteCount));
      }
    } catch (e) {
      notify.error(friendlyFunctionError(e));
    } finally {
      setReadinessLoading(false);
    }
  };

  const handleGenerate = async ({ dateRangeStart, dateRangeEnd, reportType = 'term' }) => {
    try {
      setGenerating(true);
      trackEvent('report_generate_start', { studentId, reportType }).catch(() => {});
      const call = httpsCallable(cloudFunctions, 'generateStudentReport', { timeout: 300_000 });
      const result = await call({ studentId, dateRangeStart, dateRangeEnd, reportType });
      const draft = {
        // No id — this is a draft, not yet in Firestore
        generatedAt: result.data.generatedAt ? new Date(result.data.generatedAt) : new Date(),
        noteCount: result.data.noteCount ?? null,
        reportText: result.data.reportText || '',
        reportType: result.data.reportType || reportType,
        status: result.data.status || null,
        dateRangeStart: result.data.dateRangeStart || null,
        dateRangeEnd: result.data.dateRangeEnd || null,
        programId: result.data.programId || '',
        model: result.data.model || '',
        sourceNoteIds: result.data.sourceNoteIds || [],
        generatedBy: result.data.generatedBy || '',
        generatedByName: result.data.generatedByName || null,
        driveDocLink: null,
      };
      setDraftReport(draft);
      setSelectedReport(draft);
      setGenerateOpen(false);
      setPreviewOpen(true);
      trackEvent('report_generate_success', { studentId }).catch(() => {});
    } catch (e) {
      // Keep dialog open so the user can adjust dates and retry
      notify.error(friendlyFunctionError(e));
      trackEvent('report_generate_error', { studentId, error: e?.message }).catch(() => {});
    } finally {
      setGenerating(false);
    }
  };

  const handleExportToDrive = async () => {
    if (!studentId) return;
    const isDraft = !selectedReport?.id;

    if (isDraft) {
      // Generate a stable queue item ID
      const queueItemId = `sq_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      // Unique doc ID per draft: baseline uses month+timestamp suffix, term uses timestamp
      const reportDocId = selectedReport?.reportType === 'baseline'
        ? `baseline_report_${new Date(selectedReport.dateRangeEnd || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString(36)}`
        : `report_${Date.now()}`;
      // Queue the draft save + Drive export in the background
      enqueueSaveQueueItems([{
        id: queueItemId,
        kind: 'report_export',
        studentId,
        studentName: studentLabel,
        title: `Report for ${studentLabel}`,
        maxAttempts: REPORT_EXPORT_MAX_ATTEMPTS,
        payload: {
          studentId,
          reportDocId,
          reportPayload: selectedReport,
        },
      }]);
      setPreviewOpen(false);
      setDraftReport(null); // Clear draft to prevent double-enqueue — see PEP-101
      notify.info(`Saving and exporting report for ${studentLabel}...`, { duration: 4000 });
      trackEvent('report_export_queued', { studentId }).catch(() => {});
      return;
    }

    // Non-draft path: synchronous export (existing behavior)
    try {
      setExporting(true);
      trackEvent('report_export_start', { studentId, isDraft }).catch(() => {});
      const call = httpsCallable(cloudFunctions, 'exportReportToDrive', { timeout: 240_000 });
      const result = await call({ studentId, reportDocId: selectedReport.id });
      const link = result.data.driveDocLink;
      setSelectedReport((prev) => ({ ...prev, driveDocLink: link }));
      setReports((prev) =>
        prev.map((r) => (r.id === selectedReport.id ? { ...r, driveDocLink: link } : r))
      );
      trackEvent('report_export_success', { studentId }).catch(() => {});
    } catch (e) {
      notify.error(friendlyFunctionError(e));
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
      const call = httpsCallable(cloudFunctions, 'deleteStudentReport', { timeout: 120_000 });
      await call({ studentId, reportDocId: target.id });
      notify.success('Report deleted', { duration: 3000 });
    } catch (e) {
      // Restore the report on failure
      setReports((prev) => {
        if (prev.some((r) => r.id === target.id)) return prev;
        return [...prev, target].sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0));
      });
      notify.error(friendlyFunctionError(e));
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
    }
  };

  // Filter reports by type when a filter is active
  const filteredReports = useMemo(() => {
    if (!reportTypeFilter) return reports;
    return reports.filter((r) => (r.reportType || 'term') === reportTypeFilter);
  }, [reports, reportTypeFilter]);

  return (
    <>
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, px: 2, py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => !readiness && !readinessLoading ? setReadinessNudgeOpen(true) : setGenerateOpen(true)}
          disabled={generating || !studentId || (readinessLoading && !readiness)}
          sx={{
            textTransform: 'none',
            borderRadius: 2,
            background: 'linear-gradient(135deg, var(--color-secondary) 0%, var(--color-secondary-dark) 100%)',
            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
            '&:hover': {
              background: 'linear-gradient(135deg, var(--color-secondary-dark) 0%, var(--color-green-deep) 100%)',
            },
          }}
        >
          Generate Report
        </Button>
      </Box>

      {/* Report Readiness (PEP-68) */}
      <Box
        sx={{
          borderRadius: 3,
          p: 2,
          background: 'linear-gradient(135deg, var(--color-indigo-bg) 0%, var(--color-green-bg-light) 100%)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          boxShadow: '0 2px 8px rgba(99, 102, 241, 0.08)',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(99, 102, 241, 0.12)',
            }}
          >
            <ReadinessIcon size={16} style={{ color: 'var(--color-primary)' }} />
          </Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--color-indigo-deeper)', letterSpacing: '-0.01em' }}>
            Report Readiness
          </Typography>
        </Stack>

        {readinessLoading && !readiness && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1 }}>
            <CircularProgress size={16} sx={{ color: 'var(--color-primary)' }} />
            <Typography variant="caption" sx={{ color: 'var(--color-text-soft)' }}>
              Loading readiness data...
            </Typography>
          </Stack>
        )}

        {!readinessLoading && readiness && readiness.status !== 'no_notes' ? (
          <Stack spacing={1}>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {readiness.sentimentScore != null && (
                <Chip label={`Sentiment: ${readiness.sentimentScore}`} size="small" color={getScoreColor(readiness.sentimentScore)} variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
              )}
              {readiness.areaBalanceScore != null && (
                <Chip label={`Balance: ${readiness.areaBalanceScore}`} size="small" color={getScoreColor(readiness.areaBalanceScore)} variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
              )}
              {!readiness.missingInputFlags?.length && (
                <Chip label="Complete" size="small" color="success" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
              )}
              <Chip label={`${readiness.noteCount} notes`} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
            </Stack>
            {readiness.dateRangeStart && readiness.dateRangeEnd && (
              <Typography variant="caption" sx={{ color: 'var(--color-text-soft)', mt: 0.25 }}>
                Period: {formatReportDate(readiness.dateRangeStart instanceof Date ? readiness.dateRangeStart : new Date(readiness.dateRangeStart))} – {formatReportDate(readiness.dateRangeEnd instanceof Date ? readiness.dateRangeEnd : new Date(readiness.dateRangeEnd))}
              </Typography>
            )}
            {readiness.missingInputFlags?.length > 0 && (
              <Box sx={{ mt: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'var(--color-amber-dark)', display: 'block', mb: 0.25 }}>
                  Missing data
                </Typography>
                {readiness.missingInputFlags.map((flag, i) => (
                  <Typography key={i} variant="caption" sx={{ display: 'block', color: 'var(--color-amber-dark)', lineHeight: 1.6, pl: 1 }}>
                    {flag}
                  </Typography>
                ))}
              </Box>
            )}
            <Button
              size="small"
              variant="outlined"
              startIcon={readinessLoading ? <CircularProgress size={14} /> : <ReadinessIcon size={16} />}
              onClick={() => setRerunConfirmOpen(true)}
              disabled={readinessLoading}
              sx={{
                textTransform: 'none',
                fontSize: '0.8rem',
                borderRadius: 2,
                alignSelf: 'flex-start',
                borderColor: 'rgba(99, 102, 241, 0.4)',
                color: 'var(--color-primary)',
                '&:hover': { borderColor: 'var(--color-primary)', bgcolor: 'rgba(99, 102, 241, 0.04)' },
              }}
            >
              {readinessLoading ? 'Checking...' : 'Re-run check'}
            </Button>
          </Stack>
        ) : !readinessLoading && readiness && readiness.status === 'no_notes' ? (
          <Alert severity="warning" sx={{ borderRadius: 1.5, fontSize: '0.8rem' }}>
            No observations found in this date range.
          </Alert>
        ) : !readinessLoading ? (
          <Stack spacing={1} alignItems="flex-start">
            <Typography variant="caption" sx={{ color: 'var(--color-text-soft)' }}>
              Report readiness check not run yet!
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={readinessLoading ? <CircularProgress size={14} /> : <ReadinessIcon size={16} />}
              onClick={() => setRerunConfirmOpen(true)}
              disabled={readinessLoading}
              sx={{
                textTransform: 'none',
                fontSize: '0.8rem',
                borderRadius: 2,
                borderColor: 'rgba(99, 102, 241, 0.4)',
                color: 'var(--color-primary)',
                '&:hover': { borderColor: 'var(--color-primary)', bgcolor: 'rgba(99, 102, 241, 0.04)' },
              }}
            >
              {readinessLoading ? 'Checking...' : 'Check report readiness'}
            </Button>
          </Stack>
        ) : null}
      </Box>

      {exportingCount > 0 && (
        <Alert
          severity="info"
          icon={<CircularProgress size={18} />}
          sx={{ borderRadius: 2 }}
        >
          Exporting {exportingCount === 1 ? 'a report' : `${exportingCount} reports`} to Drive...
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {!loading && filteredReports.length === 0 && exportingCount === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <ReportIcon size={48} style={{ color: 'var(--grey-300)', marginBottom: 8 }} />
          <Typography variant="body1" sx={{ color: 'var(--color-text-faint)' }}>
            No reports yet
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--grey-300)', mt: 0.5 }}>
            Generate a report to see it here
          </Typography>
        </Box>
      )}

      {!loading && filteredReports.length > 0 && (
        <List disablePadding>
          {filteredReports.map((report) => {
            const evalScores = getEvalScores(report);
            const hasMissing = evalScores.missingInputFlags?.length > 0;
            const isExpanded = expandedMissing.has(report.id);
            return (
            <ListItem
              key={report.id}
              sx={{
                borderRadius: 2,
                border: '1px solid var(--color-border)',
                mb: 1,
                '&:hover': { backgroundColor: 'rgba(5, 150, 105, 0.04)' },
                py: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
              }}
            >
              {/* Top row: date/author left, notes + actions right */}
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--color-text)' }}>
                    {formatReportDate(report.generatedAt)}
                  </Typography>
                  {report.generatedByName && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                      <User size={14} style={{ display: "inline", verticalAlign: "middle" }} />
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                        {report.generatedByName}
                      </Typography>
                    </Box>
                  )}
                </Box>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                  <Chip
                    label={report.reportType === 'baseline' ? 'Baseline' : 'Term'}
                    size="small"
                    variant="outlined"
                    sx={{
                      height: 22,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      borderColor: report.reportType === 'baseline' ? 'var(--color-secondary)' : 'var(--color-primary)',
                      color: report.reportType === 'baseline' ? 'var(--color-secondary)' : 'var(--color-primary)',
                    }}
                  />
                  {report.noteCount != null && (
                    <Chip label={`${report.noteCount} notes`} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                  )}
                  {report.status === 'no_notes' && (
                    <Chip label="No notes" size="small" color="warning" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                  )}
                  <IconButton
                    size="small"
                    onClick={() => handleViewReport(report)}
                    sx={{ color: 'var(--color-primary)' }}
                    aria-label={`View report from ${formatReportDate(report.generatedAt)}`}
                  >
                    <ViewIcon size={20} />
                  </IconButton>
                  {isAdminRole(userRole) && (
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteClick(report)}
                      disabled={deletingIds.has(report.id)}
                      sx={{ color: 'var(--color-error-light)' }}
                      aria-label={`Delete report from ${formatReportDate(report.generatedAt)}`}
                    >
                      <DeleteIcon size={20} />
                    </IconButton>
                  )}
                </Stack>
              </Box>

              {/* Quality flags row — eval scores from readiness (term) or reportEval (baseline) */}
              {report.status !== 'no_notes' && (evalScores.sentimentScore != null || evalScores.areaBalanceScore != null || evalScores.missingInputFlags?.length > 0) && (
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                  {evalScores.sentimentScore != null && (
                    <Chip label={`Sentiment: ${evalScores.sentimentScore}`} size="small" color={getScoreColor(evalScores.sentimentScore)} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                  )}
                  {evalScores.areaBalanceScore != null && (
                    <Chip label={`Balance: ${evalScores.areaBalanceScore}`} size="small" color={getScoreColor(evalScores.areaBalanceScore)} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                  )}
                  {hasMissing ? (
                    <Chip
                      label="Missing data"
                      size="small"
                      color="warning"
                      variant="outlined"
                      deleteIcon={<ExpandMoreIcon size={14} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}
                      onDelete={() => setExpandedMissing((prev) => {
                        const next = new Set(prev);
                        next.has(report.id) ? next.delete(report.id) : next.add(report.id);
                        return next;
                      })}
                      onClick={() => setExpandedMissing((prev) => {
                        const next = new Set(prev);
                        next.has(report.id) ? next.delete(report.id) : next.add(report.id);
                        return next;
                      })}
                      sx={{ height: 20, fontSize: '0.7rem', cursor: 'pointer' }}
                    />
                  ) : (
                    <Chip label="Complete" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                  )}
                </Stack>
              )}

              {/* Expanded missing flags */}
              <Collapse in={isExpanded && hasMissing}>
                <Box sx={{ mt: 0.75, pl: 0.5 }}>
                  {evalScores.missingInputFlags?.map((flag, i) => (
                    <Typography key={i} variant="caption" sx={{ display: 'block', color: 'var(--color-amber-dark)', lineHeight: 1.6 }}>
                      • {flag}
                    </Typography>
                  ))}
                </Box>
              </Collapse>
            </ListItem>
            );
          })}
        </List>
      )}
    </Box>

      <ReportGenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerate={handleGenerate}
        generating={generating}
        studentLabel={studentLabel}
        initialReportType={reportTypeFilter || 'term'}
      />

      <ReportPreviewDialog
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          if (draftReport) setDraftReport(null);
        }}
        reportText={selectedReport?.reportText || ''}
        reportType={selectedReport?.reportType || 'term'}
        missingInputFlags={selectedReport?.missingInputFlags || readiness?.missingInputFlags || []}
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

      <Dialog
        open={readinessNudgeOpen}
        onClose={() => setReadinessNudgeOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            background: 'linear-gradient(180deg, var(--color-indigo-bg) 0%, var(--color-paper) 55%)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 18px 50px rgba(15, 23, 42, 0.18)',
          },
        }}
      >
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0.08) 70%)',
                  border: '1px solid rgba(99,102,241,0.35)',
                }}
              >
                <ReadinessIcon size={22} style={{ color: 'var(--color-primary)' }} />
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'var(--grey-900)' }}>
                Check readiness first?
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ color: 'var(--grey-600)' }}>
              Report readiness hasn&apos;t been checked for {studentLabel} yet. Running it first helps ensure there are enough observations for a quality report.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexDirection: 'column', alignItems: 'stretch' }}>
          <Button
            variant="contained"
            onClick={() => {
              setReadinessNudgeOpen(false);
              setRerunConfirmOpen(true);
            }}
            sx={{
              textTransform: 'none',
              borderRadius: 999,
              boxShadow: '0 10px 20px rgba(79, 70, 229, 0.25)',
            }}
          >
            Run report readiness
          </Button>
          <Button
            onClick={() => {
              setReadinessNudgeOpen(false);
              setGenerateOpen(true);
            }}
            sx={{ textTransform: 'none', color: 'var(--grey-600)' }}
          >
            Generate anyway
          </Button>
        </DialogActions>
      </Dialog>

      <ReadinessCheckDialog
        open={rerunConfirmOpen}
        onClose={() => setRerunConfirmOpen(false)}
        onConfirm={({ dateRangeStart, dateRangeEnd }) => {
          setRerunConfirmOpen(false);
          handleCheckReadiness({ dateRangeStart, dateRangeEnd });
        }}
        loading={readinessLoading}
        studentLabel={studentLabel}
        newNotesSinceReport={newNotesSinceReport}
        initialStartDate={readiness?.dateRangeStart}
        initialEndDate={readiness?.dateRangeEnd}
      />
    </>
  );
}
