/**
 * Shared pipeline visualization components (PEP-216)
 *
 * Extracted from LLMContextPipeline.jsx so that Interview, Handwriting,
 * and Soul pipelines can all reuse the same building blocks.
 */
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Chip from "@mui/material/Chip";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

import { resolveContextBlockStatus, formatCharCount } from "./pipelineHelpers.js";

// --- React components ---

export function ContextBlock({ number, label, sublabel, content, charCount, defaultExpanded = false }) {
  const { status, charCount: resolved } = resolveContextBlockStatus(content, charCount);
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
          {status === "available" ? (
            <Chip
              label={formatCharCount(resolved)}
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

export function FlowArrow() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 0.25 }}>
      <ArrowDownwardIcon sx={{ fontSize: 16, color: "text.disabled" }} />
    </Box>
  );
}

export function SectionLabel({ children }) {
  return (
    <Typography
      variant="overline"
      sx={{ fontWeight: 700, letterSpacing: 1.2, color: "primary.main", pl: 0.5, mt: 1.5, mb: 0.5, display: "block" }}
    >
      {children}
    </Typography>
  );
}

export function RuntimePlaceholder({ icon, title, description }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        p: 1.5,
        bgcolor: "grey.900",
        borderRadius: 1,
        border: "1px dashed",
        borderColor: "divider",
        color: "text.secondary",
        fontSize: 12,
      }}
    >
      {icon && <Box sx={{ fontSize: 20, opacity: 0.5 }}>{icon}</Box>}
      <Box>
        {title && <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary", mb: 0.25 }}>{title}</Typography>}
        <Typography variant="caption" color="text.secondary">{description}</Typography>
      </Box>
    </Box>
  );
}

export function PipelineWrapper({ title, subtitle, children }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, bgcolor: "background.default", maxWidth: 640, mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">— {subtitle}</Typography>
        )}
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        {children}
      </Box>
    </Paper>
  );
}
