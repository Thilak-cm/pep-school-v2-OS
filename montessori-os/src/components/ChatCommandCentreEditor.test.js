import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('./ChatCommandCentreEditor.jsx', import.meta.url);

test('Chat Command Centre exposes and persists catalog-backed allowedTools', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /CHAT_TOOL_OPTIONS\.map/);
  assert.match(source, /Leaving every tool unchecked disables tool use/);
  assert.match(source, /allowedTools: \[\.\.\.allowedTools\]/);
  assert.match(source, /setAllowedTools\(\[\.\.\.originalState\.allowedTools\]\)/);
});
