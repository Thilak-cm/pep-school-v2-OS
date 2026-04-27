import { useState } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

export default function PromptEditor({ label, value, onChange, helperText, rows = 12, collapsed = false }) {
  const [expanded, setExpanded] = useState(!collapsed);
  const charCount = value?.length || 0;

  if (collapsed) {
    return (
      <Accordion expanded={expanded} onChange={() => setExpanded(!expanded)} variant="outlined">
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
            <Typography variant="subtitle2" fontWeight={600}>{label}</Typography>
            <Typography variant="caption" color="text.secondary">({charCount} chars)</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <TextField
            multiline
            fullWidth
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            helperText={helperText}
            slotProps={{
              input: {
                sx: { fontFamily: "monospace", fontSize: 13, lineHeight: 1.5 },
              },
            }}
          />
        </AccordionDetails>
      </Accordion>
    );
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Typography variant="subtitle2" fontWeight={600}>{label}</Typography>
        <Typography variant="caption" color="text.secondary">({charCount} chars)</Typography>
      </Box>
      <TextField
        multiline
        fullWidth
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        helperText={helperText}
        slotProps={{
          input: {
            sx: { fontFamily: "monospace", fontSize: 13, lineHeight: 1.5 },
          },
        }}
      />
    </Box>
  );
}
