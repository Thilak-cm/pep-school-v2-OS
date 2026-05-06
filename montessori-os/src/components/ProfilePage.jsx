import React from 'react';
import {
  Box,
  Typography,
  Avatar,
  Paper
} from '@mui/material';
import { getRoleLabel, isClassroomAdmin, isSuperAdmin } from '../utils/roleUtils';

const ProfilePage = ({ user, role }) => {
  const initials = (user?.displayName || user?.email || 'U')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const roleLabel = getRoleLabel(role);
  const roleColor = isSuperAdmin(role) ? 'var(--color-error)' : (isClassroomAdmin(role) ? 'var(--color-orange-dark)' : 'var(--color-primary)');

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 2,
      pb: 4 
    }}>

      {/* Profile Card */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: 2,
          border: '1px solid var(--color-border)',
          backgroundColor: 'white',
          textAlign: 'center'
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
          <Avatar
            src={user?.photoURL || undefined}
            alt={user?.displayName || 'Profile'}
            sx={{
              width: 88,
              height: 88,
              fontSize: '1.5rem',
              fontWeight: 700,
              bgcolor: 'var(--color-primary)'
            }}
          >
            {initials}
          </Avatar>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'var(--color-text)' }}>
              {user?.displayName || 'Pep School user'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--color-text-soft)' }}>
              {user?.email}
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                color: roleColor,
                fontWeight: 600,
                textTransform: 'capitalize',
                mt: 0.5
              }}
            >
              {roleLabel}
            </Typography>
          </Box>
        </Box>
      </Paper>

    </Box>
  );
};

export default ProfilePage; 
