import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..', '..', '..');

const timelinePath = resolve(__dirname, 'ClassroomTimeline.jsx');
const indexesPath = resolve(rootDir, 'firestore.indexes.json');
const noteCardPath = resolve(__dirname, 'ClassroomNoteCard.jsx');
const groupedCardPath = resolve(__dirname, 'GroupedNoteCard.jsx');

// ──────────────────────────────────────────────
// Firestore Indexes (PEP-333)
// ──────────────────────────────────────────────

describe('Firestore composite indexes for classroomId queries (PEP-333)', () => {
  let indexes;

  it('firestore.indexes.json parses correctly', async () => {
    const raw = await readFile(indexesPath, 'utf8');
    indexes = JSON.parse(raw);
    assert.ok(indexes.indexes, 'should have indexes array');
  });

  it('has classroomId + observedAt composite index for observations collection group', async () => {
    const raw = await readFile(indexesPath, 'utf8');
    indexes = JSON.parse(raw);
    const match = indexes.indexes.find(
      (idx) =>
        idx.collectionGroup === 'observations' &&
        idx.queryScope === 'COLLECTION_GROUP' &&
        idx.fields.some((f) => f.fieldPath === 'classroomId') &&
        idx.fields.some((f) => f.fieldPath === 'observedAt' && f.order === 'DESCENDING'),
    );
    assert.ok(match, 'composite index classroomId + observedAt DESC should exist for observations');
  });

  it('has classroomId + observedAt composite index for media collection group', async () => {
    const raw = await readFile(indexesPath, 'utf8');
    indexes = JSON.parse(raw);
    const match = indexes.indexes.find(
      (idx) =>
        idx.collectionGroup === 'media' &&
        idx.queryScope === 'COLLECTION_GROUP' &&
        idx.fields.some((f) => f.fieldPath === 'classroomId') &&
        idx.fields.some((f) => f.fieldPath === 'observedAt' && f.order === 'DESCENDING'),
    );
    assert.ok(match, 'composite index classroomId + observedAt DESC should exist for media');
  });

  it('has classroomId field override for media collection group', async () => {
    const raw = await readFile(indexesPath, 'utf8');
    indexes = JSON.parse(raw);
    const match = indexes.fieldOverrides.find(
      (fo) => fo.collectionGroup === 'media' && fo.fieldPath === 'classroomId',
    );
    assert.ok(match, 'classroomId field override should exist for media collection group');
    const hasCollGroupScope = match.indexes.some((i) => i.queryScope === 'COLLECTION_GROUP');
    assert.ok(hasCollGroupScope, 'media classroomId override should have COLLECTION_GROUP scope');
  });
});

// ──────────────────────────────────────────────
// ClassroomTimeline query architecture (PEP-333)
// ──────────────────────────────────────────────

describe('ClassroomTimeline uses classroomId-based queries (PEP-333)', () => {
  let source;

  it('loads ClassroomTimeline source', async () => {
    source = await readFile(timelinePath, 'utf8');
    assert.ok(source.length > 0);
  });

  it('queries observations by classroomId (not batched studentId)', async () => {
    source = source || (await readFile(timelinePath, 'utf8'));
    // Should have a where clause filtering by classroomId for observations
    assert.ok(
      /where\([^)]*['"]classroomId['"]/.test(source),
      'should query observations using where(classroomId)',
    );
  });

  it('does not use batched studentId in-queries for observation fetching', async () => {
    source = source || (await readFile(timelinePath, 'utf8'));
    // The old pattern: where('studentId', 'in', batch) inside fetchNotes
    // Should NOT appear in the observations query path
    // (studentId 'in' queries may still exist for other purposes like student note counts,
    //  but batchCursorsRef should be gone)
    assert.ok(
      !/batchCursorsRef/.test(source),
      'batchCursorsRef should be removed (no per-batch cursor tracking)',
    );
    assert.ok(
      !/exhaustedBatchesRef/.test(source),
      'exhaustedBatchesRef should be removed (no per-batch exhaustion tracking)',
    );
  });

  it('uses single-cursor pagination (lastDocRef or equivalent)', async () => {
    source = source || (await readFile(timelinePath, 'utf8'));
    // Should have a single cursor ref, not a Map of cursors
    assert.ok(
      /lastDoc|cursorRef|paginationCursor/.test(source),
      'should use a single cursor ref for pagination',
    );
  });

  it('sets up onSnapshot on observations query (not students collection)', async () => {
    source = source || (await readFile(timelinePath, 'utf8'));
    // onSnapshot should be on an observations/media query, not on studentsQuery
    assert.ok(
      !/onSnapshot\(studentsQuery/.test(source),
      'should NOT have onSnapshot on studentsQuery',
    );
    assert.ok(
      /onSnapshot\(/.test(source),
      'should still use onSnapshot for real-time updates',
    );
  });
});

// ──────────────────────────────────────────────
// Transferred student chip (PEP-333)
// ──────────────────────────────────────────────

describe('Transferred student chip in note cards (PEP-333)', () => {
  it('ClassroomNoteCard references transferred student indicator', async () => {
    const source = await readFile(noteCardPath, 'utf8');
    assert.ok(
      /[Tt]ransferred/.test(source),
      'ClassroomNoteCard should reference "Transferred" for students no longer in classroom',
    );
  });

  it('GroupedNoteCard references transferred student indicator', async () => {
    const source = await readFile(groupedCardPath, 'utf8');
    assert.ok(
      /[Tt]ransferred/.test(source),
      'GroupedNoteCard should reference "Transferred" for students no longer in classroom',
    );
  });
});
