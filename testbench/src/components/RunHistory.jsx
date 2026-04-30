import { useState, useEffect } from "react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "../firebase.js";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";

export default function RunHistory({ open, onClose, featureId, onLoad }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const q = query(
      collection(db, "testbench"),
      where("feature", "==", featureId),
      orderBy("timestamp", "desc"),
    );
    getDocs(q)
      .then((snap) => setRuns(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((err) => console.error("Failed to load run history:", err))
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

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 340, p: 2, height: "100%", display: "flex", flexDirection: "column" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Typography variant="h6">Run History</Typography>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Box>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
        ) : runs.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>No saved runs yet.</Typography>
        ) : (
          <Box sx={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
            {runs.map((run) => (
              <Box
                key={run.id}
                onClick={() => { onLoad(run); onClose(); }}
                sx={{
                  p: 1.5,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1.5,
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover", borderColor: "primary.main" },
                }}
              >
                <Typography variant="subtitle2" noWrap>{run.studentName}</Typography>
                <Typography variant="caption" color="text.secondary">{formatDate(run.timestamp)}</Typography>
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>
                  <Chip label={`${run.variants?.length ?? 0} variants`} size="small" variant="outlined" />
                  {avgRating(run.variants) && (
                    <Chip label={`Avg ${avgRating(run.variants)}/10`} size="small" variant="outlined" />
                  )}
                  {run.ranBy?.name && (
                    <Chip label={run.ranBy.name.split(" ")[0]} size="small" variant="outlined" />
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
