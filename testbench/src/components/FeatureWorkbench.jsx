import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { useAuth } from "../contexts/AuthContext.js";
import { hasFeatureAccess } from "../utils/accessUtils.js";
import HandwritingWorkbench from "./features/HandwritingWorkbench.jsx";
import SoulWorkbench from "./features/SoulWorkbench.jsx";
import InterviewWorkbench from "./features/InterviewWorkbench.jsx";

/**
 * Feature router — delegates to per-feature workbench based on featureId.
 * Guards access: if the user doesn't have permission for this feature, shows denial.
 */
export default function FeatureWorkbench({ featureId, onBack }) {
  const { role, allowedFeatures } = useAuth();

  if (!hasFeatureAccess(featureId, role, allowedFeatures)) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 2 }}>
        <Typography variant="h6">Access Denied</Typography>
        <Typography color="text.secondary">You don&apos;t have access to this feature.</Typography>
        {onBack && (
          <Button variant="outlined" onClick={onBack}>Go Back</Button>
        )}
      </Box>
    );
  }

  switch (featureId) {
    case "handwriting_analysis":
      return <HandwritingWorkbench />;
    case "soul_generation":
      return <SoulWorkbench />;
    case "interview_question_gen":
      return <InterviewWorkbench />;
    default:
      return <div>Unknown feature: {featureId}</div>;
  }
}
