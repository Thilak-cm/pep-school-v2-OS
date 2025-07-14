import React from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, provider } from "./firebase";
import { Button, Box } from "@mui/material";
import { Google } from "@mui/icons-material";

function SignIn() {
  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, provider);
      // No need for alert, the app will automatically transition
    } catch (error) {
      alert("Sign in failed: " + error.message);
    }
  };

  return (
    <Button
      variant="contained"
      onClick={handleSignIn}
      startIcon={<Google />}
      sx={{
        backgroundColor: '#4285f4',
        color: 'white',
        padding: '16px 32px',
        fontSize: '18px',
        fontWeight: 600,
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        textTransform: 'none',
        '&:hover': {
          backgroundColor: '#3367d6',
          transform: 'translateY(-2px)',
          boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
        },
        transition: 'all 0.3s ease',
        minWidth: '200px'
      }}
    >
      Sign in with Google
    </Button>
  );
}

export default SignIn; 