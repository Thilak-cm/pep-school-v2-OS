import { useState, useRef, useCallback } from "react";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Chip from "@mui/material/Chip";
import { version } from "../package.json";
import { auth } from "./firebase.js";
import { FEATURES } from "./utils/featureRegistry.js";
import AuthGate from "./components/AuthGate.jsx";
import FeaturePicker from "./components/FeaturePicker.jsx";
import FeatureWorkbench from "./components/FeatureWorkbench.jsx";

export default function App() {
  const [selectedFeature, setSelectedFeature] = useState(null);
  const backGuardRef = useRef(null);

  const navigateBack = useCallback(() => setSelectedFeature(null), []);

  function handleBack() {
    if (backGuardRef.current) {
      backGuardRef.current();
    } else {
      navigateBack();
    }
  }

  const registerBackGuard = useCallback((guard) => { backGuardRef.current = guard; }, []);

  return (
    <AuthGate>
      <Box sx={{ minHeight: "100vh" }}>
        <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Toolbar>
            {selectedFeature && (
              <IconButton edge="start" sx={{ mr: 1 }} onClick={handleBack}>
                <ArrowBackIcon />
              </IconButton>
            )}
            <Typography variant="h6" fontWeight={700}>
              {selectedFeature ? FEATURES.find((f) => f.id === selectedFeature)?.label || selectedFeature : "Test Bench"}
            </Typography>
            <Chip label={`v${version}`} size="small" variant="outlined" sx={{ ml: 1, mr: "auto", fontFamily: "monospace", fontSize: 11 }} />
            <Button size="small" onClick={() => auth.signOut()}>Sign Out</Button>
          </Toolbar>
        </AppBar>

        {!selectedFeature ? (
          <FeaturePicker onSelect={setSelectedFeature} />
        ) : (
          <FeatureWorkbench featureId={selectedFeature} onBack={navigateBack} registerBackGuard={registerBackGuard} />
        )}
      </Box>
    </AuthGate>
  );
}
