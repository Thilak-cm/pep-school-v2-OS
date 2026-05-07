import { useMemo, useRef, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import ExploreIcon from "@mui/icons-material/Explore";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import PersonIcon from "@mui/icons-material/Person";
import SendIcon from "@mui/icons-material/Send";

function ExplorationAreasCard({ areas }) {
  if (!areas?.length) return null;
  return (
    <Box sx={{ mb: 2 }}>
      <Paper
        elevation={0}
        sx={{
          p: 2,
          bgcolor: "rgba(102, 187, 106, 0.08)",
          border: 1,
          borderColor: "rgba(102, 187, 106, 0.3)",
          borderRadius: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1.5 }}>
          <ExploreIcon fontSize="small" sx={{ color: "success.main" }} />
          <Typography variant="caption" fontWeight={700} color="success.main" letterSpacing={0.5}>
            EXPLORATION AREAS
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ ml: "auto", fontSize: 10, fontStyle: "italic" }}>
            Debug — hidden from teacher in production
          </Typography>
        </Box>
        {areas.map((ea, i) => (
          <Box key={i} sx={{ mb: i < areas.length - 1 ? 1.5 : 0 }}>
            <Typography variant="body2" fontWeight={700} sx={{ mb: 0.25 }}>{ea.area}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>{ea.rationale}</Typography>
          </Box>
        ))}
      </Paper>
    </Box>
  );
}

function QuestionBubble({ question, turnNumber, meta }) {
  if (!question) return null;
  return (
    <Box sx={{ display: "flex", justifyContent: "flex-start", mb: 2 }}>
      <Box sx={{ maxWidth: "88%" }}>
        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5, px: 0.5 }}>
          <SmartToyIcon sx={{ fontSize: 16, color: "secondary.main" }} />
          <Typography variant="caption" fontWeight={700} color="secondary.main">
            Q{turnNumber} — {question.area || "general"}
          </Typography>
          {meta && (
            <Box sx={{ display: "flex", gap: 0.5, ml: "auto" }}>
              {meta.tokens != null && <Chip label={`${meta.tokens.toLocaleString()} tok`} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
              {meta.latencyMs != null && <Chip label={`${(meta.latencyMs / 1000).toFixed(1)}s`} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
            </Box>
          )}
        </Box>
        {/* Bubble */}
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            bgcolor: "rgba(156, 39, 176, 0.08)",
            border: 1,
            borderColor: "rgba(156, 39, 176, 0.2)",
            borderRadius: 2,
            borderTopLeftRadius: 4,
          }}
        >
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>{question.text}</Typography>
        </Paper>
      </Box>
    </Box>
  );
}

function ThinkingBubble({ thinking }) {
  if (!thinking) return null;
  return (
    <Box sx={{ display: "flex", justifyContent: "flex-start", mb: 0.5, px: 0.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic", lineHeight: 1.5 }}>
        💭 {thinking}
      </Typography>
    </Box>
  );
}

function ClosingRemarksBubble({ closingRemarks }) {
  if (!closingRemarks) return null;
  return (
    <Box sx={{ display: "flex", justifyContent: "flex-start", mb: 2 }}>
      <Box sx={{ maxWidth: "88%" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5, px: 0.5 }}>
          <SmartToyIcon sx={{ fontSize: 16, color: "success.main" }} />
          <Typography variant="caption" fontWeight={700} color="success.main">
            Interview Complete
          </Typography>
        </Box>
        <Paper
          elevation={0}
          sx={{
            p: 2,
            bgcolor: "rgba(102, 187, 106, 0.1)",
            border: 1,
            borderColor: "rgba(102, 187, 106, 0.3)",
            borderRadius: 2,
            borderTopLeftRadius: 4,
          }}
        >
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>{closingRemarks}</Typography>
        </Paper>
      </Box>
    </Box>
  );
}

function AnswerBubble({ answer }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
      <Box sx={{ maxWidth: "88%" }}>
        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5, px: 0.5, justifyContent: "flex-end" }}>
          <Typography variant="caption" fontWeight={700} color="primary.main">Teacher</Typography>
          <PersonIcon sx={{ fontSize: 16, color: "primary.main" }} />
        </Box>
        {/* Bubble */}
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            bgcolor: "rgba(63, 81, 181, 0.1)",
            border: 1,
            borderColor: "rgba(63, 81, 181, 0.25)",
            borderRadius: 2,
            borderTopRightRadius: 4,
          }}
        >
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>{answer}</Typography>
        </Paper>
      </Box>
    </Box>
  );
}

/**
 * ConversationPanel — renders a turn-by-turn interview conversation
 * in a chat-style layout: LLM questions left, teacher answers right.
 */
export default function ConversationPanel({ turns, loading, error, teacherInput, onTeacherInputChange, onSendAnswer, inputDisabled, ended }) {
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on new turns
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns?.length, loading]);

  const rendered = useMemo(() => {
    if (!turns?.length && !loading && !error) return null;

    let questionCount = 0;
    return turns.map((turn, i) => {
      if (turn.type === "question") {
        questionCount++;
        return (
          <Box key={i}>
            {turn.explorationAreas && <ExplorationAreasCard areas={turn.explorationAreas} />}
            <ThinkingBubble thinking={turn.thinking} />
            <QuestionBubble question={turn.question} turnNumber={questionCount} meta={turn.meta} />
          </Box>
        );
      }
      if (turn.type === "answer") {
        return <AnswerBubble key={i} answer={turn.answer} />;
      }
      if (turn.type === "closing") {
        return <ClosingRemarksBubble key={i} closingRemarks={turn.closingRemarks} />;
      }
      return null;
    });
  }, [turns, loading, error]);

  const showInput = turns?.length > 0 && !loading && !ended && onSendAnswer;

  if (!turns?.length && !loading && !error) {
    return (
      <Paper
        variant="outlined"
        sx={{ p: 3, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center", borderStyle: "dashed" }}
      >
        <Typography color="text.secondary" variant="body2">
          Click &quot;Start Interview&quot; to begin
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
      {/* Chat messages */}
      <Box
        ref={scrollRef}
        sx={{ p: 2, maxHeight: 500, overflow: "auto", display: "flex", flexDirection: "column" }}
      >
        {rendered}
        {loading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.5 }}>
            <CircularProgress size={16} />
            <Typography variant="caption" color="text.secondary">Generating next question...</Typography>
          </Box>
        )}
        {error && (
          <Paper elevation={0} sx={{ p: 1.5, bgcolor: "rgba(244, 67, 54, 0.08)", border: 1, borderColor: "error.main", borderRadius: 2 }}>
            <Typography color="error" variant="body2">{error}</Typography>
          </Paper>
        )}
      </Box>

      {/* Chat input — pinned at bottom */}
      {showInput && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 1.5,
            borderTop: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <TextField
            value={teacherInput}
            onChange={(e) => onTeacherInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSendAnswer(); } }}
            placeholder="Type teacher's response..."
            size="small"
            fullWidth
            multiline
            maxRows={3}
            disabled={inputDisabled}
          />
          <IconButton
            color="primary"
            onClick={onSendAnswer}
            disabled={!teacherInput?.trim() || inputDisabled}
          >
            <SendIcon />
          </IconButton>
        </Box>
      )}
    </Box>
  );
}
