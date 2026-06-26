import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase.js";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import TextField from "@mui/material/TextField";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";

/**
 * Compute default date range for term reports (academic year start → today).
 */
function getDefaultTermRange() {
  const now = new Date();
  const year = now.getMonth() >= 10 ? now.getFullYear() : now.getFullYear() - 1;
  const start = new Date(year, 10, 1); // Nov 1
  return { start: toIso(start), end: toIso(now) };
}

/**
 * Compute default date range for monthly reports (30 days back → today).
 */
function getDefaultMonthlyRange() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  return { start: toIso(start), end: toIso(now) };
}

function toIso(d) {
  return d.toISOString().split("T")[0];
}

const PROGRAMS = ["toddler", "primary", "elementary", "adolescent"];

export default function ReportConfig({ programId, reportType, onProgramChange, onReportTypeChange, onConfigLoaded, onDateRangeChange }) {
  const [loading, setLoading] = useState(false);
  const [configNotFound, setConfigNotFound] = useState(null);
  const [dateRange, setDateRange] = useState(() =>
    reportType === "monthly" ? getDefaultMonthlyRange() : getDefaultTermRange()
  );

  // Load config when program or report type changes
  useEffect(() => {
    if (!programId) return;
    loadConfig(programId, reportType);
  }, [programId, reportType]);

  // Reset date range defaults when report type changes
  useEffect(() => {
    const newRange = reportType === "monthly" ? getDefaultMonthlyRange() : getDefaultTermRange();
    setDateRange(newRange);
    onDateRangeChange?.(newRange);
  }, [reportType, onDateRangeChange]);

  async function loadConfig(programId, type) {
    if (!programId) return;
    setLoading(true);
    setConfigNotFound(null);
    const prefix = type === "monthly" ? "baseline_report" : "term_report";
    const docId = `${prefix}_${programId}`;
    try {
      const snap = await getDoc(doc(db, "config", docId));
      if (!snap.exists()) {
        setConfigNotFound(docId);
        onConfigLoaded({
          systemPrompt: "",
          model: "gpt-5.4",
          temperature: 0.4,
          max_tokens: 4096,
        });
      } else {
        setConfigNotFound(null);
        const data = snap.data();
        onConfigLoaded({
          systemPrompt: data.staticSystemPrompt || data.systemPrompt || "",
          model: data.model || "gpt-5.4",
          temperature: data.temperature ?? 0.4,
          max_tokens: data.max_tokens || 4096,
        });
      }
    } catch (err) {
      setConfigNotFound(`${prefix}_${programId} (load error: ${err.message})`);
    } finally {
      setLoading(false);
    }
  }

  function handleTypeChange(_, newType) {
    if (!newType) return;
    onReportTypeChange(newType);
  }

  function handleDateChange(field, value) {
    const updated = { ...dateRange, [field]: value };
    setDateRange(updated);
    onDateRangeChange?.(updated);
  }

  function handleProgramChange(_, newProgram) {
    if (!newProgram) return;
    onProgramChange?.(newProgram);
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>Program</Typography>
        <ToggleButtonGroup value={programId || ""} exclusive onChange={handleProgramChange} size="small">
          {PROGRAMS.map((p) => (
            <ToggleButton key={p} value={p}>{p}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>Report Type</Typography>
        <ToggleButtonGroup value={reportType} exclusive onChange={handleTypeChange} size="small">
          <ToggleButton value="term">Term</ToggleButton>
          <ToggleButton value="monthly">Monthly Baseline</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          label="From"
          type="date"
          value={dateRange.start}
          onChange={(e) => handleDateChange("start", e.target.value)}
          size="small"
          sx={{ width: 160 }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="To"
          type="date"
          value={dateRange.end}
          onChange={(e) => handleDateChange("end", e.target.value)}
          size="small"
          sx={{ width: 160 }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        {loading && <CircularProgress size={18} />}
      </Stack>
      {configNotFound && (
        <Alert severity="warning" variant="outlined" sx={{ py: 0.25 }}>
          Config doc <strong>config/{configNotFound}</strong> not found — enter a prompt manually
        </Alert>
      )}
    </Box>
  );
}
