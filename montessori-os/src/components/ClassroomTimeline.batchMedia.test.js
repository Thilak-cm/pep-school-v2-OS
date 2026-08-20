import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const timelineSource = readFileSync(join(__dirname, 'ClassroomTimeline.jsx'), 'utf8');

describe('Classroom Timeline multimedia batches', () => {
  it('uses shared media grouping and card components', () => {
    assert.match(timelineSource, /groupMediaObservations/);
    assert.match(timelineSource, /GroupedMediaCard/);
    assert.match(timelineSource, /carouselList=/);
    assert.match(timelineSource, /onCarouselNavigate=/);
  });

  it('does not use lesson groupId as the multimedia grouping key', () => {
    assert.match(timelineSource, /groupMediaObservations\(displayedObservations\)/);
  });
});
