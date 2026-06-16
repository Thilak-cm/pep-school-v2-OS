/**
 * PEP-322: Coachmark system — static analysis tests.
 *
 * Verifies the coachmark module structure: Provider, Component, hook,
 * and integration with StudentDashboard for plan feedback coachmark.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const providerPath = new URL('./CoachmarkProvider.jsx', import.meta.url);
const componentPath = new URL('./Coachmark.jsx', import.meta.url);
const hookPath = new URL('./useCoachmark.js', import.meta.url);
const dashboardPath = new URL('../components/StudentDashboard.jsx', import.meta.url);
const appPath = new URL('../App.jsx', import.meta.url);


// ── CoachmarkProvider ──

describe('CoachmarkProvider (PEP-322)', () => {
  it('exports CoachmarkProvider and useCoachmarkContext', async () => {
    const src = await readFile(providerPath, 'utf8');
    assert.ok(
      /export\s+(function|const)\s+CoachmarkProvider/.test(src),
      'Should export CoachmarkProvider',
    );
    assert.ok(
      /export\s+(function|const)\s+useCoachmarkContext/.test(src),
      'Should export useCoachmarkContext hook',
    );
  });

  it('creates a React context', async () => {
    const src = await readFile(providerPath, 'utf8');
    assert.ok(
      /createContext/.test(src),
      'Should use React.createContext',
    );
  });

  it('manages dismissedCoachmarks state', async () => {
    const src = await readFile(providerPath, 'utf8');
    assert.ok(
      /dismissedCoachmarks/.test(src),
      'Should manage dismissedCoachmarks state',
    );
  });

  it('provides dismissCoachmark function', async () => {
    const src = await readFile(providerPath, 'utf8');
    assert.ok(
      /dismissCoachmark/.test(src),
      'Should provide a dismissCoachmark function',
    );
  });

  it('persists dismissed state to localStorage', async () => {
    const src = await readFile(providerPath, 'utf8');
    assert.ok(
      /localStorage/.test(src),
      'Should use localStorage for persistence',
    );
  });

  it('supports tour state management (activeTour, currentStep)', async () => {
    const src = await readFile(providerPath, 'utf8');
    assert.ok(
      /activeTour/.test(src) && /currentStep/.test(src),
      'Should manage activeTour and currentStep state',
    );
  });

  it('provides startTour and advanceTour functions', async () => {
    const src = await readFile(providerPath, 'utf8');
    assert.ok(
      /startTour/.test(src),
      'Should provide startTour function',
    );
    assert.ok(
      /advanceTour/.test(src),
      'Should provide advanceTour function',
    );
  });
});

// ── Coachmark Component ──

describe('Coachmark component (PEP-322)', () => {
  it('exports a default Coachmark component', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /export\s+default\s+function\s+Coachmark/.test(src),
      'Should export default function Coachmark',
    );
  });

  it('accepts coachmarkKey, title, body, anchorRef, placement props', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(/coachmarkKey/.test(src), 'Should accept coachmarkKey prop');
    assert.ok(/\btitle\b/.test(src), 'Should accept title prop');
    assert.ok(/\bbody\b/.test(src), 'Should accept body prop');
    assert.ok(/anchorRef/.test(src), 'Should accept anchorRef prop');
    assert.ok(/placement/.test(src), 'Should accept placement prop');
  });

  it('accepts onDismiss and enabled props', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(/onDismiss/.test(src), 'Should accept onDismiss prop');
    assert.ok(/enabled/.test(src), 'Should accept enabled prop');
  });

  it('supports advanceMode prop (action or next)', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /advanceMode/.test(src),
      'Should accept advanceMode prop for action vs next advance',
    );
  });

  it('renders a backdrop overlay', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /backdrop|overlay|Backdrop/i.test(src),
      'Should render a backdrop/overlay',
    );
  });

  it('renders step progress indicator for tours', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /step.*of|currentStep|totalSteps/i.test(src),
      'Should show step progress (e.g. "Step 2 of 5")',
    );
  });

  it('has pulse animation on target element', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /pulse|@keyframes|animation/i.test(src),
      'Should have a pulse animation',
    );
  });

  it('consumes CoachmarkProvider context', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /useCoachmarkContext/.test(src),
      'Should consume useCoachmarkContext from provider',
    );
  });
});

// ── useCoachmark hook ──

describe('useCoachmark convenience hook (PEP-322)', () => {
  it('exports a default useCoachmark function', async () => {
    const src = await readFile(hookPath, 'utf8');
    assert.ok(
      /export\s+default\s+function\s+useCoachmark/.test(src),
      'Should export default function useCoachmark',
    );
  });

  it('returns isDismissed and dismiss', async () => {
    const src = await readFile(hookPath, 'utf8');
    assert.ok(/isDismissed/.test(src), 'Should return isDismissed');
    assert.ok(/dismiss/.test(src), 'Should return dismiss function');
  });
});

// ── App.jsx integration ──

describe('App.jsx CoachmarkProvider integration (PEP-322)', () => {
  it('imports CoachmarkProvider', async () => {
    const src = await readFile(appPath, 'utf8');
    assert.ok(
      /import\s*\{[^}]*CoachmarkProvider[^}]*\}\s*from\s*['"].*coachmark/.test(src),
      'App.jsx should import CoachmarkProvider from coachmark module',
    );
  });

  it('wraps app content with CoachmarkProvider', async () => {
    const src = await readFile(appPath, 'utf8');
    assert.ok(
      /<CoachmarkProvider/.test(src),
      'App.jsx should render <CoachmarkProvider>',
    );
  });
});

// ── StudentDashboard plan feedback coachmark ──

describe('StudentDashboard plan feedback coachmark (PEP-322)', () => {
  it('imports Coachmark from coachmark module', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /import\s+Coachmark\s+from\s*['"].*coachmark/.test(src),
      'Should import Coachmark component',
    );
  });

  it('has a planFeedbackChipRef', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /planFeedbackChipRef/.test(src),
      'Should define planFeedbackChipRef for coachmark anchoring',
    );
  });

  it('renders Coachmark with plan_feedback key', async () => {
    const src = await readFile(dashboardPath, 'utf8');
    assert.ok(
      /plan_feedback/.test(src) && /Coachmark/.test(src),
      'Should render Coachmark with plan_feedback coachmarkKey',
    );
  });
});

// ── Session vs permanent dismiss ──

describe('Coachmark session vs permanent dismiss (PEP-322)', () => {
  it('has sessionDismissed local state for per-visit dismiss', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /sessionDismissed/.test(src),
      'Should have sessionDismissed state for per-visit dismiss',
    );
  });

  it('has a "Never show again" permanent dismiss option', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /Never show again/.test(src),
      'Should render a "Never show again" button',
    );
  });
});
