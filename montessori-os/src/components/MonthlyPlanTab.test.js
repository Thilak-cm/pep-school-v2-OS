/**
 * PEP-260: MonthlyPlanTab component structure tests.
 *
 * Static analysis of MonthlyPlanTab.jsx — verifies the component
 * has the required structure for section pills, accordion items,
 * and expanded detail fields.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const componentPath = new URL('./MonthlyPlanTab.jsx', import.meta.url);

describe('MonthlyPlanTab component (PEP-260)', () => {
  it('exports a default function MonthlyPlanTab', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /export\s+default\s+function\s+MonthlyPlanTab/.test(src),
      'Should export default function MonthlyPlanTab',
    );
  });

  it('defines all 5 section names', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(/Language/.test(src), 'Should reference Language section');
    assert.ok(/Sensorial/.test(src), 'Should reference Sensorial section');
    assert.ok(/Math/.test(src), 'Should reference Math section');
    assert.ok(/Practical Life/.test(src), 'Should reference Practical Life section');
    assert.ok(/Grace.*Courtesy/i.test(src), 'Should reference Grace & Courtesy section');
  });

  it('defines section tint colors', async () => {
    const src = await readFile(componentPath, 'utf8');
    // At least 3 distinct hex colors for sections
    assert.ok(/#4f46e5/i.test(src), 'Should have Language tint color (indigo)');
    assert.ok(/#0d9488/i.test(src), 'Should have Sensorial tint color (teal)');
    assert.ok(/#d97706/i.test(src), 'Should have Math tint color (amber)');
  });

  it('has active section state for pill switching', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /activeSection|selectedSection|currentSection/.test(src),
      'Should have section selection state',
    );
  });

  it('has expanded item state for accordion behavior', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /expandedItem|expandedIndex|openItem/.test(src),
      'Should have expanded item state for accordion',
    );
  });

  it('renders offer field in expanded items', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /\.offer\b/.test(src) || /item\.offer/.test(src) || /OFFER/i.test(src),
      'Should render offer field in expanded items',
    );
  });

  it('renders watch field in expanded items', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /\.watch\b/.test(src) || /item\.watch/.test(src) || /WATCH/i.test(src),
      'Should render watch field in expanded items',
    );
  });

  it('renders next field in expanded items', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /\.next\b/.test(src) || /item\.next/.test(src) || /NEXT/i.test(src),
      'Should render next field in expanded items',
    );
  });

  it('renders hook field in expanded items', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /\.hook\b/.test(src) || /item\.hook/.test(src) || /HOOK/i.test(src),
      'Should render hook field in expanded items',
    );
  });

  it('has chevron affordance for expand/collapse', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /ExpandMore|ExpandLess|KeyboardArrowDown|KeyboardArrowUp|chevron/i.test(src),
      'Should have chevron icon for item expand/collapse affordance',
    );
  });
});
