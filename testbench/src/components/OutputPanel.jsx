import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import PsychologyIcon from "@mui/icons-material/Psychology";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ReactMarkdown from "react-markdown";
import AgentTracePanel from "./AgentTracePanel";

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

  // Digest handled separately via iframe (see OutputPanel render)
  if (featureId === "digest_generation") {
    return null;
  }

  return output;
}

export default function OutputPanel({ output, loading, error, meta, featureId }) {
  const [digestTab, setDigestTab] = useState(0);

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

  const isDigest = featureId === "digest_generation";
  const isProseOutput = featureId === "soul_generation" || featureId === "monthly_plan";

  // Digest: tabbed view — Email Preview + Agent Trace
  if (isDigest) {
    const iframeSrc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;color:#222;line-height:1.6}</style></head><body>${output}</body></html>`;
    const hasTrace = meta?.iterationTrace?.length > 0;
    return (
      <Box>
        {meta && (
          <Box sx={{ display: "flex", gap: 1, mb: 1, flexWrap: "wrap" }}>
            {meta.model && <Chip label={meta.model} size="small" variant="outlined" />}
            {meta.tokens && <Chip label={`${meta.tokens} tokens`} size="small" variant="outlined" />}
            {meta.latencyMs && <Chip label={`${(meta.latencyMs / 1000).toFixed(1)}s`} size="small" variant="outlined" />}
            {meta.toolCalls != null && <Chip label={`${meta.toolCalls} tool calls`} size="small" variant="outlined" />}
            {meta.iterations != null && <Chip label={`${meta.iterations} iterations`} size="small" variant="outlined" />}
          </Box>
        )}
        <Tabs
          value={digestTab}
          onChange={(_, v) => setDigestTab(v)}
          sx={{ mb: 1, minHeight: 36, "& .MuiTab-root": { minHeight: 36, py: 0.5, textTransform: "none" } }}
        >
          <Tab label="Email Preview" />
          <Tab
            label={hasTrace ? `Agent Trace (${meta.iterationTrace.length})` : "Agent Trace"}
            disabled={!hasTrace}
          />
        </Tabs>
        {digestTab === 0 && (
          <Paper variant="outlined" sx={{ overflow: "hidden", borderRadius: 2 }}>
            <iframe
              srcDoc={iframeSrc}
              title="Digest email preview"
              sandbox="allow-same-origin"
              style={{ width: "100%", minHeight: 500, border: "none", display: "block" }}
              onLoad={(e) => {
                try {
                  const h = e.target.contentDocument.body.scrollHeight;
                  e.target.style.height = `${h + 32}px`;
                } catch { /* cross-origin fallback */ }
              }}
            />
          </Paper>
        )}
        {digestTab === 1 && (
          <AgentTracePanel trace={meta.iterationTrace} />
        )}
      </Box>
    );
  }

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
