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
  Container,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Slide,
  Backdrop,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button
} from "@mui/material";
import { 
  Menu as MenuIcon, 
  Logout, 
  Person,
  BarChart,
  Home,
  Feedback,
  ArrowBack
} from "@mui/icons-material";

function AppHeader({ user, onSignOut, title = '', onNavigate, onHome, onBack, showBackButton = false }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

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

  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen);
  };

  const handleSignOut = () => {
    setDrawerOpen(false);
    setLogoutDialogOpen(true);
  };

  const confirmSignOut = () => {
    setLogoutDialogOpen(false);
    onSignOut();
  };

  const cancelSignOut = () => {
    setLogoutDialogOpen(false);
  };

  const menuItems = [
    {
      text: 'Profile',
      icon: <Person />,
      onClick: () => {
        setDrawerOpen(false);
        onNavigate('/profile');
      }
    },
    {
      text: 'Statistics',
      icon: <BarChart />,
      onClick: () => {
        setDrawerOpen(false);
        onNavigate('/stats');
      }
    },
    {
      text: 'Feedback & Suggestions',
      icon: <Feedback />,
      onClick: () => {
        setDrawerOpen(false);
        onNavigate('/feedback');
      }
    },
    {
      text: 'Log Out',
      icon: <Logout />,
      onClick: handleSignOut,
      color: '#ef4444'
    }
  ];

  return (
    <>
      <Box
        component="header"
        sx={{ 
          position: 'sticky',
          top: 0,
          zIndex: 1100,
          backgroundColor: 'white',
          borderBottom: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          // Debug: make it more visible
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            backgroundColor: '#4f46e5',
            opacity: 0.3,
          }
        }}
      >
        <Container maxWidth={false} sx={{ maxWidth: '100%' }}>
          <Box sx={{ 
            display: 'flex',
            alignItems: 'center',
            minHeight: 64, // Standard toolbar height
            px: 2,
          }}>
            {/* Back Button - Only show when showBackButton is true */}
            {showBackButton && onBack && (
              <IconButton
                onClick={onBack}
                sx={{
                  color: '#64748b',
                  mr: 1,
                  '&:hover': {
                    backgroundColor: 'rgba(100, 116, 139, 0.08)'
                  }
                }}
                aria-label="Go back"
              >
                <ArrowBack />
              </IconButton>
            )}

            {/* Menu Button */}
            <IconButton
              onClick={handleDrawerToggle}
              sx={{
                color: '#64748b',
                mr: 1,
                '&:hover': {
                  backgroundColor: 'rgba(100, 116, 139, 0.08)'
                }
              }}
              aria-label="Open menu"
            >
              <MenuIcon />
            </IconButton>

            {/* Home Button */}
            <IconButton
              onClick={onHome}
              sx={{
                color: '#64748b',
                mr: 2,
                '&:hover': {
                  backgroundColor: 'rgba(100, 116, 139, 0.08)'
                }
              }}
              aria-label="Go home"
            >
              <Home />
            </IconButton>

            <Typography
              variant="h6"
              component="h1"
              sx={{
                color: '#1e293b',
                fontWeight: 600,
                flexGrow: 1,
                textAlign: 'center'
              }}
            >
              {title}
            </Typography>

            {/* Logo moved to right end */}
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
          </Box>
        </Container>
      </Box>

      {/* Mobile-First Drawer - Contained within app boundaries */}
      <Backdrop
        open={drawerOpen}
        onClick={handleDrawerToggle}
        sx={{ 
          // Mobile: fixed to viewport, Desktop: absolute to container
          position: { xs: 'fixed', sm: 'absolute' },
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1250, // Above header (1100) but below FAB (1300)
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          opacity: drawerOpen ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: drawerOpen ? 'auto' : 'none',
        }}
      />
      
      <Box
        sx={{
          // Mobile: fixed to viewport, Desktop: absolute to container
          position: { xs: 'fixed', sm: 'absolute' },
          top: 0,
          left: 0,
          width: '280px',
          height: '100%',
          backgroundColor: '#ffffff',
          borderRight: '1px solid #e2e8f0',
          zIndex: 1260,
          overflow: 'hidden',
          display: drawerOpen ? 'flex' : 'none',
          flexDirection: 'column',
          boxShadow: '4px 0 20px rgba(0, 0, 0, 0.15)',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease',
        }}
      >
        <Box sx={{ 
          p: 3, 
          flexGrow: 1, 
          overflow: 'auto',
          height: '100%',
          '&::-webkit-scrollbar': {
            width: '6px',
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: '#f1f5f9',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: '#cbd5e1',
            borderRadius: '3px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            backgroundColor: '#94a3b8',
          },
        }}>
          {/* User Profile Section */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 2, 
            mb: 3,
            p: 2,
            backgroundColor: '#f8fafc',
            borderRadius: 2
          }}>
            <Avatar
              sx={{
                bgcolor: '#4f46e5',
                width: 48,
                height: 48,
                fontSize: '1.125rem',
                fontWeight: 700
              }}
            >
              {user.displayName?.charAt(0) || 'U'}
            </Avatar>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#1e293b' }}>
                {user.displayName || 'User'}
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748b' }}>
                {user.email}
              </Typography>
            </Box>
          </Box>

          {/* Menu Items */}
          <List sx={{ p: 0 }}>
            {menuItems.map((item, index) => (
              <ListItem key={item.text} sx={{ p: 0, mb: 1 }}>
                <ListItemButton
                  onClick={item.onClick}
                  sx={{
                    borderRadius: 2,
                    '&:hover': {
                      backgroundColor: item.color === '#ef4444' 
                        ? 'rgba(239, 68, 68, 0.08)' 
                        : 'rgba(79, 70, 229, 0.08)'
                    }
                  }}
                >
                  <ListItemIcon sx={{ 
                    color: item.color || '#64748b',
                    minWidth: 40
                  }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText 
                    primary={item.text}
                    sx={{
                      '& .MuiListItemText-primary': {
                        fontWeight: item.color === '#ef4444' ? 600 : 500,
                        color: item.color || '#1e293b'
                      }
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Box>

      {/* Logout Confirmation Dialog */}
      <Dialog
        open={logoutDialogOpen}
        onClose={cancelSignOut}
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
        <DialogTitle id="logout-dialog-title" sx={{ pb: 1 }}>
          Confirm Logout
        </DialogTitle>
        <DialogContent sx={{ pb: 2 }}>
          <DialogContentText id="logout-dialog-description">
            Are you sure you want to log out? Any unsaved changes will be lost.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button 
            onClick={cancelSignOut} 
            variant="outlined"
            sx={{ minWidth: 80 }}
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmSignOut} 
            variant="contained" 
            color="error"
            sx={{ minWidth: 80 }}
          >
            Logout
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default AppHeader; 