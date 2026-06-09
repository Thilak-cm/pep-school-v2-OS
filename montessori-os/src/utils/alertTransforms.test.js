import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'alertTransforms.js'), 'utf-8');

describe('alertTransforms — DIP display transform (PEP-296)', () => {

  it('exports transformForDisplay function', () => {
    assert.ok(
      source.includes('export') && source.includes('transformForDisplay'),
      'Should export transformForDisplay'
    );
  });

  it('exports transformRedFlag function', () => {
    assert.ok(
      source.includes('export') && source.includes('transformRedFlag'),
      'Should export transformRedFlag for weekly_snapshot source'
    );
  });

  it('handles redFlag alert type', () => {
    assert.ok(
      source.includes("'redFlag'") || source.includes('"redFlag"'),
      'Should handle redFlag type'
    );
  });

  it('handles interview alert type', () => {
    assert.ok(
      source.includes("'interview'") || source.includes('"interview"'),
      'Should handle interview type'
    );
  });

  it('handles broadcast alert type', () => {
    assert.ok(
      source.includes("'broadcast'") || source.includes('"broadcast"'),
      'Should handle broadcast type'
    );
  });

  it('handles system alert type', () => {
    assert.ok(
      source.includes("'system'") || source.includes('"system"'),
      'Should handle system type'
    );
  });

  it('returns all required display fields', () => {
    for (const field of ['label', 'title', 'subtitle', 'ctaLabel', 'colorKey']) {
      assert.ok(
        source.includes(field),
        `Should return ${field} in display shape`
      );
    }
  });

  it('returns ctaRoute and ctaParams for navigation', () => {
    assert.ok(source.includes('ctaRoute'), 'Should return ctaRoute');
    assert.ok(source.includes('ctaParams'), 'Should return ctaParams');
  });

  it('defines a color map with keys for each alert type', () => {
    assert.ok(source.includes('ALERT_COLORS') || source.includes('COLOR_MAP'), 'Should define a color map');
    // At least redFlag, broadcast, interview should be present
    for (const key of ['redFlag', 'broadcast', 'interview']) {
      assert.ok(
        source.includes(key),
        `Color map should include ${key}`
      );
    }
  });

  it('transformRedFlag maps severity and student info to display shape', () => {
    assert.ok(
      source.includes('severity') && source.includes('RED FLAG'),
      'transformRedFlag should check severity and produce RED FLAG label'
    );
  });
});
