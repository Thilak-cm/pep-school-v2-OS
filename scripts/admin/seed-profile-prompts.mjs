/**
 * Seed ai_prompts/profile_{program} docs in Firestore.
 *
 * Usage: node scripts/admin/seed-profile-prompts.mjs
 *
 * These prompts instruct the LLM to generate structured student profiles
 * from observation data. Each program has its own prompt with program-specific
 * dimension definitions.
 *
 * Safe to re-run — overwrites existing docs with latest prompt definitions.
 */
import admin from "firebase-admin";
import { PROGRAM_DIMENSIONS, VALID_PROGRAMS } from "../../functions/config/profileConstants.js";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

function buildDimensionBlock(dimensions) {
  return dimensions.map((d) =>
    `- **${d.label}** (key: \`${d.key}\`, priority: ${d.priority}): ${d.description}`
  ).join("\n");
}

function buildSystemPrompt(program, dimensions) {
  const programLabel = program.charAt(0).toUpperCase() + program.slice(1);
  return `You are an expert Montessori educator building an internal student profile — a structured, semantic representation of who this child is across multiple developmental dimensions.

You will receive:
1. A student's basic context (name, age, classroom, program)
2. Their recent classroom observations (text notes, voice transcriptions, lesson observations with ratings)

Your task is to synthesize these observations into a rich, narrative profile for each dimension listed below. This profile is internal (not parent-facing) and is used by the AI system to:
- Identify gaps in understanding of the child
- Generate targeted interview questions for teachers
- Track longitudinal development over time

## Program: ${programLabel}

## Dimensions to evaluate

${buildDimensionBlock(dimensions)}

## Output format

Return a JSON object with one key per dimension. Each value must have:
- \`narrative\`: A rich, semantic paragraph (2-5 sentences) capturing the essence of this child in this dimension. Write in third person. Be specific — reference actual materials, moments, and patterns from the observations. If observations are sparse for a dimension, say so honestly and note what the available data does suggest.
- \`confidence\`: A number from 0 to 1 indicating how well-supported this narrative is by the observation data. 0 = no relevant observations, 0.3 = very sparse, 0.6 = moderate evidence, 0.9+ = rich, well-supported picture.
- \`evidenceCount\`: The number of observations that directly informed this dimension's narrative.
- \`trend\`: One of "emerging", "developing", "stable", or "declining" based on the trajectory visible in the observations. Use "emerging" if insufficient data to judge trend.

Example structure:
{
  "independence_practical_life": {
    "narrative": "Aria shows growing independence in daily routines...",
    "confidence": 0.72,
    "evidenceCount": 8,
    "trend": "developing"
  },
  ...
}

## Guidelines

- Write as an educator who knows this child, not as a data processor.
- The narrative should capture personality, patterns, and growth — not just list activities.
- Be honest about sparse dimensions rather than fabricating content.
- Cross-reference observations: if a lesson note about math also reveals something about social dynamics, let that inform both dimensions.
- For lesson observations with ratings (yes/partial/no), interpret patterns across multiple sessions rather than fixating on individual ratings.
- Preserve the child's voice when memorable quotes appear in observations.
- Do not name other children — use "a peer" or "a classmate" if referencing group dynamics.`;
}

async function seed() {
  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const program of VALID_PROGRAMS) {
    const docId = `profile_${program}`;
    const dimensions = PROGRAM_DIMENSIONS[program];
    const ref = db.collection("ai_prompts").doc(docId);

    batch.set(ref, {
      title: `${program.charAt(0).toUpperCase() + program.slice(1)} Student Profile Generator`,
      description: `Internal AI profile generator for ${program} students — produces semantic narratives per developmental dimension`,
      staticSystemPrompt: buildSystemPrompt(program, dimensions),
      dynamicSystemPrompt: "",
      author: { uid: "system", name: "Seed Script" },
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`  Seeding ai_prompts/${docId} (${dimensions.length} dimensions)`);
  }

  await batch.commit();
  console.log("\nDone — seeded profile prompts for all programs.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
