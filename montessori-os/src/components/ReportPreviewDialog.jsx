import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Stack,
  Box,
  Chip,
  IconButton,
  Divider,
  Popover,
} from '@mui/material';
import { X as Close, FileText as ReportIcon, Upload as ExportIcon, TriangleAlert as WarningAmber } from '../icons';
import { parseReportSections, renderSectionContent } from '../utils/reportUtils';

export default function ReportPreviewDialog({
  open,
  onClose,
  reportText = '',
  missingInputFlags = [],
  generatedAt = null,
  studentLabel = 'Student',
  noteCount = null,
  onExportToDrive = null,
  exporting = false,
  driveDocLink = null,
  isDraft = false,
}) {
  const sections = useMemo(() => parseReportSections(reportText), [reportText]);
  const [flagsAnchorEl, setFlagsAnchorEl] = useState(null);

  // Reset popover anchor when dialog closes to avoid stale DOM references
  useEffect(() => {
    if (!open) setFlagsAnchorEl(null);
  }, [open]);

  const formatGeneratedAt = (value) => {
    if (!value) return null;
    const raw = value?.toDate ? value.toDate() : value;
    const date = typeof raw === 'string' ? new Date(raw) : raw;
    if (isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }).format(date);
  };

  const generatedLabel = formatGeneratedAt(generatedAt);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          maxHeight: '85vh',
          border: '1px solid var(--color-border)',
        },
      }}
    >
      <Box
        sx={{
          px: 3,
          pt: 2.5,
          pb: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(180deg, var(--color-indigo-bg) 0%, var(--color-paper) 100%)',
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ReportIcon size={24} style={{ color: 'var(--color-primary)' }} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'var(--grey-900)' }}>
              {studentLabel}'s Report
            </Typography>
            {(generatedLabel || noteCount !== null) && (
              <Typography variant="caption" sx={{ color: 'var(--color-text-soft)' }}>
                {[
                  generatedLabel ? `Generated ${generatedLabel}` : null,
                  noteCount !== null ? `${noteCount} observations` : null,
                ].filter(Boolean).join(' \u00b7 ')}
              </Typography>
            )}
          </Box>
        </Stack>
        <IconButton onClick={onClose} size="small">
          <Close size={20} />
        </IconButton>
      </Box>

      <DialogContent sx={{ px: 3, py: 2 }}>
        <Stack spacing={2}>
          {missingInputFlags.length > 0 && (
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<WarningAmber size={18} />}
                onClick={(e) => setFlagsAnchorEl(e.currentTarget)}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  borderRadius: 2,
                  borderColor: 'var(--color-warning)',
                  color: 'var(--color-amber-text)',
                  backgroundColor: 'var(--color-amber-warm)',
                  px: 1.5,
                  alignSelf: 'flex-start',
                  '&:hover': {
                    borderColor: 'var(--color-warning-dark)',
                    backgroundColor: 'var(--color-amber-bg)',
                  },
                }}
              >
                {missingInputFlags.length} missing {missingInputFlags.length === 1 ? 'input' : 'inputs'}
              </Button>
              <Popover
                open={Boolean(flagsAnchorEl)}
                anchorEl={flagsAnchorEl}
                onClose={() => setFlagsAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                PaperProps={{ sx: { p: 2, maxWidth: 340, border: '1px solid var(--color-amber-yellow)' } }}
              >
                <Stack spacing={1.25}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <WarningAmber size={20} style={{ color: 'var(--color-warning)' }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'var(--color-amber-text)' }}>
                      Missing inputs
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'var(--color-amber-text)' }}>
                    This report was generated without data in these areas.
                  </Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {missingInputFlags.map((flag, i) => (
                      <Chip key={i} label={flag} size="small" variant="outlined" />
                    ))}
                  </Stack>
                </Stack>
              </Popover>
            </>
          )}

          {sections.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No report content available.
            </Typography>
          ) : (
            sections.map((section, idx) => {
              const blocks = renderSectionContent(section.content);
              return (
                <Box key={idx}>
                  {idx > 0 && section.heading && <Divider sx={{ mb: 1.5 }} />}
                  {section.heading && (
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 700,
                        color: 'var(--color-text)',
                        mb: 0.75,
                      }}
                    >
                      {section.heading}
                    </Typography>
                  )}
                  {blocks.map((block, bIdx) => (
                    <Box key={bIdx} sx={{ mb: block.subheading ? 1 : 0 }}>
                      {block.subheading && (
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 600,
                            color: 'var(--grey-600)',
                            mt: bIdx > 0 ? 1.5 : 0,
                            mb: 0.5,
                          }}
                        >
                          {block.subheading}
                        </Typography>
                      )}
                      {block.text.trim() && (
                        <Typography
                          variant="body2"
                          sx={{
                            color: 'var(--grey-700)',
                            lineHeight: 1.7,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {block.text.trim()}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              );
            })
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <Button
          onClick={onClose}
          sx={{ textTransform: 'none', color: isDraft ? 'var(--color-error-light)' : 'var(--grey-600)' }}
        >
          {isDraft ? 'Discard' : 'Close'}
        </Button>
        {onExportToDrive && (
          driveDocLink ? (
            <Button
              variant="outlined"
              size="small"
              startIcon={<ExportIcon />}
              href={driveDocLink}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ textTransform: 'none', borderRadius: 2 }}
            >
              Open in Drive
            </Button>
          ) : (
            <Button
              variant="contained"
              size="small"
              startIcon={<ExportIcon />}
              onClick={onExportToDrive}
              disabled={exporting || !reportText}
              sx={{
                textTransform: 'none',
                borderRadius: 2,
                background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-violet-dark) 100%)',
              }}
            >
              {exporting
                ? (isDraft ? 'Saving…' : 'Exporting…')
                : (isDraft ? 'Save & Export to Drive' : 'Export to Drive')}
            </Button>
          )
        )}
      </DialogActions>
    </Dialog>
  );
}
