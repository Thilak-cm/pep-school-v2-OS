import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_CHAT_TOOL_IDS } from '../../../functions/config/toolCatalog.js';
import {
  isValidChatAllowedTools,
  normalizeChatAllowedTools,
  toggleChatAllowedTool,
} from './chatCommandCentreTools.js';

test('missing allowedTools uses shared chat defaults', () => {
  assert.deepEqual(normalizeChatAllowedTools(undefined), DEFAULT_CHAT_TOOL_IDS);
});

test('an intentionally empty allowedTools array remains empty and valid', () => {
  assert.deepEqual(normalizeChatAllowedTools([]), []);
  assert.equal(isValidChatAllowedTools([]), true);
});

test('unknown, duplicate, and dependency-invalid tool IDs are rejected', () => {
  assert.equal(isValidChatAllowedTools(['unknown_tool']), false);
  assert.equal(isValidChatAllowedTools(['fetch_media', 'fetch_media']), false);
  assert.equal(isValidChatAllowedTools(['fetch_snapshot_history']), false);
  assert.deepEqual(normalizeChatAllowedTools([
    'unknown_tool',
    'fetch_media',
    'fetch_media',
    'fetch_snapshot_history',
  ]), ['fetch_media']);
});

test('disabling a prerequisite also disables dependent tools', () => {
  assert.deepEqual(
    toggleChatAllowedTool(
      ['fetch_weekly_snapshot', 'fetch_snapshot_history', 'fetch_media'],
      'fetch_weekly_snapshot',
    ),
    ['fetch_media'],
  );
});
