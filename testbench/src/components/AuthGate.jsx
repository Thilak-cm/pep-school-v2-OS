import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, provider, db } from "../firebase.js";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setRole(null);
        setAuthLoading(false);
        setRoleLoading(false);
        return;
      }
      setUser(u);
      setAuthLoading(false);
      setRoleLoading(true);
      const snap = await getDoc(doc(db, "users", u.uid));
      setRole(snap.exists() ? snap.data().role : null);
      setRoleLoading(false);
    });
  }, []);

  if (authLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minHeight: "100vh", gap: 3 }}>
        <Typography variant="h4" fontWeight={700}>Prompt Test Bench</Typography>
        <Typography color="text.secondary">Superadmin access only</Typography>
        <Button variant="contained" size="large" onClick={() => signInWithPopup(auth, provider)}>
          Sign in with Google
        </Button>
      </Box>
    );
  }

  if (roleLoading) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minHeight: "100vh", gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Checking authorization...</Typography>
      </Box>
    );
  }

  if (role !== "superadmin") {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minHeight: "100vh", gap: 2 }}>
        <Typography variant="h5">Access Denied</Typography>
        <Typography color="text.secondary">
          Signed in as {user.email} (role: {role || "none"})
        </Typography>
        <Typography color="text.secondary">Superadmin access required.</Typography>
        <Button variant="outlined" onClick={() => auth.signOut()}>Sign Out</Button>
      </Box>
    );
  }

  return children;
}
