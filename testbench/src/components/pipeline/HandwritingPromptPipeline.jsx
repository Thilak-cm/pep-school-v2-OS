/**
 * Handwriting Analysis — Prompt Assembly Pipeline (PEP-216)
 *
 * Structural visualization of how the handwriting analysis prompt is assembled.
 * System prompt shows real content from Firestore config.
 * User prompt blocks show structural descriptions until a student is loaded.
 */
import ImageIcon from "@mui/icons-material/Image";
import { ContextBlock, FlowArrow, SectionLabel, RuntimePlaceholder, PipelineWrapper } from "./PipelineComponents.jsx";
import { buildStudentHeaderContent } from "./handwritingPipelineHelpers.js";

export default function HandwritingPromptPipeline({ systemPrompt, selectedStudent }) {
  const studentContent = buildStudentHeaderContent(selectedStudent);

  return (
    <PipelineWrapper title="Prompt Assembly" subtitle="handwriting analysis — how the prompt is assembled before sending to the LLM">
      <SectionLabel>System Prompt</SectionLabel>

      <ContextBlock
        number="1"
        label="System Prompt"
        sublabel="from Firestore config — handwriting analysis instructions"
        content={systemPrompt ?? null}
        charCount={systemPrompt?.length}
        defaultExpanded
      />

      <FlowArrow />
      <SectionLabel>User Prompt</SectionLabel>

      <ContextBlock
        number="2"
        label="Student Header"
        sublabel="name, age, total writing samples"
        content={studentContent}
        charCount={studentContent?.length}
      />

      <FlowArrow />

      <ContextBlock
        number="3"
        label="Previous Analysis"
        sublabel="longitudinal context — prior narrative + dimension ratings"
        content="Previous handwriting analysis is loaded by the Cloud Function at runtime.\nIf a prior analysis exists, its narrative and dimension ratings are injected for longitudinal comparison."
        charCount={null}
      />

      <FlowArrow />

      <ContextBlock
        number="4"
        label="Per-Image Annotations"
        sublabel="date, uploader, curriculum area, copied flag, teacher comment per sample"
        content="For each writing sample, the Cloud Function injects structured metadata:\n• Capture date\n• Uploaded by (teacher name)\n• Curriculum area\n• Whether the work was copied\n• Teacher comment (if provided)"
        charCount={null}
      />

      <FlowArrow />

      <ContextBlock
        number="5"
        label="Writing Sample Images"
        sublabel="base64-encoded images interleaved after each annotation"
        content={null}
      />
      <RuntimePlaceholder
        icon={<ImageIcon />}
        title="Base64 images injected server-side"
        description="Each annotation block above is followed by its corresponding writing sample image as a base64 content part. Images are not loaded client-side."
      />
    </PipelineWrapper>
  );
}
