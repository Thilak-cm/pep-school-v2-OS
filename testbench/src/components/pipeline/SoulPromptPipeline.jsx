/**
 * Soul Generation — Prompt Assembly Pipeline (PEP-216)
 *
 * Structural visualization of how the soul generation prompt is assembled.
 * System prompt is decomposed into 3 blocks (preamble, guidelines, output format).
 * User prompt blocks show structural descriptions until a student is loaded.
 */
import { ContextBlock, FlowArrow, SectionLabel, PipelineWrapper } from "./PipelineComponents.jsx";
import { extractRolePreamble, extractOutputFormat, buildStudentContextContent } from "./soulPipelineHelpers.js";

export default function SoulPromptPipeline({ systemPrompt, guidelinesContent, selectedStudent }) {
  const preamble = extractRolePreamble(systemPrompt);
  const outputFormat = extractOutputFormat(systemPrompt);
  const studentContent = buildStudentContextContent(selectedStudent);

  return (
    <PipelineWrapper title="Prompt Assembly" subtitle="soul generation — how the prompt is assembled before sending to the LLM">
      <SectionLabel>System Prompt</SectionLabel>

      <ContextBlock
        number="1"
        label="Role Preamble"
        sublabel="expert Montessori educator persona + task framing"
        content={preamble}
        charCount={preamble?.length}
        defaultExpanded
      />

      <FlowArrow />

      <ContextBlock
        number="2"
        label="Guidelines"
        sublabel="injected via ${guidelinesContent} from config"
        content={guidelinesContent ?? null}
        charCount={guidelinesContent?.length}
      />

      <FlowArrow />

      <ContextBlock
        number="3"
        label="Output Format & Instructions"
        sublabel="heading structure, YAML suggestions, open questions format, continuity rules"
        content={outputFormat}
        charCount={outputFormat?.length}
      />

      <FlowArrow />
      <SectionLabel>User Prompt</SectionLabel>

      <ContextBlock
        number="4"
        label="Student Context"
        sublabel="name + student ID (full context resolved server-side)"
        content={studentContent}
        charCount={studentContent?.length}
      />

      <FlowArrow />

      <ContextBlock
        number="5"
        label="Observations"
        sublabel="all observations within the configured time window"
        content="Observations are loaded by the Cloud Function at runtime.\nAll notes within the configured window (e.g., last 90-365 days) are fetched and injected as a JSON array."
        charCount={null}
      />

      <FlowArrow />

      <ContextBlock
        number="6"
        label="Interview Transcripts"
        sublabel="high-signal evidence — treated with elevated weight"
        content="Interview transcripts are loaded by the Cloud Function at runtime.\nAll completed interview sessions are injected as a JSON array, labelled as high-signal evidence."
        charCount={null}
      />

      <FlowArrow />

      <ContextBlock
        number="7"
        label="Previous Soul"
        sublabel="prior narrative for continuity — omitted if first generation"
        content="The most recent soul narrative is loaded by the Cloud Function at runtime.\nUsed for continuity — the AI updates sections where new evidence warrants it and preserves what remains accurate."
        charCount={null}
      />
    </PipelineWrapper>
  );
}
