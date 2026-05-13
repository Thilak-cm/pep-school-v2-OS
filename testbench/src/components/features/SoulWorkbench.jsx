import { useState, useCallback, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { cloudFunctions, db, auth } from "../../firebase.js";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import AddIcon from "@mui/icons-material/Add";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SaveIcon from "@mui/icons-material/Save";
import HistoryIcon from "@mui/icons-material/History";
import StudentPicker from "../StudentPicker.jsx";
import VariantColumn from "../VariantColumn.jsx";
import RunHistory from "../RunHistory.jsx";
import SoulConfig from "./SoulConfig.jsx";
import { createVariant, updateVariant as updateVariantHelper, hasUnsavedWork, SCROLL_AFTER } from "../../utils/variantHelpers.js";
import { buildSavePayload, restoreVariantsFromRun } from "../../hooks/useRunPersistence.js";

const FEATURE_ID = "soul_generation";

const SOUL_DEFAULTS_BY_PROGRAM = {
  toddler: [
    { id: "2026-PAR-006", displayName: "Dhyan J", classroomId: "parijat", classroomName: "Parijat" },
    { id: "2025-PAR-016", displayName: "Navisha Yadav", classroomId: "parijat", classroomName: "Parijat" },
  ],
  primary: [
    { id: "2025-PER-006", displayName: "Atharv Choubey", classroomId: "periwinkle", classroomName: "Periwinkle" },
    { id: "2025-GUL-017", displayName: "Kartik Maheshwari", classroomId: "gulmohar", classroomName: "Gulmohar" },
  ],
  elementary: [
    { id: "2025-POW-005", displayName: "Abhignya Girish", classroomId: "power", classroomName: "Power" },
    { id: "2025-POW-003", displayName: "Aaron Neil", classroomId: "power", classroomName: "Power" },
  ],
  adolescent: [
    { id: "2026-AED-016", displayName: "Riaan Das", classroomId: "aedon", classroomName: "Aedon" },
    { id: "2026-AED-002", displayName: "Divyaan Harlalka", classroomId: "aedon", classroomName: "Aedon" },
  ],
};

export default function SoulWorkbench() {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [variants, setVariants] = useState([createVariant(null, 0), createVariant(null, 1)]);
  const [baseConfig, setBaseConfig] = useState(null);
  const [programFilter, setProgramFilter] = useState(null);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const [confirmClose, setConfirmClose] = useState(null);
  const [pendingLoadRun, setPendingLoadRun] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (hasUnsavedWork(variants)) e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [variants]);

  const handleConfigLoaded = useCallback((config) => {
    if (typeof config === "function") {
      setBaseConfig((prev) => {
        const updated = config(prev ?? {});
        setVariants((vs) => vs.map((v) => ({ ...v, guidelinesContent: updated.guidelinesContent ?? v.guidelinesContent })));
        return updated;
      });
      return;
    }
    setBaseConfig(config);
    setVariants((prev) => prev.map((v, i) =>
      i === 0 ? { ...v, ...config, dirty: false } : { ...v, systemPrompt: config.systemPrompt, guidelinesContent: config.guidelinesContent || "", max_tokens: config.max_tokens || v.max_tokens, dirty: false }
    ));
  }, []);

  function addColumn() {
    setVariants((prev) => [...prev, createVariant(prev[0], prev.length)]);
  }

  function tryRemoveColumn(idx) {
    if (variants.length <= 1) return;
    const v = variants[idx];
    if (v.dirty || v.output) { setConfirmClose(idx); } else { setVariants((prev) => prev.filter((_, i) => i !== idx)); }
  }

  function handleUpdateVariant(idx, field, value) {
    setVariants((prev) => updateVariantHelper(prev, idx, field, value));
  }

  async function runAll() {
    if (!selectedStudent) return;
    const testBenchRun = httpsCallable(cloudFunctions, "testBenchRun", { timeout: 300000 });
    const updated = variants.map((v) => ({ ...v, loading: true, output: null, error: null, outputMeta: null }));
    setVariants(updated);

    const results = await Promise.all(updated.map(async (v, idx) => {
      const start = Date.now();
      try {
        const result = await testBenchRun({
          feature: FEATURE_ID, studentId: selectedStudent.id, systemPrompt: v.systemPrompt,
          model: v.model, temperature: v.temperature, max_tokens: v.max_tokens,
          guidelinesContent: v.guidelinesContent, windowDays: baseConfig?.windowDays || 365, includeInterviews: false,
        });
        return { idx, output: result.data.output, outputMeta: { model: v.model, tokens: result.data.totalTokens, latencyMs: Date.now() - start } };
      } catch (err) { return { idx, error: err.message || "Unknown error" }; }
    }));

    setVariants((prev) => {
      const next = [...prev];
      for (const r of results) { next[r.idx] = { ...next[r.idx], loading: false, output: r.output || null, error: r.error || null, outputMeta: r.outputMeta || null }; }
      return next;
    });
  }

  async function saveRun() {
    if (!selectedStudent) return;
    setSaving(true);
    try {
      const payload = buildSavePayload({ featureId: FEATURE_ID, selectedStudent, variants, conversations: {}, sessionName, kickoffMessage: "", user: auth.currentUser });
      await addDoc(collection(db, "testbench"), { ...payload, timestamp: Timestamp.now() });
      setSnackbar({ open: true, message: "Run saved to Firestore", severity: "success" });
    } catch (err) { setSnackbar({ open: true, message: `Save failed: ${err.message}`, severity: "error" }); }
    finally { setSaving(false); }
  }

  function loadRun(run) {
    if (hasUnsavedWork(variants)) { setPendingLoadRun(run); return; }
    applyLoadRun(run);
  }

  function applyLoadRun(run) {
    setSelectedStudent({ id: run.studentId, displayName: run.studentName });
    setSessionName(run.sessionName || "");
    setVariants(restoreVariantsFromRun(run));
    setSnackbar({ open: true, message: `Loaded run: ${run.sessionName || run.studentName}`, severity: "info" });
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 3, mb: 3, flexWrap: "wrap" }}>
        <StudentPicker
          scope="program"
          defaults={SOUL_DEFAULTS_BY_PROGRAM[programFilter || "primary"]}
          onSelect={setSelectedStudent}
          programFilter={programFilter}
        />
        <SoulConfig selectedStudent={selectedStudent} onConfigLoaded={handleConfigLoaded} onProgramChange={setProgramFilter} />
        <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
          <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={runAll} disabled={!selectedStudent || variants.some((v) => v.loading)}>Run All</Button>
          <TextField label="Session Name" value={sessionName} onChange={(e) => setSessionName(e.target.value)} size="small" placeholder="Optional" sx={{ minWidth: 200 }} />
          <Button variant="outlined" startIcon={<SaveIcon />} onClick={saveRun} disabled={saving || !variants.some((v) => v.output)}>{saving ? "Saving..." : "Save Run"}</Button>
          <Button variant="outlined" startIcon={<HistoryIcon />} onClick={() => setHistoryOpen(true)}>History</Button>
        </Box>
      </Box>

      <Divider sx={{ mb: 3 }} />

      <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 2 }}>
        {variants.map((v, idx) => (
          <Box key={idx} sx={{ flex: variants.length <= SCROLL_AFTER ? `1 0 ${100 / variants.length - 2}%` : "0 0 auto", width: variants.length > SCROLL_AFTER ? 450 : undefined }}>
            <VariantColumn variant={v} idx={idx} featureId={FEATURE_ID} canRemove={variants.length > 1} onUpdate={handleUpdateVariant} onRemove={tryRemoveColumn} />
          </Box>
        ))}
        <Box sx={{ minWidth: 80, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, border: 2, borderColor: "divider", borderRadius: 2, borderStyle: "dashed", cursor: "pointer", position: "sticky", right: 0, bgcolor: "background.default", "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" } }} onClick={addColumn}>
          <AddIcon color="action" />
          <Typography variant="caption" color="text.secondary">Add</Typography>
        </Box>
      </Box>

      <Dialog open={confirmClose !== null} onClose={() => setConfirmClose(null)}>
        <DialogTitle>Close variant?</DialogTitle>
        <DialogContent><DialogContentText>This variant has unsaved changes. Closing it will discard everything.</DialogContentText></DialogContent>
        <DialogActions><Button onClick={() => setConfirmClose(null)}>Cancel</Button><Button onClick={() => { setVariants((prev) => prev.filter((_, i) => i !== confirmClose)); setConfirmClose(null); }} color="error">Discard</Button></DialogActions>
      </Dialog>

      <Dialog open={pendingLoadRun !== null} onClose={() => setPendingLoadRun(null)}>
        <DialogTitle>Load saved run?</DialogTitle>
        <DialogContent><DialogContentText>You have unsaved work. Loading will discard current variants.</DialogContentText></DialogContent>
        <DialogActions><Button onClick={() => setPendingLoadRun(null)}>Cancel</Button><Button onClick={() => { applyLoadRun(pendingLoadRun); setPendingLoadRun(null); }} color="error">Discard & Load</Button></DialogActions>
      </Dialog>

      <RunHistory open={historyOpen} onClose={() => setHistoryOpen(false)} featureId={FEATURE_ID} onLoad={loadRun} />
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
