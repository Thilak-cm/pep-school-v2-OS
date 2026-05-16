import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, provider, db } from "../firebase.js";
import AuthContext from "../contexts/AuthContext.js";
import { canAccessTestBench } from "../utils/accessUtils.js";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [allowedFeatures, setAllowedFeatures] = useState(null);
  const [manageableClassrooms, setManageableClassrooms] = useState([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setRole(null);
        setAllowedFeatures(null);
        setManageableClassrooms([]);
        setAuthLoading(false);
        setRoleLoading(false);
        return;
      }
      setUser(u);
      setAuthLoading(false);
      setRoleLoading(true);

      // Load role + manageableClassrooms from users collection
      const userSnap = await getDoc(doc(db, "users", u.uid));
      const userData = userSnap.exists() ? userSnap.data() : {};
      const userRole = userData.role || null;
      setRole(userRole);
      setManageableClassrooms(userData.manageableClassrooms || []);

      // For non-superadmins, check testbench/settings/access for feature grants
      if (userRole !== "superadmin") {
        const accessSnap = await getDoc(doc(db, "testbench/settings/access", u.uid));
        const accessDoc = accessSnap.exists() ? accessSnap.data() : null;
        setAllowedFeatures(accessDoc?.allowedFeatures || null);
      } else {
        setAllowedFeatures(null); // superadmins don't need an access doc
      }

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
        <Typography color="text.secondary">Sign in to continue</Typography>
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

  const accessDoc = allowedFeatures ? { allowedFeatures } : null;
  if (!canAccessTestBench(role, accessDoc)) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minHeight: "100vh", gap: 2 }}>
        <Typography variant="h5">Access Denied</Typography>
        <Typography color="text.secondary">
          Signed in as {user.email} (role: {role || "none"})
        </Typography>
        <Typography color="text.secondary">
          You don&apos;t have access to the test bench. Contact a superadmin.
        </Typography>
        <Button variant="outlined" onClick={() => auth.signOut()}>Sign Out</Button>
      </Box>
    );
  }

  return (
    <AuthContext.Provider value={{ user, role, allowedFeatures, manageableClassrooms }}>
      {children}
    </AuthContext.Provider>
  );
}
