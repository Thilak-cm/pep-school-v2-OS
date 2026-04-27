import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase.js";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";

export default function HandwritingConfig({ onConfigLoaded }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const snap = await getDoc(doc(db, "config", "handwriting_analysis"));
      if (snap.exists()) {
        const data = snap.data();
        onConfigLoaded({
          systemPrompt: data.systemPrompt || "",
          model: data.model || "gpt-5.4",
          temperature: data.temperature ?? 0.3,
          max_tokens: data.max_tokens || 2000,
        });
      }
    } catch (err) {
      console.error("[HandwritingConfig] loadConfig failed:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <CircularProgress size={20} />;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Typography variant="body2" color="text.secondary">Config loaded</Typography>
    </Box>
  );
}
