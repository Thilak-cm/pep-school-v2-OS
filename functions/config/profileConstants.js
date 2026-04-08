// Student profile model constants

// Hard requirement: use latest frontier model for profile generation
// This is high-stakes data processing — not configurable downward
import { FRONTIER_MODEL } from "./modelConstants.js";

export const PROFILE_MODEL = FRONTIER_MODEL;

export const PROFILE_DEFAULTS = {
  model: PROFILE_MODEL,
  temperature: 0,
  max_tokens: 8000,
};

// Per-program dimension definitions
// key: Firestore document ID for the dimension
// label: Human-readable name
// description: What this dimension covers (used in prompts)
// priority: "major" (always seeded) or "good_to_have" (seeded but may be sparse)

const TODDLER_PRIMARY_DIMENSIONS = [
  {
    key: "independence_practical_life",
    label: "Independence & Practical Life",
    description: "Self-care, classroom routines, daily living, food preparation, care of environment",
    priority: "major",
    order: 1,
  },
  {
    key: "social_emotional",
    label: "Social-Emotional Development",
    description: "Peer relationships, emotional regulation, empathy, conflict resolution, group dynamics, separation",
    priority: "major",
    order: 2,
  },
  {
    key: "language_literacy",
    label: "Language & Literacy",
    description: "Phonics, reading, writing, vocabulary, communication, home language use",
    priority: "major",
    order: 3,
  },
  {
    key: "mathematics_sensorial",
    label: "Mathematics & Sensorial Exploration",
    description: "Number sense, counting, operations, bead work, geometric solids, colour boxes, sensory discrimination, classification",
    priority: "major",
    order: 4,
  },
  {
    key: "cultural_studies",
    label: "Cultural Studies",
    description: "Geography, science, nature, history",
    priority: "good_to_have",
    order: 5,
  },
  {
    key: "creative_physical",
    label: "Creative & Physical Development",
    description: "Art, music, movement, gymnastics, outdoor play",
    priority: "good_to_have",
    order: 6,
  },
  {
    key: "indian_languages",
    label: "Indian Languages",
    description: "Hindi, Kannada, or regional language development",
    priority: "good_to_have",
    order: 7,
  },
];

const ELEMENTARY_DIMENSIONS = [
  {
    key: "language_arts",
    label: "Language Arts",
    description: "Reading, writing, grammar, creative writing, comprehension, spelling, punctuation",
    priority: "major",
    order: 1,
  },
  {
    key: "mathematics",
    label: "Mathematics",
    description: "Operations, fractions, geometry, word problems, number patterns, measurement, time",
    priority: "major",
    order: 2,
  },
  {
    key: "social_emotional_work",
    label: "Social-Emotional Development & Work Approach",
    description: "Collaboration, independence, self-management, work habits, peer relationships, leadership",
    priority: "major",
    order: 3,
  },
  {
    key: "sciences_cultural",
    label: "Sciences & Cultural Studies",
    description: "Biology, geography, history, civilizations, environmental studies, research projects",
    priority: "major",
    order: 4,
  },
  {
    key: "indian_languages",
    label: "Indian Languages",
    description: "Kannada, Hindi",
    priority: "good_to_have",
    order: 5,
  },
  {
    key: "creative_physical",
    label: "Creative Arts & Physical Development",
    description: "Art, handwork, clay, music, sports, movement",
    priority: "good_to_have",
    order: 6,
  },
  {
    key: "community_leadership",
    label: "Community & Leadership",
    description: "Group projects, field trips, service, community contribution",
    priority: "good_to_have",
    order: 7,
  },
];

const ADOLESCENT_DIMENSIONS = [
  {
    key: "mathematics",
    label: "Mathematics",
    description: "Algebra, geometry, number theory, problem-solving, mathematical reasoning, applied math in projects",
    priority: "major",
    order: 1,
  },
  {
    key: "language_humanities",
    label: "Language & Humanities",
    description: "Reading, writing, grammar, literature, history, social studies, research, argumentation, creative expression",
    priority: "major",
    order: 2,
  },
  {
    key: "sciences",
    label: "Sciences",
    description: "Biology, chemistry, physics, environmental science, scientific method, lab work, observation and inquiry",
    priority: "major",
    order: 3,
  },
  {
    key: "enterprise_applied",
    label: "Enterprise & Applied Learning",
    description: "Business projects, production work (weaving, soap-making), economics, planning, budgeting, real-world problem-solving",
    priority: "major",
    order: 4,
  },
  {
    key: "work_habits_self_management",
    label: "Work Habits & Self-Management",
    description: "Initiative, persistence, time management, response to feedback, independence, relationship to challenge, self-assessment",
    priority: "major",
    order: 5,
  },
  {
    key: "social_community",
    label: "Social Development & Community Life",
    description: "Peer relationships, group dynamics, collaboration, conflict, leadership, empathy, contribution to the community",
    priority: "major",
    order: 6,
  },
  {
    key: "indian_languages",
    label: "Indian Languages",
    description: "Kannada, Hindi",
    priority: "good_to_have",
    order: 7,
  },
  {
    key: "creative_physical",
    label: "Creative Arts & Physical Development",
    description: "Art, music, craft, movement, sports",
    priority: "good_to_have",
    order: 8,
  },
  {
    key: "technology_research",
    label: "Technology & Research Practice",
    description: "Digital tools, research process, judgment about sources, documentation, presentation, responsible use",
    priority: "good_to_have",
    order: 9,
  },
];

export const PROGRAM_DIMENSIONS = {
  toddler: TODDLER_PRIMARY_DIMENSIONS,
  primary: TODDLER_PRIMARY_DIMENSIONS,
  elementary: ELEMENTARY_DIMENSIONS,
  adolescent: ADOLESCENT_DIMENSIONS,
};

export const VALID_PROGRAMS = Object.keys(PROGRAM_DIMENSIONS);

export const VALID_TRENDS = ["emerging", "developing", "stable", "declining"];

export const SOURCE_BACKFILL = "backfill";
export const SOURCE_INTERVIEW = "interview";
export const SOURCE_OBSERVATION = "observation";

export const VALID_SOURCE_TYPES = [SOURCE_BACKFILL, SOURCE_INTERVIEW, SOURCE_OBSERVATION];
