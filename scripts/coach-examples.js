/*
  Shared default examples for Coach feature.
  Single source of truth for example texts and reasons.
  
  Used by:
  - scripts/updateCoachExamples.js (migration)
  - scripts/pushCoachPrompt.js (prompt composition)
  - functions/index.js (Cloud Functions runtime)
*/

const examples = {
  duration: {
    exampleText: 'At the park she hesitated, then climbed and slid independently.',
    reason: 'Activity noted without a time range.'
  },
  modality: {
    exampleText: 'He returned in the morning to start subtraction again and grasped the concept.',
    reason: 'Material-based math work mentioned; no method (Material/Pen & paper/Mental).'
  },
  independence: {
    exampleText: 'After a prompt he engaged with tracing and phonetic sounds for 15 minutes.',
    reason: 'No independence/grouping label present.'
  },
  evidence: {
    exampleText: "Read 'Cheeky Chimp' and identified the 'ch' phonogram.",
    reason: 'Claim without count or quote.'
  },
  subjective: {
    exampleText: 'STUDENT_A is a very happy child and always comes with a smile.',
    reason: 'Adjective can be replaced by one objective observation.'
  }
};

// CommonJS module for use with require()
module.exports = examples;

