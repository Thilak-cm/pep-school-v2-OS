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
  {
    id: "text_cleanup",
    label: "Text Cleanup",
    description: "Compare observation text cleanup prompts",
    configDoc: "text_summarizer",
    status: "coming_soon",
  },
  {
    id: "ai_coach",
    label: "AI Coach",
    description: "Compare coaching nudge prompts per program",
    configDoc: "coach_{programId}",
    status: "coming_soon",
  },
  {
    id: "baseball_card",
    label: "Baseball Card",
    description: "Compare student summary snapshot prompts",
    configDoc: "baseball_card",
    status: "coming_soon",
  },
  {
    id: "report_generation",
    label: "Report Generation",
    description: "Compare parent-facing progress report prompts",
    configDoc: "report_{programId}",
    status: "coming_soon",
  },
];

export const ACTIVE_FEATURES = FEATURES.filter((f) => f.status === "active");
export const COMING_SOON_FEATURES = FEATURES.filter((f) => f.status === "coming_soon");
