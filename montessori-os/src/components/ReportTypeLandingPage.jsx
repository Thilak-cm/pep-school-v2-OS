import React from 'react';
import {
  Box,
  Typography,
  Stack,
  Card,
  CardActionArea,
  CardContent,
} from '@mui/material';
import {
  FileText as TermIcon,
  Baby as BaselineIcon,
  CalendarDays as MonthlyIcon,
  ChevronRight,
} from '../icons';
import NewFeaturePill from './NewFeaturePill';

const REPORT_TYPES = [
  {
    key: 'term',
    label: 'Term Report',
    description: 'Comprehensive end-of-term report covering the full academic period.',
    icon: TermIcon,
    iconColor: 'var(--color-primary)',
    bgGradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(99, 102, 241, 0.02) 100%)',
    borderColor: 'rgba(99, 102, 241, 0.2)',
    enabled: true,
  },
  {
    key: 'baseline',
    label: 'Baseline Report',
    description: 'Settling-in report for new students in their first month at a program.',
    icon: BaselineIcon,
    iconColor: 'var(--color-secondary)',
    bgGradient: 'linear-gradient(135deg, rgba(76, 175, 80, 0.08) 0%, rgba(76, 175, 80, 0.02) 100%)',
    borderColor: 'rgba(76, 175, 80, 0.2)',
    enabled: true,
  },
  {
    key: 'monthly',
    label: 'Monthly Report',
    description: 'Recurring monthly summary for ongoing students.',
    icon: MonthlyIcon,
    iconColor: 'var(--grey-400)',
    bgGradient: 'linear-gradient(135deg, rgba(158, 158, 158, 0.06) 0%, rgba(158, 158, 158, 0.02) 100%)',
    borderColor: 'rgba(158, 158, 158, 0.15)',
    enabled: false,
  },
];

export default function ReportTypeLandingPage({ onSelectType, studentLabel = 'Student' }) {
  return (
    <Box sx={{ px: 2, py: 2, maxWidth: 480, mx: 'auto' }}>
      <Typography
        variant="subtitle1"
        sx={{ fontWeight: 800, color: 'var(--grey-900)', mb: 0.5 }}
      >
        Reports
      </Typography>
      <Typography
        variant="body2"
        sx={{ color: 'var(--grey-600)', mb: 2.5 }}
      >
        Choose a report type for {studentLabel}
      </Typography>

      <Stack spacing={1.5}>
        {REPORT_TYPES.map((type) => {
          const Icon = type.icon;
          const enabled = type.enabled;
          return (
            <Card
              key={type.key}
              variant="outlined"
              sx={{
                borderRadius: 3,
                border: `1px solid ${type.borderColor}`,
                background: type.bgGradient,
                opacity: enabled ? 1 : 0.55,
                transition: 'box-shadow 0.2s, border-color 0.2s',
                ...(enabled && {
                  '&:hover': {
                    borderColor: type.iconColor,
                    boxShadow: `0 4px 16px ${type.borderColor}`,
                  },
                }),
              }}
            >
              {enabled ? (
                <CardActionArea
                  onClick={() => onSelectType?.(type.key)}
                  sx={{ borderRadius: 3 }}
                >
                  <CardContent sx={{ py: 2, px: 2.5 }}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <Box
                        sx={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: `${type.iconColor}14`,
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={22} style={{ color: type.iconColor }} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: 700, color: 'var(--grey-900)' }}
                        >
                          {type.label}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: 'var(--grey-500)', lineHeight: 1.4 }}
                        >
                          {type.description}
                        </Typography>
                      </Box>
                      <ChevronRight size={20} style={{ color: 'var(--grey-400)', flexShrink: 0 }} />
                    </Stack>
                  </CardContent>
                </CardActionArea>
              ) : (
                <CardContent sx={{ py: 2, px: 2.5 }}>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'rgba(158, 158, 158, 0.08)',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={22} style={{ color: type.iconColor }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: 700, color: 'var(--grey-400)' }}
                        >
                          {type.label}
                        </Typography>
                        <NewFeaturePill label="Coming Soon" size="sm" />
                      </Stack>
                      <Typography
                        variant="caption"
                        sx={{ color: 'var(--grey-400)', lineHeight: 1.4 }}
                      >
                        {type.description}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              )}
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}
