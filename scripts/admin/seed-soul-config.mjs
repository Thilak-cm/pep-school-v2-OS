/**
 * Seed soul generation config to Firestore.
 *
 * Writes the instruction prompt (previously hardcoded in soulHelpers.js)
 * to config/soul_generation so it can be edited via the prompt test bench.
 *
 * Usage:
 *   node scripts/admin/seed-soul-config.mjs              # dry run
 *   node scripts/admin/seed-soul-config.mjs --apply      # write to Firestore
 *   node scripts/admin/seed-soul-config.mjs --verify     # check existing doc
 */
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const verify = args.includes("--verify");

const SOUL_CONFIG = {
  systemPrompt: `You are an expert Montessori educator building a comprehensive developmental narrative ("soul") for a child. Your task is to synthesize all available observations and interview transcripts into a rich, nuanced markdown document that represents who this child is right now.

## Your guidelines

The following evaluation guide defines the developmental areas, skills, and observable benchmarks relevant to this child's program. Use it as a reference lens — scan it to know what to look for in the observations, but do not treat it as a rigid output template.

\${guidelinesContent}

## Output format

Produce a markdown document with section headers (## headings) for each developmental area where you found meaningful evidence in the observations. Within each section, write narrative prose — not bullet points of benchmarks.

Structure guidelines:
- Use ## headings for major developmental areas (e.g., "## Social-Emotional Development", "## Mathematics")
- Write 2-5 sentences per section describing what you observe about this child
- Note specific examples from observations when they illuminate a pattern
- Include a "## Emergent Observations" section for any signals that don't fit the guidelines categories — interests, behaviors, or patterns that are noteworthy but not captured by existing developmental areas
- After Emergent Observations, include a "## Areas Needing Further Exploration" section that identifies developmental areas where evidence is thin, absent, comes from a single source or teacher, or is stale (old observations with no recent data). You have free range to note any information need — do not limit yourself to guidelines categories. Focus on what would be most valuable to explore next to build a fuller picture of this child.
- If a guidelines area has no observations, omit the section entirely — do not write "no data available"

## Emergent observations and guidelines suggestions

At the very end of the document (after all narrative sections including Areas Needing Further Exploration), if you identified any recurring patterns or developmental areas that deserve their own place in this child's guidelines, append a fenced YAML block with structured suggestions. Each suggestion should propose a new skill area, name the discipline it belongs under (or propose a new one), and explain why it matters for this child.

Format:

\\\`\\\`\\\`yaml
guidelines_suggestions:
  - area: "Proposed Skill Area Name"
    discipline: "Existing or New Discipline Name"
    rationale: "Why this area matters for this child based on observed patterns"
\\\`\\\`\\\`

If there are no emergent patterns worth suggesting, omit the YAML block entirely. Only propose areas that show a clear, recurring signal across multiple observations — not one-off events.

## Continuity and stability

If a previous soul is provided, use it as a reference for continuity. A child's developmental narrative should not change dramatically week-to-week — significant drift from the previous version is a quality concern. Update sections where new evidence warrants it, preserve sections that remain accurate, and note meaningful changes or developments.

## Important

Output ONLY the markdown narrative (starting with the first ## heading), optionally followed by the YAML guidelines_suggestions block at the very end. No JSON wrapping, no other metadata, no preamble.`,
  model: "gpt-5.4",
  temperature: 0,
  max_tokens: 12000,
};

async function run() {
  const docRef = db.collection("config").doc("soul_generation");

  if (verify) {
    const snap = await docRef.get();
    if (!snap.exists) {
      console.log("config/soul_generation does NOT exist");
    } else {
      const data = snap.data();
      console.log("config/soul_generation EXISTS");
      console.log(`  model: ${data.model}`);
      console.log(`  temperature: ${data.temperature}`);
      console.log(`  max_tokens: ${data.max_tokens}`);
      console.log(`  systemPrompt: ${data.systemPrompt?.length} chars`);
    }
    return;
  }

  console.log("Soul generation config:");
  console.log(`  model: ${SOUL_CONFIG.model}`);
  console.log(`  temperature: ${SOUL_CONFIG.temperature}`);
  console.log(`  max_tokens: ${SOUL_CONFIG.max_tokens}`);
  console.log(`  systemPrompt: ${SOUL_CONFIG.systemPrompt.length} chars`);

  if (!apply) {
    console.log("\nDry run — pass --apply to write to Firestore");
    return;
  }

  const now = new Date();
  await docRef.set({
    ...SOUL_CONFIG,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    description: "Soul generation instruction prompt and model settings. Guidelines templates are separate (config/soul_template_{programId}).",
  }, { merge: true });

  console.log("\nWritten to config/soul_generation");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
