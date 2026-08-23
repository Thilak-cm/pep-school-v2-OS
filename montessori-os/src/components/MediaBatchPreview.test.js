import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'MediaBatchPreview.jsx'), 'utf8');

describe('collapsed media batch preview', () => {
  it('renders every media item in a horizontally scrollable row', () => {
    assert.match(source, /mediaItems\.map/);
    assert.match(source, /overflowX: 'auto'/);
    assert.match(source, /flex: '0 0 auto'/);
    assert.doesNotMatch(source, /ChevronLeft|ChevronRight/);
  });

  it('keeps the whole card click available for opening the expanded drawer', () => {
    assert.match(source, /onOpen/);
    assert.match(source, /stopPropagation/);
  });
});
