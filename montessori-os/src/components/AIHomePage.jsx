import React from 'react';
import { Box, Card, CardContent, CardActionArea, Typography, Avatar } from '@mui/material';
import { Description, GraphicEq, Psychology, AutoAwesome, Chat } from '@mui/icons-material';
import { isSuperAdmin } from '../utils/roleUtils';

export default function AIHomePage({ userRole, onOpenTextEditor, onOpenVoiceEditor, onOpenCoachEditor, onOpenBaseballCardConfig, onOpenChatCommandCentre }) {
  const isAdmin = isSuperAdmin(userRole);

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
      <CardActionArea onClick={onOpenBaseballCardConfig} sx={{ p: 0 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: '#fb7185', width: 56, height: 56 }}>
              <AutoAwesome />
            </Avatar>
            <Box>
              <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 600 }}>
                Baseball Card
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
                Configure Coach Pepper’s last 6 weeks summary prompt and model
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

      <Card sx={{ borderRadius: 2, '&:hover': { boxShadow: '0 8px 24px rgba(0,0,0,0.12)', transform: 'translateY(-2px)' }, transition: 'all 0.2s ease-in-out' }}>
        <CardActionArea onClick={onOpenChatCommandCentre} sx={{ p: 0 }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: '#6366f1', width: 56, height: 56 }}>
                <Chat />
              </Avatar>
              <Box>
                <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 600 }}>
                  Chat Command Centre
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
                  Configure AI chat settings for per-student conversations
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>
    </Box>
  );
}
