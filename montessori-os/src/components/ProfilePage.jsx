import React from 'react';
import {
  Box,
  Typography,
  Avatar,
  Card,
  CardContent,
  Divider,
  IconButton,
  Chip
} from '@mui/material';
import {
  ArrowBack,
  Email,
  Person,
  Verified,
  AdminPanelSettings,
  School
} from '@mui/icons-material';

const ProfilePage = ({ user, role, onBack }) => {
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 3,
      pb: 4 
    }}>
      {/* Back Button */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <IconButton 
          onClick={onBack}
          sx={{ 
            mr: 2,
            color: '#64748b',
            '&:hover': { backgroundColor: 'rgba(100, 116, 139, 0.08)' }
          }}
          aria-label="Go back"
        >
          <ArrowBack />
        </IconButton>
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
          mb: 1
        }}>
          {user?.displayName || 'User'}
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            icon={role === 'admin' ? <AdminPanelSettings /> : <School />}
            label={role === 'admin' ? 'Administrator' : 'Teacher'}
            color={role === 'admin' ? 'error' : 'primary'}
            variant="outlined"
            size="small"
          />
          <Verified sx={{ color: '#10b981', fontSize: 20 }} />
        </Box>
      </Box>

      {/* Profile Details Card */}
      <Card sx={{ 
        borderRadius: 3,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>
        <CardContent sx={{ p: 0 }}>
          {/* Email */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            p: 3,
            borderBottom: '1px solid #f1f5f9'
          }}>
            <Email sx={{ color: '#64748b', mr: 3, fontSize: 24 }} />
            <Box>
              <Typography variant="caption" sx={{ 
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: 1,
                fontWeight: 600
              }}>
                Email Address
              </Typography>
              <Typography variant="body1" sx={{ 
                color: '#1e293b',
                fontWeight: 500,
                mt: 0.5
              }}>
                {user?.email}
              </Typography>
            </Box>
          </Box>

          {/* User ID */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            p: 3,
            borderBottom: '1px solid #f1f5f9'
          }}>
            <Person sx={{ color: '#64748b', mr: 3, fontSize: 24 }} />
            <Box>
              <Typography variant="caption" sx={{ 
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: 1,
                fontWeight: 600
              }}>
                User ID
              </Typography>
              <Typography variant="body2" sx={{ 
                color: '#1e293b',
                fontFamily: 'monospace',
                mt: 0.5,
                wordBreak: 'break-all'
              }}>
                {user?.uid}
              </Typography>
            </Box>
          </Box>

          {/* Account Type */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            p: 3,
            borderBottom: '1px solid #f1f5f9'
          }}>
            <AdminPanelSettings sx={{ color: '#64748b', mr: 3, fontSize: 24 }} />
            <Box>
              <Typography variant="caption" sx={{ 
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: 1,
                fontWeight: 600
              }}>
                Account Type
              </Typography>
              <Typography variant="body1" sx={{ 
                color: '#1e293b',
                fontWeight: 500,
                mt: 0.5
              }}>
                {role === 'admin' ? 'Administrator' : 'Teacher'}
              </Typography>
            </Box>
          </Box>

          {/* Provider Info */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            p: 3
          }}>
            <Box
              component="img"
              src="https://developers.google.com/identity/images/g-logo.png"
              alt="Google"
              sx={{ width: 24, height: 24, mr: 3 }}
            />
            <Box>
              <Typography variant="caption" sx={{ 
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: 1,
                fontWeight: 600
              }}>
                Authentication Provider
              </Typography>
              <Typography variant="body1" sx={{ 
                color: '#1e293b',
                fontWeight: 500,
                mt: 0.5
              }}>
                Google Account
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Account Status */}
      <Card sx={{ 
        borderRadius: 3,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        backgroundColor: '#f0fdf4',
        border: '1px solid #bbf7d0'
      }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Verified sx={{ color: '#10b981', mr: 2 }} />
            <Typography variant="h6" sx={{ 
              color: '#059669',
              fontWeight: 600
            }}>
              Account Verified
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#065f46' }}>
            Your account has been verified and you have access to the Montessori Observation Hub.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ProfilePage; 