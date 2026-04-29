import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Chip from "@mui/material/Chip";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

function ContextBlock({ number, label, sublabel, content, charCount, defaultExpanded = false }) {
  const hasContent = content != null && content !== "";
  return (
    <Accordion
      variant="outlined"
      defaultExpanded={defaultExpanded}
      sx={{
        "&::before": { display: "none" },
        borderRadius: "8px !important",
        overflow: "hidden",
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ minHeight: 48, "& .MuiAccordionSummary-content": { alignItems: "center", gap: 1.5 } }}
      >
        <Chip
          label={number}
          size="small"
          color="primary"
          sx={{ fontWeight: 700, minWidth: 28, height: 24 }}
        />
        <Typography variant="subtitle2" fontWeight={600}>{label}</Typography>
        {sublabel && (
          <Typography variant="caption" color="text.secondary">{sublabel}</Typography>
        )}
        <Box sx={{ ml: "auto" }}>
          {hasContent ? (
            <Chip
              label={`${charCount != null ? charCount.toLocaleString() + " chars" : "loaded"}`}
              size="small"
              variant="outlined"
              color="success"
              sx={{ height: 20, fontSize: 11 }}
            />
          ) : (
            <Chip label="not available" size="small" variant="outlined" color="default" sx={{ height: 20, fontSize: 11 }} />
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Box
          sx={{
            fontFamily: "monospace",
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            maxHeight: 300,
            overflow: "auto",
            bgcolor: "grey.900",
            color: "grey.100",
            borderRadius: 1,
            p: 1.5,
          }}
        >
          {content || "No data available for this student."}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}

function FlowArrow() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 0.25 }}>
      <ArrowDownwardIcon sx={{ fontSize: 16, color: "text.disabled" }} />
    </Box>
  );
}

/**
 * Full-width visual pipeline showing all data blocks that get assembled
 * into the system prompt for the interview LLM call.
 *
 * Props:
 * - studentContext: { soul, guidelines, baseballCard, openQuestions } | null
 * - selectedStudent: { id, displayName, classroomId, classroomName } | null
 */
export default function LLMContextPipeline({ studentContext, selectedStudent }) {
  if (!selectedStudent || !studentContext) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
        <Typography color="text.secondary" variant="body2">
          Select a student to see the LLM context pipeline
        </Typography>
      </Paper>
    );
  }

  const bcContent = studentContext.baseballCard
    ? `${studentContext.baseballCard.summary}\n\nWindow: ${studentContext.baseballCard.windowDays} days | Notes: ${studentContext.baseballCard.noteCount}${studentContext.baseballCard.coverageGaps?.length ? `\nCoverage gaps: ${studentContext.baseballCard.coverageGaps.join(", ")}` : ""}`
    : null;

  const oqContent = studentContext.openQuestions
    ? studentContext.openQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
    : null;

  return (
    <Paper variant="outlined" sx={{ p: 2, bgcolor: "background.default" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          LLM Context Window
        </Typography>
        <Typography variant="caption" color="text.secondary">
          — what gets assembled into the system prompt at runtime
        </Typography>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        <ContextBlock
          number="1"
          label="Student Context"
          sublabel="name, age, program"
          content={`Name: ${selectedStudent.displayName}\nClassroom: ${selectedStudent.classroomName || selectedStudent.classroomId}`}
          charCount={null}
          defaultExpanded
        />

        <FlowArrow />

        <ContextBlock
          number="2"
          label="Soul Narrative"
          sublabel="AI-generated understanding of this child"
          content={studentContext.soul}
          charCount={studentContext.soul?.length}
        />

        <FlowArrow />

        <ContextBlock
          number="3"
          label="Guidelines"
          sublabel="evaluation framework — ## headers are developmental areas"
          content={studentContext.guidelines}
          charCount={studentContext.guidelines?.length}
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
          label={`Open Questions${studentContext.openQuestions ? ` (${studentContext.openQuestions.length})` : ""}`}
          sublabel="pre-generated question bank from soul generation"
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
      </Box>
    </Paper>
  );
}
