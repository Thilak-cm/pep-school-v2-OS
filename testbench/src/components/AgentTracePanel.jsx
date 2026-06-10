import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ToolCallRow({ tc }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box sx={{ ml: 2, mb: 1 }}>
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          cursor: "pointer",
          "&:hover": { opacity: 0.8 },
        }}
      >
        <Typography
          variant="body2"
          sx={{ fontFamily: "monospace", fontWeight: 700 }}
        >
          {tc.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatBytes(tc.resultSizeBytes)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatDuration(tc.durationMs)}
        </Typography>
        <ExpandMoreIcon
          sx={{
            fontSize: 16,
            color: "text.secondary",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
          }}
        />
      </Box>
      <Collapse in={expanded}>
        <Box
          sx={{
            mt: 0.5,
            ml: 1,
            p: 1,
            bgcolor: "action.hover",
            borderRadius: 1,
            fontFamily: "monospace",
            fontSize: 11,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 200,
            overflow: "auto",
          }}
        >
          {JSON.stringify(tc.args, null, 2)}
        </Box>
      </Collapse>
    </Box>
  );
}

function IterationSection({ entry }) {
  const isFinal = entry.isFinal;
  const totalIterTokens = entry.tokens.input + entry.tokens.output;

  return (
    <Box
      sx={{
        mb: 2,
        p: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: isFinal ? "success.main" : "divider",
        bgcolor: isFinal ? "success.main" : "transparent",
        ...(isFinal && { bgcolor: "rgba(46, 125, 50, 0.08)" }),
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: entry.reasoning || entry.toolCalls.length > 0 ? 1 : 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {isFinal && (
            <CheckCircleIcon sx={{ fontSize: 18, color: "success.main" }} />
          )}
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "text.secondary",
            }}
          >
            Iteration {entry.iteration}
          </Typography>
          {isFinal && (
            <Chip label="Final" size="small" color="success" variant="outlined" sx={{ height: 20 }} />
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Chip
            label={formatDuration(entry.durationMs)}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: 11 }}
          />
          <Chip
            label={`${totalIterTokens} tok`}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: 11 }}
          />
          {entry.toolCalls.length > 0 && (
            <Chip
              label={`${entry.toolCalls.length} tool${entry.toolCalls.length > 1 ? "s" : ""}`}
              size="small"
              variant="outlined"
              sx={{ height: 20, fontSize: 11 }}
            />
          )}
        </Box>
      </Box>

      {/* Reasoning */}
      {entry.reasoning && (
        <Box
          sx={{
            mb: 1,
            pl: 1.5,
            borderLeft: 2,
            borderColor: "primary.main",
          }}
        >
          <Typography
            variant="body2"
            sx={{ fontStyle: "italic", color: "text.secondary", fontSize: 13, lineHeight: 1.5 }}
          >
            {entry.reasoning}
          </Typography>
        </Box>
      )}

      {/* Tool calls */}
      {entry.toolCalls.map((tc, i) => (
        <ToolCallRow key={`${entry.iteration}-${i}`} tc={tc} />
      ))}
    </Box>
  );
}

export default function AgentTracePanel({ trace }) {
  if (!trace || trace.length === 0) {
    return (
      <Paper
        variant="outlined"
        sx={{ p: 3, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}
      >
        <Typography color="text.secondary" variant="body2">
          No trace data available
        </Typography>
      </Paper>
    );
  }

  const totalToolCalls = trace.reduce((sum, e) => sum + e.toolCalls.length, 0);
  const totalDuration = trace.reduce((sum, e) => sum + e.durationMs, 0);
  const totalTokens = trace.reduce(
    (sum, e) => sum + e.tokens.input + e.tokens.output,
    0,
  );

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      {/* Summary bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
          pb: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="subtitle2" fontWeight={700}>
          Run complete
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {totalToolCalls} tool call{totalToolCalls !== 1 ? "s" : ""}
          {" \u00B7 "}
          {formatDuration(totalDuration)}
          {" \u00B7 "}
          {totalTokens.toLocaleString()} tokens
        </Typography>
      </Box>

      {/* Iterations */}
      {trace.map((entry) => (
        <IterationSection key={entry.iteration} entry={entry} />
      ))}
    </Paper>
  );
}
