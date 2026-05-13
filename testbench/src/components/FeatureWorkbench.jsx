import { useState, useCallback, useEffect, useRef } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, addDoc, Timestamp, doc, getDoc } from "firebase/firestore";
import { cloudFunctions, db, auth } from "../firebase.js";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
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
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import SaveIcon from "@mui/icons-material/Save";
import HistoryIcon from "@mui/icons-material/History";
import StudentPicker from "./StudentPicker.jsx";
import LLMContextPipeline from "./LLMContextPipeline.jsx";
import VariantColumn from "./VariantColumn.jsx";
import HandwritingConfig from "./features/HandwritingConfig.jsx";
import SoulConfig from "./features/SoulConfig.jsx";
import InterviewQuestionConfig from "./features/InterviewQuestionConfig.jsx";
import RunHistory from "./RunHistory.jsx";
import { pickRandomAreas, pickRandomQuestion, buildSyntheticTurn } from "../../../functions/testbench/interviewColdStart.js";
import { createVariant, updateVariant as updateVariantHelper, hasUnsavedWork, SCROLL_AFTER } from "../utils/variantHelpers.js";

// Hardcoded student defaults — will move to per-feature workbenches
const HANDWRITING_DEFAULTS = [
  { id: "2025-GUL-030", displayName: "Sudarshan", classroomId: "gulmohar", classroomName: "Gulmohar", handwrittenCount: 9 },
  { id: "2025-GUL-003", displayName: "Akshleena Mishra", classroomId: "gulmohar", classroomName: "Gulmohar", handwrittenCount: 6 },
  { id: "2025-GUL-017", displayName: "Kartik Maheshwari", classroomId: "gulmohar", classroomName: "Gulmohar", handwrittenCount: 4 },
  { id: "2025-PER-003", displayName: "Anagha Mandyam", classroomId: "periwinkle", classroomName: "Periwinkle", handwrittenCount: 4 },
  { id: "2025-GUL-021", displayName: "Nuha Rao", classroomId: "gulmohar", classroomName: "Gulmohar", handwrittenCount: 4 },
];

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
import { buildSavePayload, restoreVariantsFromRun, restoreConversationsFromRun } from "../hooks/useRunPersistence.js";
import { buildMessageHistory, getQuestionCount, serializeConversations, getElapsedMinutes as calcElapsedMinutes } from "../hooks/useInterviewSession.js";

export default function FeatureWorkbench({ featureId }) {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [variants, setVariants] = useState([createVariant(null, 0), createVariant(null, 1)]);
  const [baseConfig, setBaseConfig] = useState(null);
  const [programFilter, setProgramFilter] = useState(null);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
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

  // Timer state (PEP-208)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerStartRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, []);

  function startTimer() {
    timerStartRef.current = Date.now();
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - timerStartRef.current) / 1000));
    }, 1000);
  }

  function stopTimer() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }

  function getElapsedMinutes() {
    return calcElapsedMinutes(timerStartRef.current);
  }

  // Warn on page refresh/close if any variant has edits or output
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (hasUnsavedWork(variants)) {
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

  function handleUpdateVariant(idx, field, value) {
    setVariants((prev) => updateVariantHelper(prev, idx, field, value));
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

    try {
      // Fetch open_questions doc from Firestore
      const oqSnap = await getDoc(doc(db, "students", selectedStudent.id, "ai_summaries", "open_questions"));
      if (!oqSnap.exists()) {
        setSnackbar({ open: true, message: "No open_questions doc found — soul generation must run first", severity: "error" });
        return;
      }

      const areas = oqSnap.data()?.areas;
      if (!areas || Object.keys(areas).length === 0) {
        setSnackbar({ open: true, message: "open_questions doc has no areas", severity: "error" });
        return;
      }

      // Pick 2 random areas and 1 random question using tested helpers
      const selectedAreas = pickRandomAreas(areas, 2);
      const picked = pickRandomQuestion(areas, selectedAreas);

      const explorationAreas = selectedAreas.map((key) => ({
        area: key,
        rationale: `Pre-selected from open questions (${(areas[key] || []).length} questions in this area)`,
      }));

      // Build synthetic turn mimicking LLM response shape
      const syntheticTurn = buildSyntheticTurn({
        questionText: picked.question,
        questionArea: picked.area,
        explorationAreas,
      });

      // Apply to all variants simultaneously
      const newConversations = {};
      for (let idx = 0; idx < variants.length; idx++) {
        newConversations[idx] = [syntheticTurn];
      }

      setConversations(newConversations);
      setInterviewStarted(true);
      setVariants((prev) => prev.map((v) => ({ ...v, dirty: true })));

      // Start timer when Q1 is displayed
      startTimer();
    } catch (err) {
      setSnackbar({ open: true, message: `Failed to start interview: ${err.message}`, severity: "error" });
    }
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

    // Count questions from snapshot for session progress
    const questionCount = getQuestionCount(Object.values(conversationsSnapshot)[0]);
    const elapsedMinutes = getElapsedMinutes();

    const promises = variants.map(async (v, idx) => {
      const start = Date.now();
      try {
        // Build messages from conversation snapshot + new answer
        const prevMessages = [
          ...buildMessageHistory(conversationsSnapshot[idx] || [], kickoffMessage),
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
          elapsedMinutes,
          questionCount: questionCount + 1,
        });
        const latencyMs = Date.now() - start;
        let parsed;
        try { parsed = JSON.parse(result.data.output); } catch { parsed = {}; }

        // Check if LLM decided to end the interview
        if (parsed.interviewComplete) {
          return {
            idx,
            turn: {
              type: "closing",
              closingRemarks: parsed.closingRemarks || "Thank you for this conversation.",
              rawContent: result.data.output,
              meta: { tokens: result.data.totalTokens, latencyMs },
            },
            error: null,
            interviewComplete: true,
          };
        }

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
          interviewComplete: false,
        };
      } catch (err) {
        return { idx, turn: null, error: err.message || "Unknown error", interviewComplete: false };
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

    // Auto-end if ANY variant's LLM decided interview is complete (OR semantics).
    // In multi-variant A/B tests, this means a fast-completing variant ends all variants.
    if (results.some((r) => r.interviewComplete)) {
      endInterview();
    }
  }

  function endInterview() {
    stopTimer();
    setInterviewEnded(true);
    // Use functional updater to read latest conversations, avoiding stale closure
    setConversations((currentConvos) => {
      setVariants((prev) => prev.map((v) => ({
        ...v,
        loading: false,
        output: serializeConversations(currentConvos),
      })));
      return currentConvos;
    });
  }

  async function saveRun() {
    if (!selectedStudent) return;
    setSaving(true);
    try {
      const user = auth.currentUser;
      const payload = buildSavePayload({
        featureId, selectedStudent, variants, conversations, sessionName, kickoffMessage, user,
      });
      await addDoc(collection(db, "testbench"), { ...payload, timestamp: Timestamp.now() });
      setSnackbar({ open: true, message: "Run saved to Firestore", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: `Save failed: ${err.message}`, severity: "error" });
    } finally {
      setSaving(false);
    }
  }

  function loadRun(run) {
    if (hasUnsavedWork(variants)) {
      setPendingLoadRun(run);
      return;
    }
    applyLoadRun(run);
  }

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
      {/* Setup bar */}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 3, mb: 3, flexWrap: "wrap" }}>
        <StudentPicker
          scope={isInterview ? "school-wide" : featureId === "handwriting_analysis" ? "hardcoded" : "program"}
          defaults={featureId === "handwriting_analysis" ? HANDWRITING_DEFAULTS : SOUL_DEFAULTS_BY_PROGRAM[programFilter || "primary"]}
          onSelect={setSelectedStudent}
          programFilter={programFilter}
          renderOptionExtra={featureId === "handwriting_analysis" ? (s) => (
            <Chip label={`${s.handwrittenCount} handwritten images`} size="small" color="success" variant="filled" />
          ) : undefined}
        />

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
                <>
                  <Chip
                    label={`${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`}
                    color={elapsedSeconds >= 600 ? "warning" : "default"}
                    variant="outlined"
                    sx={{ fontFamily: "monospace", fontWeight: 700, minWidth: 64 }}
                  />
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<StopIcon />}
                    onClick={endInterview}
                    disabled={variants.some((v) => v.loading)}
                  >
                    End Interview
                  </Button>
                </>
              ) : (
                <Chip
                  label={`Session Ended — ${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`}
                  color="default"
                  variant="outlined"
                  sx={{ fontFamily: "monospace" }}
                />
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
          <LLMContextPipeline
            studentContext={studentContextData}
            selectedStudent={selectedStudent}
            kickoffMessage={kickoffMessage}
            interviewStarted={interviewStarted}
            elapsedSeconds={elapsedSeconds}
            questionCount={Object.values(conversations)[0]?.filter((t) => t.type === "question").length || 0}
          />
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
            }}
          >
            <VariantColumn
              variant={v}
              idx={idx}
              featureId={featureId}
              canRemove={variants.length > 1}
              onUpdate={handleUpdateVariant}
              onRemove={tryRemoveColumn}
              conversations={conversations[idx]}
              teacherInput={teacherInput}
              onTeacherInputChange={setTeacherInput}
              onSendAnswer={sendAnswer}
              anyLoading={variants.some((vr) => vr.loading)}
              interviewEnded={interviewEnded}
            />
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
