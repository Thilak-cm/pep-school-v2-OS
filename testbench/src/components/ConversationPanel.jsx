import { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import ExploreIcon from "@mui/icons-material/Explore";
import QuestionAnswerIcon from "@mui/icons-material/QuestionAnswer";
import PersonIcon from "@mui/icons-material/Person";

function ExplorationAreasCard({ areas }) {
  if (!areas?.length) return null;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, bgcolor: "primary.50", borderColor: "primary.200" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
        <ExploreIcon fontSize="small" color="primary" />
        <Typography variant="caption" fontWeight={700} color="primary.main">
          EXPLORATION AREAS
        </Typography>
      </Box>
      {areas.map((ea, i) => (
        <Box key={i} sx={{ mb: i < areas.length - 1 ? 1 : 0 }}>
          <Typography variant="body2" fontWeight={600}>{ea.area}</Typography>
          <Typography variant="caption" color="text.secondary">{ea.rationale}</Typography>
        </Box>
      ))}
    </Paper>
  );
}

function QuestionBubble({ question, turnNumber, meta }) {
  if (!question) return null;
  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
        <QuestionAnswerIcon fontSize="small" sx={{ color: "secondary.main" }} />
        <Typography variant="caption" fontWeight={700} color="secondary.main">
          Q{turnNumber} [{(question.type || "open").toUpperCase()}] — {question.area || "general"}
        </Typography>
        {meta && (
          <Box sx={{ display: "flex", gap: 0.5, ml: "auto" }}>
            {meta.tokens && <Chip label={`${meta.tokens} tok`} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
            {meta.latencyMs && <Chip label={`${(meta.latencyMs / 1000).toFixed(1)}s`} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
          </Box>
        )}
      </Box>
      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "grey.50" }}>
        <Typography variant="body2">{question.text}</Typography>
      </Paper>
    </Box>
  );
}

function ThinkingBubble({ thinking }) {
  if (!thinking) return null;
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, fontStyle: "italic" }}>
      💭 {thinking}
    </Typography>
  );
}

function AnswerBubble({ answer }) {
  return (
    <Box sx={{ mb: 1.5, display: "flex", justifyContent: "flex-end" }}>
      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "primary.50", borderColor: "primary.200", maxWidth: "85%" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
          <PersonIcon fontSize="small" color="primary" />
          <Typography variant="caption" fontWeight={700} color="primary.main">Teacher</Typography>
        </Box>
        <Typography variant="body2">{answer}</Typography>
      </Paper>
    </Box>
  );
}

/**
 * ConversationPanel — renders a turn-by-turn interview conversation.
 *
 * Props:
 * - turns: Array of { type: "question"|"answer", question?, thinking?, answer?, explorationAreas?, meta? }
 * - loading: boolean — show spinner for in-flight LLM call
 * - error: string | null
 */
export default function ConversationPanel({ turns, loading, error }) {
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
      return null;
    });
  }, [turns, loading, error]);

  if (!turns?.length && !loading && !error) {
    return (
      <Paper variant="outlined" sx={{ p: 3, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography color="text.secondary" variant="body2">
          Click &quot;Start Interview&quot; to begin
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Paper
        variant="outlined"
        sx={{ p: 2, maxHeight: 500, overflow: "auto", display: "flex", flexDirection: "column", gap: 0.5 }}
      >
        {rendered}
        {loading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="caption" color="text.secondary">Thinking...</Typography>
          </Box>
        )}
        {error && (
          <Typography color="error" variant="body2" sx={{ p: 1 }}>{error}</Typography>
        )}
      </Paper>
    </Box>
  );
}
