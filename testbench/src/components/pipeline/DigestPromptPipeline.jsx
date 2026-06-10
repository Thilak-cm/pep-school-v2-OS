/**
 * Digest Generation — Prompt Assembly Pipeline (PEP-304)
 *
 * Visualizes how the digest agent prompt is assembled:
 * system prompt, user message (classroom data + stats + contextual notes),
 * available tools, and output format.
 */
import DescriptionIcon from "@mui/icons-material/Description";
import LoopIcon from "@mui/icons-material/Loop";
import { ContextBlock, FlowArrow, SectionLabel, RuntimePlaceholder, PipelineWrapper } from "./PipelineComponents.jsx";
import ToolChecklist from "../ToolChecklist.jsx";

export default function DigestPromptPipeline({ systemPrompt, promptType, selectedClassroom, enabledTools, allowedTools, allowedScopes, onToolsChange }) {
  const classroomLabel = selectedClassroom?.name || "(select a classroom)";
  const isClassroom = promptType === "classroom";

  const userMessagePreview = isClassroom
    ? `# Classroom: ${classroomLabel}
Program: primary
Teachers: 3
Students: 12

## School Contextual Notes
- Diana D'Souza is an administrative teacher — she handles operations, not classroom teaching. Do not flag her for note-taking inactivity.
- Anil Kumar S is a support staff member, not a classroom teacher. Ignore his note counts.
- The school was on summer break for April and May 2026. A dip in notes for most students during this period is expected, except for students in the summer program.
- Argus, Orion and Sirius classrooms are new classrooms that started recently — lower activity is expected as they ramp up.

## Teacher Activity (last 7 days)
- Sonal Jayaswal: 14 notes (10 obs, 4 lessons) | all-time: 380
- Richa Harsh: 0 notes (0 obs, 0 lessons) | all-time: 92
- Diana D'Souza: 0 notes (0 obs, 0 lessons) | all-time: 5

## Student Note Counts
- Aarav Mehta [stu_001]: this week 3, last 42d 18, total 45
- Diya Sharma [stu_002]: this week 0, last 42d 12, total 30
- Eana Gabriela De Ata [stu_003]: this week 0, last 42d 21, total 67
- Kalidas Sreehari [stu_004]: this week 0, last 42d 0, total 8
- Reyansh Bansal [stu_005]: this week 0, last 42d 4, total 15
- Ruhaan Shrivastava [stu_006]: this week 2, last 42d 9, total 22
- Jia [stu_007]: this week 0, last 42d 6, total 19
- Dhruv Adithya Reddy [stu_008]: this week 0, last 42d 2, total 11

Generate a weekly digest email for this classroom. Use the tools available to investigate any anomalies, trends, or students who need attention. Start by checking weekly snapshots for students with low or declining activity.`
    : `# All Classroom Digests
Total classrooms: 18
Classrooms with red flags: 3

## School Contextual Notes
- Diana D'Souza is an administrative teacher — she handles operations, not classroom teaching. Do not flag her for note-taking inactivity.
- Anil Kumar S is a support staff member, not a classroom teacher. Ignore his note counts.
- The school was on summer break for April and May 2026. A dip in notes for most students during this period is expected, except for students in the summer program.
- Argus, Orion and Sirius classrooms are new classrooms that started recently — lower activity is expected as they ramp up.

## Periwinkle ⚠️ RED FLAGS

<div style="max-width:600px;margin:0 auto">
  <h2>June Week 2 Digest — Periwinkle</h2>
  <p>HTML email body from CF1 classroom digest run...</p>
</div>

---

## All Stars

<div style="max-width:600px;margin:0 auto">
  <h2>June Week 2 Digest — All Stars</h2>
  <p>HTML email body from CF1 classroom digest run...</p>
</div>

---

## Sirius

<div style="max-width:600px;margin:0 auto">
  <h2>June Week 2 Digest — Sirius</h2>
  <p>HTML email body from CF1 classroom digest run...</p>
</div>

(one section per active classroom)

Generate a consolidated executive summary email for superadmins. Highlight the most critical items across all classrooms. Identify cross-classroom patterns. Use tools to investigate specific cases if needed.`;

  return (
    <PipelineWrapper
      title="Prompt Assembly"
      subtitle={`digest ${isClassroom ? "classroom" : "superadmin"} — how the agent prompt is assembled`}
    >
      <SectionLabel>System Prompt</SectionLabel>

      <ContextBlock
        number="1"
        label="System Prompt"
        sublabel={isClassroom ? "classroom admin digest instructions" : "superadmin executive digest instructions"}
        content={systemPrompt ?? null}
        charCount={systemPrompt?.length}
      />

      <FlowArrow />
      <SectionLabel>User Message (assembled server-side)</SectionLabel>

      {isClassroom ? (
        <>
          <ContextBlock
            number="2"
            label="Classroom Header + Stats"
            sublabel="classroom name, program, teacher activity (7d), student note counts"
            content={userMessagePreview}
            charCount={null}
          />
          <RuntimePlaceholder
            icon={<DescriptionIcon />}
            title="Built from classrooms/{id} + statsCache/classroom_{id}"
            description="Teacher 7-day and all-time note counts, student this-week / 42-day / total note counts. Contextual notes from config/weekly_digest injected if present."
          />
        </>
      ) : (
        <>
          <ContextBlock
            number="2"
            label="All Classroom Digests"
            sublabel="HTML output from each classroom's CF1 run, concatenated"
            content={userMessagePreview}
            charCount={null}
          />
          <RuntimePlaceholder
            icon={<DescriptionIcon />}
            title="Reads from classrooms/{id}/digests/weekly_email"
            description="Each classroom's previously generated HTML digest is included. Red-flagged classrooms are marked with ⚠️. Contextual notes injected if present."
          />
        </>
      )}

      <FlowArrow />
      <SectionLabel>Agent Tools</SectionLabel>

      <ToolChecklist
        enabledTools={enabledTools}
        allowedTools={allowedTools}
        allowedScopes={allowedScopes}
        onChange={onToolsChange}
      />

      <FlowArrow />
      <SectionLabel>Agent Loop</SectionLabel>

      <RuntimePlaceholder
        icon={<LoopIcon />}
        title="Multi-turn tool-calling loop (max 15 iterations)"
        description="The agent reviews stats, calls tools to investigate concerning students, then produces final HTML output. Each iteration: LLM call → tool calls → results appended → next LLM call. Stops when the agent returns content without tool calls."
      />
    </PipelineWrapper>
  );
}
