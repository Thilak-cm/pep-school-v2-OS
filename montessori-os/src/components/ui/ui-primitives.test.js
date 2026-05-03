import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXEMPT_MARKERS = ['Recharts', 'hex required', 'hex-alpha'];

function readUiFile(name) {
  return readFileSync(join(__dirname, name), 'utf-8');
}

// ── AC1: Components live in a shared location ──
describe('AC1: Components in components/ui/', () => {
  const expectedFiles = [
    'HFHeader.jsx',
    'HFTabs.jsx',
    'HFSegmented.jsx',
    'DayHeader.jsx',
    'Avatar.jsx',
    'KidAvatar.jsx',
    'MiniTangram.jsx',
    'Chip.jsx',
    'HFSearchInput.jsx',
    'HFFilterChip.jsx',
    'HFRangeBar.jsx',
    'LineChart.jsx',
    'BarChart.jsx',
    'Donut.jsx',
    'NotesTimeline.jsx',
    'Spark.jsx',
    'index.js',
  ];

  for (const file of expectedFiles) {
    it(`${file} exists in components/ui/`, () => {
      assert.ok(
        existsSync(join(__dirname, file)),
        `Missing: components/ui/${file}`
      );
    });
  }

  it('barrel index.js re-exports all components', () => {
    const barrel = readUiFile('index.js');
    const components = expectedFiles
      .filter(f => f.endsWith('.jsx'))
      .map(f => f.replace('.jsx', ''));
    for (const name of components) {
      assert.ok(
        barrel.includes(name),
        `Barrel missing export for ${name}`
      );
    }
  });
});

// ── AC2: Each component exports a React component ──
describe('AC2: Components are valid React components', () => {
  const componentFiles = [
    'HFHeader.jsx',
    'HFTabs.jsx',
    'HFSegmented.jsx',
    'DayHeader.jsx',
    'Avatar.jsx',
    'KidAvatar.jsx',
    'MiniTangram.jsx',
    'Chip.jsx',
    'HFSearchInput.jsx',
    'HFFilterChip.jsx',
    'HFRangeBar.jsx',
    'LineChart.jsx',
    'BarChart.jsx',
    'Donut.jsx',
    'NotesTimeline.jsx',
    'Spark.jsx',
  ];

  for (const file of componentFiles) {
    it(`${file} has a default or named export function`, () => {
      const content = readUiFile(file);
      // Must contain either `export default function` or `export function` or `export default`
      const hasExport =
        content.includes('export default function') ||
        content.includes('export default') ||
        content.includes('export function');
      assert.ok(hasExport, `${file} does not export a component`);
    });
  }
});

// ── AC3: Components use design tokens (no raw hex) ──
describe('AC3: No raw hex in ui primitives', () => {
  const TARGET_HEXES = [
    '#e2e8f0', '#64748b', '#4f46e5', '#f8fafc', '#1e293b',
    '#94a3b8', '#475569', '#059669', '#dc2626', '#0f172a',
    '#f59e0b', '#6366f1', '#4338ca', '#10b981', '#047857',
    '#3b82f6', '#f1f5f9', '#ef4444', '#b91c1c', '#fbbf24',
    '#d97706', '#60a5fa', '#2563eb', '#334155', '#cbd5e1',
    '#8b5cf6', '#0ea5e9', '#f0f0f0',
  ];

  it('no TARGET_HEXES in ui/*.jsx files (Recharts exempt)', () => {
    const violations = [];
    for (const entry of readdirSync(__dirname)) {
      if (!entry.endsWith('.jsx')) continue;
      const content = readFileSync(join(__dirname, entry), 'utf-8');
      const lines = content.split('\n');
      for (const hex of TARGET_HEXES) {
        const hexLower = hex.toLowerCase();
        const hasUnexemptedUse = lines.some((line) => {
          if (!line.toLowerCase().includes(hexLower)) return false;
          return !EXEMPT_MARKERS.some((m) => line.includes(m));
        });
        if (hasUnexemptedUse) {
          violations.push(`${entry} contains ${hex}`);
        }
      }
    }
    assert.deepStrictEqual(
      violations,
      [],
      `Raw hex found in ui primitives:\n${violations.join('\n')}`
    );
  });
});

// ── AC4: All color references use var(--*) tokens ──
describe('AC4: Colors via CSS custom properties', () => {
  // Non-chart components should not contain any #xxx or #xxxxxx hex patterns
  // (chart components are exempt when marked)
  const nonChartFiles = [
    'HFHeader.jsx',
    'HFTabs.jsx',
    'HFSegmented.jsx',
    'DayHeader.jsx',
    'Avatar.jsx',
    'KidAvatar.jsx',
    'MiniTangram.jsx',
    'Chip.jsx',
    'HFSearchInput.jsx',
    'HFFilterChip.jsx',
    'HFRangeBar.jsx',
  ];

  for (const file of nonChartFiles) {
    it(`${file} uses no raw hex colors`, () => {
      const content = readUiFile(file);
      const lines = content.split('\n');
      const hexLines = lines.filter((line) => {
        // Match #xxx or #xxxxxx hex color patterns (not in comments or imports)
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return false;
        if (line.includes('import ')) return false;
        return /#[0-9a-fA-F]{3,8}\b/.test(line);
      });
      assert.deepStrictEqual(
        hexLines.map(l => l.trim()),
        [],
        `${file} contains raw hex colors — use var(--*) tokens instead`
      );
    });

    it(`${file} uses no hardcoded rgba() colors`, () => {
      const content = readUiFile(file);
      const lines = content.split('\n');
      const rgbaLines = lines.filter((line) => {
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return false;
        if (line.includes('import ')) return false;
        if (EXEMPT_MARKERS.some((m) => line.includes(m))) return false;
        return /rgba\([^)]+\)/.test(line);
      });
      assert.deepStrictEqual(
        rgbaLines.map(l => l.trim()),
        [],
        `${file} contains hardcoded rgba() — use var(--*) tokens or color-mix() instead`
      );
    });
  }
});

// ── AC5: Chart components accept data props ──
describe('AC5: Chart components accept data props', () => {
  const chartFiles = [
    { file: 'LineChart.jsx', props: ['data'] },
    { file: 'BarChart.jsx', props: ['data'] },
    { file: 'Donut.jsx', props: ['data'] },
    { file: 'NotesTimeline.jsx', props: ['data'] },
    { file: 'Spark.jsx', props: ['data'] },
  ];

  for (const { file, props } of chartFiles) {
    it(`${file} destructures expected props`, () => {
      const content = readUiFile(file);
      for (const prop of props) {
        assert.ok(
          content.includes(prop),
          `${file} should accept a "${prop}" prop`
        );
      }
    });

    it(`${file} renders SVG or Recharts elements`, () => {
      const content = readUiFile(file);
      const rendersSvg =
        content.includes('<svg') ||
        content.includes('<Svg') ||
        content.includes('ResponsiveContainer') ||
        content.includes('recharts');
      assert.ok(rendersSvg, `${file} should render SVG or Recharts charts`);
    });
  }
});
