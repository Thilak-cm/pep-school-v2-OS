/**
 * Monthly Plan — Prompt Assembly Pipeline (PEP-235)
 *
 * Structural visualization of how the monthly plan prompt is assembled.
 * System prompt shows real content from Firestore config.
 * User prompt blocks show structural descriptions until a student is loaded.
 */
import DescriptionIcon from "@mui/icons-material/Description";
import { ContextBlock, FlowArrow, SectionLabel, RuntimePlaceholder, PipelineWrapper } from "./PipelineComponents.jsx";
import { buildStudentHeaderContent } from "./monthlyPlanPipelineHelpers.js";

export default function MonthlyPlanPromptPipeline({ systemPrompt, selectedStudent }) {
  const studentContent = buildStudentHeaderContent(selectedStudent);

  return (
    <PipelineWrapper title="Prompt Assembly" subtitle="monthly plan — how the prompt is assembled before sending to the LLM">
      <SectionLabel>System Prompt</SectionLabel>

      <ContextBlock
        number="1"
        label="System Prompt"
        sublabel="from Firestore config — plan generation instructions"
        content={systemPrompt ?? null}
        charCount={systemPrompt?.length}
      />

      <FlowArrow />
      <SectionLabel>User Prompt</SectionLabel>

      <ContextBlock
        number="2"
        label="Student Header"
        sublabel="name, age (from DOB), program"
        content={studentContent}
        charCount={studentContent?.length}
      />

      <FlowArrow />

      <ContextBlock
        number="3"
        label="Writing Analysis"
        sublabel="developmental writing assessment — narrative, dimension ratings, improvements, concerns"
        content="Writing analysis is loaded by the Cloud Function from students/{studentId}/ai_summaries/writing_analysis.\nIncludes narrative summary, dimension ratings with scores/trends, improvements, and concerns."
        charCount={null}
      />
      <RuntimePlaceholder
        icon={<DescriptionIcon />}
        title="Writing analysis loaded server-side"
        description="The full writing_analysis document is fetched and formatted as context for the LLM. If missing, the prerequisite dialog prompts generation first."
      />

      <FlowArrow />

      <ContextBlock
        number="4"
        label="Observations (4 months)"
        sublabel="all text, voice, lesson, and media observations — most recent first"
        content="All observations from the last 4 months are loaded by the Cloud Function.\nOrdered most-recent-first so the LLM prioritizes recent information.\nNo truncation — full observation text included for each entry."
        charCount={null}
      />
      <RuntimePlaceholder
        icon={<DescriptionIcon />}
        title="Observations loaded server-side"
        description="Each observation is serialized with date, type, and content. Includes text notes, voice transcriptions, lesson titles/descriptions/ratings, and media comments."
      />
    </PipelineWrapper>
  );
}
