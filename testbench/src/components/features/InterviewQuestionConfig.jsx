import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase.js";
import CircularProgress from "@mui/material/CircularProgress";

/**
 * Pure data loader for interview question gen config + student context.
 * No rendering — context display is handled by FeatureWorkbench's
 * full-width LLM context pipeline section.
 */
export default function InterviewQuestionConfig({ selectedStudent, onConfigLoaded, onStudentContextLoaded }) {
  const [loading, setLoading] = useState(true);

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, []);

  // Load student context when student changes
  useEffect(() => {
    if (selectedStudent) {
      loadStudentContext(selectedStudent.id);
    } else {
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
      onConfigLoaded({ systemPrompt: "", model: "gpt-5.4", temperature: 0.7, max_tokens: 1000 });
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
      onStudentContextLoaded?.(ctx);
    } catch (err) {
      console.error("[InterviewQuestionConfig] loadStudentContext failed:", err);
      onStudentContextLoaded?.(null);
    }
  }

  if (loading) return <CircularProgress size={20} />;

  return null;
}
