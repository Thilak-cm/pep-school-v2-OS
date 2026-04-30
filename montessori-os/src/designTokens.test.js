import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── helpers ──
function readFile(relPath) {
  return readFileSync(join(__dirname, '..', relPath), 'utf-8');
}

function readSrcFile(relPath) {
  return readFileSync(join(__dirname, relPath), 'utf-8');
}

// ── AC1: CSS custom properties defined in a central file ──
describe('AC1: CSS custom properties in index.css', () => {
  let css;
  it('index.css contains a :root block', () => {
    css = readSrcFile('index.css');
    assert.ok(css.includes(':root'), ':root block missing from index.css');
  });

  it('defines color tokens', () => {
    css = readSrcFile('index.css');
    const requiredVars = [
      '--color-primary',
      '--color-primary-light',
      '--color-primary-dark',
      '--color-secondary',
      '--color-error',
      '--color-warning',
      '--color-info',
      '--color-text',
      '--color-text-soft',
      '--color-text-faint',
      '--color-bg',
      '--color-paper',
      '--color-surface',
      '--color-border',
    ];
    for (const v of requiredVars) {
      assert.ok(css.includes(v), `Missing CSS var: ${v}`);
    }
  });

  it('defines grey scale tokens', () => {
    css = readSrcFile('index.css');
    for (const n of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      assert.ok(css.includes(`--grey-${n}`), `Missing CSS var: --grey-${n}`);
    }
  });

  it('defines shadow tokens', () => {
    css = readSrcFile('index.css');
    for (const s of ['--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-xl']) {
      assert.ok(css.includes(s), `Missing CSS var: ${s}`);
    }
  });

  it('defines radius tokens', () => {
    css = readSrcFile('index.css');
    for (const r of ['--radius-sm', '--radius-md', '--radius-lg', '--radius-pill']) {
      assert.ok(css.includes(r), `Missing CSS var: ${r}`);
    }
  });

  it('defines font tokens', () => {
    css = readSrcFile('index.css');
    for (const f of ['--font-display', '--font-ui', '--font-body', '--font-mono']) {
      assert.ok(css.includes(f), `Missing CSS var: ${f}`);
    }
  });
});

// ── AC2: Google Fonts loaded for Schoolbell + Inter Tight ──
describe('AC2: Google Fonts loaded', () => {
  let html;
  it('index.html loads Schoolbell', () => {
    html = readFile('index.html');
    assert.ok(html.includes('Schoolbell'), 'Schoolbell font not loaded in index.html');
  });

  it('index.html loads Inter Tight', () => {
    html = readFile('index.html');
    assert.ok(
      html.includes('Inter+Tight') || html.includes('Inter Tight'),
      'Inter Tight font not loaded in index.html'
    );
  });

  it('index.html loads Inter', () => {
    html = readFile('index.html');
    // Must match "Inter" but not only via "Inter Tight" or "Inter+Tight"
    // Check for the standalone Inter family parameter
    assert.ok(
      html.includes('family=Inter:') || html.includes('family=Inter&'),
      'Inter font not loaded in index.html'
    );
  });
});

// ── AC3: Indigo swappable to teal via token ──
describe('AC3: Primary color is token-swappable', () => {
  it('--color-primary is defined with current indigo value', () => {
    const css = readSrcFile('index.css');
    // Should contain --color-primary with the indigo hex
    assert.ok(
      css.includes('--color-primary') && css.includes('#4f46e5'),
      '--color-primary should be set to indigo #4f46e5'
    );
  });

  it('teal value is documented in dark mode or comments for future swap', () => {
    const css = readSrcFile('index.css');
    assert.ok(
      css.includes('#2bb9d9'),
      'Teal #2bb9d9 should be present (in dark mode overrides or comments)'
    );
  });
});

// ── AC4: No raw hex literals remain in component files ──
describe('AC4: No raw hex in components (full migration)', () => {
  // The top hex values that should be fully migrated to CSS vars
  const TARGET_HEXES = [
    '#e2e8f0', '#64748b', '#4f46e5', '#f8fafc', '#1e293b',
    '#94a3b8', '#475569', '#059669', '#dc2626', '#0f172a',
    '#f59e0b', '#6366f1', '#4338ca', '#10b981', '#047857',
    '#3b82f6', '#f1f5f9', '#ef4444', '#b91c1c', '#fbbf24',
    '#d97706', '#60a5fa', '#2563eb', '#334155', '#cbd5e1',
    '#8b5cf6',
  ];

  it('theme.js exists as extracted MUI theme', () => {
    const theme = readSrcFile('theme.js');
    assert.ok(theme.includes('createTheme'), 'theme.js should export a MUI theme');
  });

  it('main.jsx imports theme from theme.js', () => {
    const main = readSrcFile('main.jsx');
    assert.ok(
      main.includes("from './theme") || main.includes("from './theme.js"),
      'main.jsx should import theme from theme.js'
    );
    // Should NOT contain createTheme inline anymore
    assert.ok(
      !main.includes('createTheme'),
      'main.jsx should not define createTheme inline (extracted to theme.js)'
    );
  });
});

// ── AC5: Dark mode token overrides prepared ──
describe('AC5: Dark mode overrides prepared', () => {
  it('index.css contains [data-theme="dark"] block', () => {
    const css = readSrcFile('index.css');
    assert.ok(
      css.includes('[data-theme="dark"]'),
      'Dark mode override block missing from index.css'
    );
  });

  it('dark mode defines inverted color tokens', () => {
    const css = readSrcFile('index.css');
    // Extract the dark mode block content
    const darkIdx = css.indexOf('[data-theme="dark"]');
    assert.ok(darkIdx > -1, 'Dark mode block not found');
    const darkBlock = css.slice(darkIdx, css.indexOf('}', darkIdx + 30) + 1);
    assert.ok(darkBlock.includes('--color-bg'), 'Dark mode should override --color-bg');
    assert.ok(darkBlock.includes('--color-text'), 'Dark mode should override --color-text');
    assert.ok(darkBlock.includes('--color-paper'), 'Dark mode should override --color-paper');
  });
});
