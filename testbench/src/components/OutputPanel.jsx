import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import PsychologyIcon from "@mui/icons-material/Psychology";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ReactMarkdown from "react-markdown";

function RationaleBlock({ rationale }) {
  const [open, setOpen] = useState(false);
  if (!rationale) return null;
  return (
    <Box sx={{ mb: 1 }}>
      <Box
        onClick={() => setOpen(!open)}
        sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, cursor: "pointer", opacity: 0.7, "&:hover": { opacity: 1 } }}
      >
        <PsychologyIcon sx={{ fontSize: 16, color: "warning.main" }} />
        <Typography variant="caption" color="warning.main" fontWeight={600}>
          AI Reasoning (debug only — teachers won&apos;t see this)
        </Typography>
        <ExpandMoreIcon sx={{ fontSize: 16, color: "warning.main", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </Box>
      <Collapse in={open}>
        <Box sx={{ mt: 0.5, ml: 0.5, pl: 1.5, borderLeft: 2, borderColor: "warning.main", opacity: 0.8 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic", fontSize: 12, lineHeight: 1.5 }}>
            {rationale}
          </Typography>
        </Box>
      </Collapse>
    </Box>
  );
}

function MonthlyPlanOutput({ output }) {
  try {
    const plan = JSON.parse(output);
    const sections = plan.sections || [];
    return (
      <Box>
        {plan.month && (
          <Typography variant="subtitle2" color="primary" gutterBottom>
            Plan for {plan.month}
          </Typography>
        )}
        {sections.map((section, i) => (
          <Box key={i} sx={{ mb: 2.5 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
              {section.name}
            </Typography>
            <RationaleBlock rationale={section.rationale} />
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {(section.items || []).map((item, j) => (
                <Typography component="li" variant="body2" key={j} sx={{ mb: 0.5 }}>
                  {item}
                </Typography>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    );
  } catch {
    return <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", color: "warning.main" }}>{output}</Typography>;
  }
}

function formatOutput(output, featureId) {
  if (featureId === "soul_generation") {
    return <ReactMarkdown>{output}</ReactMarkdown>;
  }

  if (featureId === "monthly_plan") {
    return <MonthlyPlanOutput output={output} />;
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

  const isProseOutput = featureId === "soul_generation" || featureId === "monthly_plan";

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
          ...(isProseOutput
            ? { fontSize: 14, lineHeight: 1.7, "& h1,& h2,& h3": { mt: 2, mb: 1 }, "& ul,& ol": { pl: 3 } }
            : { fontFamily: "monospace", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }),
        }}
      >
        {rendered}
      </Paper>
    </Box>
  );
}
