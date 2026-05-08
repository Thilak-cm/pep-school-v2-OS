import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase.js";
import Box from "@mui/material/Box";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";

const PROGRAMS = ["toddler", "primary", "elementary", "adolescent"];

export default function SoulConfig({ selectedStudent, onConfigLoaded, onProgramChange }) {
  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState("primary");
  const [windowDays, setWindowDays] = useState(365);
  const [includeInterviews, setIncludeInterviews] = useState(true);

  useEffect(() => {
    loadConfig(program);
  }, [program]);

  // When student changes, try to load their per-student guidelines
  useEffect(() => {
    if (selectedStudent) {
      loadStudentGuidelines(selectedStudent.id);
    }
  }, [selectedStudent?.id]);

  async function loadConfig(programId) {
    setLoading(true);
    try {
      // Load instruction prompt from config/soul_generation
      const soulConfigSnap = await getDoc(doc(db, "config", "soul_generation"));
      const soulConfig = soulConfigSnap.exists() ? soulConfigSnap.data() : {};

      // Load program template as fallback guidelines
      const templateSnap = await getDoc(doc(db, "config", `soul_guidelines_${programId}`));
      const templateGuidelines = templateSnap.exists() ? templateSnap.data().markdown || "" : "";

      onConfigLoaded({
        systemPrompt: soulConfig.systemPrompt || "",
        guidelinesContent: templateGuidelines,
        model: soulConfig.model || "gpt-5.4",
        temperature: soulConfig.temperature ?? 0,
        max_tokens: soulConfig.max_tokens || 12000,
        windowDays,
      });
    } catch (err) {
      console.error("[SoulConfig] loadConfig failed:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadStudentGuidelines(studentId) {
    try {
      const guidelinesSnap = await getDoc(
        doc(db, "students", studentId, "ai_summaries", "guidelines")
      );
      if (guidelinesSnap.exists()) {
        const content = guidelinesSnap.data().content;
        if (content) {
          onConfigLoaded((prev) => ({ ...prev, guidelinesContent: content }));
        }
      }
    } catch (err) {
      console.error("[SoulConfig] loadStudentGuidelines failed:", err);
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

      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Typography variant="body2" color="text.secondary">Window:</Typography>
        <Slider
          value={windowDays}
          onChange={(_, v) => { setWindowDays(v); onConfigLoaded((prev) => ({ ...prev, windowDays: v })); }}
          min={30}
          max={365}
          step={30}
          valueLabelDisplay="auto"
          sx={{ width: 150 }}
        />
        <Typography variant="body2">{windowDays}d</Typography>
      </Box>

      <Tooltip title="No interviews live yet" arrow>
        <FormControlLabel
          control={<Switch checked={false} disabled size="small" />}
          label={<Typography variant="body2" color="text.disabled">Include interviews</Typography>}
        />
      </Tooltip>
    </Box>
  );
}
