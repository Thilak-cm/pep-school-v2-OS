import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import { ContextBlock, FlowArrow, PipelineWrapper } from "./pipeline/PipelineComponents.jsx";

/**
 * Full-width visual pipeline showing all data blocks that get assembled
 * into the system prompt for the interview LLM call.
 *
 * Props:
 * - studentContext: { soul, guidelines, baseballCard, openQuestions } | null
 * - selectedStudent: { id, displayName, classroomId, classroomName } | null
 */
export default function LLMContextPipeline({ studentContext, selectedStudent, kickoffMessage, interviewStarted, elapsedSeconds, questionCount, selectedAreas = [] }) {
  const bcContent = studentContext?.baseballCard
    ? `${studentContext.baseballCard.summary}\n\nWindow: ${studentContext.baseballCard.windowDays} days | Notes: ${studentContext.baseballCard.noteCount}${studentContext.baseballCard.coverageGaps?.length ? `\nCoverage gaps: ${studentContext.baseballCard.coverageGaps.join(", ")}` : ""}`
    : null;

  const oqContent = studentContext?.openQuestions && typeof studentContext.openQuestions === "object" && Object.keys(studentContext.openQuestions).length > 0
    ? Object.entries(studentContext.openQuestions).map(([area, questions]) =>
      `## ${area}\n${(questions || []).map((q, i) => `${i + 1}. ${q}`).join("\n")}`
    ).join("\n\n")
    : null;
  const totalOqAreas = studentContext?.openQuestions ? Object.keys(studentContext.openQuestions).length : 0;
  const oqCount = oqContent && studentContext?.openQuestions
    ? Object.values(studentContext.openQuestions).reduce((sum, qs) => sum + (qs?.length || 0), 0)
    : 0;
  const areaFilterLabel = selectedAreas.length > 0 && totalOqAreas > 0
    ? ` — ${selectedAreas.length} of ${totalOqAreas} areas sent to LLM`
    : "";

  return (
    <PipelineWrapper title="Prompt Assembly" subtitle="data injected into the system prompt at runtime">
      <ContextBlock
        number="1"
        label="Student Context"
        sublabel="name, age, program"
        content={selectedStudent ? `Name: ${selectedStudent.displayName}\nClassroom: ${selectedStudent.classroomName || selectedStudent.classroomId}` : null}
        charCount={null}
        defaultExpanded
      />

      <FlowArrow />

      <ContextBlock
        number="2"
        label="Soul Narrative"
        sublabel="AI-generated understanding of this child"
        content={studentContext?.soul ?? null}
        charCount={studentContext?.soul?.length}
      />

      <FlowArrow />

      <ContextBlock
        number="3"
        label="Guidelines"
        sublabel="evaluation framework — ## headers are developmental areas"
        content={studentContext?.guidelines ?? null}
        charCount={studentContext?.guidelines?.length}
      />

      <FlowArrow />

      <ContextBlock
        number="4"
        label="Baseball Card"
        sublabel="recent observation summary + coverage gaps"
        content={bcContent}
        charCount={bcContent?.length}
      />

      <FlowArrow />

      <ContextBlock
        number="5"
        label={`Open Questions${oqCount > 0 ? ` (${oqCount})` : ""}${areaFilterLabel}`}
        sublabel={selectedAreas.length > 0 ? `filtered to: ${selectedAreas.join(", ")}` : "pre-generated question bank from soul generation"}
        content={oqContent}
        charCount={oqContent?.length}
      />

      <FlowArrow />

      <ContextBlock
        number="6"
        label="Prior Interview Transcripts"
        sublabel="completed sessions for cross-session dedup (loaded server-side)"
        content="Prior interviews are loaded by the Cloud Function at runtime.\nAll completed sessions within 365 days are injected for dedup."
        charCount={null}
      />

      <FlowArrow />

      <Paper
        variant="outlined"
        sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.5, borderRadius: 2, borderStyle: "dashed", borderColor: "primary.main" }}
      >
        <Chip label="7" size="small" color="primary" sx={{ fontWeight: 700, minWidth: 28, height: 24 }} />
        <Box>
          <Typography variant="subtitle2" fontWeight={600}>Instruction Template</Typography>
          <Typography variant="caption" color="text.secondary">editable per variant below</Typography>
        </Box>
      </Paper>

      <FlowArrow />

      <Paper
        variant="outlined"
        sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.5, borderRadius: 2 }}
      >
        <Chip label="8" size="small" color="secondary" sx={{ fontWeight: 700, minWidth: 28, height: 24 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>Kickoff Message</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25, fontFamily: "monospace", fontSize: 11 }}>
            {kickoffMessage || "—"}
          </Typography>
        </Box>
      </Paper>

      <FlowArrow />

      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          borderRadius: 2,
          bgcolor: interviewStarted ? "rgba(255, 167, 38, 0.08)" : undefined,
          borderColor: interviewStarted ? "rgba(255, 167, 38, 0.3)" : "divider",
        }}
      >
        <Chip label="9" size="small" color="warning" sx={{ fontWeight: 700, minWidth: 28, height: 24 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>Session Progress</Typography>
          <Typography variant="caption" color="text.secondary">
            appended server-side from Q2 onwards
          </Typography>
          {interviewStarted && (
            <Typography variant="caption" sx={{ display: "block", mt: 0.5, fontFamily: "monospace", fontSize: 11, color: (elapsedSeconds || 0) >= 600 ? "warning.main" : "text.secondary" }}>
              Question {questionCount || 0} | {Math.floor((elapsedSeconds || 0) / 60)}:{String((elapsedSeconds || 0) % 60).padStart(2, "0")} elapsed | Target: ~7 questions or ~10 min
            </Typography>
          )}
        </Box>
        {interviewStarted ? (
          <Chip label="live" size="small" variant="outlined" color="warning" sx={{ height: 20, fontSize: 11 }} />
        ) : (
          <Chip label="inactive" size="small" variant="outlined" color="default" sx={{ height: 20, fontSize: 11 }} />
        )}
      </Paper>
    </PipelineWrapper>
  );
}
