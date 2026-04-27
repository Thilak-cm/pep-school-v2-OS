import Box from "@mui/material/Box";
import Slider from "@mui/material/Slider";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

export default function RatingWidget({ rating, notes, onRatingChange, onNotesChange }) {
  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Typography variant="subtitle2" sx={{ minWidth: 50 }}>Rating</Typography>
        <Slider
          value={rating || 5}
          onChange={(_, v) => onRatingChange(v)}
          min={1}
          max={10}
          step={1}
          marks
          valueLabelDisplay="auto"
          sx={{ maxWidth: 200 }}
        />
        <Typography variant="h6" fontWeight={700} color="primary">{rating || 5}/10</Typography>
      </Box>
      <TextField
        fullWidth
        size="small"
        placeholder="Notes on this output..."
        value={notes || ""}
        onChange={(e) => onNotesChange(e.target.value)}
        sx={{ mt: 1 }}
      />
    </Box>
  );
}
