export const FEATURES = [
  {
    id: "handwriting_analysis",
    label: "Handwriting Analysis",
    description: "Compare VLM writing analysis prompts against student handwriting samples",
    configDoc: "handwriting_analysis",
    status: "active",
  },
  {
    id: "soul_generation",
    label: "Soul Generation",
    description: "Compare soul generation instruction prompts and guidelines templates",
    configDoc: "soul_generation",
    status: "active",
  },
  {
    id: "interview_question_gen",
    label: "Interview Question Gen",
    description: "Simulate turn-by-turn interview sessions and compare question generation across prompt variants",
    configDoc: "interview_question_gen",
    status: "active",
  },
];

export const ACTIVE_FEATURES = FEATURES.filter((f) => f.status === "active");
