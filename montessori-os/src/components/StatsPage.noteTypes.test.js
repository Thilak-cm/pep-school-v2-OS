import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import shared classifier from functions (single source of truth, PEP-285)
import { classifyNote } from '../../../functions/stats/helpers.js';

function classifyNotes(observations) {
  return {
    lesson: observations.filter(o => classifyNote(o) === 'lesson'),
    voice: observations.filter(o => classifyNote(o) === 'voice'),
    text: observations.filter(o => classifyNote(o) === 'text'),
    media: observations.filter(o => classifyNote(o) === 'media'),
  };
}

describe('StatsPage note type classification', () => {
  const observations = [
    { id: '1', type: 'text', text: 'Student worked on math' },
    { id: '2', type: 'voice', duration: 30 },
    { id: '3', type: 'lesson', lessonTitle: 'Addition' },
    { id: '4', type: 'media', mediaKind: 'photo' },
    { id: '5', type: 'media', mediaKind: 'video' },
    { id: '6', type: 'text', text: 'Another text note' },
    { id: '7', type: 'lesson' },
  ];

  it('classifies media notes correctly', () => {
    const { media } = classifyNotes(observations);
    assert.equal(media.length, 2);
    assert.deepEqual(media.map(o => o.id), ['4', '5']);
  });

  it('does not count media notes as text, voice, or lesson', () => {
    const { text, voice, lesson } = classifyNotes(observations);
    const nonMediaIds = [...text, ...voice, ...lesson].map(o => o.id);
    assert.ok(!nonMediaIds.includes('4'), 'media note 4 should not be in text/voice/lesson');
    assert.ok(!nonMediaIds.includes('5'), 'media note 5 should not be in text/voice/lesson');
  });

  it('counts all four types without overlap or loss', () => {
    const { text, voice, lesson, media } = classifyNotes(observations);
    const total = text.length + voice.length + lesson.length + media.length;
    assert.equal(total, observations.length);
  });

  it('classifies other types unchanged', () => {
    const { text, voice, lesson } = classifyNotes(observations);
    assert.equal(text.length, 2);
    assert.equal(voice.length, 1);
    assert.equal(lesson.length, 2);
  });
});
