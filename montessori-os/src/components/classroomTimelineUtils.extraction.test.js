import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const typeIconPath = new URL('./ui/TypeIcon.jsx', import.meta.url);
const classroomCardPath = new URL('./ClassroomNoteCard.jsx', import.meta.url);
const groupedCardPath = new URL('./GroupedNoteCard.jsx', import.meta.url);
const studentTimelinePath = new URL('./StudentTimeline.jsx', import.meta.url);

describe('TypeIcon extraction to ui/TypeIcon.jsx', () => {
  it('ui/TypeIcon.jsx defines TypeIcon component with TONE_STYLES and TYPE_ICONS', async () => {
    const source = await readFile(typeIconPath, 'utf8');
    assert.ok(/export\s+default\s+function\s+TypeIcon/.test(source), 'TypeIcon should be default-exported');
    assert.ok(/const\s+TONE_STYLES/.test(source), 'TONE_STYLES should be defined');
    assert.ok(/const\s+TYPE_ICONS/.test(source), 'TYPE_ICONS should be defined');
  });

  it('ClassroomNoteCard imports TypeIcon from ui, does not define locally', async () => {
    const source = await readFile(classroomCardPath, 'utf8');
    assert.ok(
      /import\s+\{[^}]*TypeIcon[^}]*\}\s+from\s+['"]\.\/ui['"]/.test(source),
      'ClassroomNoteCard should import TypeIcon from ./ui',
    );
    assert.ok(
      !/^function\s+TypeIcon/m.test(source),
      'ClassroomNoteCard should not define TypeIcon locally',
    );
    assert.ok(
      !/^const\s+TONE_STYLES/m.test(source),
      'ClassroomNoteCard should not define TONE_STYLES locally',
    );
  });

  it('GroupedNoteCard imports TypeIcon from ui, does not define locally', async () => {
    const source = await readFile(groupedCardPath, 'utf8');
    assert.ok(
      /import\s+\{[^}]*TypeIcon[^}]*\}\s+from\s+['"]\.\/ui['"]/.test(source),
      'GroupedNoteCard should import TypeIcon from ./ui',
    );
    assert.ok(
      !/^function\s+TypeIcon/m.test(source),
      'GroupedNoteCard should not define TypeIcon locally',
    );
    assert.ok(
      !/^const\s+TONE_STYLES/m.test(source),
      'GroupedNoteCard should not define TONE_STYLES locally',
    );
  });
});

describe('ClassroomNoteCard variant="student" support', () => {
  it('ClassroomNoteCard accepts a variant prop', async () => {
    const source = await readFile(classroomCardPath, 'utf8');
    assert.ok(/variant/.test(source), 'ClassroomNoteCard should reference variant prop');
  });
});

describe('StudentTimeline uses day-grouped rendering', () => {
  it('imports groupByCalendarDay and DayHeader', async () => {
    const source = await readFile(studentTimelinePath, 'utf8');
    assert.ok(
      /groupByCalendarDay/.test(source),
      'StudentTimeline should import groupByCalendarDay',
    );
    assert.ok(
      /DayHeader/.test(source),
      'StudentTimeline should import DayHeader',
    );
  });

  it('no longer uses 3-bucket time grouping', async () => {
    const source = await readFile(studentTimelinePath, 'utf8');
    assert.ok(
      !/['"]Last 7 Days['"]/.test(source),
      'StudentTimeline should not contain "Last 7 Days" bucket label',
    );
    assert.ok(
      !/['"]Beyond 7 Days['"]/.test(source),
      'StudentTimeline should not contain "Beyond 7 Days" bucket label',
    );
  });

  it('uses ClassroomNoteCard with variant="student"', async () => {
    const source = await readFile(studentTimelinePath, 'utf8');
    assert.ok(
      /ClassroomNoteCard/.test(source),
      'StudentTimeline should use ClassroomNoteCard',
    );
    assert.ok(
      /variant\s*=\s*["']student["']/.test(source),
      'StudentTimeline should pass variant="student" to ClassroomNoteCard',
    );
  });

  it('uses simplified media card (no horizontal thumbnail strip)', async () => {
    const source = await readFile(studentTimelinePath, 'utf8');
    assert.ok(
      !/scrollSnapType/.test(source),
      'StudentTimeline should not contain scrollSnapType (old thumbnail strip)',
    );
    assert.ok(
      !/Swipe to browse/.test(source),
      'StudentTimeline should not contain "Swipe to browse" text',
    );
  });
});
