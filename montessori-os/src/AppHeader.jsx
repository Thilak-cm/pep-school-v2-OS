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
  Backdrop
} from "@mui/material";
import { 
  Menu as MenuIcon, 
  Settings, 
  Logout, 
  Person 
} from "@mui/icons-material";

function AppHeader({ user, onSignOut, title = '', onNavigate }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    onSignOut();
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
      text: 'Settings',
      icon: <Settings />,
      onClick: () => {
        setDrawerOpen(false);
        // TODO: Navigate to settings page
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
            {/* Menu Button */}
            <IconButton
              onClick={handleDrawerToggle}
              sx={{
                color: '#64748b',
                mr: 2,
                '&:hover': {
                  backgroundColor: 'rgba(100, 116, 139, 0.08)'
                }
              }}
              aria-label="Open menu"
            >
              <MenuIcon />
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

      {/* Mobile-First Drawer - Contained within 375px boundaries */}
      <Backdrop
        open={drawerOpen}
        onClick={handleDrawerToggle}
        sx={{ 
          zIndex: 1250, // Above header (1100) but below FAB (1300)
          backgroundColor: 'rgba(0, 0, 0, 0.5)'
        }}
      />
      
      <Slide direction="right" in={drawerOpen} mountOnEnter unmountOnExit>
        <Box
          sx={{
            position: 'fixed', // Changed from absolute to fixed for better positioning
            top: 0,
            left: 0,
            width: '280px',
            height: '100vh', // Use full viewport height
            backgroundColor: '#ffffff',
            borderRight: '1px solid #e2e8f0',
            zIndex: 1260, // Above backdrop (1250)
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <Box sx={{ p: 3, flexGrow: 1, overflow: 'auto' }}>
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
      </Slide>
    </>
  );
}

export default AppHeader; 