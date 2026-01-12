import React from 'react';
import {
  Box,
  Typography,
  Avatar
} from '@mui/material';
import { getRoleLabel, isClassroomAdmin, isSuperAdmin } from '../utils/roleUtils';

const ProfilePage = ({ user, role }) => {

  const roleLabel = getRoleLabel(role);
  const roleColor = isSuperAdmin(role) ? '#dc2626' : (isClassroomAdmin(role) ? '#ea580c' : '#4f46e5');

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 3,
      pb: 4 
    }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, color: '#1e293b' }}>
          Profile
        </Typography>
      </Box>

      {/* Profile Photo Section */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        py: 2
      }}>
        <Avatar
          src={user?.photoURL}
          sx={{
            width: 120,
            height: 120,
            mb: 2,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            border: '4px solid white',
            fontSize: '3rem',
            fontWeight: 700,
            backgroundColor: '#4f46e5'
          }}
        >
          {user?.displayName?.charAt(0) || 'U'}
        </Avatar>
        
        <Typography variant="h4" sx={{ 
          fontWeight: 700, 
          color: '#1e293b',
          textAlign: 'center',
          mb: 0.5
        }}>
          {user?.displayName || 'User'}
        </Typography>
        
        <Typography variant="body1" sx={{ 
          color: '#64748b',
          textAlign: 'center',
          mb: 1
        }}>
          {user?.email}
        </Typography>
        
        <Typography variant="body2" sx={{ 
          color: roleColor,
          textAlign: 'center',
          fontWeight: 600,
          textTransform: 'capitalize'
        }}>
          {roleLabel}
        </Typography>
      </Box>

    </Box>
  );
};

export default ProfilePage; 
