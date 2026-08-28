import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./MediaContent.jsx', import.meta.url), 'utf8');

test('media carousel supports horizontal touch navigation', () => {
  assert.match(source, /onTouchStart=\{handleTouchStart\}/);
  assert.match(source, /onTouchEnd=\{handleTouchEnd\}/);
  assert.match(source, /SWIPE_THRESHOLD/);
  assert.match(source, /onCarouselNavigate\?\.\(deltaX < 0 \? 1 : -1\)/);
});

test('media carousel shows the current image position for multi-item batches', () => {
  assert.match(source, /\{carouselIndex \+ 1\}\/\{carouselList\.length\}/);
  assert.match(source, /Image \$\{carouselIndex \+ 1\} of \$\{carouselList\.length\}/);
});
