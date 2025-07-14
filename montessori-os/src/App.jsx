import React, { useState, useEffect, useRef } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import SignIn from "./SignIn";
import VoiceRecorder from "./VoiceRecorder";
import AppHeader from "./AppHeader";
import { 
  Box, 
  Container, 
  Typography, 
  CircularProgress, 
  Paper,
  Card,
  CardContent
} from "@mui/material";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Centering container for all app states
  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
      }}
    >
      {/* Loading State */}
      {loading && (
        <Box
          sx={{
            width: '375px',
            height: '812px',
            boxShadow: '0 0 24px rgba(0,0,0,0.10)',
            borderRadius: '32px',
            overflow: 'scroll',
            backgroundColor: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px'
            }}
          >
            <CircularProgress 
              size={40}
              sx={{ 
                color: '#4f46e5',
                '& .MuiCircularProgress-circle': {
                  strokeLinecap: 'round',
                }
              }}
            />
            <Typography variant="body1" sx={{ color: '#64748b' }}>
              Loading...
            </Typography>
          </Box>
        </Box>
      )}

      {/* Unauthenticated State */}
      {!loading && !user && (
        <Box
          sx={{
            width: '375px',
            height: '812px',
            boxShadow: '0 0 24px rgba(0,0,0,0.10)',
            borderRadius: '32px',
            overflow: 'scroll',
            backgroundColor: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Card
            sx={{
              borderRadius: '16px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
              padding: '48px 32px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              maxWidth: '100%',
              width: '100%',
              backgroundColor: 'white'
            }}
          >
            <Box
              component="img"
              src="/pep-logo.png"
              alt="Pep School Logo"
              sx={{
                width: '120px',
                height: '120px',
                marginBottom: '32px',
                filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))'
              }}
            />
            <Typography
              variant="h3"
              component="h1"
              sx={{
                color: '#1e293b',
                marginBottom: '20px',
                fontSize: '2rem',
                fontWeight: '700',
                lineHeight: '1.2',
                textAlign: 'center',
              }}
            >
              Welcome to Pep School V2 OS!
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: '#64748b',
                marginBottom: '40px',
                fontSize: '1.1rem',
                lineHeight: '1.6',
                maxWidth: '100%',
                textAlign: 'center',
              }}
            >
              Streamline your teaching workflow
            </Typography>
            <SignIn />
          </Card>
        </Box>
      )}

      {/* Authenticated State */}
      {!loading && user && (
        <Box
          sx={{
            width: '375px',
            height: '812px',
            backgroundColor: '#f8fafc',
            boxShadow: '0 0 24px rgba(0,0,0,0.10)',
            borderRadius: '32px',
            overflow: 'scroll',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <AppHeader user={user} onSignOut={handleSignOut} />

          {/* Main Content */}
          <Container maxWidth={false} sx={{ py: 3, px: 2, maxWidth: '375px' }}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3
              }}
            >
              {/* Welcome Section */}
              <Box sx={{ textAlign: 'center', marginBottom: '20px' }}>
                <Typography
                  variant="h4"
                  component="h2"
                  sx={{
                    color: '#1e293b',
                    fontSize: '1.875rem',
                    fontWeight: '600',
                    margin: '0 0 8px 0'
                  }}
                >
                  Observation Hub
                </Typography>
                <Typography
                  variant="body1"
                  sx={{
                    color: '#64748b',
                    fontSize: '1.1rem',
                    margin: 0,
                    lineHeight: '1.6'
                  }}
                >
                  Record voice notes up to 30 seconds for easy classroom documentation
                </Typography>
              </Box>

              {/* Voice Recorder - Now styled better */}
              <VoiceRecorder />
              
              {/* Quick Stats or Tips */}
              
            </Box>
          </Container>
        </Box>
      )}
    </Box>
  );
}

export default App;
