import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import ScienceIcon from "@mui/icons-material/Science";
import { useAuth } from "../contexts/AuthContext.js";
import { filterFeaturesByAccess } from "../utils/accessUtils.js";
import AccessPanel from "./AccessPanel.jsx";

export default function FeaturePicker({ onSelect }) {
  const { role, allowedFeatures } = useAuth();
  const visibleFeatures = filterFeaturesByAccess(role, allowedFeatures);

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", py: 6, px: 3 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Prompt Test Bench
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        Pick a feature to test and iterate on its prompts.
      </Typography>

      <Grid container spacing={2}>
        {visibleFeatures.map((f) => (
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
      </Grid>

      {role === "superadmin" && <AccessPanel />}
    </Box>
  );
}
