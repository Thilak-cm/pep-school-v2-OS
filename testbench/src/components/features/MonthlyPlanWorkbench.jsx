import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, addDoc, Timestamp, doc, getDoc } from "firebase/firestore";
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
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SaveIcon from "@mui/icons-material/Save";
import HistoryIcon from "@mui/icons-material/History";
import StudentPicker from "../StudentPicker.jsx";
import VariantColumn from "../VariantColumn.jsx";
import RunHistory from "../RunHistory.jsx";
import WritingAnalysisDialog from "../WritingAnalysisDialog.jsx";
import MonthlyPlanConfig from "./MonthlyPlanConfig.jsx";
import MonthlyPlanPromptPipeline from "../pipeline/MonthlyPlanPromptPipeline.jsx";
import { createVariant, updateVariant as updateVariantHelper, hasUnsavedWork, SCROLL_AFTER } from "../../utils/variantHelpers.js";
import { buildSavePayload, restoreVariantsFromRun } from "../../hooks/useRunPersistence.js";
import useBackGuard from "../../hooks/useBackGuard.js";
import { useAuth } from "../../contexts/AuthContext.js";
import usePromoteToLive from "../../hooks/usePromoteToLive.js";
import PromoteConfirmDialog from "../PromoteConfirmDialog.jsx";

const FEATURE_ID = "monthly_plan";

export default function MonthlyPlanWorkbench({ onBack, registerBackGuard }) {
  const { role } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [variants, setVariants] = useState([createVariant(null, 0), createVariant(null, 1)]);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const [confirmClose, setConfirmClose] = useState(null);
  const [pendingLoadRun, setPendingLoadRun] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [promoteIdx, setPromoteIdx] = useState(null);
  const liveConfigRef = useRef(null);
  const { promote, promoting } = usePromoteToLive();

  // Writing analysis prerequisite (PEP-235)
  const [writingDialogOpen, setWritingDialogOpen] = useState(false);
  const writingGenCompleted = useRef(null);

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (hasUnsavedWork(variants)) e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [variants]);

  const { blocked: backBlocked, confirmLeave, cancelLeave } = useBackGuard(registerBackGuard, onBack, hasUnsavedWork(variants));

  // Check for missing writing analysis when student changes
  useEffect(() => {
    if (!selectedStudent || writingGenCompleted.current === selectedStudent.id) return;
    checkWritingAnalysis(selectedStudent.id);
  }, [selectedStudent]);

  async function checkWritingAnalysis(studentId) {
    try {
      const snap = await getDoc(doc(db, "students", studentId, "ai_summaries", "writing_analysis"));
      if (!snap.exists()) {
        setWritingDialogOpen(true);
      }
    } catch (err) {
      console.warn("[MonthlyPlan] Failed to check writing analysis:", err?.message);
    }
  }

  function handleWritingGenerated() {
    writingGenCompleted.current = selectedStudent?.id;
    setWritingDialogOpen(false);
    setSnackbar({ open: true, message: "Writing analysis generated", severity: "success" });
  }

  const handleConfigLoaded = useCallback((config) => {
    liveConfigRef.current = config;
    setVariants((prev) => prev.map((v, i) =>
      i === 0 ? { ...v, ...config, dirty: false } : { ...v, systemPrompt: config.systemPrompt, max_tokens: config.max_tokens || v.max_tokens, dirty: false }
    ));
  }, []);

  const promoteVariantConfig = useMemo(() => {
    if (promoteIdx === null) return null;
    const v = variants[promoteIdx];
    return { systemPrompt: v.systemPrompt, model: v.model, temperature: v.temperature, max_tokens: v.max_tokens };
  }, [promoteIdx, variants]);

  async function handlePromoteConfirm({ fields }) {
    try {
      await promote({ featureId: FEATURE_ID, fields });
      setPromoteIdx(null);
      setSnackbar({ open: true, message: "Promoted to live config", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: `Promote failed: ${err.message}`, severity: "error" });
    }
  }

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
        const result = await testBenchRun({ feature: FEATURE_ID, studentId: selectedStudent.id, systemPrompt: v.systemPrompt, model: v.model, temperature: v.temperature, max_tokens: v.max_tokens });
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
      await addDoc(collection(db, "testbench/settings/runs"), { ...payload, timestamp: Timestamp.now() });
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
          programFilter="toddler,primary"
          onSelect={setSelectedStudent}
        />
        <MonthlyPlanConfig onConfigLoaded={handleConfigLoaded} />
        <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
          <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={runAll} disabled={!selectedStudent || variants.some((v) => v.loading)}>Run All</Button>
          <TextField label="Session Name" value={sessionName} onChange={(e) => setSessionName(e.target.value)} size="small" placeholder="Optional" sx={{ minWidth: 200 }} />
          <Button variant="outlined" startIcon={<SaveIcon />} onClick={saveRun} disabled={saving || !variants.some((v) => v.output)}>{saving ? "Saving..." : "Save Run"}</Button>
          <Button variant="outlined" startIcon={<HistoryIcon />} onClick={() => setHistoryOpen(true)}>History</Button>
        </Box>
      </Box>

      <Accordion variant="outlined" sx={{ mb: 3, "&::before": { display: "none" } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2" fontWeight={600}>Prompt Assembly Pipeline</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0 }}>
          <MonthlyPlanPromptPipeline
            systemPrompt={variants[0]?.systemPrompt}
            selectedStudent={selectedStudent}
          />
        </AccordionDetails>
      </Accordion>

      <Divider sx={{ mb: 3 }} />

      <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 2 }}>
        {variants.map((v, idx) => (
          <Box key={idx} sx={{ flex: variants.length <= SCROLL_AFTER ? `1 0 ${100 / variants.length - 2}%` : "0 0 auto", width: variants.length > SCROLL_AFTER ? 450 : undefined }}>
            <VariantColumn variant={v} idx={idx} featureId={FEATURE_ID} canRemove={variants.length > 1} onUpdate={handleUpdateVariant} onRemove={tryRemoveColumn} canPromote={role === "superadmin"} onPromote={setPromoteIdx} />
          </Box>
        ))}
        <Box sx={{ minWidth: 80, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, border: 2, borderColor: "divider", borderRadius: 2, borderStyle: "dashed", cursor: "pointer", position: "sticky", right: 0, bgcolor: "background.default", "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" } }} onClick={addColumn}>
          <AddIcon color="action" />
          <Typography variant="caption" color="text.secondary">Add</Typography>
        </Box>
      </Box>

      {/* Writing analysis prerequisite dialog (PEP-235) */}
      <WritingAnalysisDialog
        open={writingDialogOpen}
        studentName={selectedStudent?.displayName || ""}
        studentId={selectedStudent?.id || ""}
        onSuccess={handleWritingGenerated}
        onClose={() => setWritingDialogOpen(false)}
      />

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

      <Dialog open={backBlocked} onClose={cancelLeave}>
        <DialogTitle>Leave with unsaved changes?</DialogTitle>
        <DialogContent><DialogContentText>You have unsaved work. Leaving will discard your current variants and outputs.</DialogContentText></DialogContent>
        <DialogActions><Button onClick={cancelLeave}>Cancel</Button><Button onClick={confirmLeave} color="error">Leave without saving</Button></DialogActions>
      </Dialog>

      <PromoteConfirmDialog
        key={promoteIdx ?? "closed"}
        open={promoteIdx !== null}
        onClose={() => setPromoteIdx(null)}
        onConfirm={handlePromoteConfirm}
        featureId={FEATURE_ID}
        liveConfig={liveConfigRef.current}
        variantConfig={promoteVariantConfig}
        promoting={promoting}
      />

      <RunHistory open={historyOpen} onClose={() => setHistoryOpen(false)} featureId={FEATURE_ID} onLoad={loadRun} />
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
