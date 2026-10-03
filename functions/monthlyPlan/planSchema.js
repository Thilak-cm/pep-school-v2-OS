/**
 * #306: Zod contract for monthly plan generation, enforced at both boundaries
 * by runStructuredLLM (request-side strict json_schema constrains sampling;
 * response-side safeParse detects shape violations with field paths). Mirrors
 * the config/monthly_plan prompt's "Output Format" section - keep them in sync.
 *
 * Adopted after the 2026-10 batch incident: OpenRouter returned
 * finish_reason "error" mid-generation, bare JSON.parse threw, and one
 * transient provider hiccup became a permanent failed work item.
 *
 * Strictness decisions (#306 planning, 2026-10-02):
 * - Enums for planningMode / basis / section name: both consumers
 *   (docBuilders.js SECTION_COLORS, MonthlyPlanTab.jsx SECTIONS) key on exact
 *   section names; a misspelling today degrades silently to grey/positional.
 * - Exactly 5 sections + uniqueness refine, NO order enforcement: consumers
 *   look sections up by name, never by index, and a tuple would couple code
 *   to prompt ordering that lives in editable Firestore config. The refine is
 *   response-side only (dropped in JSON Schema conversion) - duplicates are
 *   caught by safeParse, not by sampling.
 * - items min(1), no max: empty sections are an integrity defect (bare heading
 *   with zero actions); the prompt's "5 compact action items" is style, and
 *   machine-enforcing it would spend repair budget forcing filler items.
 * - Closed object, all fields required: strict-mode contract. studentId /
 *   studentName / month are validated here (strict mode requires the full
 *   contract) but server-side stamping in generatePlanInternal remains
 *   authoritative for the saved doc.
 */
import { z } from "zod";

export const SECTION_NAMES = [
  "Language",
  "Sensorial",
  "Math",
  "Practical Life",
  "Grace & Courtesy",
];

const PlanItemSchema = z.object({
  work: z.string().min(1),
  basis: z.enum(["observed", "ageBenchmark", "diagnostic", "conditional"]),
  why: z.string(),
  hook: z.string(),
  offer: z.string(),
  next: z.string(),
  watch: z.string(),
});

const PlanSectionSchema = z.object({
  name: z.enum(SECTION_NAMES),
  position: z.string(),
  monthlyAim: z.string(),
  items: z.array(PlanItemSchema).min(1),
});

export const MonthlyPlanResponseSchema = z.object({
  studentId: z.string().min(1),
  studentName: z.string().min(1),
  age: z.string(),
  month: z.string(),
  planningMode: z.enum(["observationBased", "coldStart"]),
  dataSufficiency: z.object({
    meaningfulObservationCount: z.number().int().min(0),
    summary: z.string(),
  }),
  dataWindow: z.object({
    from: z.string(),
    to: z.string(),
    observationCount: z.number().int().min(0),
  }),
  affinities: z.array(z.string()),
  sections: z.array(PlanSectionSchema)
    .length(5)
    .refine(
      (sections) => new Set(sections.map((s) => s.name)).size === 5,
      { message: "section names must be unique (one of each of the 5 areas)" },
    ),
});
