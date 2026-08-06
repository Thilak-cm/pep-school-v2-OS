import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'MessageBubble.jsx'), 'utf-8');

test('message bubbles use role-specific always-visible metadata and terminal assistant actions', () => {
  assert.match(source, /UserBubble/);
  assert.match(source, /AssistantBubble/);
  assert.match(source, /ThumbsUp/);
  assert.match(source, /shouldShowAssistantActions/);
  assert.doesNotMatch(source, /onTouchStart/);
  assert.doesNotMatch(source, /opacity:\s*visible\s*\?/);
  assert.doesNotMatch(source, /formatTimestamp/);
});

test('new active-turn bubbles animate once and respect reduced motion', () => {
  assert.match(source, /180ms/);
  assert.match(source, /6px/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /animate/);
});
