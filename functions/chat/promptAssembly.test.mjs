import test from "node:test";
import assert from "node:assert/strict";

import {
  REQUIRED_PROMPT_VARIABLES,
  validateSystemPromptTemplate,
  renderSystemPrompt,
  buildStudentProfile,
} from "./promptAssembly.js";

const TEMPLATE = [
  "Role {{studentName}}",
  "Profile {{studentProfile}}",
  "Soul {{developmentSummary}}",
  "Obs {{recentObservations}}",
  "Window {{observationWindowDays}}",
].join("\n");

test("validates the five approved system prompt variables", () => {
  assert.deepEqual(validateSystemPromptTemplate(TEMPLATE), { valid: true });
  assert.deepEqual(REQUIRED_PROMPT_VARIABLES, [
    "studentName",
    "studentProfile",
    "developmentSummary",
    "recentObservations",
    "observationWindowDays",
  ]);
});

test("rejects unsupported, missing, repeated block, and unresolved variables", () => {
  assert.match(validateSystemPromptTemplate("{{studentName}} {{nope}}").error, /unsupported/);
  assert.match(validateSystemPromptTemplate("{{studentName}}").error, /missing/);
  assert.match(validateSystemPromptTemplate(`${TEMPLATE}\n{{studentProfile}}`).error, /exactly once/);
  assert.match(validateSystemPromptTemplate(`${TEMPLATE}\n{{`).error, /unresolved/);
});

test("renders the template without adding hardcoded prose", () => {
  const rendered = renderSystemPrompt(TEMPLATE, {
    studentName: "Anaya Rao",
    studentProfile: "Name: Anaya Rao",
    developmentSummary: "Full soul",
    recentObservations: "[]",
    observationWindowDays: 30,
  });
  assert.match(rendered, /Role Anaya Rao/);
  assert.match(rendered, /Window 30/);
  assert.doesNotMatch(rendered, /undefined|\{\{/);
});

test("formats authoritative student profile and unavailable optional fields", () => {
  const profile = buildStudentProfile({
    displayName: "Anaya Rao",
    dateOfBirth: new Date("2022-01-10T00:00:00.000Z"),
    createdAt: new Date("2024-01-10T00:00:00.000Z"),
    classroomName: "All Stars",
    programName: "Primary",
  }, new Date("2026-08-12T00:00:00.000Z"));
  assert.match(profile, /Name: Anaya Rao/);
  assert.match(profile, /Age: 4 years, 7 months/);
  assert.match(profile, /Time at Pep: 2 years, 7 months/);
  assert.match(profile, /Classroom: All Stars/);
  assert.match(profile, /Program: Primary/);

  const unavailable = buildStudentProfile({ classroomName: "All Stars", programName: "Primary" }, new Date("2026-08-12T00:00:00.000Z"));
  assert.match(unavailable, /Name: unavailable/);
  assert.match(unavailable, /Age: unavailable/);
  assert.match(unavailable, /Time at Pep: unavailable/);
});
