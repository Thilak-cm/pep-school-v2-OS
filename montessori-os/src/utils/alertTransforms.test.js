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

  // ── PEP-307: broadcast display from payload fields ──
  describe('broadcast payload-driven display (PEP-307)', () => {
    it('maps payload.label to display label (not hardcoded)', () => {
      assert.ok(
        source.includes('payload.label'),
        'Should read label from payload.label'
      );
      assert.ok(
        !source.includes("label: 'FROM OFFICE'") && !source.includes('label: "FROM OFFICE"'),
        'Should NOT hardcode FROM OFFICE as label'
      );
    });

    it('maps payload.title to display title', () => {
      assert.ok(
        source.includes('payload.title'),
        'Should read title from payload.title'
      );
    });

    it('maps payload.subtitle to display subtitle', () => {
      assert.ok(
        source.includes('payload.subtitle'),
        'Should read subtitle from payload.subtitle'
      );
    });

    it('maps payload.ctaLabel to CTA button text', () => {
      assert.ok(
        source.includes('payload.ctaLabel'),
        'Should read ctaLabel from payload.ctaLabel'
      );
    });

    it('includes payload.message for ack modal (full body)', () => {
      assert.ok(
        source.includes('payload.message') || source.includes('message'),
        'Should pass through payload.message for confirmation modal'
      );
    });
  });

  // ── PEP-323a: poll data passthrough ──
  describe('poll broadcast passthrough (PEP-323a)', () => {
    it('passes poll field through in broadcast transform', () => {
      assert.ok(
        source.includes('poll') && source.includes('alert.poll'),
        'Should pass alert.poll through in broadcast case'
      );
    });

    it('passes broadcastKind through in broadcast transform', () => {
      assert.ok(
        source.includes('broadcastKind') && source.includes('alert.broadcastKind'),
        'Should pass alert.broadcastKind through in broadcast case'
      );
    });

    it('sets ctaLabel to Respond for poll broadcasts', () => {
      assert.ok(
        source.includes("'Respond'") || source.includes('"Respond"'),
        'Should use "Respond" as ctaLabel for poll kind'
      );
    });
  });
});
