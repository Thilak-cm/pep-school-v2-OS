// YourAssessmentsPage.jsx - #313: Uploader-scoped assessment upload list
import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, CircularProgress, LinearProgress } from '@mui/material';
import Chip from '@mui/material/Chip';
import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../firebase';
import { ListChecks, ChevronRight } from '../icons';
import { trackEvent } from '../utils/analytics';

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  const millis = timestampMillis(value);
  return millis ? new Date(millis).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

function formatDateRange(range) {
  if (!range) return '';
  if (range.startDate === range.endDate) return range.startDate;
  return `${range.startDate} - ${range.endDate}`;
}

export default function YourAssessmentsPage({ onSelectUpload }) {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fn = httpsCallable(cloudFunctions, 'listMyAssessmentUploads');
        const result = await fn();
        if (!cancelled) setUploads(result.data || []);
      } catch (err) {
        console.error('[YourAssessmentsPage] load failed:', err);
        if (!cancelled) setError(err.message || 'Failed to load assessments');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  if (uploads.length === 0) {
    return (
      <Box sx={{ px: 2, py: 6, textAlign: 'center' }}>
        <ListChecks size={40} style={{ color: 'var(--color-text-soft)', marginBottom: 12 }} />
        <Typography variant="body2" sx={{ color: 'var(--color-text-soft)' }}>
          No assessments uploaded yet
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {uploads.map((upload) => {
        const isSlowBurn = upload.dateRange && upload.dateRange.endDate >= new Date().toISOString().slice(0, 10) &&
          upload.dateRange.startDate !== upload.dateRange.endDate;
        const hasPending = (upload.pendingCount || 0) > 0;
        const progress = upload.studentCount > 0 ? ((upload.gradedCount || 0) / upload.studentCount) * 100 : 100;

        return (
          <Card
            key={upload.sourceId}
            onClick={() => {
              trackEvent('your_assessments_select', { sourceId: upload.sourceId }).catch(() => {});
              onSelectUpload?.(upload.sourceId, upload.assessmentName);
            }}
            sx={{
              cursor: 'pointer',
              borderRadius: 2,
              border: '1px solid var(--color-border)',
              background: 'var(--color-paper)',
              '&:hover': { borderColor: 'var(--color-primary)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
            }}
          >
            <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {upload.assessmentName}
                    </Typography>
                    {upload.criticality === 'high' && (
                      <Chip label="High" size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, backgroundColor: 'var(--color-indigo-bg)', color: 'var(--color-primary)' }} />
                    )}
                  </Box>
                  <Typography variant="caption" sx={{ color: 'var(--color-text-soft)' }}>
                    {formatDateRange(upload.dateRange)} - {upload.studentCount} student{upload.studentCount !== 1 ? 's' : ''}
                  </Typography>
                </Box>
                <ChevronRight size={18} style={{ color: 'var(--color-text-soft)', flexShrink: 0, marginTop: 2 }} />
              </Box>

              {/* Status pill */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                {hasPending ? (
                  <Chip
                    label={`${upload.pendingCount} absent pending`}
                    size="small"
                    sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600, backgroundColor: 'rgba(245, 158, 11, 0.12)', color: 'var(--color-warning)' }}
                  />
                ) : (
                  <Chip
                    label="All recorded"
                    size="small"
                    sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600, backgroundColor: 'rgba(34, 197, 94, 0.12)', color: 'var(--color-secondary)' }}
                  />
                )}
                <Typography variant="caption" sx={{ color: 'var(--color-text-soft)', ml: 'auto' }}>
                  {formatDate(upload.publishedAt)}
                </Typography>
              </Box>

              {/* Slow-burn progress bar */}
              {isSlowBurn && (
                <Box sx={{ mt: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={progress}
                    sx={{
                      height: 4, borderRadius: 2,
                      backgroundColor: 'var(--color-border)',
                      '& .MuiLinearProgress-bar': { backgroundColor: 'var(--color-secondary)' },
                    }}
                  />
                  <Typography variant="caption" sx={{ color: 'var(--color-text-soft)', mt: 0.25, display: 'block' }}>
                    {upload.gradedCount || 0}/{upload.studentCount} assessed
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}
