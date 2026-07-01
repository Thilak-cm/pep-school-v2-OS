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
  computePerStudentCounts,
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

describe('computePerStudentCounts', () => {
  it('counts notes per student correctly', () => {
    const notes = [
      { id: 'n1', studentId: 's1', type: 'voice', observedAt: ts('2026-06-25T10:00:00Z') },
      { id: 'n2', studentId: 's1', type: 'lesson', observedAt: ts('2026-06-24T10:00:00Z') },
      { id: 'n3', studentId: 's2', type: 'text', observedAt: ts('2026-06-23T10:00:00Z') },
      { id: 'n4', studentId: 's1', type: 'media', observedAt: ts('2026-06-10T10:00:00Z') },
    ];

    const counts = computePerStudentCounts(notes);
    assert.equal(counts.get('s1').totalNotes, 3);
    assert.equal(counts.get('s2').totalNotes, 1);
  });

  it('computes notesLast7Days based on observedAt', () => {
    const now = new Date('2026-06-26T12:00:00Z');
    const notes = [
      { id: 'n1', studentId: 's1', type: 'voice', observedAt: ts('2026-06-25T10:00:00Z') }, // within 7d
      { id: 'n2', studentId: 's1', type: 'text', observedAt: ts('2026-06-10T10:00:00Z') },  // outside 7d
      { id: 'n3', studentId: 's1', type: 'lesson', observedAt: ts('2026-06-22T10:00:00Z') }, // within 7d
    ];

    const counts = computePerStudentCounts(notes, now);
    assert.equal(counts.get('s1').totalNotes, 3);
    assert.equal(counts.get('s1').notesLast7Days, 2);
  });

  it('returns empty map for empty notes array', () => {
    const counts = computePerStudentCounts([]);
    assert.equal(counts.size, 0);
  });

  it('excludes report type from note counts', () => {
    const notes = [
      { id: 'n1', studentId: 's1', type: 'voice', observedAt: ts('2026-06-25T10:00:00Z') },
      { id: 'r1', studentId: 's1', type: 'report', observedAt: ts('2026-06-25T10:00:00Z') },
    ];

    const counts = computePerStudentCounts(notes);
    assert.equal(counts.get('s1').totalNotes, 1, 'reports should not count toward totalNotes');
  });
});

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

  it('imports pure helpers from timelineDataHelpers', async () => {
    hookSource = hookSource || await readFile(hookPath, 'utf8');
    assert.ok(
      hookSource.includes("from './timelineDataHelpers.js'"),
      'should import from timelineDataHelpers.js'
    );
  });

  it('helpers file exports mergeAndDedupe', async () => {
    const helpers = await readFile(helpersPath, 'utf8');
    assert.ok(helpers.includes('export function mergeAndDedupe'), 'should export mergeAndDedupe');
  });

  it('helpers file exports computePerStudentCounts', async () => {
    const helpers = await readFile(helpersPath, 'utf8');
    assert.ok(helpers.includes('export function computePerStudentCounts'), 'should export computePerStudentCounts');
  });

  it('helpers file exports checkClassroomAccess', async () => {
    const helpers = await readFile(helpersPath, 'utf8');
    assert.ok(helpers.includes('export function checkClassroomAccess'), 'should export checkClassroomAccess');
  });

  it('uses getDocs not onSnapshot', async () => {
    hookSource = hookSource || await readFile(hookPath, 'utf8');
    assert.ok(hookSource.includes('getDocs'), 'should import getDocs');
    // Check import line specifically — comments mentioning onSnapshot are fine
    const importLines = hookSource.split('\n').filter(l => l.includes('import') && l.includes('firebase/firestore'));
    const importsOnSnapshot = importLines.some(l => l.includes('onSnapshot'));
    assert.ok(!importsOnSnapshot, 'should NOT import onSnapshot from firebase/firestore');
  });

  it('does not import or use limit for query-level pagination', async () => {
    hookSource = hookSource || await readFile(hookPath, 'utf8');
    // Should not import limit from firebase (UI-only pagination via displayLimit)
    const firebaseImportLine = hookSource.split('\n').find(l =>
      l.includes('from \'firebase/firestore\'') || l.includes('from "firebase/firestore"')
    );
    if (firebaseImportLine) {
      assert.ok(!firebaseImportLine.includes(' limit'), 'should not import limit from firebase/firestore');
    }
  });

  it('exposes injectNote function for post-save insertion', async () => {
    hookSource = hookSource || await readFile(hookPath, 'utf8');
    assert.ok(hookSource.includes('injectNote'), 'should expose injectNote');
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

  it('media rule uses classroomId-based teacher path', async () => {
    rules = rules || await readFile(rulesPath, 'utf8');
    const mediaSection = rules.split('match /{path=**}/media/{mediaId}')[1]?.split('match /')[0] || '';
    assert.ok(
      mediaSection.includes("isTeacherInClassroom(resource.data.classroomId)"),
      'media collectionGroup should have classroomId-based teacher path'
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

  it('uses classroom.studentCount for count display, not computed length', async () => {
    timelineSource = timelineSource || await readFile(timelinePath, 'utf8');
    assert.ok(
      timelineSource.includes('classroom.studentCount'),
      'should use classroom.studentCount for the student count display'
    );
    // The old pattern — sortedFilteredStudents.length used as count label — should be gone
    assert.ok(
      !timelineSource.includes('sortedFilteredStudents.length} students'),
      'should NOT use sortedFilteredStudents.length as the student count label'
    );
    // Notes tab search branch should use filteredStudents (includes transferred) not sortedFilteredStudents
    assert.ok(
      timelineSource.includes('filteredStudents.length'),
      'Notes tab search branch should use filteredStudents.length (includes transferred students in count)'
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
