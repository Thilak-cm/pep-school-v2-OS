/**
 * PEP-279: Tests for monthly plan Google Docs builders.
 *
 * Tests the pure functions that convert plan JSON into Google Docs API
 * batchUpdate request arrays. No Drive/Docs API calls — just data transforms.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDetailedPlanRequests,
  buildChecklistRequests,
  buildPlanDocTitle,
  buildChecklistDocTitle,
  formatMonthLabel,
} from "./docBuilders.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_PLAN = {
  studentId: "stu-001",
  studentName: "Ruhi / Roohi",
  age: "3y 11m",
  month: "2026-06",
  dataWindow: {
    from: "2026-02-06",
    to: "2026-05-20",
    observationCount: 30,
  },
  affinities: ["books", "animals"],
  sections: [
    {
      name: "Language",
      position: "Ruhi is in the early oral-language stage, age-appropriate for 3y 11m.",
      monthlyAim: "Strengthen oral vocabulary and sound awareness through storytelling and sandpaper letters.",
      items: [
        {
          work: "Re-present Sandpaper Letters for known sounds",
          basis: "observed",
          why: "Ruhi has shown pre-reading interest and requested adult support for sandpaper letters.",
          hook: "Her love of books can bridge into letter sounds.",
          offer: "Use only two sounds at a time, beginning with familiar ones.",
          next: "Move to three-letter phonetic words if she connects sounds to symbols.",
          watch: "Ruhi traces with correct direction and connects sounds to familiar words.",
        },
        {
          work: "Offer classified picture cards for flowers and vehicles",
          basis: "diagnostic",
          why: "Need to assess vocabulary breadth in concrete categories.",
          hook: "She enjoys sorting and naming animals — extend to other categories.",
          offer: "Place one category on the mat with 4-6 cards.",
          next: "Introduce pairing cards if naming is steady.",
          watch: "She names familiar cards and adds a short oral sentence.",
        },
        {
          work: "Use book browsing as an oral storytelling bridge",
          basis: "observed",
          why: "She looks at books daily and turns pages during pretend play.",
          hook: "Books are her strongest affinity.",
          offer: "Sit beside her and ask open-ended questions about the pictures.",
          next: "Encourage retelling a short story in sequence.",
          watch: "She describes pictures in complete phrases.",
        },
        {
          work: "Begin sound games through I Spy with classroom objects",
          basis: "conditional",
          why: "If sandpaper letters land, sound games reinforce phonemic awareness.",
          hook: "Use objects she can see and touch in the classroom.",
          offer: "Say 'I spy something that begins with /m/.'",
          next: "Progress to ending sounds if beginning sounds are steady.",
          watch: "She identifies beginning sounds without adult over-articulation.",
        },
        {
          work: "Use Hindi rhymes for language recall and sequencing",
          basis: "observed",
          why: "She responds to Hindi songs during circle time.",
          hook: "Music and rhythm engage her attention consistently.",
          offer: "Introduce one new rhyme per week with hand actions.",
          next: "Ask her to lead the rhyme for the group.",
          watch: "She recalls the rhyme independently after two sessions.",
        },
      ],
    },
    {
      name: "Sensorial",
      position: "Exploring sensorial discrimination materials at age-expected level.",
      monthlyAim: "Deepen visual discrimination and introduce sorting by multiple attributes.",
      items: Array.from({ length: 5 }, (_, i) => ({
        work: `Sensorial item ${i + 1}`,
        basis: "observed",
        why: `Sensorial why ${i + 1}`,
        hook: `Sensorial hook ${i + 1}`,
        offer: `Sensorial offer ${i + 1}`,
        next: `Sensorial next ${i + 1}`,
        watch: `Sensorial watch ${i + 1}`,
      })),
    },
    {
      name: "Math",
      position: "Beginning number work with concrete materials.",
      monthlyAim: "Build one-to-one correspondence through Number Rods and counting games.",
      items: Array.from({ length: 5 }, (_, i) => ({
        work: `Math item ${i + 1}`,
        basis: "diagnostic",
        why: `Math why ${i + 1}`,
        hook: `Math hook ${i + 1}`,
        offer: `Math offer ${i + 1}`,
        next: `Math next ${i + 1}`,
        watch: `Math watch ${i + 1}`,
      })),
    },
    {
      name: "Practical Life",
      position: "Developing independence in self-care and care of environment.",
      monthlyAim: "Support full work cycles and encourage taking one material at a time.",
      items: Array.from({ length: 5 }, (_, i) => ({
        work: `Practical Life item ${i + 1}`,
        basis: "observed",
        why: `PL why ${i + 1}`,
        hook: `PL hook ${i + 1}`,
        offer: `PL offer ${i + 1}`,
        next: `PL next ${i + 1}`,
        watch: `PL watch ${i + 1}`,
      })),
    },
    {
      name: "Grace & Courtesy",
      position: "Learning social scripts through observation and role-play.",
      monthlyAim: "Practice concrete greeting and turn-taking scripts in guided settings.",
      items: Array.from({ length: 5 }, (_, i) => ({
        work: `G&C item ${i + 1}`,
        basis: "conditional",
        why: `G&C why ${i + 1}`,
        hook: `G&C hook ${i + 1}`,
        offer: `G&C offer ${i + 1}`,
        next: `G&C next ${i + 1}`,
        watch: `G&C watch ${i + 1}`,
      })),
    },
  ],
};

const STUDENT_META = {
  classroomName: "ACCEL Cosmos",
  studentCode: "2025-AC-COS-008",
  childNumber: "01",
};

// ---------------------------------------------------------------------------
// Title builders
// ---------------------------------------------------------------------------

test("buildPlanDocTitle formats correctly", () => {
  const title = buildPlanDocTitle("Ruhi / Roohi", "2026-06");
  assert.equal(title, "Ruhi / Roohi | Monthly Plan | June 2026");
});

test("buildChecklistDocTitle formats correctly", () => {
  const title = buildChecklistDocTitle("Ruhi / Roohi", "2026-06");
  assert.equal(title, "Ruhi / Roohi | Task Checklist | June 2026");
});

test("formatMonthLabel converts YYYY-MM to Month YYYY", () => {
  assert.equal(formatMonthLabel("2026-06"), "June 2026");
  assert.equal(formatMonthLabel("2026-02"), "February 2026");
  assert.equal(formatMonthLabel("2026-12"), "December 2026");
});

// ---------------------------------------------------------------------------
// Detailed plan doc builder
// ---------------------------------------------------------------------------

test("buildDetailedPlanRequests returns non-empty array", () => {
  const requests = buildDetailedPlanRequests(SAMPLE_PLAN, STUDENT_META);
  assert.ok(Array.isArray(requests));
  assert.ok(requests.length > 0, "Expected non-empty request array");
});

test("buildDetailedPlanRequests includes student name in header", () => {
  const requests = buildDetailedPlanRequests(SAMPLE_PLAN, STUDENT_META);
  const textInserts = requests
    .filter((r) => r.insertText)
    .map((r) => r.insertText.text);
  const allText = textInserts.join("");
  assert.ok(allText.includes("Ruhi / Roohi"), "Should include student name");
});

test("buildDetailedPlanRequests includes classroom name in header", () => {
  const requests = buildDetailedPlanRequests(SAMPLE_PLAN, STUDENT_META);
  const allText = requests
    .filter((r) => r.insertText)
    .map((r) => r.insertText.text)
    .join("");
  assert.ok(allText.includes("ACCEL COSMOS"), "Should include classroom name in upper case");
});

test("buildDetailedPlanRequests includes data window meta line", () => {
  const requests = buildDetailedPlanRequests(SAMPLE_PLAN, STUDENT_META);
  const allText = requests
    .filter((r) => r.insertText)
    .map((r) => r.insertText.text)
    .join("");
  assert.ok(allText.includes("2026-02-06"), "Should include data window start");
  assert.ok(allText.includes("2026-05-20"), "Should include data window end");
  assert.ok(allText.includes("30"), "Should include observation count");
});

test("buildDetailedPlanRequests includes all 5 section headings", () => {
  const requests = buildDetailedPlanRequests(SAMPLE_PLAN, STUDENT_META);
  const allText = requests
    .filter((r) => r.insertText)
    .map((r) => r.insertText.text)
    .join("");
  for (const name of ["Language", "Sensorial", "Math", "Practical Life", "Grace & Courtesy"]) {
    assert.ok(allText.includes(name), `Should include section heading: ${name}`);
  }
});

test("buildDetailedPlanRequests includes RATIONALE block per section", () => {
  const requests = buildDetailedPlanRequests(SAMPLE_PLAN, STUDENT_META);
  const allText = requests
    .filter((r) => r.insertText)
    .map((r) => r.insertText.text)
    .join("");
  // Section rationale = position text
  assert.ok(
    allText.includes("Ruhi is in the early oral-language stage"),
    "Should include Language section rationale (position)",
  );
});

test("buildDetailedPlanRequests includes all 7 item fields per item", () => {
  const requests = buildDetailedPlanRequests(SAMPLE_PLAN, STUDENT_META);
  const allText = requests
    .filter((r) => r.insertText)
    .map((r) => r.insertText.text)
    .join("");

  // Check first Language item has all fields
  assert.ok(allText.includes("Re-present Sandpaper Letters"), "Should include work title");
  assert.ok(allText.includes("WHY"), "Should include WHY label");
  assert.ok(allText.includes("HOW TO OFFER"), "Should include HOW TO OFFER label");
  assert.ok(allText.includes("SUCCESS"), "Should include SUCCESS label (watch field)");
  assert.ok(allText.includes("NEXT"), "Should include NEXT label");
  assert.ok(allText.includes("HOOK"), "Should include HOOK label");
  assert.ok(allText.includes("BASIS"), "Should include BASIS label");
});

test("buildDetailedPlanRequests renders 25 numbered items (5 sections × 5 items)", () => {
  const requests = buildDetailedPlanRequests(SAMPLE_PLAN, STUDENT_META);
  const allText = requests
    .filter((r) => r.insertText)
    .map((r) => r.insertText.text)
    .join("");
  // Count numbered item prefixes: "1. ", "2. ", ..., "5. " appearing 5 times each
  const itemMatches = allText.match(/\d+\.\s+\S/g) || [];
  assert.ok(itemMatches.length >= 25, `Expected at least 25 numbered items, got ${itemMatches.length}`);
});

// ---------------------------------------------------------------------------
// Task checklist doc builder
// ---------------------------------------------------------------------------

test("buildChecklistRequests returns non-empty array", () => {
  const requests = buildChecklistRequests(SAMPLE_PLAN, STUDENT_META);
  assert.ok(Array.isArray(requests));
  assert.ok(requests.length > 0, "Expected non-empty request array");
});

test("buildChecklistRequests includes student name and Teacher Comments header", () => {
  const requests = buildChecklistRequests(SAMPLE_PLAN, STUDENT_META);
  const allText = requests
    .filter((r) => r.insertText)
    .map((r) => r.insertText.text)
    .join("");
  assert.ok(allText.includes("Ruhi / Roohi"), "Should include student name");
  assert.ok(allText.includes("Teacher Comments"), "Should include Teacher Comments column header");
});

test("buildChecklistRequests includes all 5 section names", () => {
  const requests = buildChecklistRequests(SAMPLE_PLAN, STUDENT_META);
  const allText = requests
    .filter((r) => r.insertText)
    .map((r) => r.insertText.text)
    .join("");
  for (const name of ["LANGUAGE", "SENSORIAL", "MATH", "PRACTICAL LIFE", "GRACE & COURTESY"]) {
    assert.ok(allText.includes(name), `Should include section name: ${name}`);
  }
});

test("buildChecklistRequests includes all work titles as checklist items", () => {
  const requests = buildChecklistRequests(SAMPLE_PLAN, STUDENT_META);
  const allText = requests
    .filter((r) => r.insertText)
    .map((r) => r.insertText.text)
    .join("");
  assert.ok(
    allText.includes("Re-present Sandpaper Letters"),
    "Should include first Language item work title",
  );
  assert.ok(
    allText.includes("Sensorial item 1"),
    "Should include first Sensorial item work title",
  );
});

test("buildChecklistRequests sets wide right margin for teacher notes", () => {
  const requests = buildChecklistRequests(SAMPLE_PLAN, STUDENT_META);
  const docStyles = requests.filter((r) => r.updateDocumentStyle);
  assert.ok(docStyles.length >= 1, "Should set document margins");
  const rightMargin = docStyles[0].updateDocumentStyle.documentStyle.marginRight;
  assert.ok(rightMargin.magnitude >= 180, "Right margin should be wide (>=180pt) for teacher notes");
});

test("buildChecklistRequests uses 8pt font size", () => {
  const requests = buildChecklistRequests(SAMPLE_PLAN, STUDENT_META);
  const textStyles = requests
    .filter((r) => r.updateTextStyle)
    .map((r) => r.updateTextStyle.textStyle);
  const fontSizes = textStyles
    .filter((s) => s.fontSize)
    .map((s) => s.fontSize.magnitude);
  // At least some text should be 8pt (checklist body text)
  assert.ok(fontSizes.includes(8), "Should use 8pt font size for checklist body text");
});

test("buildChecklistRequests has no footer text", () => {
  const requests = buildChecklistRequests(SAMPLE_PLAN, STUDENT_META);
  const allText = requests
    .filter((r) => r.insertText)
    .map((r) => r.insertText.text)
    .join("");
  assert.ok(
    !allText.includes("companion"),
    "Should not include footer referencing the detailed plan doc",
  );
});
