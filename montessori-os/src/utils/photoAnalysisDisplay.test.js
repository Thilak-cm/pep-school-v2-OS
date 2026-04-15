/**
 * Tests for photoAnalysisDisplay utilities (PEP-33).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { truncateDescription } from './photoAnalysisDisplay.js';

describe('truncateDescription', () => {
  test('returns empty string for null/undefined/empty', () => {
    assert.equal(truncateDescription(null), '');
    assert.equal(truncateDescription(undefined), '');
    assert.equal(truncateDescription(''), '');
    assert.equal(truncateDescription(123), '');
  });

  test('returns full string when under maxLen', () => {
    const short = 'A child matching vocabulary cards on a rug.';
    assert.equal(truncateDescription(short), short);
  });

  test('truncates at maxLen with ellipsis', () => {
    const long = 'A child appears to be matching vocabulary/photo cards to the corresponding symbol/number cards showing various letters arranged on a rug.';
    const result = truncateDescription(long, 80);
    assert.ok(result.length <= 81); // 80 chars + ellipsis character
    assert.ok(result.endsWith('…'));
    assert.ok(!result.endsWith(' …')); // trimEnd before ellipsis
  });

  test('trims whitespace from input', () => {
    assert.equal(truncateDescription('  hello  '), 'hello');
  });

  test('respects custom maxLen', () => {
    const result = truncateDescription('Hello world, this is a test', 10);
    assert.ok(result.length <= 11);
    assert.ok(result.endsWith('…'));
  });
});
