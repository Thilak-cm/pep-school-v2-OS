import React, { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, provider } from "./firebase";
import { Button, Box, Snackbar, Alert, CircularProgress } from "@mui/material";
import { Google } from "@mui/icons-material";

function SignIn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async () => {
    try {
      setLoading(true);
      await signInWithPopup(auth, provider);
    } catch (error) {
      setError(error?.message || "Sign in failed");
    }
    finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        aria-label="Sign in with Google"
        variant="contained"
        onClick={handleSignIn}
        disabled={loading}
        startIcon={
          loading ? (
            <CircularProgress size={20} sx={{ color: 'white' }} />
          ) : (
            <Google />
          )
        }
        sx={{
          backgroundColor: '#4285f4',
          color: 'white',
          px: 4,
          py: 2,
          fontSize: '18px',
          fontWeight: 600,
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          textTransform: 'none',
          width: '100%',
          maxWidth: 320,
          '&:hover': {
            backgroundColor: '#3367d6',
            transform: 'translateY(-1px)',
            boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
          },
          transition: 'all 0.2s ease',
        }}
      >
        {loading ? 'Signing in...' : 'Sign in with Google'}
      </Button>
      <Snackbar
        open={Boolean(error)}
        autoHideDuration={4000}
        onClose={() => setError("")}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setError("")} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}

export default SignIn; 