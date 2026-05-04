import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'AddNoteFab.jsx'), 'utf-8');

describe('AddNoteFab component', () => {
  it('exports a default component', () => {
    assert.ok(source.includes('export default AddNoteFab'));
  });

  it('renders 3 menu items (Voice, Lesson, Media)', () => {
    assert.ok(source.includes("'voice'"), 'Missing voice menu item');
    assert.ok(source.includes("'lesson'"), 'Missing lesson menu item');
    assert.ok(source.includes("'media'"), 'Missing media menu item');
  });

  it('does not include a Text note option', () => {
    // PEP-189 scope: only 3 items, no text
    const menuItems = source.match(/MENU_ITEMS\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(menuItems, 'MENU_ITEMS array not found');
    assert.ok(!menuItems[1].includes("'text'"), 'Text should not be in MENU_ITEMS');
  });

  it('uses Plus icon that rotates to become X', () => {
    assert.ok(source.includes('rotate(135deg)'), 'Plus should rotate 135deg when open');
    assert.ok(source.includes('rotate(0deg)'), 'Plus should be 0deg when closed');
  });

  it('renders a scrim overlay for closing', () => {
    assert.ok(source.includes('handleClose'), 'Should have handleClose');
    assert.ok(source.includes('rgba(0, 0, 0, 0.3)'), 'Should render a scrim overlay');
  });

  it('accepts onVoice, onLesson, onMedia callbacks', () => {
    assert.ok(source.includes('onVoice'), 'Missing onVoice prop');
    assert.ok(source.includes('onLesson'), 'Missing onLesson prop');
    assert.ok(source.includes('onMedia'), 'Missing onMedia prop');
  });

  it('renders as a single card panel with rows', () => {
    assert.ok(source.includes("borderRadius: '16px'"), 'Card should have rounded corners');
    assert.ok(source.includes('borderBottom'), 'Rows should have dividers');
  });

  it('uses plain icons without colored boxes', () => {
    assert.ok(source.includes('--color-text-soft'), 'Icons should use text-soft color');
    assert.ok(!source.includes('iconColor'), 'Should not have colored icon boxes');
  });

  it('has scale-from-FAB animation', () => {
    assert.ok(source.includes('scale(1)'), 'Open state should scale to 1');
    assert.ok(source.includes('scale(0.5)'), 'Closed state should scale down');
    assert.ok(source.includes('cubic-bezier'), 'Should use spring-like easing');
    assert.ok(source.includes("transformOrigin: 'bottom right'"), 'Should animate from FAB position');
  });

  it('menu items ordered top-to-bottom: Media, Lesson, Voice', () => {
    const mediaIdx = source.indexOf("key: 'media'");
    const lessonIdx = source.indexOf("key: 'lesson'");
    const voiceIdx = source.indexOf("key: 'voice'");
    assert.ok(mediaIdx < lessonIdx, 'Media should be first in array (top of card)');
    assert.ok(lessonIdx < voiceIdx, 'Lesson should be second (middle), Voice last (bottom, closest to FAB)');
  });
});
