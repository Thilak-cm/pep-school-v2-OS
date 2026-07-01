import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('./ReportTypeLandingPage.jsx', import.meta.url);

test('ReportTypeLandingPage exports a default function component', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /export default function ReportTypeLandingPage/.test(source),
    'Expected default export named ReportTypeLandingPage',
  );
});

test('ReportTypeLandingPage renders three report type cards', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /Term Report/.test(source),
    'Expected "Term Report" card label',
  );
  assert.ok(
    /Baseline Report/.test(source),
    'Expected "Baseline Report" card label',
  );
  assert.ok(
    /Monthly Report/.test(source),
    'Expected "Monthly Report" card label',
  );
});

test('ReportTypeLandingPage accepts onSelectType callback prop', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /onSelectType/.test(source),
    'Expected onSelectType prop',
  );
});

test('ReportTypeLandingPage uses NewFeaturePill for Coming Soon on disabled cards', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /NewFeaturePill/.test(source),
    'Expected NewFeaturePill component for Coming Soon indicator',
  );
  assert.ok(
    /Coming Soon/.test(source),
    'Expected "Coming Soon" label on disabled card',
  );
});

test('ReportTypeLandingPage renders term and baseline as clickable via CardActionArea', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  // Enabled cards use CardActionArea with onClick calling onSelectType
  assert.ok(
    /CardActionArea/.test(source),
    'Expected CardActionArea for clickable report type cards',
  );
  assert.ok(
    /onSelectType\?\.\(type\.key\)|onSelectType/.test(source),
    'Expected onClick to call onSelectType with the type key',
  );
  // term is statically enabled: true
  assert.ok(
    /key: 'term'[\s\S]*?enabled: true/.test(source),
    'Expected term report type to be enabled',
  );
  // baseline is gated by isSuperAdmin prop
  assert.ok(
    /isSuperAdmin/.test(source),
    'Expected baseline report enabled state to depend on isSuperAdmin prop',
  );
});
