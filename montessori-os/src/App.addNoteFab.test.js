import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appPath = new URL('./App.jsx', import.meta.url);

describe('student dashboard Add Note placement', () => {
  it('aligns the global FAB with the final cell of the dashboard action grid', async () => {
    const src = await readFile(appPath, 'utf8');
    assert.match(src, /right:\s*\{ xs: 52, sm: 52 \}/);
    assert.match(src, /bottom:\s*\{ xs: 96, sm: 96 \}/);
  });
});
