import { useState, useCallback, useEffect, useRef } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, addDoc, Timestamp, doc, getDoc } from "firebase/firestore";
import { cloudFunctions, db, auth } from "../../firebase.js";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import AddIcon from "@mui/icons-material/Add";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import SaveIcon from "@mui/icons-material/Save";
import HistoryIcon from "@mui/icons-material/History";
import StudentPicker from "../StudentPicker.jsx";
import SoulGenerationDialog from "../SoulGenerationDialog.jsx";
import VariantColumn from "../VariantColumn.jsx";
import LLMContextPipeline from "../LLMContextPipeline.jsx";
import RunHistory from "../RunHistory.jsx";
import InterviewQuestionConfig from "./InterviewQuestionConfig.jsx";
import { isMissingSoulData } from "../../utils/soulCheckHelpers.js";
import { pickRandomAreas, pickRandomQuestion, buildSyntheticTurn } from "../../../../functions/testbench/interviewColdStart.js";
import { createVariant, updateVariant as updateVariantHelper, hasUnsavedWork, SCROLL_AFTER } from "../../utils/variantHelpers.js";
import { buildSavePayload, restoreVariantsFromRun, restoreConversationsFromRun } from "../../hooks/useRunPersistence.js";
import { buildMessageHistory, getQuestionCount, serializeConversations, getElapsedMinutes as calcElapsedMinutes } from "../../hooks/useInterviewSession.js";

const FEATURE_ID = "interview_question_gen";

export default function InterviewWorkbench() {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [variants, setVariants] = useState([createVariant(null, 0), createVariant(null, 1)]);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const [confirmClose, setConfirmClose] = useState(null);
  const [pendingLoadRun, setPendingLoadRun] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");

  // Interview-specific state
  const [conversations, setConversations] = useState({});
  const [teacherInput, setTeacherInput] = useState("");
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [interviewEnded, setInterviewEnded] = useState(false);
  const [kickoffMessage, setKickoffMessage] = useState("Begin the interview. Generate your exploration areas and first question.");
  const [studentContextData, setStudentContextData] = useState(null);
  const [contextReloadKey, setContextReloadKey] = useState(0);
  const [soulDialogOpen, setSoulDialogOpen] = useState(false);

  // Timer
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerStartRef = useRef(null);
  const timerIntervalRef = useRef(null);

  useEffect(() => { return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); }; }, []);

  function startTimer() {
    timerStartRef.current = Date.now();
    timerIntervalRef.current = setInterval(() => { setElapsedSeconds(Math.floor((Date.now() - timerStartRef.current) / 1000)); }, 1000);
  }
  function stopTimer() { if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; } }

  useEffect(() => {
    function handleBeforeUnload(e) { if (hasUnsavedWork(variants)) e.preventDefault(); }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [variants]);

  const handleConfigLoaded = useCallback((config) => {
    setVariants((prev) => prev.map((v, i) =>
      i === 0 ? { ...v, ...config, dirty: false } : { ...v, systemPrompt: config.systemPrompt, max_tokens: config.max_tokens || v.max_tokens, dirty: false }
    ));
  }, []);

  // Proactive soul/open_questions detection (PEP-222)
  useEffect(() => {
    if (selectedStudent && isMissingSoulData(studentContextData)) {
      setSoulDialogOpen(true);
    }
  }, [studentContextData, selectedStudent]);

  function handleSoulGenerated() {
    setSoulDialogOpen(false);
    setContextReloadKey((k) => k + 1);
  }

  function addColumn() { setVariants((prev) => [...prev, createVariant(prev[0], prev.length)]); }

  function tryRemoveColumn(idx) {
    if (variants.length <= 1) return;
    const v = variants[idx];
    if (v.dirty || v.output) { setConfirmClose(idx); } else { setVariants((prev) => prev.filter((_, i) => i !== idx)); }
  }

  function handleUpdateVariant(idx, field, value) {
    setVariants((prev) => updateVariantHelper(prev, idx, field, value));
  }

  // --- Interview functions ---

  async function startInterview() {
    if (!selectedStudent) return;
    try {
      const oqSnap = await getDoc(doc(db, "students", selectedStudent.id, "ai_summaries", "open_questions"));
      if (!oqSnap.exists()) { setSoulDialogOpen(true); return; }

      const areas = oqSnap.data()?.areas;
      if (!areas || Object.keys(areas).length === 0) { setSoulDialogOpen(true); return; }

      const selectedAreas = pickRandomAreas(areas, 2);
      const picked = pickRandomQuestion(areas, selectedAreas);
      const explorationAreas = selectedAreas.map((key) => ({ area: key, rationale: `Pre-selected from open questions (${(areas[key] || []).length} questions in this area)` }));
      const syntheticTurn = buildSyntheticTurn({ questionText: picked.question, questionArea: picked.area, explorationAreas });

      const newConversations = {};
      for (let idx = 0; idx < variants.length; idx++) { newConversations[idx] = [syntheticTurn]; }

      setConversations(newConversations);
      setInterviewStarted(true);
      setVariants((prev) => prev.map((v) => ({ ...v, dirty: true })));
      startTimer();
    } catch (err) { setSnackbar({ open: true, message: `Failed to start interview: ${err.message}`, severity: "error" }); }
  }

  async function sendAnswer() {
    if (!teacherInput.trim() || !selectedStudent) return;
    const answer = teacherInput.trim();
    setTeacherInput("");
    const testBenchRun = httpsCallable(cloudFunctions, "testBenchRun", { timeout: 300000 });
    const conversationsSnapshot = { ...conversations };

    setConversations((prev) => {
      const updated = { ...prev };
      for (const idx of Object.keys(updated)) { updated[idx] = [...updated[idx], { type: "answer", answer }]; }
      return updated;
    });
    setVariants((prev) => prev.map((v) => ({ ...v, loading: true, error: null })));

    const questionCount = getQuestionCount(Object.values(conversationsSnapshot)[0]);
    const elapsedMinutes = calcElapsedMinutes(timerStartRef.current);

    const results = await Promise.all(variants.map(async (v, idx) => {
      const start = Date.now();
      try {
        const prevMessages = [...buildMessageHistory(conversationsSnapshot[idx] || [], kickoffMessage), { role: "user", content: answer }];
        const result = await testBenchRun({ feature: FEATURE_ID, studentId: selectedStudent.id, systemPrompt: v.systemPrompt, messages: prevMessages, model: v.model, temperature: v.temperature, max_tokens: v.max_tokens, elapsedMinutes, questionCount: questionCount + 1 });
        const latencyMs = Date.now() - start;
        let parsed; try { parsed = JSON.parse(result.data.output); } catch { parsed = {}; }

        if (parsed.interviewComplete) {
          return { idx, turn: { type: "closing", closingRemarks: parsed.closingRemarks || "Thank you for this conversation.", rawContent: result.data.output, meta: { tokens: result.data.totalTokens, latencyMs } }, error: null, interviewComplete: true };
        }
        return { idx, turn: { type: "question", question: parsed.question || null, explorationAreas: null, thinking: parsed.thinking || null, rawContent: result.data.output, meta: { tokens: result.data.totalTokens, latencyMs } }, error: null, interviewComplete: false };
      } catch (err) { return { idx, turn: null, error: err.message || "Unknown error", interviewComplete: false }; }
    }));

    setConversations((prev) => {
      const updated = { ...prev };
      for (const r of results) { if (r.turn) updated[r.idx] = [...(updated[r.idx] || []), r.turn]; }
      return updated;
    });
    setVariants((prev) => { const next = [...prev]; for (const r of results) { next[r.idx] = { ...next[r.idx], loading: false, error: r.error || null, dirty: true }; } return next; });

    if (results.some((r) => r.interviewComplete)) { endInterview(); }
  }

  function endInterview() {
    stopTimer();
    setInterviewEnded(true);
    setConversations((currentConvos) => {
      setVariants((prev) => prev.map((v) => ({ ...v, loading: false, output: serializeConversations(currentConvos) })));
      return currentConvos;
    });
  }

  async function saveRun() {
    if (!selectedStudent) return;
    setSaving(true);
    try {
      const payload = buildSavePayload({ featureId: FEATURE_ID, selectedStudent, variants, conversations, sessionName, kickoffMessage, user: auth.currentUser });
      await addDoc(collection(db, "testbench"), { ...payload, timestamp: Timestamp.now() });
      setSnackbar({ open: true, message: "Run saved to Firestore", severity: "success" });
    } catch (err) { setSnackbar({ open: true, message: `Save failed: ${err.message}`, severity: "error" }); }
    finally { setSaving(false); }
  }

  function loadRun(run) { if (hasUnsavedWork(variants)) { setPendingLoadRun(run); return; } applyLoadRun(run); }

  function applyLoadRun(run) {
    setSelectedStudent({ id: run.studentId, displayName: run.studentName });
    setSessionName(run.sessionName || "");
    if (run.kickoffMessage) setKickoffMessage(run.kickoffMessage);
    setVariants(restoreVariantsFromRun(run));
    const restoredConvos = restoreConversationsFromRun(run);
    setConversations(restoredConvos);
    const hasConvos = Object.keys(restoredConvos).length > 0;
    setInterviewStarted(hasConvos);
    setInterviewEnded(hasConvos);
    setSnackbar({ open: true, message: `Loaded run: ${run.sessionName || run.studentName}`, severity: "info" });
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 3, mb: 3, flexWrap: "wrap" }}>
        <StudentPicker scope="school-wide" onSelect={setSelectedStudent} />
        <InterviewQuestionConfig selectedStudent={selectedStudent} reloadKey={contextReloadKey} onConfigLoaded={handleConfigLoaded} onStudentContextLoaded={setStudentContextData} />
        <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
          {!interviewStarted ? (
            <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={startInterview} disabled={!selectedStudent || variants.some((v) => v.loading)}>Start Interview</Button>
          ) : !interviewEnded ? (
            <>
              <Chip label={`${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`} color={elapsedSeconds >= 600 ? "warning" : "default"} variant="outlined" sx={{ fontFamily: "monospace", fontWeight: 700, minWidth: 64 }} />
              <Button variant="outlined" color="error" startIcon={<StopIcon />} onClick={endInterview} disabled={variants.some((v) => v.loading)}>End Interview</Button>
            </>
          ) : (
            <Chip label={`Session Ended — ${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`} color="default" variant="outlined" sx={{ fontFamily: "monospace" }} />
          )}
          <TextField label="Session Name" value={sessionName} onChange={(e) => setSessionName(e.target.value)} size="small" placeholder="Optional" sx={{ minWidth: 200 }} />
          <Button variant="outlined" startIcon={<SaveIcon />} onClick={saveRun} disabled={saving || !Object.values(conversations).some((c) => c?.length > 0)}>{saving ? "Saving..." : "Save Run"}</Button>
          <Button variant="outlined" startIcon={<HistoryIcon />} onClick={() => setHistoryOpen(true)}>History</Button>
        </Box>
      </Box>

      {/* LLM Context Pipeline — always visible, content fills on student load (PEP-216) */}
      <Accordion defaultExpanded variant="outlined" sx={{ mb: 3, "&::before": { display: "none" } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2" fontWeight={600}>Prompt Assembly Pipeline</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0 }}>
          <LLMContextPipeline
            studentContext={studentContextData}
            selectedStudent={selectedStudent}
            kickoffMessage={kickoffMessage}
            interviewStarted={interviewStarted}
            elapsedSeconds={elapsedSeconds}
            questionCount={Object.values(conversations)[0]?.filter((t) => t.type === "question").length || 0}
          />
        </AccordionDetails>
      </Accordion>

      <Divider sx={{ mb: 3 }} />

      {/* Kickoff message */}
      <Box sx={{ mb: 3 }}>
        <TextField label="Kickoff Message" value={kickoffMessage} onChange={(e) => setKickoffMessage(e.target.value)} size="small" fullWidth disabled={interviewStarted} helperText="First user message sent to start the interview" />
      </Box>

      {/* Comparison columns */}
      <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 2 }}>
        {variants.map((v, idx) => (
          <Box key={idx} sx={{ flex: variants.length <= SCROLL_AFTER ? `1 0 ${100 / variants.length - 2}%` : "0 0 auto", width: variants.length > SCROLL_AFTER ? 450 : undefined }}>
            <VariantColumn variant={v} idx={idx} featureId={FEATURE_ID} canRemove={variants.length > 1} onUpdate={handleUpdateVariant} onRemove={tryRemoveColumn} conversations={conversations[idx]} teacherInput={teacherInput} onTeacherInputChange={setTeacherInput} onSendAnswer={sendAnswer} anyLoading={variants.some((vr) => vr.loading)} interviewEnded={interviewEnded} />
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

      <SoulGenerationDialog
        open={soulDialogOpen}
        studentName={selectedStudent?.displayName || ""}
        studentId={selectedStudent?.id || ""}
        onSuccess={handleSoulGenerated}
        onClose={() => setSoulDialogOpen(false)}
      />

      <RunHistory open={historyOpen} onClose={() => setHistoryOpen(false)} featureId={FEATURE_ID} onLoad={loadRun} />
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
