const PROMPT_BUILDERS = Object.freeze([
  (student) => `How is ${student} progressing?`,
  (student) => `What patterns do you notice in ${student}'s recent observations?`,
  (student) => `What should I focus on next with ${student}?`,
  (student) => `Help me draft a parent-friendly update about ${student}.`,
]);

export const TOOL_STATUS_QUIPS = Object.freeze({
  fetch_observations: Object.freeze([
    'Flipping through my notes on [student]...',
    "Let me see what I've jotted down about [student]...",
    "Thumbing through [student]'s observation log...",
  ]),
  fetch_media: Object.freeze([
    'Pulling up some photos...',
    'Let me find those pictures...',
    'Rummaging through the photo album...',
  ]),
  fetch_interviews: Object.freeze([
    'Revisiting our conversations about [student]...',
    'Let me recall what we discussed about [student]...',
    'Going back through the interview notes...',
  ]),
  fetch_term_reports: Object.freeze([
    "Digging into [student]'s report card...",
    'Pulling up the term report...',
    "Let me review [student]'s progress report...",
  ]),
  fetch_baseline_reports: Object.freeze([
    'Checking the baseline write-up...',
    "Flipping to [student]'s baseline notes...",
    'Let me look at the baseline summary...',
  ]),
  fetch_weekly_snapshot: Object.freeze([
    "Glancing at this week's snapshot...",
    'Checking the weekly pulse on [student]...',
    "Let me peek at this week's highlights...",
  ]),
  fetch_snapshot_history: Object.freeze([
    'Looking back at earlier snapshots...',
    "Tracing [student]'s weekly patterns...",
    "Flipping through [student]'s past highlights...",
  ]),
  fetch_writing_analysis: Object.freeze([
    "Reviewing [student]'s writing samples...",
    'Taking a closer look at the writing...',
    "Let me examine [student]'s handwriting progress...",
  ]),
  fetch_monthly_plan: Object.freeze([
    'Looking at the plan for this month...',
    "Checking what's on the agenda...",
    "Let me see what we've mapped out this month...",
  ]),
  fetch_placements: Object.freeze([
    "Checking [student]'s graduation history...",
    "Tracing [student]'s classroom journey...",
    "Let me see where [student]'s been...",
  ]),
  fetch_chat_history: Object.freeze([
    'Scrolling back through our earlier chat...',
    'Let me revisit what we talked about before...',
    'Flipping back a few pages in our conversation...',
  ]),
});

export function getChatStudentName(student, fallback = 'this student') {
  return String(student?.firstName || '').trim()
    || String(student?.displayName || '').trim()
    || fallback;
}

export function getSuggestedChatPrompts(student) {
  const name = getChatStudentName(student);
  return PROMPT_BUILDERS.map((build) => build(name));
}

export function resolveChatMessage({ retryMessage = '', explicitMessage = '', input = '' } = {}) {
  return String(retryMessage || explicitMessage || input).trim();
}

export function getToolStatusQuips({ names = [], student, random = Math.random } = {}) {
  const studentName = getChatStudentName(student);
  return names.flatMap((name) => {
    const options = TOOL_STATUS_QUIPS[name];
    if (!options) return [];
    const choice = Math.min(options.length - 1, Math.floor(Math.max(0, random()) * options.length));
    return options[choice].replaceAll('[student]', studentName);
  });
}
