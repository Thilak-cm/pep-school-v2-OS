import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./ClassroomTimeline.jsx', import.meta.url), 'utf8');

test('Classroom Timeline changes tabs only through the tab headers', () => {
  assert.doesNotMatch(source, /useSwipeTabs|swipeBind|getTransform/);
  assert.match(source, /<HFTabs[\s\S]*?value=\{activeTab\}[\s\S]*?onChange=\{\(v\) => \{[\s\S]*?setActiveTab\(v\)/);
  assert.match(source, /\{activeTab === 0 \? \(/);
});

test('a grouped media card body opens the first real observation with its full carousel', () => {
  const mediaBlockStart = source.indexOf("if (item.type === 'media')");
  const mediaBlockEnd = source.indexOf('return (', mediaBlockStart + 1);
  const nextCardStart = source.indexOf('<ClassroomNoteCard', mediaBlockEnd);
  const mediaBlock = source.slice(mediaBlockStart, nextCardStart);

  assert.match(mediaBlock, /const mediaItems = item\.mediaItems \|\| \[\]/);
  assert.match(mediaBlock, /const firstObservation = mediaItems\[0\]\?\.sourceObservation/);
  assert.match(mediaBlock, /setSelectedMediaIndex\(0\)/);
  assert.match(mediaBlock, /setSelectedNote\(\{[\s\S]*?\.\.\.firstObservation,[\s\S]*?mediaItems,[\s\S]*?mediaCount: mediaItems\.length/);
  assert.doesNotMatch(mediaBlock, /setSelectedNote\(item\)/);
});
