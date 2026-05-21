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

describe('StudentDashboard uniform toolbar', () => {
  it('renders coverage, age, refresh, and flag in a toolbar row', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    // All four toolbar elements should be present
    assert.ok(/coverage/i.test(src), 'Toolbar should have coverage element');
    assert.ok(/age/i.test(src) || /ageString/.test(src), 'Toolbar should have age chip');
    assert.ok(/[Rr]efresh|[Rr]egenerate/.test(src), 'Toolbar should have refresh/regenerate button');
    assert.ok(/[Ff]lag|severity/.test(src), 'Toolbar should have flag button');
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
