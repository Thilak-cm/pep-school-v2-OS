import { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import ReactMarkdown from "react-markdown";

function formatOutput(output, featureId) {
  if (featureId === "soul_generation") {
    return <ReactMarkdown>{output}</ReactMarkdown>;
  }

  if (featureId === "handwriting_analysis") {
    try {
      const parsed = JSON.parse(output);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return output;
    }
  }

  return output;
}

export default function OutputPanel({ output, loading, error, meta, featureId }) {
  const rendered = useMemo(() => {
    if (!output) return null;
    return formatOutput(output, featureId);
  }, [output, featureId]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 200, p: 3 }}>
        <CircularProgress size={28} />
        <Typography sx={{ ml: 2 }} color="text.secondary">Running...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Paper variant="outlined" sx={{ p: 2, borderColor: "error.main", minHeight: 200 }}>
        <Typography color="error" variant="body2">{error}</Typography>
      </Paper>
    );
  }

  if (!output) {
    return (
      <Paper variant="outlined" sx={{ p: 3, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography color="text.secondary" variant="body2">Run a prompt to see output here</Typography>
      </Paper>
    );
  }

  const isSoul = featureId === "soul_generation";

  return (
    <Box>
      {meta && (
        <Box sx={{ display: "flex", gap: 1, mb: 1, flexWrap: "wrap" }}>
          {meta.model && <Chip label={meta.model} size="small" variant="outlined" />}
          {meta.tokens && <Chip label={`${meta.tokens} tokens`} size="small" variant="outlined" />}
          {meta.latencyMs && <Chip label={`${(meta.latencyMs / 1000).toFixed(1)}s`} size="small" variant="outlined" />}
        </Box>
      )}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          overflow: "auto",
          ...(isSoul
            ? { fontSize: 14, lineHeight: 1.7, "& h1,& h2,& h3": { mt: 2, mb: 1 }, "& ul,& ol": { pl: 3 } }
            : { fontFamily: "monospace", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }),
        }}
      >
        {rendered}
      </Paper>
    </Box>
  );
}
