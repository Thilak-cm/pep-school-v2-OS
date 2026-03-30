import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assembleReportSystemContent } from '../../../functions/utils/reportHelpers.js';
import { buildMigrationPayload } from '../../../scripts/config/reportMigrationUtils.js';

describe('assembleReportSystemContent', () => {
  const JSON_WRAPPER = '\n\nIMPORTANT: Output JSON only.';

  it('concatenates static + dynamic + jsonWrapper', () => {
    const result = assembleReportSystemContent(
      'You are a Montessori educator.',
      'Use these glossary terms: practical life.',
      JSON_WRAPPER,
    );
    assert.equal(
      result,
      'You are a Montessori educator.\n\nUse these glossary terms: practical life.' + JSON_WRAPPER,
    );
  });

  it('produces static + jsonWrapper when dynamic is empty string', () => {
    const result = assembleReportSystemContent(
      'You are a Montessori educator.',
      '',
      JSON_WRAPPER,
    );
    assert.equal(result, 'You are a Montessori educator.' + JSON_WRAPPER);
  });

  it('produces static + jsonWrapper when dynamic is null', () => {
    const result = assembleReportSystemContent(
      'You are a Montessori educator.',
      null,
      JSON_WRAPPER,
    );
    assert.equal(result, 'You are a Montessori educator.' + JSON_WRAPPER);
  });

  it('produces static + jsonWrapper when dynamic is undefined', () => {
    const result = assembleReportSystemContent(
      'You are a Montessori educator.',
      undefined,
      JSON_WRAPPER,
    );
    assert.equal(result, 'You are a Montessori educator.' + JSON_WRAPPER);
  });

  it('does not add extra whitespace between static and dynamic', () => {
    const result = assembleReportSystemContent('A', 'B', '');
    assert.equal(result, 'A\n\nB');
  });

  it('handles both empty static and dynamic (only jsonWrapper)', () => {
    const result = assembleReportSystemContent('', '', JSON_WRAPPER);
    assert.equal(result, JSON_WRAPPER);
  });

  it('trims trailing whitespace from static before joining', () => {
    const result = assembleReportSystemContent('Static prompt.  \n', 'Dynamic part.', '');
    assert.equal(result, 'Static prompt.\n\nDynamic part.');
  });
});

describe('buildMigrationPayload', () => {
  it('transforms systemPrompt to staticSystemPrompt + empty dynamicSystemPrompt', () => {
    const result = buildMigrationPayload({
      systemPrompt: 'Original prompt content',
      title: 'Report Title',
      description: 'Report desc',
      version: 1,
    });
    assert.equal(result.status, 'migrate');
    assert.equal(result.payload.staticSystemPrompt, 'Original prompt content');
    assert.equal(result.payload.dynamicSystemPrompt, '');
    assert.ok(!('systemPrompt' in result.payload), 'legacy systemPrompt should not be in payload');
  });

  it('skips doc that already has staticSystemPrompt (idempotency)', () => {
    const result = buildMigrationPayload({
      staticSystemPrompt: 'Already migrated',
      dynamicSystemPrompt: '',
    });
    assert.equal(result.status, 'skip');
    assert.equal(result.reason, 'already-migrated');
  });

  it('handles empty systemPrompt gracefully', () => {
    const result = buildMigrationPayload({ systemPrompt: '', title: 'Empty' });
    assert.equal(result.status, 'migrate');
    assert.equal(result.payload.staticSystemPrompt, '');
    assert.equal(result.payload.dynamicSystemPrompt, '');
  });

  it('handles missing systemPrompt field and returns warning', () => {
    const result = buildMigrationPayload({ title: 'No SP' });
    assert.equal(result.status, 'migrate');
    assert.equal(result.payload.staticSystemPrompt, '');
    assert.equal(result.payload.dynamicSystemPrompt, '');
    assert.ok(result.warning, 'should have a warning for missing systemPrompt');
  });

  it('skips when data is null/undefined', () => {
    assert.equal(buildMigrationPayload(null).status, 'skip');
    assert.equal(buildMigrationPayload(undefined).status, 'skip');
  });
});
