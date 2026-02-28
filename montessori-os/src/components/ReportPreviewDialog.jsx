import React, { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Stack,
  Box,
  Alert,
  IconButton,
  Divider,
} from '@mui/material';
import { Close, Description as ReportIcon, CloudUpload as ExportIcon } from '@mui/icons-material';
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
}) {
  const sections = useMemo(() => parseReportSections(reportText), [reportText]);

  const formatGeneratedAt = (value) => {
    if (!value) return null;
    const date = typeof value === 'string' ? new Date(value) : value;
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
          border: '1px solid #e2e8f0',
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
          background: 'linear-gradient(180deg, #eef2ff 0%, #ffffff 100%)',
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ReportIcon sx={{ color: '#4f46e5', fontSize: 24 }} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#0f172a' }}>
              {studentLabel}'s Report
            </Typography>
            {(generatedLabel || noteCount !== null) && (
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                {[
                  generatedLabel ? `Generated ${generatedLabel}` : null,
                  noteCount !== null ? `${noteCount} observations` : null,
                ].filter(Boolean).join(' \u00b7 ')}
              </Typography>
            )}
          </Box>
        </Stack>
        <IconButton onClick={onClose} size="small">
          <Close fontSize="small" />
        </IconButton>
      </Box>

      <DialogContent sx={{ px: 3, py: 2 }}>
        <Stack spacing={2}>
          {missingInputFlags.length > 0 && (
            <Stack spacing={1}>
              {missingInputFlags.map((flag, i) => (
                <Alert key={i} severity="warning" sx={{ py: 0.25 }}>
                  {flag}
                </Alert>
              ))}
            </Stack>
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
                        color: '#1e293b',
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
                            color: '#475569',
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
                            color: '#334155',
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
          sx={{ textTransform: 'none', color: '#475569' }}
        >
          Close
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
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              }}
            >
              {exporting ? 'Exporting…' : 'Export to Drive'}
            </Button>
          )
        )}
      </DialogActions>
    </Dialog>
  );
}
