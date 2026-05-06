import { useState, useEffect } from "react";
import { collection, query, where, orderBy, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase.js";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";

export default function RunHistory({ open, onClose, featureId, onLoad }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setFetchError(null);
    const q = query(
      collection(db, "testbench"),
      where("feature", "==", featureId),
      orderBy("timestamp", "desc"),
    );
    getDocs(q)
      .then((snap) => setRuns(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((err) => setFetchError(err.message))
      .finally(() => setLoading(false));
  }, [open, featureId]);

  function formatDate(ts) {
    if (!ts?.toDate) return "";
    const d = ts.toDate();
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function avgRating(variants) {
    if (!variants?.length) return null;
    const sum = variants.reduce((acc, v) => acc + (v.rating ?? 0), 0);
    return (sum / variants.length).toFixed(1);
  }

  async function saveRename(runId) {
    const trimmed = renameValue.trim();
    try {
      await updateDoc(doc(db, "testbench", runId), { sessionName: trimmed || "" });
      setRuns((prev) => prev.map((r) => r.id === runId ? { ...r, sessionName: trimmed || "" } : r));
    } catch (err) {
      console.error("Failed to rename session:", err);
    }
    setRenamingId(null);
  }

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 340, p: 2, height: "100%", display: "flex", flexDirection: "column" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Typography variant="h6">Run History</Typography>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Box>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
        ) : fetchError ? (
          <Alert severity="error" sx={{ mt: 2 }}>Failed to load history: {fetchError}</Alert>
        ) : runs.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>No saved runs yet.</Typography>
        ) : (
          <Box sx={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
            {runs.map((run) => {
              const avg = avgRating(run.variants);
              const label = run.sessionName?.trim() || run.studentName;
              const isRenaming = renamingId === run.id;
              return (
                <Box
                  key={run.id}
                  onClick={() => { if (!isRenaming) { onLoad(run); onClose(); } }}
                  sx={{
                    p: 1.5,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1.5,
                    cursor: isRenaming ? "default" : "pointer",
                    "&:hover": isRenaming ? {} : { bgcolor: "action.hover", borderColor: "primary.main" },
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {isRenaming ? (
                      <>
                        <TextField
                          size="small"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveRename(run.id); if (e.key === "Escape") setRenamingId(null); }}
                          autoFocus
                          placeholder={run.studentName}
                          sx={{ flex: 1 }}
                          slotProps={{ input: { sx: { fontSize: "0.875rem", fontWeight: 600 } } }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); saveRename(run.id); }} color="primary">
                          <CheckIcon fontSize="small" />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <Typography variant="subtitle2" noWrap sx={{ flex: 1 }}>{label}</Typography>
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); setRenamingId(run.id); setRenameValue(run.sessionName || ""); }}
                          sx={{ color: "text.secondary", opacity: 0.6, "&:hover": { opacity: 1 } }}
                        >
                          <EditIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </>
                    )}
                  </Box>
                  {run.sessionName?.trim() && (
                    <Typography variant="caption" color="text.secondary">{run.studentName}</Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{formatDate(run.timestamp)}</Typography>
                  <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>
                    <Chip label={`${run.variants?.length ?? 0} variants`} size="small" variant="outlined" />
                    {avg && (
                      <Chip label={`Avg ${avg}/10`} size="small" variant="outlined" />
                    )}
                    {run.ranBy?.name && (
                      <Chip label={run.ranBy.name.split(" ")[0]} size="small" variant="outlined" />
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
