import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('./ChatMaintenance.jsx', import.meta.url);

test('chat maintenance gate uses the Firebase UID allowlist', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /CHAT_MAINTENANCE_ALLOWED_UID/);
  assert.match(source, /currentUser\?\.uid === CHAT_MAINTENANCE_ALLOWED_UID/);
});

test('chat maintenance gate provides separate authorized and blocked copy', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /authorized for testing/);
  assert.match(source, /under maintenance/);
});
