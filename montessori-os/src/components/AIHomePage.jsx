import React from 'react';
import { Box, Card, CardContent, CardActionArea, Typography, Avatar } from '@mui/material';
import { Description, GraphicEq, Psychology } from '@mui/icons-material';

export default function AIHomePage({ userRole, onOpenTextEditor, onOpenVoiceEditor, onOpenCoachEditor }) {
  const isAdmin = userRole === 'admin';

  if (!isAdmin) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="error">Access denied. Admins only.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card sx={{ borderRadius: 2, '&:hover': { boxShadow: '0 8px 24px rgba(0,0,0,0.12)', transform: 'translateY(-2px)' }, transition: 'all 0.2s ease-in-out' }}>
        <CardActionArea onClick={onOpenTextEditor} sx={{ p: 0 }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: '#0ea5e9', width: 56, height: 56 }}>
                <Description />
              </Avatar>
              <Box>
                <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 600 }}>
                  Text Cleanup
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
                  Clean and structure observation notes using configurable prompts
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>

      <Card sx={{ borderRadius: 2, '&:hover': { boxShadow: '0 8px 24px rgba(0,0,0,0.12)', transform: 'translateY(-2px)' }, transition: 'all 0.2s ease-in-out' }}>
        <CardActionArea onClick={onOpenVoiceEditor} sx={{ p: 0 }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: '#7c3aed', width: 56, height: 56 }}>
                <GraphicEq />
              </Avatar>
              <Box>
                <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 600 }}>
                  Voice Transcriber
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
                  Configure STT context to improve transcription accuracy
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>

      <Card sx={{ borderRadius: 2, '&:hover': { boxShadow: '0 8px 24px rgba(0,0,0,0.12)', transform: 'translateY(-2px)' }, transition: 'all 0.2s ease-in-out' }}>
        <CardActionArea onClick={onOpenCoachEditor} sx={{ p: 0 }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: '#16a34a', width: 56, height: 56 }}>
                <Psychology />
              </Avatar>
              <Box>
                <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 600 }}>
                  Coach
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
                  Toggle which nudges Coach can suggest for testing
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>
    </Box>
  );
}
