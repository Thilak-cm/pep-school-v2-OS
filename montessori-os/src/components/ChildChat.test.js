import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('./ChildChat.jsx', import.meta.url);

test('ChildChat keeps the production maintenance gate and localhost UID allowlist', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /import\.meta\.env\.DEV/);
  assert.match(source, /CHAT_MAINTENANCE_ALLOWED_UID/);
  assert.match(source, /<ChatMaintenance/);
});

test('ChildChat uses the streaming transport and AbortController', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /streamChatTurn/);
  assert.match(source, /new AbortController/);
  assert.match(source, /status: 'streaming'/);
});
