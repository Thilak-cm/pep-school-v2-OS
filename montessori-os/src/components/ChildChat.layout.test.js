import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const childChatSource = readFileSync(join(__dirname, 'ChildChat.jsx'), 'utf-8');
const appSource = readFileSync(join(__dirname, '..', 'App.jsx'), 'utf-8');
const footerSource = readFileSync(join(__dirname, '..', 'AppFooter.jsx'), 'utf-8');
const scrollFabSource = readFileSync(join(__dirname, 'chat', 'ScrollToBottomFab.jsx'), 'utf-8');
const presentationSource = readFileSync(join(__dirname, 'chat', 'chatPresentation.js'), 'utf-8');

test('child chat owns one bounded middle transcript viewport', () => {
  assert.match(childChatSource, /maxWidth:[\s\S]*420px/);
  assert.match(childChatSource, /minHeight:\s*0/);
  assert.match(childChatSource, /overflowY:\s*['"]auto['"]/);
  assert.match(childChatSource, /FOLLOW_THRESHOLD_PX/);
  assert.doesNotMatch(childChatSource, /pb:\s*['"]190px['"]/);
  assert.doesNotMatch(childChatSource, /height:\s*['"]calc\(100vh - 80px\)['"]/);
});

test('scroll follow wiring reacts to transcript growth and the 200px threshold', () => {
  assert.match(presentationSource, /scrollHeight/);
  assert.match(childChatSource, /scrollIntoView/);
  assert.match(childChatSource, /isNearBottom/);
  assert.match(childChatSource, /scrollToBottom/);
  assert.match(scrollFabSource, /position:\s*['"]absolute['"]/);
  assert.doesNotMatch(scrollFabSource, /position:\s*['"]fixed['"]/);
});

test('streaming keeps the composer editable while preserving send blocking and Stop', () => {
  assert.match(childChatSource, /inputRef/);
  assert.match(childChatSource, /getComposerState/);
  assert.match(childChatSource, /aria-label="Stop response"/);
  assert.doesNotMatch(childChatSource, /TextField[^\n]*disabled=\{loading\}/);
});

test('App gives child chat an exclusive non-scrolling content region and shares footer height', () => {
  assert.match(appSource, /screen === ['"]childChat['"]/);
  assert.match(appSource, /overflowY:\s*isChildChat\s*\?\s*['"]hidden['"]/);
  assert.match(footerSource, /export const FOOTER_HEIGHT/);
});
