import { useState, useCallback, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { cloudFunctions, db, auth } from "../firebase.js";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Slider from "@mui/material/Slider";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import SaveIcon from "@mui/icons-material/Save";
import HistoryIcon from "@mui/icons-material/History";
import StudentPicker from "./StudentPicker.jsx";
import PromptEditor from "./PromptEditor.jsx";
import OutputPanel from "./OutputPanel.jsx";
import RatingWidget from "./RatingWidget.jsx";
import ConversationPanel from "./ConversationPanel.jsx";
import LLMContextPipeline from "./LLMContextPipeline.jsx";
import HandwritingConfig from "./features/HandwritingConfig.jsx";
import SoulConfig from "./features/SoulConfig.jsx";
import InterviewQuestionConfig from "./features/InterviewQuestionConfig.jsx";
import RunHistory from "./RunHistory.jsx";

const MODELS = [
  { id: "gpt-5.4", label: "GPT-5.4" },
  { id: "gpt-5.3-instant", label: "GPT-5.3 Instant" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
];

const SCROLL_AFTER = 4; // columns become fixed-width and scroll after this count

function createVariant(config, idx) {
  return {
    name: `Variant ${String.fromCharCode(65 + (idx || 0))}`,
    systemPrompt: config?.systemPrompt || "",
    guidelinesContent: config?.guidelinesContent || "",
    model: config?.model || "gpt-5.4",
    temperature: config?.temperature ?? 0.3,
    max_tokens: config?.max_tokens || 2000,
    output: null,
    outputMeta: null,
    error: null,
    loading: false,
    rating: 5,
    notes: "",
    dirty: false,
  };
}

export default function FeatureWorkbench({ featureId }) {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [variants, setVariants] = useState([createVariant(null, 0), createVariant(null, 1)]);
  const [baseConfig, setBaseConfig] = useState(null);
  const [programFilter, setProgramFilter] = useState(null);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const [editingName, setEditingName] = useState(null); // index of variant being renamed
  const [confirmClose, setConfirmClose] = useState(null); // index of variant pending close confirmation
  const [pendingLoadRun, setPendingLoadRun] = useState(null); // run pending load confirmation

  const isSoul = featureId === "soul_generation";
  const isInterview = featureId === "interview_question_gen";

  // Interview-specific state
  const [conversations, setConversations] = useState({}); // { [variantIdx]: Turn[] }
  const [teacherInput, setTeacherInput] = useState("");
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [interviewEnded, setInterviewEnded] = useState(false);
  const [kickoffMessage, setKickoffMessage] = useState("Begin the interview. Generate your exploration areas and first question.");
  const [studentContextData, setStudentContextData] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");

  // Warn on page refresh/close if any variant has edits or output
  useEffect(() => {
    function handleBeforeUnload(e) {
      const hasWork = variants.some((v) => v.dirty || v.output);
      if (hasWork) {
        e.preventDefault();
      }
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
    const base = variants[0];
    const idx = variants.length;
    setVariants((prev) => [...prev, createVariant(base, idx)]);
  }

  function tryRemoveColumn(idx) {
    if (variants.length <= 1) return;
    const v = variants[idx];
    if (v.dirty || v.output) {
      setConfirmClose(idx);
    } else {
      setVariants((prev) => prev.filter((_, i) => i !== idx));
    }
  }

  function confirmRemoveColumn() {
    if (confirmClose !== null) {
      setVariants((prev) => prev.filter((_, i) => i !== confirmClose));
      setConfirmClose(null);
    }
  }

  function updateVariant(idx, field, value) {
    setVariants((prev) => prev.map((v, i) => i === idx ? { ...v, [field]: value, dirty: true } : v));
  }

  async function runAll() {
    if (!selectedStudent) return;

    const testBenchRun = httpsCallable(cloudFunctions, "testBenchRun", { timeout: 300000 });

    const updated = variants.map((v) => ({ ...v, loading: true, output: null, error: null, outputMeta: null }));
    setVariants(updated);

    const promises = updated.map(async (v, idx) => {
      const start = Date.now();
      try {
        const payload = {
          feature: featureId,
          studentId: selectedStudent.id,
          systemPrompt: v.systemPrompt,
          model: v.model,
          temperature: v.temperature,
          max_tokens: v.max_tokens,
        };
        if (isSoul) {
          payload.guidelinesContent = v.guidelinesContent;
          payload.windowDays = baseConfig?.windowDays || 365;
          payload.includeInterviews = false; // no interviews live yet
        }
        const result = await testBenchRun(payload);
        const latencyMs = Date.now() - start;
        return {
          idx,
          output: result.data.output,
          outputMeta: { model: v.model, tokens: result.data.totalTokens, latencyMs },
        };
      } catch (err) {
        return { idx, error: err.message || "Unknown error" };
      }
    });

    const results = await Promise.all(promises);
    setVariants((prev) => {
      const next = [...prev];
      for (const r of results) {
        next[r.idx] = {
          ...next[r.idx],
          loading: false,
          output: r.output || null,
          error: r.error || null,
          outputMeta: r.outputMeta || null,
        };
      }
      return next;
    });
  }

  // --- Interview-mode functions ---

  async function startInterview() {
    if (!selectedStudent) return;
    setInterviewStarted(true);

    const testBenchRun = httpsCallable(cloudFunctions, "testBenchRun", { timeout: 300000 });
    const newConversations = {};

    // Mark all variants as loading
    setVariants((prev) => prev.map((v) => ({ ...v, loading: true, error: null })));

    const promises = variants.map(async (v, idx) => {
      const start = Date.now();
      try {
        const result = await testBenchRun({
          feature: featureId,
          studentId: selectedStudent.id,
          systemPrompt: v.systemPrompt,
          messages: [{ role: "user", content: kickoffMessage }],
          model: v.model,
          temperature: v.temperature,
          max_tokens: v.max_tokens,
        });
        const latencyMs = Date.now() - start;
        let parsed;
        try { parsed = JSON.parse(result.data.output); } catch { parsed = {}; }
        newConversations[idx] = [{
          type: "question",
          question: parsed.question || null,
          explorationAreas: parsed.explorationAreas || null,
          thinking: null,
          rawContent: result.data.output,
          meta: { tokens: result.data.totalTokens, latencyMs },
        }];
        return { idx, error: null };
      } catch (err) {
        newConversations[idx] = [];
        return { idx, error: err.message || "Unknown error" };
      }
    });

    const results = await Promise.all(promises);
    setConversations(newConversations);
    setVariants((prev) => {
      const next = [...prev];
      for (const r of results) {
        next[r.idx] = { ...next[r.idx], loading: false, error: r.error || null, dirty: true };
      }
      return next;
    });
  }

  async function sendAnswer() {
    if (!teacherInput.trim() || !selectedStudent) return;
    const answer = teacherInput.trim();
    setTeacherInput("");

    const testBenchRun = httpsCallable(cloudFunctions, "testBenchRun", { timeout: 300000 });

    // Snapshot conversations before state update to avoid stale closure
    const conversationsSnapshot = { ...conversations };

    // Add answer to all conversations and mark loading
    setConversations((prev) => {
      const updated = { ...prev };
      for (const idx of Object.keys(updated)) {
        updated[idx] = [...updated[idx], { type: "answer", answer }];
      }
      return updated;
    });
    setVariants((prev) => prev.map((v) => ({ ...v, loading: true, error: null })));

    // Build messages from snapshot (not stale closure)
    function getSnapshotMessages(idx) {
      const turns = conversationsSnapshot[idx] || [];
      const messages = [];
      for (const turn of turns) {
        if (turn.type === "question") {
          messages.push({ role: "assistant", content: turn.rawContent });
        } else if (turn.type === "answer") {
          messages.push({ role: "user", content: turn.answer });
        }
      }
      return messages;
    }

    const promises = variants.map(async (v, idx) => {
      const start = Date.now();
      try {
        // Build messages from conversation snapshot + new answer
        const prevMessages = [
          { role: "user", content: kickoffMessage },
          ...getSnapshotMessages(idx),
          { role: "user", content: answer },
        ];
        const result = await testBenchRun({
          feature: featureId,
          studentId: selectedStudent.id,
          systemPrompt: v.systemPrompt,
          messages: prevMessages,
          model: v.model,
          temperature: v.temperature,
          max_tokens: v.max_tokens,
        });
        const latencyMs = Date.now() - start;
        let parsed;
        try { parsed = JSON.parse(result.data.output); } catch { parsed = {}; }
        return {
          idx,
          turn: {
            type: "question",
            question: parsed.question || null,
            explorationAreas: null,
            thinking: parsed.thinking || null,
            rawContent: result.data.output,
            meta: { tokens: result.data.totalTokens, latencyMs },
          },
          error: null,
        };
      } catch (err) {
        return { idx, turn: null, error: err.message || "Unknown error" };
      }
    });

    const results = await Promise.all(promises);
    setConversations((prev) => {
      const updated = { ...prev };
      for (const r of results) {
        if (r.turn) {
          updated[r.idx] = [...(updated[r.idx] || []), r.turn];
        }
      }
      return updated;
    });
    setVariants((prev) => {
      const next = [...prev];
      for (const r of results) {
        next[r.idx] = { ...next[r.idx], loading: false, error: r.error || null, dirty: true };
      }
      return next;
    });
  }

  function endInterview() {
    setInterviewEnded(true);
    setVariants((prev) => prev.map((v) => ({
      ...v,
      loading: false,
      output: JSON.stringify(conversations, null, 2),
    })));
  }

  async function saveRun() {
    if (!selectedStudent) return;
    setSaving(true);
    try {
      const user = auth.currentUser;
      const trimmedName = sessionName.trim();
      await addDoc(collection(db, "testbench"), {
        feature: featureId,
        studentId: selectedStudent.id,
        studentName: selectedStudent.displayName,
        ...(trimmedName ? { sessionName: trimmedName } : {}),
        timestamp: Timestamp.now(),
        variants: variants.map((v, idx) => ({
          name: v.name,
          prompt: {
            systemPrompt: v.systemPrompt,
            ...(v.guidelinesContent ? { guidelinesContent: v.guidelinesContent } : {}),
            model: v.model,
            temperature: v.temperature,
            max_tokens: v.max_tokens,
          },
          output: v.output || "",
          ...(isInterview && conversations[idx] ? { conversation: conversations[idx] } : {}),
          rating: v.rating,
          notes: v.notes,
        })),
        ...(isInterview ? { kickoffMessage } : {}),
        ranBy: { uid: user?.uid, name: user?.displayName || user?.email },
      });
      setSnackbar({ open: true, message: "Run saved to Firestore", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: `Save failed: ${err.message}`, severity: "error" });
    } finally {
      setSaving(false);
    }
  }

  function loadRun(run) {
    const hasWork = variants.some((v) => v.dirty || v.output);
    if (hasWork) {
      setPendingLoadRun(run);
      return;
    }
    applyLoadRun(run);
  }

  function applyLoadRun(run) {
    setSelectedStudent({ id: run.studentId, displayName: run.studentName });
    setSessionName(run.sessionName || "");
    if (run.kickoffMessage) setKickoffMessage(run.kickoffMessage);

    const restored = (run.variants || []).map((v, i) => ({
      ...createVariant(null, i),
      name: v.name,
      systemPrompt: v.prompt?.systemPrompt || "",
      guidelinesContent: v.prompt?.guidelinesContent || "",
      model: v.prompt?.model || "gpt-5.4",
      temperature: v.prompt?.temperature ?? 0.3,
      max_tokens: v.prompt?.max_tokens || 2000,
      output: v.output || null,
      rating: v.rating ?? 5,
      notes: v.notes || "",
    }));
    setVariants(restored);

    // Restore conversations for interview runs
    const restoredConvos = {};
    (run.variants || []).forEach((v, i) => {
      if (v.conversation) restoredConvos[i] = v.conversation;
    });
    setConversations(restoredConvos);

    const hasConvos = Object.keys(restoredConvos).length > 0;
    setInterviewStarted(hasConvos);
    setInterviewEnded(hasConvos);

    setSnackbar({ open: true, message: `Loaded run: ${run.sessionName || run.studentName}`, severity: "info" });
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Setup bar */}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 3, mb: 3, flexWrap: "wrap" }}>
        <StudentPicker featureId={featureId} onSelect={setSelectedStudent} programFilter={programFilter} />

        {featureId === "handwriting_analysis" && (
          <HandwritingConfig onConfigLoaded={handleConfigLoaded} />
        )}
        {isSoul && (
          <SoulConfig
            selectedStudent={selectedStudent}
            onConfigLoaded={handleConfigLoaded}
            onProgramChange={setProgramFilter}
          />
        )}
        {isInterview && (
          <InterviewQuestionConfig
            selectedStudent={selectedStudent}
            onConfigLoaded={handleConfigLoaded}
            onStudentContextLoaded={setStudentContextData}
          />
        )}

        <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
          {isInterview ? (
            <>
              {!interviewStarted ? (
                <Button
                  variant="contained"
                  startIcon={<PlayArrowIcon />}
                  onClick={startInterview}
                  disabled={!selectedStudent || variants.some((v) => v.loading)}
                >
                  Start Interview
                </Button>
              ) : !interviewEnded ? (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<StopIcon />}
                  onClick={endInterview}
                  disabled={variants.some((v) => v.loading)}
                >
                  End Interview
                </Button>
              ) : (
                <Chip label="Session Ended" color="default" variant="outlined" />
              )}
            </>
          ) : (
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={runAll}
              disabled={!selectedStudent || variants.some((v) => v.loading)}
            >
              Run All
            </Button>
          )}
          <TextField
            label="Session Name"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            size="small"
            placeholder="Optional — defaults to student name"
            sx={{ minWidth: 200 }}
          />
          <Button
            variant="outlined"
            startIcon={<SaveIcon />}
            onClick={saveRun}
            disabled={saving || !(isInterview ? Object.values(conversations).some((c) => c?.length > 0) : variants.some((v) => v.output))}
          >
            {saving ? "Saving..." : "Save Run"}
          </Button>
          <Button
            variant="outlined"
            startIcon={<HistoryIcon />}
            onClick={() => setHistoryOpen(true)}
          >
            History
          </Button>
        </Box>
      </Box>

      {/* Interview: full-width LLM context pipeline */}
      {isInterview && studentContextData && (
        <Box sx={{ mb: 3 }}>
          <LLMContextPipeline studentContext={studentContextData} selectedStudent={selectedStudent} kickoffMessage={kickoffMessage} />
        </Box>
      )}

      <Divider sx={{ mb: 3 }} />

      {/* Interview: kickoff message */}
      {isInterview && (
        <Box sx={{ mb: 3 }}>
          <TextField
            label="Kickoff Message"
            value={kickoffMessage}
            onChange={(e) => setKickoffMessage(e.target.value)}
            size="small"
            fullWidth
            disabled={interviewStarted}
            helperText="First user message sent to start the interview"
          />
        </Box>
      )}

      {/* Comparison columns */}
      <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 2 }}>
        {variants.map((v, idx) => (
          <Box
            key={idx}
            sx={{
              flex: variants.length <= SCROLL_AFTER ? `1 0 ${100 / variants.length - 2}%` : "0 0 auto",
              width: variants.length > SCROLL_AFTER ? 450 : undefined,
              minWidth: 350,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              p: 2,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {/* Column header with editable name */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                {editingName === idx ? (
                  <>
                    <TextField
                      size="small"
                      value={v.name}
                      onChange={(e) => updateVariant(idx, "name", e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") setEditingName(null); }}
                      autoFocus
                      sx={{ width: 180 }}
                      slotProps={{ input: { sx: { fontWeight: 700 } } }}
                    />
                    <IconButton size="small" onClick={() => setEditingName(null)} color="primary">
                      <CheckIcon fontSize="small" />
                    </IconButton>
                  </>
                ) : (
                  <>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {v.name}
                    </Typography>
                    <IconButton size="small" onClick={() => setEditingName(idx)} sx={{ color: "primary.main" }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </>
                )}
              </Box>
              {variants.length > 1 && (
                <IconButton size="small" onClick={() => tryRemoveColumn(idx)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              )}
            </Box>

            {/* Model + temperature */}
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Select
                value={v.model}
                onChange={(e) => updateVariant(idx, "model", e.target.value)}
                size="small"
                sx={{ minWidth: 160 }}
              >
                {MODELS.map((m) => (
                  <MenuItem key={m.id} value={m.id}>{m.label}</MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 40 }}>
                T={v.temperature}
              </Typography>
              <Slider
                value={v.temperature}
                onChange={(_, val) => updateVariant(idx, "temperature", val)}
                min={0}
                max={1}
                step={0.1}
                sx={{ width: 80 }}
              />
            </Box>

            {/* Prompt editor(s) */}
            <PromptEditor
              label={isInterview ? "Instruction Template" : "System Prompt"}
              value={v.systemPrompt}
              onChange={(val) => updateVariant(idx, "systemPrompt", val)}
              rows={isSoul || isInterview ? 10 : 14}
            />
            {isSoul && (
              <PromptEditor
                label="Guidelines Template"
                value={v.guidelinesContent}
                onChange={(val) => updateVariant(idx, "guidelinesContent", val)}
                rows={10}
                collapsed
                helperText="Per-student developmental areas — loaded from student's ai_summaries/guidelines"
              />
            )}

            {/* Output / Conversation */}
            {isInterview ? (
              <ConversationPanel
                turns={conversations[idx] || []}
                loading={v.loading}
                error={v.error}
                teacherInput={teacherInput}
                onTeacherInputChange={setTeacherInput}
                onSendAnswer={sendAnswer}
                inputDisabled={variants.some((vr) => vr.loading)}
                ended={interviewEnded}
              />
            ) : (
              <OutputPanel output={v.output} loading={v.loading} error={v.error} meta={v.outputMeta} featureId={featureId} />
            )}

            {/* Rating */}
            {(isInterview ? (conversations[idx]?.length > 0 && !v.loading) : v.output) && (
              <RatingWidget
                rating={v.rating}
                notes={v.notes}
                onRatingChange={(val) => updateVariant(idx, "rating", val)}
                onNotesChange={(val) => updateVariant(idx, "notes", val)}
              />
            )}
          </Box>
        ))}

        {/* Add column button */}
        {(
          <Box
            sx={{
              minWidth: 80,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              border: 2,
              borderColor: "divider",
              borderRadius: 2,
              borderStyle: "dashed",
              cursor: "pointer",
              position: "sticky",
              right: 0,
              bgcolor: "background.default",
              "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
            }}
            onClick={addColumn}
          >
            <AddIcon color="action" />
            <Typography variant="caption" color="text.secondary">Add</Typography>
          </Box>
        )}
      </Box>

      {/* Close confirmation dialog */}
      <Dialog open={confirmClose !== null} onClose={() => setConfirmClose(null)}>
        <DialogTitle>Close variant?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This variant has unsaved changes{variants[confirmClose]?.output ? " and output" : ""}. Closing it will discard everything.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClose(null)}>Cancel</Button>
          <Button onClick={confirmRemoveColumn} color="error">Discard</Button>
        </DialogActions>
      </Dialog>

      {/* Load run confirmation dialog */}
      <Dialog open={pendingLoadRun !== null} onClose={() => setPendingLoadRun(null)}>
        <DialogTitle>Load saved run?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved work. Loading a saved run will discard your current variants and output.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingLoadRun(null)}>Cancel</Button>
          <Button onClick={() => { applyLoadRun(pendingLoadRun); setPendingLoadRun(null); }} color="error">Discard & Load</Button>
        </DialogActions>
      </Dialog>

      {/* Run history drawer */}
      <RunHistory open={historyOpen} onClose={() => setHistoryOpen(false)} featureId={featureId} onLoad={loadRun} />

      {/* Save feedback snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
