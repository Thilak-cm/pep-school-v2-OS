import React from 'react';
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Avatar,
} from '@mui/material';
import {
  Description as ReportIcon,
  ArrowForward,
} from '@mui/icons-material';
import { trackEvent } from '../utils/analytics';

export default function ReportsCard({ studentId, onClick }) {
  return (
    <Card
      sx={{
        borderRadius: 2,
        '&:hover': { boxShadow: '0 8px 24px rgba(0,0,0,0.12)', transform: 'translateY(-2px)' },
        transition: 'all 0.2s ease-in-out',
      }}
    >
      <CardActionArea
        onClick={() => {
          trackEvent('student_dashboard_card_click', { card: 'reports', studentId }).catch(() => {});
          onClick?.();
        }}
        sx={{ p: 0 }}
      >
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
              <Avatar sx={{ bgcolor: '#059669', width: 48, height: 48 }}>
                <ReportIcon />
              </Avatar>
              <Box>
                <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 700 }}>
                  Reports
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748b' }}>
                  View and generate student reports
                </Typography>
              </Box>
            </Box>
            <ArrowForward sx={{ color: '#94a3b8' }} />
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
