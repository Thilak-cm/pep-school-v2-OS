/**
 * PEP-137: WritingAnalysisTab component structure tests.
 *
 * Static analysis of WritingAnalysisTab.jsx — verifies the component
 * has the required structure for narrative, dimension ratings,
 * recommendations, confidence, metadata, and empty states.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const componentPath = new URL('./WritingAnalysisTab.jsx', import.meta.url);

describe('WritingAnalysisTab component (PEP-137)', () => {
  // ── Structure ──

  it('exports a default function WritingAnalysisTab', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /export\s+default\s+function\s+WritingAnalysisTab/.test(src),
      'Should export default function WritingAnalysisTab',
    );
  });

  it('accepts writingData, hwCount, and totalMediaCount props', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(/writingData/.test(src), 'Should reference writingData prop');
    assert.ok(/hwCount/.test(src), 'Should reference hwCount prop');
    assert.ok(/totalMediaCount/.test(src), 'Should reference totalMediaCount prop');
  });

  // ── Meta line (rendered by parent StudentDashboard, not this component) ──
  // sampleCount, copiedCount, generatedAt are rendered in the parent's chip row.
  // WritingAnalysisTab only renders the scrollable content (narrative, ratings, recs, confidence).

  // ── Narrative ──

  it('renders narrative field without a section heading', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(/narrative/.test(src), 'Should render narrative field');
  });

  // ── Ratings ──

  it('has a Ratings section with dimension cards', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(/Ratings/i.test(src), 'Should have Ratings heading');
    assert.ok(/dimensionRatings/.test(src), 'Should reference dimensionRatings');
  });

  it('renders score, trend, and handles null score gracefully', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(/\.score/.test(src), 'Should reference dimension score');
    assert.ok(/\.trend/.test(src), 'Should reference dimension trend');
    // Null score should render a dash or fallback
    assert.ok(
      /score\s*===?\s*null|score\s*==\s*null|!.*score|score.*\?\?|score.*\?/.test(src),
      'Should handle null score gracefully',
    );
  });

  it('converts camelCase dimension keys to human-readable labels', async () => {
    const src = await readFile(componentPath, 'utf8');
    // Should have a camelCase-to-label conversion function, not hardcoded dimension names
    assert.ok(
      /camelCase|split|replace.*[A-Z]|charAt.*toUpperCase|\.replace\(/.test(src),
      'Should have camelCase-to-label conversion logic',
    );
    // Should NOT hardcode primary/elementary/adolescent dimension names
    assert.ok(
      !/handControl.*letterFormation.*spacingAndPageUse/.test(src),
      'Should NOT hardcode dimension names in a static list',
    );
  });

  it('renders trend icons for improving, declining, and stable', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(/improving/.test(src), 'Should handle improving trend');
    assert.ok(/declining/.test(src), 'Should handle declining trend');
    assert.ok(/stable/.test(src), 'Should handle stable trend');
  });

  // ── Recommendations ──

  it('has recommendations section with priority, area, montessoriApproach, and expandable action', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(/recommendations/.test(src), 'Should reference recommendations');
    assert.ok(/\.priority/.test(src), 'Should render priority');
    assert.ok(/\.area/.test(src), 'Should render area');
    assert.ok(/montessoriApproach/.test(src), 'Should render montessoriApproach');
    assert.ok(/\.action/.test(src), 'Should render action text');
  });

  it('has expanded state with first recommendation open by default', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /expandedRec|expandedIdx|expanded.*0|useState\(0\)/.test(src),
      'Should have expanded state defaulting to first item (index 0)',
    );
  });

  // ── Confidence (rendered by parent StudentDashboard as Gauge chip + popover) ──
  // Confidence UI moved to parent chip row — not in this component.

  // ── Empty states ──

  it('shows "No photos uploaded yet" empty state', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /No photos uploaded yet/i.test(src),
      'Should show "No photos uploaded yet" for zero media',
    );
  });

  it('shows "Upload 3 handwritten notes" action text', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /Upload.*3.*handwrit/i.test(src),
      'Should prompt to upload 3 handwritten notes',
    );
  });

  it('shows handwriting vs other breakdown when media exists but no analysis', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /handwriting/i.test(src) && /other/i.test(src),
      'Should show handwriting vs other breakdown',
    );
  });

  it('shows progress toward threshold of 3', async () => {
    const src = await readFile(componentPath, 'utf8');
    // Progress bar or indicator should reference threshold of 3
    assert.ok(
      /threshold|minSamples|need.*3|at least 3|of\s*3/i.test(src),
      'Should show progress toward threshold of 3',
    );
  });

  it('shows "Log N more" action text for below-threshold state', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /Log.*more.*handwrit/i.test(src),
      'Should show "Log N more handwriting" prompt',
    );
  });
});
