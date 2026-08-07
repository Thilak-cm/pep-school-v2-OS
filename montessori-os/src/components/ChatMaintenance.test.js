import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isChatAllowed } from './chat/chatAccess.js';

const sourceUrl = new URL('./chat/chatAccess.js', import.meta.url);
const maintenanceSourceUrl = new URL('./ChatMaintenance.jsx', import.meta.url);
const childChatSourceUrl = new URL('./ChildChat.jsx', import.meta.url);

test('chat tester allowlist accepts only Thilak and Rahul', () => {
  assert.equal(isChatAllowed('T1iLA2qjTqMvgS4hamw2PEtNsov1'), true);
  assert.equal(isChatAllowed('HA1TiA1xbkRJ8n1MPaBi1PdGlo92'), true);
  assert.equal(isChatAllowed('other-user'), false);
  assert.equal(isChatAllowed(null), false);
});

test('chat maintenance gate uses the Firebase UID allowlist', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const maintenanceSource = await readFile(maintenanceSourceUrl, 'utf8');
  const childChatSource = await readFile(childChatSourceUrl, 'utf8');
  assert.match(source, /CHAT_ALLOWED_UIDS/);
  assert.match(source, /T1iLA2qjTqMvgS4hamw2PEtNsov1/);
  assert.match(source, /HA1TiA1xbkRJ8n1MPaBi1PdGlo92/);
  assert.match(maintenanceSource, /isChatAllowed\(currentUser\?\.uid\)/);
  assert.match(childChatSource, /isChatAllowed\(currentUser\?\.uid\)/);
  assert.doesNotMatch(source, /import\.meta\.env\.DEV/);
  assert.doesNotMatch(maintenanceSource, /import\.meta\.env\.DEV/);
  assert.doesNotMatch(childChatSource, /const isAuthorizedTester = import\.meta\.env\.DEV/);
});

test('chat maintenance gate provides separate authorized and blocked copy', async () => {
  const source = await readFile(maintenanceSourceUrl, 'utf8');
  assert.match(source, /authorized for testing/);
  assert.match(source, /under maintenance/);
});
