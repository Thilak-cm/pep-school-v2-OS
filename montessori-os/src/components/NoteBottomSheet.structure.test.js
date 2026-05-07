import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { access, constants } from 'node:fs/promises';

const containerPath = new URL('./noteBottomSheet/NoteBottomSheet.jsx', import.meta.url);
const sharedHeaderPath = new URL('./noteBottomSheet/SharedHeader.jsx', import.meta.url);
const voiceContentPath = new URL('./noteBottomSheet/VoiceContent.jsx', import.meta.url);
const lessonContentPath = new URL('./noteBottomSheet/LessonContent.jsx', import.meta.url);
const mediaContentPath = new URL('./noteBottomSheet/MediaContent.jsx', import.meta.url);
const actionButtonsPath = new URL('./noteBottomSheet/ActionButtons.jsx', import.meta.url);
const studentTimelinePath = new URL('./StudentTimeline.jsx', import.meta.url);
const classroomTimelinePath = new URL('./ClassroomTimeline.jsx', import.meta.url);

describe('NoteBottomSheet container', () => {
  it('exports a default function component', async () => {
    const source = await readFile(containerPath, 'utf8');
    assert.ok(
      /export\s+default\s+function\s+NoteBottomSheet/.test(source),
      'NoteBottomSheet should be default-exported',
    );
  });

  it('uses SwipeableDrawer, not Dialog for the main container', async () => {
    const source = await readFile(containerPath, 'utf8');
    assert.ok(
      /SwipeableDrawer/.test(source),
      'NoteBottomSheet should use SwipeableDrawer',
    );
    assert.ok(
      /anchor\s*=\s*["']bottom["']/.test(source),
      'SwipeableDrawer should use anchor="bottom"',
    );
  });

  it('renders all sub-components based on note type', async () => {
    const source = await readFile(containerPath, 'utf8');
    assert.ok(/SharedHeader/.test(source), 'Should render SharedHeader');
    assert.ok(/TextContent/.test(source), 'Should render TextContent');
    assert.ok(/VoiceContent/.test(source), 'Should render VoiceContent');
    assert.ok(/LessonContent/.test(source), 'Should render LessonContent');
    assert.ok(/MediaContent/.test(source), 'Should render MediaContent');
    assert.ok(/ActionButtons/.test(source), 'Should render ActionButtons');
  });

  it('preserves reassign and lesson tag sub-dialogs', async () => {
    const source = await readFile(containerPath, 'utf8');
    assert.ok(/ClassroomStudentPicker/.test(source), 'Should use ClassroomStudentPicker for reassign');
    assert.ok(/LessonNoteTagDialog/.test(source), 'Should use LessonNoteTagDialog');
  });
});

describe('SharedHeader sub-component', () => {
  it('uses Avatar from shared ui and type icons', async () => {
    const source = await readFile(sharedHeaderPath, 'utf8');
    assert.ok(/Avatar/.test(source), 'SharedHeader should use Avatar');
    assert.ok(/TYPE_ICONS/.test(source) || /Eye|Mic|BookOpen|Image/.test(source), 'SharedHeader should reference type icons');
  });

  it('imports getTypeChipConfig for type chip configuration', async () => {
    const source = await readFile(sharedHeaderPath, 'utf8');
    assert.ok(/getTypeChipConfig/.test(source), 'Should import getTypeChipConfig');
  });
});

describe('VoiceContent sub-component', () => {
  it('contains TRANSCRIPT label and duration display', async () => {
    const source = await readFile(voiceContentPath, 'utf8');
    assert.ok(/TRANSCRIPT/.test(source), 'VoiceContent should show TRANSCRIPT label');
    assert.ok(/duration/.test(source), 'VoiceContent should display duration');
  });
});

describe('LessonContent sub-component', () => {
  it('uses lesson dimension rating logic', async () => {
    const source = await readFile(lessonContentPath, 'utf8');
    assert.ok(/getLessonDimensions/.test(source), 'Should use getLessonDimensions');
    assert.ok(/LESSON_RATING_LABELS/.test(source), 'Should use LESSON_RATING_LABELS');
  });
});

describe('MediaContent sub-component', () => {
  it('contains Coach Pepper AI classification section', async () => {
    const source = await readFile(mediaContentPath, 'utf8');
    assert.ok(/curriculumArea/.test(source), 'Should display curriculumArea');
    assert.ok(/materialsIdentified/.test(source), 'Should display materialsIdentified');
  });

  it('handles photo, video, and PDF media kinds', async () => {
    const source = await readFile(mediaContentPath, 'utf8');
    assert.ok(/photo/.test(source), 'Should handle photo');
    assert.ok(/video/.test(source), 'Should handle video');
  });
});

describe('ActionButtons sub-component', () => {
  it('contains permission-gated action patterns', async () => {
    const source = await readFile(actionButtonsPath, 'utf8');
    assert.ok(/canReassign/.test(source) || /Reassign/.test(source), 'Should have reassign button');
    assert.ok(/Edit/.test(source), 'Should have edit button');
    assert.ok(/Delete/.test(source), 'Should have delete button');
  });

  it('shows View Student Timeline conditionally', async () => {
    const source = await readFile(actionButtonsPath, 'utf8');
    assert.ok(
      /isClassroomContext/.test(source) || /View student timeline/.test(source) || /View Student Timeline/.test(source),
      'Should conditionally show View Student Timeline',
    );
  });
});

describe('Call site migration', () => {
  it('StudentTimeline imports NoteBottomSheet, not NoteExpansionDialog', async () => {
    const source = await readFile(studentTimelinePath, 'utf8');
    assert.ok(
      /noteBottomSheet/.test(source) || /NoteBottomSheet/.test(source),
      'StudentTimeline should import NoteBottomSheet',
    );
    assert.ok(
      !/import.*NoteExpansionDialog/.test(source),
      'StudentTimeline should not import NoteExpansionDialog',
    );
  });

  it('ClassroomTimeline imports NoteBottomSheet, not NoteExpansionDialog', async () => {
    const source = await readFile(classroomTimelinePath, 'utf8');
    assert.ok(
      /noteBottomSheet/.test(source) || /NoteBottomSheet/.test(source),
      'ClassroomTimeline should import NoteBottomSheet',
    );
    assert.ok(
      !/import.*NoteExpansionDialog/.test(source),
      'ClassroomTimeline should not import NoteExpansionDialog',
    );
  });

  it('StudentTimeline does not contain inline media preview Dialog state', async () => {
    const source = await readFile(studentTimelinePath, 'utf8');
    assert.ok(
      !/mediaEditMode/.test(source),
      'StudentTimeline should not have mediaEditMode state (moved to NoteBottomSheet)',
    );
    assert.ok(
      !/mediaEditSaving/.test(source),
      'StudentTimeline should not have mediaEditSaving state (moved to NoteBottomSheet)',
    );
  });

  it('NoteExpansionDialog.jsx no longer exists', async () => {
    let exists = true;
    try {
      await access(new URL('./NoteExpansionDialog.jsx', import.meta.url), constants.F_OK);
    } catch {
      exists = false;
    }
    assert.ok(!exists, 'NoteExpansionDialog.jsx should have been deleted');
  });
});
