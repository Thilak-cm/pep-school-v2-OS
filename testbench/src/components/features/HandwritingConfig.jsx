import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase.js";
import Box from "@mui/material/Box";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";

export default function HandwritingConfig({ onConfigLoaded }) {
  const [loading, setLoading] = useState(true);
  const [imageCount, setImageCount] = useState(5);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
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
    setLoading(false);
  }

  if (loading) return <CircularProgress size={20} />;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
      <Typography variant="body2" color="text.secondary">Images:</Typography>
      <Slider
        value={imageCount}
        onChange={(_, v) => setImageCount(v)}
        min={3}
        max={20}
        step={1}
        valueLabelDisplay="auto"
        sx={{ width: 120 }}
      />
      <Typography variant="body2">{imageCount}</Typography>
    </Box>
  );
}
