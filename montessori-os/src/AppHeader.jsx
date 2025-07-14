import React, { useState, useEffect } from "react";
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  Avatar, 
  IconButton, 
  Menu, 
  MenuItem, 
  Divider,
  Box,
  Container
} from "@mui/material";
import { Settings, Logout } from "@mui/icons-material";

function AppHeader({ user, onSignOut }) {
  const [anchorEl, setAnchorEl] = useState(null);

  useEffect(() => {
    // Close menu on outside click
    function handleClickOutside(event) {
      if (anchorEl && !anchorEl.contains(event.target)) {
        setAnchorEl(null);
      }
    }
    if (anchorEl) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [anchorEl]);

  return (
    <AppBar 
      position="static" 
      elevation={1}
      sx={{ 
        backgroundColor: 'white',
        borderBottom: '1px solid #e2e8f0'
      }}
    >
      <Container maxWidth={false} sx={{ maxWidth: '100%' }}>
        <Toolbar sx={{ px: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexGrow: 1 }}>
            <Box
              component="img"
              src="/pep-logo.png"
              alt="Pep School Logo"
              sx={{
                width: 40,
                height: 'auto',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
              }}
            />
            <Typography
              variant="h5"
              component="h1"
              sx={{
                color: '#1e293b',
                fontWeight: 600,
                display: { xs: 'none', sm: 'block' }
              }}
            >
            </Typography>
          </Box>

          {/* User avatar and settings */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar
                sx={{
                  bgcolor: '#4f46e5',
                  width: 32,
                  height: 32,
                  fontSize: '0.75rem',
                  fontWeight: 600
                }}
              >
                {user.displayName?.charAt(0) || 'U'}
              </Avatar>
              <Typography
                variant="body2"
                sx={{
                  color: '#64748b',
                  fontWeight: 500,
                  display: { xs: 'none', sm: 'block' }
                }}
              >
                {user.displayName}
              </Typography>
            </Box>

            {/* Settings Icon */}
            <IconButton
              onClick={e => setAnchorEl(e.currentTarget)}
              sx={{
                color: '#64748b',
                '&:hover': {
                  backgroundColor: 'rgba(100, 116, 139, 0.08)'
                }
              }}
              aria-label="Settings"
            >
              <Settings />
            </IconButton>

            {/* Dropdown Menu */}
            <Menu
              open={Boolean(anchorEl)}
              anchorEl={anchorEl}
              onClose={() => setAnchorEl(null)}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              PaperProps={{
                sx: {
                  mt: 1,
                  minWidth: 200,
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  border: '1px solid #e2e8f0'
                }
              }}
            >
              <MenuItem disabled sx={{ fontWeight: 600, cursor: 'default' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <Avatar
                    sx={{
                      bgcolor: '#4f46e5',
                      width: 28,
                      height: 28,
                      fontSize: '0.8125rem',
                      fontWeight: 700
                    }}
                  >
                    {user.displayName?.charAt(0) || 'U'}
                  </Avatar>
                  <Typography variant="body2">
                    {user.displayName}
                  </Typography>
                </Box>
              </MenuItem>
              
              <Divider />
              
              <MenuItem disabled sx={{ color: '#64748b' }}>
                Settings (coming soon)
              </MenuItem>
              
              <Divider />
              
              <MenuItem 
                onClick={onSignOut}
                sx={{ 
                  color: '#ef4444', 
                  fontWeight: 600,
                  '&:hover': {
                    backgroundColor: 'rgba(239, 68, 68, 0.08)'
                  }
                }}
              >
                <Logout sx={{ mr: 1, fontSize: 20 }} />
                Sign Out
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
}

export default AppHeader; 