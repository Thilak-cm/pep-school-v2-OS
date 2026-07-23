import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hookPath = resolve(__dirname, 'useTimelineData.js');
const helpersPath = resolve(__dirname, 'timelineDataHelpers.js');
const rootDir = resolve(__dirname, '..', '..', '..');
const indexesPath = resolve(rootDir, 'firestore.indexes.json');
const rulesPath = resolve(rootDir, 'firestore.rules');

// Helper: create a fake Firestore-like timestamp
const ts = (dateStr) => {
  const d = new Date(dateStr);
  return { seconds: Math.floor(d.getTime() / 1000), toDate: () => d };
};

// ──────────────────────────────────────────────
// Pure logic: mergeAndDedupe, computePerStudentCounts
// ──────────────────────────────────────────────

import {
  mergeAndDedupe,
  checkClassroomAccess,
} from './timelineDataHelpers.js';

describe('mergeAndDedupe', () => {
  it('merges multiple arrays and removes duplicates by id', () => {
    const obs = [
      { id: 'obs1', type: 'voice', observedAt: ts('2026-06-20T10:00:00Z'), studentId: 's1' },
      { id: 'obs2', type: 'text', observedAt: ts('2026-06-19T10:00:00Z'), studentId: 's2' },
    ];
    const media = [
      { id: 'med1', type: 'media', observedAt: ts('2026-06-21T10:00:00Z'), studentId: 's1' },
    ];
    const reports = [
      { id: 'report_1', type: 'report', observedAt: ts('2026-06-18T10:00:00Z'), studentId: 's1' },
    ];

    const result = mergeAndDedupe(obs, media, reports);
    assert.equal(result.length, 4);
    // Should be sorted newest first
    assert.equal(result[0].id, 'med1');
    assert.equal(result[3].id, 'report_1');
  });

  it('deduplicates by id when same doc appears in multiple arrays', () => {
    const obs = [
      { id: 'obs1', type: 'voice', observedAt: ts('2026-06-20T10:00:00Z'), studentId: 's1' },
    ];
    const duplicate = [
      { id: 'obs1', type: 'voice', observedAt: ts('2026-06-20T10:00:00Z'), studentId: 's1' },
    ];

    const result = mergeAndDedupe(obs, duplicate, []);
    assert.equal(result.length, 1);
  });

  it('returns empty array for empty inputs', () => {
    const result = mergeAndDedupe([], [], []);
    assert.deepStrictEqual(result, []);
  });

  it('handles items with Firestore Timestamp objects', () => {
    const obs = [
      { id: 'obs1', type: 'voice', observedAt: ts('2026-06-20T10:00:00Z'), studentId: 's1' },
      { id: 'obs2', type: 'text', observedAt: ts('2026-06-22T10:00:00Z'), studentId: 's2' },
    ];

    const result = mergeAndDedupe(obs, [], []);
    // Newest first
    assert.equal(result[0].id, 'obs2');
    assert.equal(result[1].id, 'obs1');
  });
});

// computePerStudentCounts tests removed in #221 Sprint 2 — function deleted,
// stats now come from statsCache via useTimelineStats.

describe('checkClassroomAccess', () => {
  it('grants access to superadmin for any classroom', () => {
    assert.equal(checkClassroomAccess('superadmin', [], 'amazing'), true);
  });

  it('grants access to classroomadmin with matching classroom', () => {
    assert.equal(checkClassroomAccess('classroomadmin', ['amazing', 'power'], 'amazing'), true);
  });

  it('denies access to classroomadmin without matching classroom', () => {
    assert.equal(checkClassroomAccess('classroomadmin', ['power'], 'amazing'), false);
  });

  it('grants access to teacher (no scoping needed)', () => {
    assert.equal(checkClassroomAccess('teacher', [], 'amazing'), true);
  });

  it('grants access to teacher even without manageableClassrooms', () => {
    assert.equal(checkClassroomAccess('teacher', undefined, 'amazing'), true);
  });
});

// ──────────────────────────────────────────────
// Structural: hook file exists and exports correctly
// ──────────────────────────────────────────────

describe('useTimelineData hook structure', () => {
  let hookSource;

  it('hook file exists and is readable', async () => {
    hookSource = await readFile(hookPath, 'utf8');
    assert.ok(hookSource.length > 0);
  });

  it('exports default useTimelineData function', async () => {
    hookSource = hookSource || await readFile(hookPath, 'utf8');
    assert.ok(
      hookSource.includes('export default function useTimelineData'),
      'should export default useTimelineData'
    );
  });

  it('helpers file exports checkClassroomAccess', async () => {
    const helpers = await readFile(helpersPath, 'utf8');
    assert.ok(helpers.includes('export function checkClassroomAccess'), 'should export checkClassroomAccess');
  });

  it('uses getDocs not onSnapshot', async () => {
    hookSource = hookSource || await readFile(hookPath, 'utf8');
    assert.ok(hookSource.includes('getDocs'), 'should import getDocs');
    const importLines = hookSource.split('\n').filter(l => l.includes('import') && l.includes('firebase/firestore'));
    const importsOnSnapshot = importLines.some(l => l.includes('onSnapshot'));
    assert.ok(!importsOnSnapshot, 'should NOT import onSnapshot from firebase/firestore');
  });

  it('imports limit and startAfter for cursor-based pagination (#221)', async () => {
    hookSource = hookSource || await readFile(hookPath, 'utf8');
    // Multi-line import: find the full import block by extracting between 'import {' and 'firebase/firestore'
    const importMatch = hookSource.match(/import\s*\{([^}]+)\}\s*from\s*['"]firebase\/firestore['"]/s);
    assert.ok(importMatch, 'should have firebase/firestore import');
    const importedSymbols = importMatch[1];
    assert.ok(importedSymbols.includes('limit'), 'should import limit');
    assert.ok(importedSymbols.includes('startAfter'), 'should import startAfter');
  });

  it('exposes loadMore and hasMore for cursor pagination (#221)', async () => {
    hookSource = hookSource || await readFile(hookPath, 'utf8');
    assert.ok(hookSource.includes('loadMore'), 'should expose loadMore');
    assert.ok(hookSource.includes('hasMore'), 'should expose hasMore');
  });

  it('exposes refresh and refreshing (#221)', async () => {
    hookSource = hookSource || await readFile(hookPath, 'utf8');
    assert.ok(hookSource.includes('refresh'), 'should expose refresh');
    assert.ok(hookSource.includes('refreshing'), 'should expose refreshing');
  });

  it('does not expose injectNote (#221 - removed)', async () => {
    hookSource = hookSource || await readFile(hookPath, 'utf8');
    assert.ok(!hookSource.includes('injectNote'), 'should not expose injectNote');
  });

  it('does not expose displayLimit or showMore (#221 - replaced by loadMore)', async () => {
    hookSource = hookSource || await readFile(hookPath, 'utf8');
    assert.ok(!hookSource.includes('displayLimit'), 'should not expose displayLimit');
    assert.ok(!hookSource.includes('showMore'), 'should not expose showMore');
  });

  it('does not fetch ai_summaries (#221 - reports dropped from timeline)', async () => {
    hookSource = hookSource || await readFile(hookPath, 'utf8');
    // Check for actual code usage (collectionGroup/collection calls), not comments
    const codeLines = hookSource.split('\n').filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('//'));
    const hasAiSummariesCode = codeLines.some(l => l.includes("'ai_summaries'") || l.includes('"ai_summaries"'));
    assert.ok(!hasAiSummariesCode, 'should not fetch ai_summaries in code');
    assert.ok(!hookSource.includes('normalizeReportDoc'), 'should not have normalizeReportDoc');
  });

  it('does not import computePerStudentCounts (#221 - stats from statsCache)', async () => {
    hookSource = hookSource || await readFile(hookPath, 'utf8');
    assert.ok(!hookSource.includes('computePerStudentCounts'), 'should not import computePerStudentCounts');
  });
});

// ──────────────────────────────────────────────
// Structural: Firestore indexes for ai_summaries
// ──────────────────────────────────────────────

describe('Firestore indexes for ai_summaries collectionGroup', () => {
  it('has classroomId + generatedAt composite index', async () => {
    const raw = await readFile(indexesPath, 'utf8');
    const indexes = JSON.parse(raw);
    const match = indexes.indexes.find(
      (idx) =>
        idx.collectionGroup === 'ai_summaries' &&
        idx.queryScope === 'COLLECTION_GROUP' &&
        idx.fields.some((f) => f.fieldPath === 'classroomId') &&
        idx.fields.some((f) => f.fieldPath === 'generatedAt' && f.order === 'DESCENDING'),
    );
    assert.ok(match, 'composite index classroomId + generatedAt DESC should exist for ai_summaries');
  });
});

// ──────────────────────────────────────────────
// Structural: Firestore rules for teacher collectionGroup access
// ──────────────────────────────────────────────

describe('Firestore collectionGroup rules for teacher access', () => {
  let rules;

  it('observations rule uses classroomId-based teacher path', async () => {
    rules = await readFile(rulesPath, 'utf8');
    assert.ok(
      rules.includes("(isTeacher() && ('classroomId' in resource.data) && isTeacherInClassroom(resource.data.classroomId))"),
      'observations collectionGroup should have classroomId-based teacher path'
    );
  });

  it('observations rule does NOT have studentClassroomId fallback for teachers', async () => {
    rules = rules || await readFile(rulesPath, 'utf8');
    // The old pattern: isTeacherInClassroom(studentClassroomId(resource.data.studentId))
    // should not appear in the observations collectionGroup rule
    const obsRuleSection = rules.split('match /{path=**}/observations/{observationId}')[1]?.split('match /')[0] || '';
    assert.ok(
      !obsRuleSection.includes('isTeacherInClassroom(studentClassroomId(resource.data.studentId))'),
      'observations collectionGroup should NOT have expensive studentClassroomId fallback for teachers'
    );
  });

  it('no separate media collection group rule (#221 - merged into observations)', async () => {
    rules = rules || await readFile(rulesPath, 'utf8');
    assert.ok(
      !rules.includes('match /{path=**}/media/{mediaId}'),
      'media collection group rule should not exist - media docs covered by observations rule'
    );
  });
});

// ──────────────────────────────────────────────
// #151: Student count consistency — ClassroomTimeline
// ──────────────────────────────────────────────

const timelinePath = resolve(__dirname, '..', 'components', 'ClassroomTimeline.jsx');

describe('ClassroomTimeline student count display (#151)', () => {
  let timelineSource;

  it('loads ClassroomTimeline source', async () => {
    timelineSource = await readFile(timelinePath, 'utf8');
    assert.ok(timelineSource.length > 0);
  });

  it('uses statsCache for student count, with classroomStudents.length as fallback (#221)', async () => {
    timelineSource = timelineSource || await readFile(timelinePath, 'utf8');
    // #221: Students tab header uses statsCacheStudentCount with classroomStudents.length fallback
    assert.ok(
      timelineSource.includes('statsCacheStudentCount'),
      'should use statsCacheStudentCount from statsCache for student count display'
    );
    assert.ok(
      timelineSource.includes('classroomStudents.length'),
      'should fall back to classroomStudents.length when statsCache unavailable'
    );
    // The stale pattern - classroom.studentCount from cached prop - should be gone
    assert.ok(
      !timelineSource.includes('classroom.studentCount'),
      'should NOT use classroom.studentCount (stale cache) for count display'
    );
  });

  it('filters transferred students out of the Students tab card list', async () => {
    timelineSource = timelineSource || await readFile(timelinePath, 'utf8');
    // sortedFilteredStudents should exclude transferred students
    assert.ok(
      timelineSource.includes('isTransferred'),
      'should reference isTransferred to filter transferred students from the list'
    );
  });
});

// ──────────────────────────────────────────────
// #221: Media merged into observations — no separate media subcollection
// ──────────────────────────────────────────────

const noteBottomSheetPath = resolve(__dirname, '..', 'components', 'noteBottomSheet', 'NoteBottomSheet.jsx');
const useMediaPreviewPath = resolve(__dirname, '..', 'components', 'noteBottomSheet', 'useMediaPreview.js');
const addNoteModalPath = resolve(__dirname, '..', 'components', 'AddNoteModal.jsx');
const saveQueuePath = resolve(__dirname, '..', 'services', 'saveQueue.js');
const studentDashboardPath = resolve(__dirname, '..', 'components', 'StudentDashboard.jsx');
const settingsPagePath = resolve(__dirname, '..', 'components', 'SettingsPage.jsx');
const storageRulesPath = resolve(rootDir, 'storage.rules');

describe('Media merged into observations (#221)', () => {
  it('useTimelineData does not query the media subcollection', async () => {
    const src = await readFile(hookPath, 'utf8');
    assert.ok(
      !src.includes("collectionGroup(db, 'media')"),
      'should not have collectionGroup media query'
    );
    assert.ok(
      !src.includes("'media'),"),
      'should not reference media subcollection in collection() calls'
    );
  });

  it('NoteBottomSheet does not branch on media subcollection for delete/reassign', async () => {
    const src = await readFile(noteBottomSheetPath, 'utf8');
    assert.ok(
      !src.includes("? 'media' : 'observations'"),
      'should not branch between media and observations subcollections'
    );
    assert.ok(
      !src.includes("'media' : 'observations'"),
      'should not have ternary picking media vs observations'
    );
  });

  it('useMediaPreview writes to observations subcollection', async () => {
    const src = await readFile(useMediaPreviewPath, 'utf8');
    assert.ok(
      !src.includes("'media', observation.id"),
      'should not reference media subcollection for comment edits'
    );
  });

  it('AddNoteModal writes media to observations subcollection', async () => {
    const src = await readFile(addNoteModalPath, 'utf8');
    // Check that media doc writes go to observations, not media subcollection
    const lines = src.split('\n');
    const mediaDocLines = lines.filter(l =>
      l.includes("'media', mediaId") && l.includes('doc(')
    );
    assert.equal(
      mediaDocLines.length, 0,
      'should not write media docs to media subcollection (should use observations)'
    );
  });

  it('saveQueue writes media to observations subcollection', async () => {
    const src = await readFile(saveQueuePath, 'utf8');
    const lines = src.split('\n');
    const mediaDocLines = lines.filter(l =>
      l.includes("'media', mediaId") && l.includes('doc(')
    );
    assert.equal(
      mediaDocLines.length, 0,
      'should not write media docs to media subcollection (should use observations)'
    );
  });

  it('StudentDashboard reads media from observations subcollection', async () => {
    const src = await readFile(studentDashboardPath, 'utf8');
    assert.ok(
      !src.includes("studentId, 'media'"),
      'should not query media subcollection directly'
    );
  });

  it('SettingsPage reads media from observations collection group', async () => {
    const src = await readFile(settingsPagePath, 'utf8');
    assert.ok(
      !src.includes("collectionGroup(db, 'media')"),
      'should not query media collection group'
    );
  });

  it('NoteBottomSheet does not expose onNotesChanged prop', async () => {
    const src = await readFile(noteBottomSheetPath, 'utf8');
    assert.ok(
      !src.includes('onNotesChanged'),
      'onNotesChanged prop should be removed'
    );
  });

  it('storage.rules mediaDoc() reads from observations subcollection', async () => {
    const src = await readFile(storageRulesPath, 'utf8');
    assert.ok(
      src.includes('students/$(studentId)/observations/$(mediaId)'),
      'mediaDoc() should read from observations subcollection'
    );
    assert.ok(
      !src.includes('students/$(studentId)/media/$(mediaId)'),
      'mediaDoc() should NOT read from media subcollection'
    );
  });
});

// ──────────────────────────────────────────────
// #221 Sprint 2: Inject wiring fully removed
// ──────────────────────────────────────────────

const appPath = resolve(__dirname, '..', 'App.jsx');
const screenRendererPath = resolve(__dirname, '..', 'ScreenRenderer.jsx');

describe('Inject wiring removed (#221 Sprint 2)', () => {
  it('App.jsx does not contain timelineInjectRef', async () => {
    const src = await readFile(appPath, 'utf8');
    assert.ok(!src.includes('timelineInjectRef'), 'timelineInjectRef should be removed from App.jsx');
  });

  it('App.jsx does not contain onTimelineInjectReady', async () => {
    const src = await readFile(appPath, 'utf8');
    assert.ok(!src.includes('onTimelineInjectReady'), 'onTimelineInjectReady should be removed from App.jsx');
  });

  it('ScreenRenderer does not forward onInjectReady', async () => {
    const src = await readFile(screenRendererPath, 'utf8');
    assert.ok(!src.includes('onInjectReady'), 'onInjectReady should be removed from ScreenRenderer.jsx');
  });

  it('ClassroomTimeline does not accept onInjectReady', async () => {
    const src = await readFile(timelinePath, 'utf8');
    assert.ok(!src.includes('onInjectReady'), 'onInjectReady should be removed from ClassroomTimeline');
  });

  it('StudentTimeline does not accept onInjectReady', async () => {
    const studentTimelinePath = resolve(__dirname, '..', 'components', 'StudentTimeline.jsx');
    const src = await readFile(studentTimelinePath, 'utf8');
    assert.ok(!src.includes('onInjectReady'), 'onInjectReady should be removed from StudentTimeline');
  });
});
