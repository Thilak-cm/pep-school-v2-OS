/**
 * #215: Version-gated save tests for AddNoteModal.
 *
 * Verifies the stale-write protection logic that checks the open_questions
 * document version before saving, rejecting saves when the version has
 * changed since QuestionDeck loaded.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const modalSource = readFileSync(join(__dirname, 'AddNoteModal.jsx'), 'utf-8');

describe('#215: Version-gated save in AddNoteModal', () => {
  // Extract the version-gate block for structural assertions
  const versionGateComment = 'Version-gated save: reject if open_questions doc was regenerated';

  it('version gate block exists in the save path', () => {
    assert.ok(
      modalSource.includes(versionGateComment),
      'Version-gate comment block should exist in save path'
    );
  });

  describe('Mismatch path: calls onRefreshQuestionDeck and returns early', () => {
    it('checks openQuestion.version against currentVersion from Firestore', () => {
      // The gate should compare currentVersion !== openQuestion.version
      assert.ok(
        modalSource.includes('currentVersion !== openQuestion.version'),
        'Should compare currentVersion from Firestore doc against openQuestion.version'
      );
    });

    it('calls onRefreshQuestionDeck on version mismatch', () => {
      // Extract the version-gate block (from the comment to the closing of the outer if)
      const gateStart = modalSource.indexOf(versionGateComment);
      const gateBlock = modalSource.slice(gateStart, gateStart + 800);

      assert.ok(
        gateBlock.includes('onRefreshQuestionDeck?.()'),
        'Should call onRefreshQuestionDeck when version mismatch detected'
      );
    });

    it('shows error notification on version mismatch', () => {
      const gateStart = modalSource.indexOf(versionGateComment);
      const gateBlock = modalSource.slice(gateStart, gateStart + 800);

      assert.ok(
        gateBlock.includes("notify.error('These questions were updated - please try again.')"),
        'Should show error toast on version mismatch'
      );
    });

    it('calls onClose and returns early on version mismatch', () => {
      const gateStart = modalSource.indexOf(versionGateComment);
      const gateBlock = modalSource.slice(gateStart, gateStart + 800);

      // After the mismatch branch, should call onClose() then return
      const mismatchIdx = gateBlock.indexOf('currentVersion !== openQuestion.version');
      const afterMismatch = gateBlock.slice(mismatchIdx);

      assert.ok(
        afterMismatch.includes('onClose()'),
        'Should call onClose() on version mismatch'
      );
      assert.ok(
        afterMismatch.includes('return;'),
        'Should return early on version mismatch to prevent save'
      );
    });

    it('return is before groupId generation (save does not proceed)', () => {
      // The return in the version gate must come before the groupId line
      // to ensure that a stale write is truly prevented
      const gateReturnIdx = modalSource.indexOf("notify.error('These questions were updated");
      const groupIdIdx = modalSource.indexOf("const groupId = selectedStudents.length > 1");

      assert.ok(gateReturnIdx > 0, 'Version mismatch notify.error should exist');
      assert.ok(groupIdIdx > 0, 'groupId generation should exist');
      assert.ok(
        gateReturnIdx < groupIdIdx,
        'Version mismatch return must come before groupId generation (save is truly blocked)'
      );
    });
  });

  describe('Match path: proceeds normally when version matches', () => {
    it('only rejects when currentVersion !== openQuestion.version', () => {
      // The gate should NOT have an else branch that blocks saving on match.
      // After the version-gate if-block closes, code should proceed to groupId.
      const gateStart = modalSource.indexOf(versionGateComment);
      const gateBlock = modalSource.slice(gateStart, gateStart + 800);

      // Count return statements in the gate block - should be exactly one (the mismatch path)
      const returnMatches = gateBlock.match(/\breturn\b/g);
      assert.equal(
        returnMatches?.length ?? 0,
        1,
        'Version gate should have exactly one return (the mismatch early-exit)'
      );
    });
  });

  describe('Non-existent OQ doc: treated as pass-through', () => {
    it('only checks currentVersion when oqSnap.exists() is true', () => {
      const gateStart = modalSource.indexOf(versionGateComment);
      const gateBlock = modalSource.slice(gateStart, gateStart + 800);

      // The version comparison should be nested inside an exists() check
      assert.ok(
        gateBlock.includes('oqSnap.exists()'),
        'Should check oqSnap.exists() before comparing versions'
      );

      // exists() check should come before the version comparison
      const existsIdx = gateBlock.indexOf('oqSnap.exists()');
      const versionCompareIdx = gateBlock.indexOf('currentVersion !== openQuestion.version');

      assert.ok(
        existsIdx < versionCompareIdx,
        'exists() check should come before version comparison (non-existent doc is a pass-through)'
      );
    });

    it('does not return or call onRefreshQuestionDeck when doc does not exist', () => {
      // When oqSnap.exists() is false, the code should fall through to normal save.
      // The return and onRefreshQuestionDeck calls are inside the exists() block,
      // inside the mismatch check - so a non-existent doc simply skips the whole block.
      const gateStart = modalSource.indexOf(versionGateComment);
      const gateBlock = modalSource.slice(gateStart, gateStart + 800);

      // The onRefreshQuestionDeck call should be nested deeper than the exists() check
      const existsIdx = gateBlock.indexOf('oqSnap.exists()');
      const refreshIdx = gateBlock.indexOf('onRefreshQuestionDeck');

      assert.ok(
        refreshIdx > existsIdx,
        'onRefreshQuestionDeck should be nested inside exists() check'
      );
    });
  });

  describe('Guard conditions', () => {
    it('only runs version check when openQuestion.version is non-null', () => {
      assert.ok(
        modalSource.includes('openQuestion?.version != null'),
        'Should guard on openQuestion?.version != null'
      );
    });

    it('only runs version check for single-student saves', () => {
      const gateStart = modalSource.indexOf(versionGateComment);
      const gateBlock = modalSource.slice(gateStart, gateStart + 200);

      assert.ok(
        gateBlock.includes('selectedStudents.length === 1'),
        'Version gate should only apply to single-student saves'
      );
    });
  });
});
