import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'coach_nudge.jsx'), 'utf-8');

describe('CoachNudge component (PEP-265)', () => {
  it('does not have a useEffect that resets selections from initialSelections', () => {
    // The bug: a useEffect watched mergedInitialSelections and called
    // setSelections() on every parent re-render, creating a feedback loop
    // that caused TextFields to lose focus on mobile.
    //
    // The fix: remove the useEffect entirely — CoachNudge should own its
    // state via useState(mergedInitialSelections) and never re-sync from props.
    const useEffectCalls = source.match(/useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*setSelections\s*\(/g);
    assert.equal(useEffectCalls, null, 'Should not have a useEffect that calls setSelections — this causes a feedback loop on mobile (PEP-265)');
  });

  it('initializes selections from mergedInitialSelections via useState', () => {
    // CoachNudge should read initialSelections once at mount via useState
    assert.ok(
      source.includes('useState(mergedInitialSelections)'),
      'Should initialize selections state from mergedInitialSelections'
    );
  });

  it('calls onSelectionsChange when selections update', () => {
    // Parent still needs to know about selection changes for save purposes
    assert.ok(
      source.includes('onSelectionsChange'),
      'Should call onSelectionsChange to report selections to parent'
    );
  });

  it('renders the objective one-liner TextField for SUBJECTIVE nudge', () => {
    assert.ok(
      source.includes('Objective one-liner'),
      'Should render a TextField with label "Objective one-liner"'
    );
  });

  it('renders chip-based nudges for DURATION, MODALITY, INDEPENDENCE', () => {
    assert.ok(source.includes('NUDGE_IDS.DURATION'), 'Should handle DURATION nudge');
    assert.ok(source.includes('NUDGE_IDS.MODALITY'), 'Should handle MODALITY nudge');
    assert.ok(source.includes('NUDGE_IDS.INDEPENDENCE'), 'Should handle INDEPENDENCE nudge');
  });
});
