import React from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, provider } from "./firebase";

function SignIn() {
  const handleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      alert(`Signed in as: ${result.user.displayName}`);
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <button onClick={handleSignIn} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
      Sign in with Google
    </button>
  );
}

export default SignIn; 