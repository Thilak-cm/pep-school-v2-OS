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
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

/**
 * PEP-222: Dialog prompting soul + open_questions generation when missing.
 *
 * Shown proactively after student selection in InterviewWorkbench when
 * the student lacks the AI summary docs required for interview start.
 */
export default function SoulGenerationDialog({ open, studentName, studentId, onSuccess, onClose }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  // Reset internal state when studentId changes or dialog reopens
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
      const generateProfile = httpsCallable(cloudFunctions, "generateStudentProfile", { timeout: 180000 });
      await generateProfile({ studentId });
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
        <AutoAwesomeIcon color="primary" />
        Soul Profile Required
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ mb: 2 }}>
          <strong>{studentName}</strong> is missing a few documents that Coach Pepper needs before the interview can begin.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Generate them now so you can proceed with the interview.
        </Typography>

        {generating && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, my: 2, p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary">
              Generating profile&hellip; this may take up to 2 minutes.
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
          <Button onClick={onClose}>Cancel</Button>
        )}
        <Button
          variant="contained"
          onClick={handleGenerate}
          disabled={generating}
          startIcon={generating ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
        >
          {error ? "Retry" : "Generate Soul"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
