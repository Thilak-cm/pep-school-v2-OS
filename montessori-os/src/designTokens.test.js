import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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
    for (const f of ['--font-body', '--font-mono']) {
      assert.ok(css.includes(f), `Missing CSS var: ${f}`);
    }
  });
});

// ── AC2: Google Fonts loaded ──
describe('AC2: Google Fonts loaded', () => {
  it('index.html loads Inter', () => {
    const html = readFile('index.html');
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

  it('no TARGET_HEXES remain in component or page files', () => {
    // Collect all .jsx files to scan
    const componentsDir = join(__dirname, 'components');
    const coachDir = join(__dirname, 'coach');
    const filesToScan = [];

    // src/components/**/*.jsx (recursive)
    const scanDir = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) scanDir(join(dir, entry.name));
        else if (entry.name.endsWith('.jsx')) filesToScan.push(join(dir, entry.name));
      }
    };
    scanDir(componentsDir);

    // src/coach/*.jsx
    try {
      for (const f of readdirSync(coachDir)) {
        if (f.endsWith('.jsx')) filesToScan.push(join(coachDir, f));
      }
    } catch { /* coach dir may not exist */ }

    // Root src/*.jsx files
    for (const f of readdirSync(__dirname)) {
      if (f.endsWith('.jsx')) filesToScan.push(join(__dirname, f));
    }

    const violations = [];
    // Lines containing these markers are intentional hex uses (Recharts JS props,
    // hex-alpha concatenation) where CSS vars cannot work.
    const EXEMPT_MARKERS = ['Recharts', 'hex required', 'hex-alpha'];
    for (const filePath of filesToScan) {
      // Skip theme.js (legitimately contains hex for MUI)
      if (filePath.endsWith('theme.js')) continue;
      const lines = readFileSync(filePath, 'utf-8').split('\n');
      for (const hex of TARGET_HEXES) {
        const hexLower = hex.toLowerCase();
        const hasUnexemptedUse = lines.some((line) => {
          if (!line.toLowerCase().includes(hexLower)) return false;
          // Allow if this line (or prior line) is marked as intentional
          return !EXEMPT_MARKERS.some((m) => line.includes(m));
        });
        if (hasUnexemptedUse) {
          const relName = filePath.split('/').slice(-2).join('/');
          violations.push(`${relName} contains ${hex}`);
        }
      }
    }
    assert.deepStrictEqual(violations, [], `Raw hex values found in component files:\n${violations.join('\n')}`);
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
