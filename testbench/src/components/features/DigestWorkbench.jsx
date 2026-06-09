import { useState, useCallback, useEffect, useRef } from "react";
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
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SaveIcon from "@mui/icons-material/Save";
import HistoryIcon from "@mui/icons-material/History";
import ClassroomPicker from "../ClassroomPicker.jsx";
import VariantColumn from "../VariantColumn.jsx";
import RunHistory from "../RunHistory.jsx";
import DigestConfig from "./DigestConfig.jsx";
import DigestPromptPipeline from "../pipeline/DigestPromptPipeline.jsx";
import { createVariant, updateVariant as updateVariantHelper, hasUnsavedWork, SCROLL_AFTER } from "../../utils/variantHelpers.js";
import { buildSavePayload, restoreVariantsFromRun } from "../../hooks/useRunPersistence.js";

const FEATURE_ID = "digest_generation";

export default function DigestWorkbench() {
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [promptType, setPromptType] = useState("classroom");
  const [variants, setVariants] = useState([createVariant(null, 0), createVariant(null, 1)]);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const [confirmClose, setConfirmClose] = useState(null);
  const [pendingLoadRun, setPendingLoadRun] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");

  // Tool selection
  const ALL_DEFAULT_TOOLS = [
    "fetch_weekly_snapshot", "fetch_snapshot_history", "fetch_soul",
    "fetch_monthly_plan", "fetch_writing_analysis", "fetch_interviews",
    "fetch_observations", "fetch_media",
  ];
  const [enabledTools, setEnabledTools] = useState(ALL_DEFAULT_TOOLS);
  const [allowedTools, setAllowedTools] = useState(ALL_DEFAULT_TOOLS);
  const [allowedScopes, setAllowedScopes] = useState(["student"]);

  // Store both prompts from config
  const configRef = useRef({ classroomPrompt: "", superadminPrompt: "" });

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (hasUnsavedWork(variants)) e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [variants]);

  const handleConfigLoaded = useCallback((config) => {
    configRef.current = {
      classroomPrompt: config.classroomPrompt,
      superadminPrompt: config.superadminPrompt,
    };
    // Seed tool permissions from config
    if (config.allowedTools) {
      setAllowedTools(config.allowedTools);
      setEnabledTools(config.allowedTools);
    }
    if (config.allowedScopes) setAllowedScopes(config.allowedScopes);

    // Seed variants with the current prompt type's prompt
    const prompt = config.classroomPrompt;
    setVariants((prev) => prev.map((v, i) =>
      i === 0
        ? { ...v, systemPrompt: prompt, model: config.model, temperature: config.temperature, max_tokens: config.max_tokens, dirty: false }
        : { ...v, systemPrompt: prompt, max_tokens: config.max_tokens || v.max_tokens, dirty: false }
    ));
  }, []);

  function handlePromptTypeChange(_, newType) {
    if (!newType) return;
    setPromptType(newType);
    // Update variant prompts to match the selected type
    const prompt = newType === "superadmin"
      ? configRef.current.superadminPrompt
      : configRef.current.classroomPrompt;
    setVariants((prev) => prev.map((v) => ({
      ...v,
      systemPrompt: prompt,
      output: null,
      outputMeta: null,
      error: null,
      dirty: false,
    })));
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
    // Classroom mode requires a selected classroom; superadmin mode doesn't
    if (promptType === "classroom" && !selectedClassroom) return;

    const testBenchRun = httpsCallable(cloudFunctions, "testBenchRun", { timeout: 300000 });
    const updated = variants.map((v) => ({ ...v, loading: true, output: null, error: null, outputMeta: null }));
    setVariants(updated);

    const results = await Promise.all(updated.map(async (v, idx) => {
      const start = Date.now();
      try {
        const payload = {
          feature: FEATURE_ID,
          promptType,
          systemPrompt: v.systemPrompt,
          model: v.model,
          temperature: v.temperature,
          max_tokens: v.max_tokens,
          enabledTools,
        };
        if (promptType === "classroom" && selectedClassroom) {
          payload.classroomId = selectedClassroom.id;
        }
        const result = await testBenchRun(payload);
        return {
          idx,
          output: result.data.output,
          outputMeta: {
            model: v.model,
            tokens: result.data.totalTokens,
            latencyMs: Date.now() - start,
            toolCalls: result.data.toolCallLog?.length || 0,
            iterations: result.data.iterations || 0,
          },
        };
      } catch (err) { return { idx, error: err.message || "Unknown error" }; }
    }));

    setVariants((prev) => {
      const next = [...prev];
      for (const r of results) { next[r.idx] = { ...next[r.idx], loading: false, output: r.output || null, error: r.error || null, outputMeta: r.outputMeta || null }; }
      return next;
    });
  }

  async function saveRun() {
    if (promptType === "classroom" && !selectedClassroom) return;
    setSaving(true);
    try {
      const payload = buildSavePayload({
        featureId: FEATURE_ID,
        selectedStudent: null,
        selectedClassroom,
        promptType,
        variants,
        conversations: {},
        sessionName,
        kickoffMessage: "",
        user: auth.currentUser,
      });
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
    if (run.classroomId) {
      setSelectedClassroom({ id: run.classroomId, name: run.classroomName || run.classroomId });
    }
    if (run.promptType) {
      setPromptType(run.promptType);
    }
    setSessionName(run.sessionName || "");
    setVariants(restoreVariantsFromRun(run));
    setSnackbar({ open: true, message: `Loaded run: ${run.sessionName || run.classroomName || "saved run"}`, severity: "info" });
  }

  const canRun = promptType === "superadmin" || !!selectedClassroom;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 3, mb: 3, flexWrap: "wrap" }}>
        <ToggleButtonGroup
          value={promptType}
          exclusive
          onChange={handlePromptTypeChange}
          size="small"
        >
          <ToggleButton value="classroom">Classroom Admin</ToggleButton>
          <ToggleButton value="superadmin">Superadmin Executive</ToggleButton>
        </ToggleButtonGroup>

        {promptType === "classroom" && (
          <ClassroomPicker onSelect={setSelectedClassroom} />
        )}
        {promptType === "superadmin" && (
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
            Runs against all stored classroom digests
          </Typography>
        )}

        <DigestConfig onConfigLoaded={handleConfigLoaded} />

        <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
          <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={runAll} disabled={!canRun || variants.some((v) => v.loading)}>Run All</Button>
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
          <DigestPromptPipeline
            systemPrompt={variants[0]?.systemPrompt}
            promptType={promptType}
            selectedClassroom={selectedClassroom}
            enabledTools={enabledTools}
            allowedTools={allowedTools}
            allowedScopes={allowedScopes}
            onToolsChange={setEnabledTools}
          />
        </AccordionDetails>
      </Accordion>

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
