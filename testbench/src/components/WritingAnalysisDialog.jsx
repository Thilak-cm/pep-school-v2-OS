import { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../firebase.js";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import DrawIcon from "@mui/icons-material/Draw";

/**
 * PEP-235: Dialog prompting writing analysis generation when missing.
 *
 * Shown proactively after student selection in MonthlyPlanWorkbench when
 * the student lacks a writing_analysis doc required for plan generation.
 * Calls batchAnalyzeWriting prod CF which writes to Firestore.
 */
export default function WritingAnalysisDialog({ open, studentName, studentId, onSuccess, onClose }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setGenerating(false);
      setError(null);
    }
  }, [open, studentId]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const analyzeWriting = httpsCallable(cloudFunctions, "batchAnalyzeWriting", { timeout: 300000 });
      await analyzeWriting({ studentId });
      setGenerating(false);
      onSuccess();
    } catch (err) {
      const message = err?.message || "Unknown error";
      setError(message);
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onClose={generating ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <DrawIcon color="primary" />
        Writing Analysis Required
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ mb: 2 }}>
          <strong>{studentName}</strong> is missing a writing analysis, which the monthly plan prompt needs as input.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Generate it now so the plan has handwriting developmental context to work with.
          This requires at least 3 handwritten media samples for the student.
        </Typography>

        {generating && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, my: 2, p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary">
              Analyzing writing samples&hellip; this may take up to 3 minutes.
            </Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {!generating && (
          <Button onClick={onClose}>Skip</Button>
        )}
        <Button
          variant="contained"
          onClick={handleGenerate}
          disabled={generating}
          startIcon={generating ? null : <DrawIcon />}
        >
          {error ? "Retry" : "Generate Analysis"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
