import React from "react";
import { 
  Typography, 
  IconButton, 
  Box,
  Container
} from "@mui/material";
import { 
  ArrowBack
} from "@mui/icons-material";

function AppHeader({ title = '', onBack, showBackButton = false }) {
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
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto',
            alignItems: 'center',
            minHeight: 64, // Standard toolbar height
            px: 2,
          }}>
            {/* Back Button - Only show when showBackButton is true */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {showBackButton && onBack && (
                <IconButton
                  onClick={onBack}
                  sx={{
                    color: '#64748b',
                    '&:hover': {
                      backgroundColor: 'rgba(100, 116, 139, 0.08)'
                    }
                  }}
                  aria-label="Go back"
              >
                <ArrowBack />
              </IconButton>
            )}
          </Box>

            <Typography
              variant="h6"
              component="h1"
              sx={{
                color: '#1e293b',
                fontWeight: 600,
                textAlign: 'center',
                justifySelf: 'center',
                maxWidth: '100%',
                px: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {title}
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
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
          </Box>
        </Container>
      </Box>
    </>
  );
}

export default AppHeader; 
