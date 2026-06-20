/**
 * Promote-to-Live confirmation dialog (PEP-326).
 *
 * Shows a field-level diff between live config and the variant's config,
 * with checkboxes to select/deselect fields. Supports program selector
 * for handwriting/soul and promptType awareness for digest.
 */
import { useState, useMemo } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import { buildFieldDiff } from "../utils/promoteFieldRegistry.js";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {function} props.onClose
 * @param {function} props.onConfirm — called with { fields: { key: value, ... } }
 * @param {string} props.featureId
 * @param {object} props.liveConfig — current live config from Firestore
 * @param {object} props.variantConfig — the variant's config values
 * @param {string} [props.promptType] — "classroom" | "superadmin" (digest only)
 * @param {string} [props.programId] — current program (handwriting/soul)
 * @param {boolean} [props.guidelinesFromStudent] — true if guidelinesContent came from a student doc
 * @param {boolean} props.promoting — loading state
 */
export default function PromoteConfirmDialog({
  open,
  onClose,
  onConfirm,
  featureId,
  liveConfig,
  variantConfig,
  promptType,
  programId,
  guidelinesFromStudent,
  promoting,
}) {
  const diff = useMemo(
    () => buildFieldDiff(featureId, liveConfig, variantConfig),
    [featureId, liveConfig, variantConfig]
  );

  // All fields selected by default; guidelinesContent deselected if from student doc
  const [selected, setSelected] = useState(() => {
    const initial = {};
    for (const d of diff) {
      initial[d.key] = d.warnIfFromStudent && guidelinesFromStudent ? false : true;
    }
    return initial;
  });

  function toggleField(key) {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleConfirm() {
    const fields = {};
    for (const d of diff) {
      if (selected[d.key]) {
        fields[d.key] = d.variantValue;
      }
    }
    onConfirm({ fields });
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const changedAndSelected = diff.filter((d) => d.changed && selected[d.key]).length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        Promote to Live
        {programId && <Chip label={programId} size="small" color="info" />}
        {promptType && <Chip label={`${promptType} prompt`} size="small" color="secondary" />}
      </DialogTitle>

      <DialogContent dividers>
        {guidelinesFromStudent && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            The guidelines content was loaded from a student&apos;s personal doc, not the program template.
            Promoting it will overwrite the <strong>program-wide template</strong> for all students.
          </Alert>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select which fields to promote. Only changed fields are highlighted.
        </Typography>

        {diff.map((d) => (
          <Box key={d.key} sx={{ mb: 2 }}>
            <FormControlLabel
              control={<Checkbox checked={!!selected[d.key]} onChange={() => toggleField(d.key)} size="small" />}
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="subtitle2">{d.label}</Typography>
                  {d.changed && <Chip label="changed" size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />}
                  {!d.changed && <Chip label="unchanged" size="small" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />}
                </Box>
              }
            />
            {selected[d.key] && d.type === "string" && d.changed && (
              <Box sx={{ ml: 4, mt: 0.5 }}>
                <Box sx={{ display: "flex", gap: 1, mb: 0.5 }}>
                  <Chip label="Live" size="small" variant="outlined" color="default" sx={{ height: 18, fontSize: "0.65rem" }} />
                  <Typography variant="caption" color="text.secondary" sx={{ maxHeight: 60, overflow: "auto", whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "0.7rem" }}>
                    {d.liveValue ? `${String(d.liveValue).slice(0, 200)}${String(d.liveValue).length > 200 ? "..." : ""}` : "(empty)"}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Chip label="New" size="small" variant="outlined" color="success" sx={{ height: 18, fontSize: "0.65rem" }} />
                  <Typography variant="caption" color="success.main" sx={{ maxHeight: 60, overflow: "auto", whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "0.7rem" }}>
                    {d.variantValue ? `${String(d.variantValue).slice(0, 200)}${String(d.variantValue).length > 200 ? "..." : ""}` : "(empty)"}
                  </Typography>
                </Box>
              </Box>
            )}
            {selected[d.key] && d.type === "number" && d.changed && (
              <Box sx={{ ml: 4 }}>
                <Typography variant="caption" color="text.secondary">
                  {d.liveValue ?? "(empty)"} → <strong>{d.variantValue ?? "(empty)"}</strong>
                </Typography>
              </Box>
            )}
            {d.key !== diff[diff.length - 1].key && <Divider sx={{ mt: 1 }} />}
          </Box>
        ))}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: "auto" }}>
          {changedAndSelected} changed field{changedAndSelected !== 1 ? "s" : ""} will be promoted
        </Typography>
        <Button onClick={onClose} disabled={promoting}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="success"
          disabled={promoting || selectedCount === 0}
          startIcon={promoting ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {promoting ? "Promoting..." : "Promote to Live"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
