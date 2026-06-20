import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase.js";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";

const PROGRAMS = ["toddler", "primary", "elementary", "adolescent"];

export default function HandwritingConfig({ onConfigLoaded, onProgramChange }) {
  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState("primary");

  useEffect(() => {
    loadConfig(program);
  }, [program]);

  async function loadConfig(programId) {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "config", `writing_analysis_${programId}`));
      const data = snap.exists() ? snap.data() : {};
      onConfigLoaded({
        systemPrompt: data.systemPrompt || "",
        model: data.model || "gpt-5.4",
        temperature: data.temperature ?? 0.3,
        max_tokens: data.max_tokens || 2000,
      });
    } catch (err) {
      console.error("[HandwritingConfig] loadConfig failed:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleProgramChange(_, newProgram) {
    if (!newProgram) return;
    setProgram(newProgram);
    onProgramChange?.(newProgram);
  }

  if (loading) return <CircularProgress size={20} />;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>Program</Typography>
        <ToggleButtonGroup value={program} exclusive onChange={handleProgramChange} size="small">
          {PROGRAMS.map((p) => (
            <ToggleButton key={p} value={p}>{p}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
    </Box>
  );
}
