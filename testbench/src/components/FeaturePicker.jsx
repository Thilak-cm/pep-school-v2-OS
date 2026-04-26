import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import ScienceIcon from "@mui/icons-material/Science";
import { ACTIVE_FEATURES, COMING_SOON_FEATURES } from "../utils/featureRegistry.js";

export default function FeaturePicker({ onSelect }) {
  return (
    <Box sx={{ maxWidth: 900, mx: "auto", py: 6, px: 3 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Prompt Test Bench
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        Pick a feature to test and iterate on its prompts.
      </Typography>

      <Grid container spacing={2}>
        {ACTIVE_FEATURES.map((f) => (
          <Grid key={f.id} size={{ xs: 12, sm: 6 }}>
            <Card variant="outlined" sx={{ height: "100%", borderColor: "primary.main", borderWidth: 2 }}>
              <CardActionArea onClick={() => onSelect(f.id)} sx={{ height: "100%", p: 1 }}>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <ScienceIcon color="primary" />
                    <Typography variant="h6" fontWeight={600}>{f.label}</Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">{f.description}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}

        {COMING_SOON_FEATURES.map((f) => (
          <Grid key={f.id} size={{ xs: 12, sm: 6 }}>
            <Card variant="outlined" sx={{ height: "100%", opacity: 0.4 }}>
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  <Typography variant="h6" fontWeight={600}>{f.label}</Typography>
                  <Chip label="Coming Soon" size="small" />
                </Box>
                <Typography variant="body2" color="text.secondary">{f.description}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
