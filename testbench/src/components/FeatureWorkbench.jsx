import HandwritingWorkbench from "./features/HandwritingWorkbench.jsx";
import SoulWorkbench from "./features/SoulWorkbench.jsx";
import InterviewWorkbench from "./features/InterviewWorkbench.jsx";

/**
 * Feature router — delegates to per-feature workbench based on featureId.
 */
export default function FeatureWorkbench({ featureId }) {
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
