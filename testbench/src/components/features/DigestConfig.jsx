import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase.js";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";

/**
 * Loads config/weekly_digest and calls onConfigLoaded with both prompts.
 *
 * onConfigLoaded receives:
 * { classroomPrompt, superadminPrompt, model, temperature, max_tokens }
 */
export default function DigestConfig({ onConfigLoaded }) {
  const [loading, setLoading] = useState(true);
  const [configFound, setConfigFound] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const snap = await getDoc(doc(db, "config", "weekly_digest"));
      if (snap.exists()) {
        const data = snap.data();
        onConfigLoaded({
          classroomPrompt: data.classroomPrompt || "",
          superadminPrompt: data.superadminPrompt || "",
          model: data.model || "gpt-4.1-mini",
          temperature: data.temperature ?? 0.4,
          max_tokens: data.max_tokens || 4000,
          allowedTools: data.allowedTools || null,
          allowedScopes: data.allowedToolScopes || null,
        });
      } else {
        setConfigFound(false);
        onConfigLoaded({ classroomPrompt: "", superadminPrompt: "", model: "gpt-4.1-mini", temperature: 0.4, max_tokens: 4000 });
      }
    } catch (err) {
      console.error("[DigestConfig] loadConfig failed:", err);
      setConfigFound(false);
      onConfigLoaded({ classroomPrompt: "", superadminPrompt: "", model: "gpt-4.1-mini", temperature: 0.4, max_tokens: 4000 });
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <CircularProgress size={20} />;

  if (!configFound) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="body2" color="warning.main">Config not found — using defaults</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Typography variant="body2" color="text.secondary">Config loaded</Typography>
    </Box>
  );
}
