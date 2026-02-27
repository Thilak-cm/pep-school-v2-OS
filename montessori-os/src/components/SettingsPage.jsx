import React, { useState } from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Paper
} from '@mui/material';
import {
  Person,
  BarChart,
  Group,
  Feedback,
  Logout,
  Tune
} from '@mui/icons-material';
import VersionBadge from './VersionBadge';
import { isSuperAdmin } from '../utils/roleUtils';

function SettingsPage({ _currentUser, userRole, onNavigate, onSignOut }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isSuperAdminUser = isSuperAdmin(userRole);

  const menuItems = [
    {
      text: 'Profile',
      icon: <Person />,
      action: () => onNavigate('/profile')
    },
    {
      text: 'Statistics',
      icon: <BarChart />,
      action: () => onNavigate('/stats')
    },
    {
      text: 'My Student Groups',
      icon: <Group />,
      action: () => onNavigate('/aliases')
    },
    {
      text: 'Feedback & Suggestions',
      icon: <Feedback />,
      action: () => onNavigate('/feedback')
    },
    ...(isSuperAdminUser ? [{
      text: 'Configurations',
      icon: <Tune />,
      action: () => onNavigate('/config')
    }] : [])
  ];

  const handleLogout = () => {
    setConfirmOpen(true);
  };

  const confirmLogout = () => {
    setConfirmOpen(false);
    if (onSignOut) onSignOut();
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 1,
          borderRadius: 2,
          border: '1px solid #e2e8f0',
          backgroundColor: 'white',
          overflow: 'hidden'
        }}
      >
        <List sx={{ p: 0 }}>
          {menuItems.map((item) => (
            <ListItemButton
              key={item.text}
              onClick={item.action}
              sx={{
                borderRadius: 1.5,
                mx: 0.5,
                my: 0.5,
                '&:hover': {
                  backgroundColor: 'rgba(79, 70, 229, 0.06)'
                }
              }}
            >
              <ListItemIcon sx={{ minWidth: 42, color: '#4f46e5' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.text}
                primaryTypographyProps={{ fontWeight: 600, color: '#0f172a' }}
              />
            </ListItemButton>
          ))}
        </List>
        <Divider sx={{ mx: 1, my: 0.5 }} />
        <List sx={{ p: 0 }}>
          <ListItemButton
            onClick={handleLogout}
            sx={{
              borderRadius: 1.5,
              mx: 0.5,
              my: 0.5,
              '&:hover': {
                backgroundColor: 'rgba(239, 68, 68, 0.08)'
              }
            }}
          >
            <ListItemIcon sx={{ minWidth: 42, color: '#ef4444' }}>
              <Logout />
            </ListItemIcon>
            <ListItemText
              primary="Log Out"
              primaryTypographyProps={{ fontWeight: 700, color: '#b91c1c' }}
            />
          </ListItemButton>
        </List>
      </Paper>

      <VersionBadge userRole={userRole} showInProfile />

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        aria-labelledby="logout-dialog-title"
        aria-describedby="logout-dialog-description"
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxWidth: '400px',
            width: '90%'
          }
        }}
      >
        <DialogTitle id="logout-dialog-title" component="div" sx={{ pb: 1 }}>
          <Typography component="h2" variant="h6">Confirm Logout</Typography>
        </DialogTitle>
        <DialogContent sx={{ pb: 2 }}>
          <DialogContentText id="logout-dialog-description">
            Are you sure you want to log out? Any unsaved changes will be lost.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button 
            onClick={() => setConfirmOpen(false)} 
            variant="outlined"
            sx={{ minWidth: 80 }}
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmLogout} 
            variant="contained" 
            color="error"
            sx={{ minWidth: 80 }}
          >
            Logout
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default SettingsPage;
