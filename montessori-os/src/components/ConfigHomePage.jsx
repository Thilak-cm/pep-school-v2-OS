import React from 'react';
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Avatar,
  Grid,
  Alert
} from '@mui/material';
import { Settings as Tune, Brain as Psychology, Calendar } from '../icons';
import { isSuperAdmin } from '../utils/roleUtils';

export default function ConfigHomePage({ userRole, onOpenLessonNoteConfig, onOpenAiTools, onOpenDigestConfig }) {
  const isAdmin = isSuperAdmin(userRole);

  if (!isAdmin) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Access denied. Super admins only.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card
        sx={{
          borderRadius: 2,
          '&:hover': {
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            transform: 'translateY(-2px)',
          },
          transition: 'all 0.2s ease-in-out',
        }}
      >
        <CardActionArea onClick={onOpenLessonNoteConfig} sx={{ p: 0 }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: 'var(--color-sky)', width: 56, height: 56 }}>
                <Tune />
              </Avatar>
              <Box>
                <Typography variant="h6" component="h3" sx={{ color: 'var(--color-text)', fontWeight: 600 }}>
                  Lesson Notes Config
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', mt: 0.5 }}>
                  Manage lesson title suggestions and program-specific dimensions
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>

      <Card
        sx={{
          borderRadius: 2,
          '&:hover': {
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            transform: 'translateY(-2px)',
          },
          transition: 'all 0.2s ease-in-out',
        }}
      >
        <CardActionArea onClick={onOpenAiTools} sx={{ p: 0 }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: 'var(--color-violet-dark)', width: 56, height: 56 }}>
                <Psychology />
              </Avatar>
              <Box>
                <Typography variant="h6" component="h3" sx={{ color: 'var(--color-text)', fontWeight: 600 }}>
                  AI Tools
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', mt: 0.5 }}>
                  Configure Text Cleanup, Voice Transcriber, and Coach prompts
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>

      <Card
        sx={{
          borderRadius: 2,
          '&:hover': {
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            transform: 'translateY(-2px)',
          },
          transition: 'all 0.2s ease-in-out',
        }}
      >
        <CardActionArea onClick={onOpenDigestConfig} sx={{ p: 0 }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: 'var(--color-secondary)', width: 56, height: 56 }}>
                <Calendar />
              </Avatar>
              <Box>
                <Typography variant="h6" component="h3" sx={{ color: 'var(--color-text)', fontWeight: 600 }}>
                  School Context Notes
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', mt: 0.5 }}>
                  Manage context notes the AI uses across weekly digests
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>
    </Box>
  );
}

