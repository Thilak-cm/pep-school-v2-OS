import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Source-pattern tests (repo convention for component files - no render tests).
const sourceUrl = new URL('./StudentMatchReview.jsx', import.meta.url);

test('StudentMatchReview sorts rows none -> review -> auto', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /\[ZONE\.NONE\]:\s*0[\s\S]{0,60}\[ZONE\.REVIEW\]:\s*1[\s\S]{0,60}\[ZONE\.AUTO\]:\s*2/.test(source),
    'Expected zone sort order none(0) < review(1) < auto(2)',
  );
});

test('StudentMatchReview uses a bottom-sheet Drawer picker', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(/anchor="bottom"/.test(source), 'Expected Drawer anchored to bottom');
  assert.ok(/fuzzySearchStudents/.test(source), 'Expected picker search via fuzzySearchStudents');
});

test('StudentMatchReview offers a search-all-classrooms toggle', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(/searchAll/.test(source) && /Search all classrooms/.test(source));
  assert.ok(/searchAll\s*\?\s*fullPool\s*:\s*pool/.test(source), 'Toggle must widen scope from pool to fullPool');
});

test('StudentMatchReview has no bulk-accept or reject affordances', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(!/Accept All/i.test(source), 'Accept All button must not exist');
  assert.ok(!/reject/i.test(source), 'Reject/skip action must not exist');
});

test('StudentMatchReview shows classroom labels only for multi-classroom scopes', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(/spansMultipleClassrooms/.test(source));
  assert.ok(/showClassroomsInCards\s*\?/.test(source) && /showClassroomsInPicker\s*\?/.test(source));
});

test('StudentMatchReview surfaces duplicate-selection warnings', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(/duplicateIds/.test(source), 'Expected duplicate selection detection');
  assert.ok(/Another name is also matched/.test(source), 'Expected per-row duplicate warning copy');
});

test('StudentMatchReview is controlled: no data fetching, no pool filtering', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(!/firebase|firestore|getDocs|collection\(/.test(source), 'Component must not fetch data');
  assert.ok(/onSelect\(/.test(source), 'Selections must flow through the onSelect callback');
});
