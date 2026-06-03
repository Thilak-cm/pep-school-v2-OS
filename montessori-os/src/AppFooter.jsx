import React, { useEffect, useState } from 'react';
import { Box, BottomNavigation, BottomNavigationAction } from '@mui/material';
import { Home, Settings, Bell as Notifications, Inbox } from './icons';
import { trackEvent } from './utils/analytics';

const FOOTER_HEIGHT = 64;

function AppFooter({ onHome, onNavigate, active = null }) {
  const [value, setValue] = useState(active || 'none');

  useEffect(() => {
    setValue(active || 'none');
  }, [active]);

  const handleAction = (target) => {
    if (target === 'home' && onHome) {
      onHome();
    } else if (target === 'settings' && onNavigate) {
      onNavigate('settings');
    } else if (target === 'alerts' && onNavigate) {
      onNavigate('alerts');
    } else if (target === 'interviews' && onNavigate) {
      onNavigate('interviews');
    }
  };

  const handleChange = (_, newValue) => {
    setValue(newValue);
    if (newValue !== 'none') {
      trackEvent('footer_nav', { target: newValue });
      handleAction(newValue);
    }
  };

  const handleClickSelected = (target) => {
    if (target === value) {
      handleAction(target);
    }
  };


  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: { xs: '100%', sm: '420px' },
        overflowX: 'hidden',
        zIndex: 1050,
        px: { xs: 0, sm: 1 },
        '@media (max-width: 599px)': {
          '@supports (padding: env(safe-area-inset-bottom))': {
            paddingBottom: 'env(safe-area-inset-bottom)'
          }
        }
      }}
    >
      <Box
        sx={{
          height: FOOTER_HEIGHT,
          backgroundColor: 'white',
          borderTop: '1px solid var(--color-border)',
          boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.08)',
          display: 'flex',
          alignItems: 'center',
          borderRadius: { xs: 0, sm: '12px' },
          overflow: 'hidden'
        }}
      >
        <BottomNavigation
          value={value}
          onChange={handleChange}
          showLabels
          sx={{
            width: '100%',
            height: FOOTER_HEIGHT,
            backgroundColor: 'transparent',
            '& .MuiBottomNavigationAction-root': {
              minWidth: 0,
              color: 'var(--color-text-soft)',
              paddingTop: 0.5,
              paddingBottom: 0.5,
              outline: 'none',
              '&:focus-visible': {
                outline: 'none',
                boxShadow: 'none',
              },
              '& .MuiBottomNavigationAction-label': {
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: 0.2
              }
            },
            '& .Mui-selected': {
              color: 'var(--color-primary)'
            }
          }}
        >
          <BottomNavigationAction
            label="Settings"
            value="settings"
            icon={<Settings />}
            onClick={() => handleClickSelected('settings')}
          />
          <BottomNavigationAction
            label="Alerts"
            value="alerts"
            icon={<Notifications />}
            onClick={() => handleClickSelected('alerts')}
          />
          <BottomNavigationAction
            label="Interviews"
            value="interviews"
            icon={<Inbox />}
            onClick={() => handleClickSelected('interviews')}
          />
          <BottomNavigationAction
            label="Home"
            value="home"
            icon={<Home />}
            onClick={() => handleClickSelected('home')}
          />
        </BottomNavigation>
      </Box>
    </Box>
  );
}

export default AppFooter;
