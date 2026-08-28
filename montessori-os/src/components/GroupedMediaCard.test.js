import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('GroupedMediaCard', () => {
  it('delegates the shared media card to the existing timeline card contract', () => {
    const source = readFileSync(join(__dirname, 'GroupedMediaCard.jsx'), 'utf8');
    assert.match(source, /ClassroomNoteCard/);
    assert.match(source, /onNoteClick/);
  });
});
