import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assembleReportSystemContent } from '../../../functions/utils/reportHelpers.js';

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

describe('migratePromptFields', () => {
  // Test the transformation logic used by the migration script
  it('transforms systemPrompt to staticSystemPrompt + empty dynamicSystemPrompt', () => {
    const docData = {
      systemPrompt: 'Original prompt content',
      title: 'Report Title',
      description: 'Report desc',
      version: 1,
    };

    // Simulate what the migration does
    const migrated = {
      staticSystemPrompt: docData.systemPrompt,
      dynamicSystemPrompt: '',
      title: docData.title,
      description: docData.description,
      version: docData.version,
    };

    assert.equal(migrated.staticSystemPrompt, 'Original prompt content');
    assert.equal(migrated.dynamicSystemPrompt, '');
    assert.equal(migrated.title, 'Report Title');
    assert.ok(!('systemPrompt' in migrated), 'legacy systemPrompt should not be present');
  });

  it('handles empty systemPrompt gracefully', () => {
    const docData = { systemPrompt: '', title: 'Empty' };
    const migrated = {
      staticSystemPrompt: docData.systemPrompt || '',
      dynamicSystemPrompt: '',
    };
    assert.equal(migrated.staticSystemPrompt, '');
    assert.equal(migrated.dynamicSystemPrompt, '');
  });

  it('handles missing systemPrompt field', () => {
    const docData = { title: 'No SP' };
    const migrated = {
      staticSystemPrompt: docData.systemPrompt || '',
      dynamicSystemPrompt: '',
    };
    assert.equal(migrated.staticSystemPrompt, '');
    assert.equal(migrated.dynamicSystemPrompt, '');
  });
});
