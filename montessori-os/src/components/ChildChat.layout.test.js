import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  beginProgrammaticScroll,
  CHAT_SHELL_WIDTH_SX,
  CONVERSATION_SELECTOR_LAYER_SX,
  consumeFollowModeGrowth,
  createFollowModeState,
  enableFollowMode,
  getChatShellGeometry,
  interruptProgrammaticScroll,
  resetFollowMode,
  SCROLL_TO_BOTTOM_FAB_LAYER_SX,
  TRANSCRIPT_LAYER_SX,
  updateFollowModeFromScroll,
} from './chat/chatPresentation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const childChatSource = readFileSync(join(__dirname, 'ChildChat.jsx'), 'utf-8');
const appSource = readFileSync(join(__dirname, '..', 'App.jsx'), 'utf-8');
const footerSource = readFileSync(join(__dirname, '..', 'AppFooter.jsx'), 'utf-8');
const scrollFabSource = readFileSync(join(__dirname, 'chat', 'ScrollToBottomFab.jsx'), 'utf-8');
const presentationSource = readFileSync(join(__dirname, 'chat', 'chatPresentation.js'), 'utf-8');
const selectorSource = childChatSource.slice(
  childChatSource.indexOf('<ClickAwayListener'),
  childChatSource.indexOf('</ClickAwayListener>'),
);

test('child chat owns one bounded middle transcript viewport', () => {
  assert.match(childChatSource, /minHeight:\s*0/);
  assert.match(childChatSource, /overflowY:\s*['"]auto['"]/);
  assert.match(childChatSource, /flex:\s*1/);
  assert.match(childChatSource, /flexShrink:\s*0/);
  assert.doesNotMatch(childChatSource, /pb:\s*['"]190px['"]/);
  assert.doesNotMatch(childChatSource, /height:\s*['"]calc\(100vh - 80px\)['"]/);
});

test('startup suggestions and stream presentation are wired through transient controllers', () => {
  assert.match(childChatSource, /getSuggestedChatPrompts/);
  assert.match(childChatSource, /handleSend\(null, suggestion\)/);
  assert.match(childChatSource, /createChatTokenPresentation/);
  assert.match(childChatSource, /TypingIndicator label=\{progressText\}/);
  assert.ok(
    (childChatSource.match(/presentationRef\.current\?\.clear\(\)/g) || []).length >= 4,
    'student changes, navigation, retries, and unmount clear transient presentation',
  );
});

test('chat shell geometry exactly bounds the header, footer, and safe areas', () => {
  const geometry = getChatShellGeometry({
    viewportHeight: 844,
    headerHeight: 60,
    headerBottomPadding: 16,
    footerHeight: 64,
    safeAreaTop: 47,
    safeAreaBottom: 34,
  });

  assert.deepEqual(geometry, {
    topInset: 123,
    bottomInset: 98,
    bottomEdge: 746,
    height: 623,
  });
});

test('open keyboard replaces the footer and bottom safe-area boundary', () => {
  const geometry = getChatShellGeometry({
    viewportHeight: 844,
    headerHeight: 60,
    headerBottomPadding: 16,
    footerHeight: 64,
    safeAreaTop: 47,
    safeAreaBottom: 34,
    keyboardOpen: true,
    keyboardBottomOffset: 291,
  });

  assert.deepEqual(geometry, {
    topInset: 123,
    bottomInset: 291,
    bottomEdge: 553,
    height: 430,
  });
});

test('production geometry preserves live CSS safe-area insets', () => {
  assert.deepEqual(getChatShellGeometry({
    headerHeight: 60,
    headerBottomPadding: 16,
    footerHeight: 64,
    safeAreaTop: 'env(safe-area-inset-top, 0px)',
    safeAreaBottom: 'env(safe-area-inset-bottom, 0px)',
  }), {
    topInset: 'calc(60px + env(safe-area-inset-top, 0px) + 16px)',
    bottomInset: 'calc(64px + env(safe-area-inset-bottom, 0px))',
    bottomEdge: undefined,
    height: undefined,
  });
  assert.match(childChatSource, /getChatShellGeometry/);
});

test('chat shell width and transcript layering use the exact mobile contracts', () => {
  assert.deepEqual(CHAT_SHELL_WIDTH_SX, {
    width: '100%',
    maxWidth: '420px',
  });
  assert.deepEqual(CONVERSATION_SELECTOR_LAYER_SX, {
    position: 'relative',
    zIndex: 3,
  });
  assert.deepEqual(TRANSCRIPT_LAYER_SX, {
    position: 'relative',
    zIndex: 0,
  });
  assert.deepEqual(SCROLL_TO_BOTTOM_FAB_LAYER_SX, {
    position: 'absolute',
    zIndex: 2,
  });
  assert.ok(
    CONVERSATION_SELECTOR_LAYER_SX.zIndex > SCROLL_TO_BOTTOM_FAB_LAYER_SX.zIndex
      && SCROLL_TO_BOTTOM_FAB_LAYER_SX.zIndex > TRANSCRIPT_LAYER_SX.zIndex,
    'the selector dropdown stays above both the scroll FAB and transcript',
  );
  assert.ok(childChatSource.includes('...CHAT_SHELL_WIDTH_SX'));
  assert.ok(childChatSource.includes('...CONVERSATION_SELECTOR_LAYER_SX'));
  assert.ok(childChatSource.includes('...TRANSCRIPT_LAYER_SX'));
  assert.ok(scrollFabSource.includes('...SCROLL_TO_BOTTOM_FAB_LAYER_SX'));
});

test('open conversation selector and dropdown form one continuous surface', () => {
  assert.match(selectorSource, /borderRadius:\s*chatDropdownOpen\s*\?\s*'28px 28px 0 0'\s*:\s*'28px'/);
  assert.match(selectorSource, /borderBottomWidth:\s*chatDropdownOpen\s*\?\s*0\s*:\s*'1px'/);
  assert.match(selectorSource, /filter:\s*chatDropdownOpen\s*\?\s*'drop-shadow\(0 4px 8px rgba\(0,0,0,\.12\)\)'\s*:\s*'none'/);
  assert.match(selectorSource, /top:\s*'100%'/);
  assert.match(selectorSource, /borderRadius:\s*'0 0 20px 20px'/);
  assert.match(selectorSource, /borderTopWidth:\s*0/);
  assert.doesNotMatch(selectorSource, /calc\(100%\s*\+/);
});

test('connected dropdown preserves interaction, scrolling, and management controls', () => {
  assert.match(selectorSource, /onClickAway=\{\(\) => setChatDropdownOpen\(false\)\}/);
  assert.match(selectorSource, /maxHeight:\s*280/);
  assert.match(selectorSource, /overflowY:\s*'auto'/);
  assert.match(selectorSource, /aria-label="Edit chat name"/);
  assert.match(selectorSource, /aria-label="Delete chat"/);
});

test('follow mode executes initial load, switching, streaming, manual scroll, and FAB lifecycle', () => {
  const followMode = createFollowModeState();

  resetFollowMode(followMode, { initialScrollPending: true });
  assert.equal(consumeFollowModeGrowth(followMode), true, 'initial load scrolls to the transcript bottom');

  resetFollowMode(followMode, { initialScrollPending: true });
  assert.equal(consumeFollowModeGrowth(followMode), true, 'conversation switch scrolls to the transcript bottom');

  enableFollowMode(followMode);
  assert.equal(consumeFollowModeGrowth(followMode), true, 'send scrolls to the optimistic turn');
  assert.equal(consumeFollowModeGrowth(followMode), true, 'streamed growth remains pinned in follow mode');

  assert.equal(updateFollowModeFromScroll(followMode, {
    scrollHeight: 1200,
    scrollTop: 799,
    clientHeight: 200,
  }), false, 'scrolling more than 200px away disables follow mode');
  assert.equal(consumeFollowModeGrowth(followMode), false, 'streamed growth does not move a manually scrolled transcript');

  assert.equal(updateFollowModeFromScroll(followMode, {
    scrollHeight: 1200,
    scrollTop: 800,
    clientHeight: 200,
  }), true, 'returning within 200px reenables follow mode');
  assert.equal(consumeFollowModeGrowth(followMode), true, 'streamed growth resumes following near the bottom');

  updateFollowModeFromScroll(followMode, { scrollHeight: 1200, scrollTop: 500, clientHeight: 200 });
  beginProgrammaticScroll(followMode);
  assert.equal(consumeFollowModeGrowth(followMode), true, 'the scroll-to-bottom FAB reenables follow mode');

  assert.equal(updateFollowModeFromScroll(followMode, {
    scrollHeight: 1200,
    scrollTop: 650,
    clientHeight: 200,
  }), false, 'an intermediate smooth-scroll event is still far from the bottom');
  assert.equal(followMode.enabled, true, 'smooth-scroll progress does not disable follow mode');
  assert.equal(followMode.programmaticScrollPending, true, 'the programmatic state remains pending in transit');

  assert.equal(updateFollowModeFromScroll(followMode, {
    scrollHeight: 1200,
    scrollTop: 800,
    clientHeight: 200,
  }), true, 'arrival within 200px completes the smooth scroll');
  assert.equal(followMode.enabled, true);
  assert.equal(followMode.programmaticScrollPending, false, 'arrival clears programmatic state exactly once');

  assert.equal(updateFollowModeFromScroll(followMode, {
    scrollHeight: 1200,
    scrollTop: 500,
    clientHeight: 200,
  }), false, 'later manual scrolling can disable follow mode normally');
  assert.equal(followMode.enabled, false);
});

test('user gesture cancels an interrupted smooth scroll before the follow threshold', () => {
  const followMode = createFollowModeState();
  beginProgrammaticScroll(followMode);
  updateFollowModeFromScroll(followMode, {
    scrollHeight: 1200,
    scrollTop: 650,
    clientHeight: 200,
  });

  assert.equal(interruptProgrammaticScroll(followMode, {
    scrollHeight: 1200,
    scrollTop: 650,
    clientHeight: 200,
  }), false);
  assert.equal(followMode.programmaticScrollPending, false);
  assert.equal(followMode.enabled, false);
  assert.equal(
    consumeFollowModeGrowth(followMode),
    false,
    'later streamed content does not resume the cancelled smooth scroll',
  );

  assert.equal(updateFollowModeFromScroll(followMode, {
    scrollHeight: 1200,
    scrollTop: 800,
    clientHeight: 200,
  }), true, 'ordinary scrolling back within the threshold reenables follow mode');
  assert.equal(consumeFollowModeGrowth(followMode), true);
});

test('follow-mode controls are wired to the bounded transcript viewport', () => {
  assert.match(presentationSource, /scrollHeight/);
  assert.match(childChatSource, /scrollIntoView/);
  assert.match(childChatSource, /updateFollowModeFromScroll/);
  assert.match(childChatSource, /beginProgrammaticScroll/);
  assert.match(childChatSource, /onWheel=\{handleTranscriptUserGesture\}/);
  assert.match(childChatSource, /onTouchStart=\{handleTranscriptUserGesture\}/);
  assert.match(childChatSource, /onPointerDown=\{handleTranscriptUserGesture\}/);
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
