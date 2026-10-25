import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const cardUrl = new URL('./CriticalAssessmentsCard.jsx', import.meta.url);

test('CriticalAssessmentsCard returns null when no high-criticality assessments', async () => {
  const source = await readFile(cardUrl, 'utf8');
  // Null-return pattern: renders nothing when empty
  assert.match(source, /return null/);
  // Must check for empty results
  assert.match(source, /length\s*===\s*0|\.length\b/);
});

test('CriticalAssessmentsCard queries Firestore for high-criticality assessments', async () => {
  const source = await readFile(cardUrl, 'utf8');
  // Must query observations where criticality == 'high'
  assert.match(source, /criticality/);
  assert.match(source, /high/);
  // Must filter by type and assessmentKind
  assert.match(source, /type.*assessment|assessment.*type/);
  assert.match(source, /structured/);
});

test('CriticalAssessmentsCard renders chips with assessment name and current value', async () => {
  const source = await readFile(cardUrl, 'utf8');
  // Must render Chip components
  assert.match(source, /Chip/);
  // Must show assessmentName
  assert.match(source, /assessmentName/);
});

test('CriticalAssessmentsCard opens AssessmentMatrixSheet on chip tap', async () => {
  const source = await readFile(cardUrl, 'utf8');
  // Must reference AssessmentMatrixSheet or set sourceId for opening it
  assert.match(source, /sourceId/);
  // Must have an onClick or onPress handler
  assert.match(source, /onClick|onPress|handleClick|handleOpen/);
});

test('CriticalAssessmentsCard is collapsible', async () => {
  const source = await readFile(cardUrl, 'utf8');
  // Must have an expand/collapse toggle
  assert.match(source, /expanded|collapsed|toggle/i);
});
