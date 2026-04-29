import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase.js";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Chip from "@mui/material/Chip";

function ContextPanel({ label, content, charCount }) {
  return (
    <Accordion variant="outlined" defaultExpanded={false}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
          <Typography variant="subtitle2" fontWeight={600}>{label}</Typography>
          {charCount != null && (
            <Chip label={`${charCount} chars`} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Typography
          variant="body2"
          sx={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}
        >
          {content || "Not available"}
        </Typography>
      </AccordionDetails>
    </Accordion>
  );
}

export default function InterviewQuestionConfig({ selectedStudent, onConfigLoaded, onStudentContextLoaded }) {
  const [loading, setLoading] = useState(true);
  const [studentContext, setStudentContext] = useState(null);

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, []);

  // Load student context when student changes
  useEffect(() => {
    if (selectedStudent) {
      loadStudentContext(selectedStudent.id);
    } else {
      setStudentContext(null);
      onStudentContextLoaded?.(null);
    }
  }, [selectedStudent?.id]);

  async function loadConfig() {
    setLoading(true);
    try {
      const configSnap = await getDoc(doc(db, "config", "interview_question_gen"));
      const config = configSnap.exists() ? configSnap.data() : {};
      onConfigLoaded({
        systemPrompt: config.systemPrompt || "",
        model: config.model || "gpt-5.4",
        temperature: config.temperature ?? 0.7,
        max_tokens: config.max_tokens || 1000,
      });
    } catch (err) {
      console.error("[InterviewQuestionConfig] loadConfig failed:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadStudentContext(studentId) {
    try {
      const [soulSnap, guidelinesSnap, bcSnap, oqSnap] = await Promise.all([
        getDoc(doc(db, "students", studentId, "ai_summaries", "soul")),
        getDoc(doc(db, "students", studentId, "ai_summaries", "guidelines")),
        getDoc(doc(db, "students", studentId, "ai_summaries", "baseball_card")),
        getDoc(doc(db, "students", studentId, "ai_summaries", "open_questions")),
      ]);

      const ctx = {
        soul: soulSnap.exists() ? soulSnap.data().content : null,
        guidelines: guidelinesSnap.exists() ? guidelinesSnap.data().content : null,
        baseballCard: bcSnap.exists() ? bcSnap.data() : null,
        openQuestions: oqSnap.exists() ? oqSnap.data().questions : null,
      };
      setStudentContext(ctx);
      onStudentContextLoaded?.(ctx);
    } catch (err) {
      console.error("[InterviewQuestionConfig] loadStudentContext failed:", err);
    }
  }

  if (loading) return <CircularProgress size={20} />;

  if (!selectedStudent || !studentContext) return null;

  const bcSummary = studentContext.baseballCard
    ? `${studentContext.baseballCard.summary}\n\nWindow: ${studentContext.baseballCard.windowDays} days | Notes: ${studentContext.baseballCard.noteCount}${studentContext.baseballCard.coverageGaps?.length ? `\nCoverage gaps: ${studentContext.baseballCard.coverageGaps.join(", ")}` : ""}`
    : null;

  const oqText = studentContext.openQuestions
    ? studentContext.openQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
    : null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 300, maxWidth: 400 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        Student Context (read-only)
      </Typography>
      <ContextPanel label="Soul Narrative" content={studentContext.soul} charCount={studentContext.soul?.length} />
      <ContextPanel label="Guidelines" content={studentContext.guidelines} charCount={studentContext.guidelines?.length} />
      <ContextPanel label="Baseball Card" content={bcSummary} charCount={bcSummary?.length} />
      <ContextPanel
        label={`Open Questions${studentContext.openQuestions ? ` (${studentContext.openQuestions.length})` : ""}`}
        content={oqText}
        charCount={oqText?.length}
      />
    </Box>
  );
}
