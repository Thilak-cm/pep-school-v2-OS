import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboardPath = new URL('./StudentDashboard.jsx', import.meta.url);
const snapshotCardPath = new URL('./SnapshotCard.jsx', import.meta.url);
const snapshotBodyPath = new URL('./SnapshotBody.jsx', import.meta.url);

describe('StudentDashboard tab support', () => {
  it('imports HFTabs from ui', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /HFTabs/.test(src),
      'StudentDashboard should import HFTabs for tab switching',
    );
  });

  it('has weekly and writing tab definitions', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(/weekly/i.test(src), 'Should define a Weekly tab');
    assert.ok(/writing/i.test(src), 'Should define a Writing tab');
  });

  it('manages active tab state', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /activeTab/.test(src) && /setActiveTab/.test(src),
      'Should have activeTab state',
    );
  });

  it('renders different note count text per tab', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /notes over last/.test(src),
      'Should show "notes over last X days" for weekly tab',
    );
    assert.ok(
      /writing samples/i.test(src) || /writing analysis/i.test(src),
      'Should show writing-related text for writing tab',
    );
  });

  it('fetches writing_analysis doc for writing tab', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /writing_analysis/.test(src),
      'Should reference writing_analysis Firestore doc',
    );
  });

  it('renders narrative from writing analysis data', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /writingData\??\.(narrative|summary)/.test(src) || /\.narrative/.test(src),
      'Should render the narrative field from writing analysis',
    );
  });

  it('shows empty state when no writing analysis available', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /No writing analysis available/i.test(src),
      'Should show "No writing analysis available" empty state',
    );
  });

  it('writing tab has loading state', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /writingLoading/.test(src),
      'Should have writingLoading state for the writing tab',
    );
  });
});

describe('StudentDashboard Plan tab (PEP-260)', () => {
  it('has plan tab in SNAPSHOT_TABS as the first entry', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    // Plan should be the first tab in SNAPSHOT_TABS array
    const tabsMatch = src.match(/SNAPSHOT_TABS\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(tabsMatch, 'Should define SNAPSHOT_TABS');
    const firstTab = tabsMatch[1].trim();
    assert.ok(
      /plan/i.test(firstTab.split('},')[0] || firstTab.split('}')[0]),
      'First tab in SNAPSHOT_TABS should be Plan',
    );
  });

  it('defaults activeTab to plan', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /useState\(\s*['"]plan['"]\s*\)/.test(src),
      'activeTab should default to "plan"',
    );
  });

  it('imports MonthlyPlanTab component', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /import\s+MonthlyPlanTab\s+from/.test(src),
      'Should import MonthlyPlanTab',
    );
  });

  it('fetches monthly_plan doc for plan tab', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /monthly_plan/.test(src),
      'Should reference monthly_plan Firestore doc',
    );
  });

  it('superadmin regenerate is role-gated', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /isSuperAdmin/.test(src),
      'Should check isSuperAdmin for regenerate button visibility',
    );
  });

  it('calls generateMonthlyPlan CF on regenerate', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /generateMonthlyPlan/.test(src),
      'Should reference generateMonthlyPlan callable',
    );
  });
});

describe('StudentDashboard uniform toolbar', () => {
  it('renders coverage, DoB-missing guard, refresh, and flag in a toolbar row', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    // Toolbar elements: coverage, DoB-missing chip (age moved to header per PEP-243), refresh, flag
    assert.ok(/coverage/i.test(src), 'Toolbar should have coverage element');
    assert.ok(/!ageString/.test(src), 'Toolbar should show DoB-missing chip when age is absent (age display moved to header)');
    assert.ok(/[Rr]efresh|[Rr]egenerate/.test(src), 'Toolbar should have refresh/regenerate button');
    assert.ok(/[Ff]lag|severity/.test(src), 'Toolbar should have flag button');
  });
});

describe('StudentDashboard collapsible chart drawer (PEP-261)', () => {
  it('imports NotesOverTimeDrawer', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /import\s+NotesOverTimeDrawer\s+from/.test(src),
      'StudentDashboard should import NotesOverTimeDrawer',
    );
  });

  it('renders NotesOverTimeDrawer on both tabs', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /NotesOverTimeDrawer/.test(src),
      'Should render NotesOverTimeDrawer component',
    );
    // Drawer should NOT be gated on activeTab — visible on both tabs
    assert.ok(
      !/activeTab\s*===\s*['"]weekly['"][^}]*NotesOverTimeDrawer/.test(src),
      'Drawer should render on both tabs, not gated to weekly only',
    );
  });

  it('scroll-fade height is 28px (halved from 56)', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    // Find the scroll-fade box and check height is 28
    assert.ok(
      /height:\s*28\b/.test(src),
      'Scroll-fade height should be 28px',
    );
    // The scroll-fade block (position absolute, bottom 0) should not have height 56
    const fadeMatch = src.match(/position:\s*'absolute'[^}]*bottom:\s*0[^}]*height:\s*(\d+)/);
    assert.ok(
      fadeMatch && Number(fadeMatch[1]) === 28,
      'Scroll-fade overlay height should be 28, not 56',
    );
  });

  it('does not render old chart footer inline', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    // The old "Chart footer" comment block should be gone
    assert.ok(
      !/Chart footer/.test(src),
      'Old "Chart footer" section should be removed from StudentDashboard',
    );
  });
});

describe('NotesOverTimeDrawer component', () => {
  const drawerPath = new URL('./NotesOverTimeDrawer.jsx', import.meta.url);

  it('exists and exports a default function', async () => {
    const src = await readFile(drawerPath, 'utf8');
    assert.ok(
      /export\s+default\s+function\s+NotesOverTimeDrawer/.test(src),
      'Should export default function NotesOverTimeDrawer',
    );
  });

  it('has collapsed state by default (expanded starts false)', async () => {
    const src = await readFile(drawerPath, 'utf8');
    assert.ok(
      /useState\(\s*false\s*\)/.test(src),
      'Expanded state should default to false (collapsed)',
    );
  });

  it('renders a mini sparkline with last-point dot (AC2)', async () => {
    const src = await readFile(drawerPath, 'utf8');
    assert.ok(
      /LineChart|Line\b/.test(src) || /sparkline/i.test(src),
      'Should have a sparkline element for collapsed strip',
    );
    // Last-point dot: custom dot renderer checking index === data.length - 1
    assert.ok(
      /data\.length\s*-\s*1/.test(src),
      'Sparkline should render a dot only on the last data point',
    );
  });

  it('uses chevron icons for expand/collapse', async () => {
    const src = await readFile(drawerPath, 'utf8');
    assert.ok(
      /ChevronUp/.test(src) && /ChevronDown/.test(src),
      'Should use ChevronUp and ChevronDown icons',
    );
  });

  it('has height transition for animation', async () => {
    const src = await readFile(drawerPath, 'utf8');
    assert.ok(
      /transition/.test(src) && /height/.test(src),
      'Should have height transition for expand/collapse animation',
    );
  });

  it('renders grab handle', async () => {
    const src = await readFile(drawerPath, 'utf8');
    assert.ok(
      /grab.*handle|handle|36/i.test(src) && /rgba\(31,\s*35,\s*40/.test(src),
      'Should render grab handle with specified color',
    );
  });
});

describe('Component rename: BaseballCard → Snapshot', () => {
  it('SnapshotCard.jsx exists and exports default', async () => {
    const src = await readFile(snapshotCardPath, 'utf8');
    assert.ok(
      /export\s+default\s+function\s+SnapshotCard/.test(src),
      'SnapshotCard should be default-exported',
    );
  });

  it('SnapshotBody.jsx exists and exports default', async () => {
    const src = await readFile(snapshotBodyPath, 'utf8');
    assert.ok(
      /export\s+default\s+function\s+SnapshotBody/.test(src),
      'SnapshotBody should be default-exported',
    );
  });

  it('StudentDashboard imports SnapshotBody, not BaseballCard', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /import\s+SnapshotBody\s+from/.test(src),
      'Should import SnapshotBody',
    );
    assert.ok(
      !/import\s+BaseballCardSnapshotCard\s+from/.test(src),
      'Should NOT import BaseballCardSnapshotCard (old name)',
    );
  });

  it('SnapshotCard imports SnapshotBody, not BaseballCardBody', async () => {
    const src = await readFile(snapshotCardPath, 'utf8');
    assert.ok(
      /import\s+SnapshotBody\s+from/.test(src),
      'SnapshotCard should import SnapshotBody',
    );
    assert.ok(
      !/BaseballCardBody/.test(src),
      'Should NOT reference BaseballCardBody (old name)',
    );
  });
});
