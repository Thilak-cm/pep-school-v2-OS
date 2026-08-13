import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEditorState,
  applyEditorOperation,
  resetEditorState,
  hasPixelChanges,
  getOutputDimensions,
} from './photoEditorTransforms.js';

test('photo editor composes crop, rotation, and flips without clearing earlier operations', () => {
  let state = createEditorState({ width: 1200, height: 800 });
  state = applyEditorOperation(state, { type: 'crop', crop: { x: 100, y: 50, width: 900, height: 600 } });
  state = applyEditorOperation(state, { type: 'rotate', degrees: 90 });
  state = applyEditorOperation(state, { type: 'flip', axis: 'horizontal' });

  assert.deepEqual(state.crop, { x: 100, y: 50, width: 900, height: 600 });
  assert.equal(state.rotation, 90);
  assert.equal(state.flipX, true);
  assert.equal(hasPixelChanges(state), true);
  assert.deepEqual(getOutputDimensions(state), { width: 600, height: 900 });
});

test('reset returns to the initially selected normalized image', () => {
  const original = createEditorState({ width: 1600, height: 1000 });
  const changed = applyEditorOperation(original, { type: 'rotate', degrees: 90 });

  assert.equal(hasPixelChanges(changed), true);
  assert.deepEqual(resetEditorState(changed), original);
  assert.equal(hasPixelChanges(resetEditorState(changed)), false);
});

test('no-op editor state does not enable Apply', () => {
  assert.equal(hasPixelChanges(createEditorState({ width: 800, height: 600 })), false);
});
