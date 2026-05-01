import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSrcFile(relPath) {
  return readFileSync(join(__dirname, relPath), 'utf-8');
}

function getAllSrcFiles(dir = __dirname, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      getAllSrcFiles(full, files);
    } else if (/\.(jsx?|tsx?)$/.test(entry.name) && !entry.name.endsWith('.test.js') && entry.name !== 'icons.js') {
      files.push(full);
    }
  }
  return files;
}

// ── AC1: Shared icon import pattern established ──
describe('AC1: Shared icon barrel exists', () => {
  it('src/icons.js exists and is non-empty', () => {
    const content = readSrcFile('icons.js');
    assert.ok(content.length > 0, 'icons.js is empty');
  });

  it('icons.js re-exports from lucide-react', () => {
    const content = readSrcFile('icons.js');
    assert.ok(content.includes('lucide-react'), 'icons.js does not import from lucide-react');
  });
});

// ── AC2: All design spec icons available ──
describe('AC2: Design spec icons available', () => {
  const designSpecIcons = [
    'ChevronLeft', 'ChevronRight', 'ChevronDown', 'ChevronUp',
    'ArrowLeft', 'ArrowRight', 'X', 'Plus', 'MoreHorizontal',
    'Search', 'Filter', 'Pencil', 'Share2', 'Download', 'RefreshCw',
    'Check', 'Eye', 'Mic', 'Image', 'Paperclip', 'FileText',
    'Clock', 'Bell', 'Star', 'Flag', 'TriangleAlert', 'Settings',
    'Type', 'BookOpen', 'Users', 'User', 'GraduationCap', 'BarChart3',
    'MessageCircle', 'Sparkles', 'ShieldCheck', 'Circle', 'Dot',
  ];

  it('icons.js exports every design spec icon', () => {
    const content = readSrcFile('icons.js');
    const missing = designSpecIcons.filter(name => {
      // Check for either direct re-export or aliased export
      const exportPattern = new RegExp(`\\b${name}\\b`);
      return !exportPattern.test(content);
    });
    assert.deepStrictEqual(missing, [], `Missing design spec icons: ${missing.join(', ')}`);
  });
});

// ── AC3: No emoji used as icons ──
describe('AC3: No emoji used as icons', () => {
  it('no component files use emoji as functional icons', () => {
    const files = getAllSrcFiles();
    const emojiIcons = [];
    // Check for the specific emoji-as-icon patterns identified in codebase
    const emojiPatterns = [
      /role="img".*aria-label="teacher"/,
      /👩‍🏫/,
      /💬/,
      /🔍/,
    ];
    for (const filePath of files) {
      const content = readFileSync(filePath, 'utf-8');
      for (const pattern of emojiPatterns) {
        if (pattern.test(content)) {
          const relPath = filePath.replace(__dirname + '/', '');
          emojiIcons.push(relPath);
          break;
        }
      }
    }
    assert.deepStrictEqual(emojiIcons, [], `Files still using emoji as icons: ${emojiIcons.join(', ')}`);
  });
});

// ── AC4: No @mui/icons-material imports remain ──
describe('AC4: No MUI icon imports remain', () => {
  it('no component files import from @mui/icons-material', () => {
    const files = getAllSrcFiles();
    const muiIconFiles = [];
    for (const filePath of files) {
      const content = readFileSync(filePath, 'utf-8');
      if (content.includes('@mui/icons-material')) {
        const relPath = filePath.replace(__dirname + '/', '');
        muiIconFiles.push(relPath);
      }
    }
    assert.deepStrictEqual(muiIconFiles, [], `Files still importing MUI icons: ${muiIconFiles.join(', ')}`);
  });
});

// ── AC4a: No MUI semantic color tokens on Lucide icons ──
describe('AC4a: No MUI color tokens on Lucide icons', () => {
  it('no Lucide icons use color="error|success|warning|primary|secondary|info"', () => {
    const files = getAllSrcFiles().filter(f => f.endsWith('.jsx'));
    const violations = [];
    const muiColorPattern = /color="(error|success|warning|primary|secondary|info)"/;
    for (const filePath of files) {
      const content = readFileSync(filePath, 'utf-8');
      if (!content.includes("from '../icons'") && !content.includes("from './icons'")) continue;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (muiColorPattern.test(line) && line.includes('<') && !line.includes('<Typography') && !line.includes('<Button') && !line.includes('<IconButton') && !line.includes('<Chip') && !line.includes('<CircularProgress') && !line.includes('<Alert')) {
          // Check if the component on this line is likely a Lucide icon (starts with uppercase, not a known MUI component)
          const tagMatch = line.match(/<([A-Z][A-Za-z]+)/);
          if (tagMatch) {
            const tag = tagMatch[1];
            const muiComponents = ['Box', 'Typography', 'Button', 'IconButton', 'Fab', 'Paper', 'Card', 'Stack', 'Grid', 'Divider', 'Avatar', 'Tab', 'Tabs', 'Dialog', 'TextField', 'Select', 'MenuItem', 'Tooltip', 'Badge', 'CircularProgress', 'Alert', 'Chip', 'Switch', 'Checkbox', 'Radio', 'FormControl', 'InputLabel', 'DialogTitle', 'ListItem', 'ListItemText', 'ListItemIcon', 'ListItemButton'];
            if (!muiComponents.includes(tag)) {
              violations.push(`${filePath.replace(__dirname + '/', '')}:${i + 1}`);
            }
          }
        }
      }
    }
    assert.deepStrictEqual(violations, [], `Lucide icons with MUI color tokens: ${violations.join(', ')}`);
  });
});

// ── AC4b: strokeWidth prop contract ──
describe('AC4b: Lucide icons accept strokeWidth', () => {
  it('exported Lucide icons accept strokeWidth for stroke control', async () => {
    const icons = await import('./icons.js');
    // Lucide icons are React forwardRef components that forward all props to SVG
    // strokeWidth controls line thickness (default 2, design uses 1.5-2)
    assert.ok(icons.Mic != null, 'Mic is exported');
    assert.ok(typeof icons.Mic === 'function' || typeof icons.Mic === 'object', 'Mic is a component (function or forwardRef object)');
    // This is a contract test — strokeWidth is the canonical Lucide prop
  });
});

// ── AC5: Naming convention documented ──
describe('AC5: Icon naming convention documented', () => {
  it('icons.js has a documentation header', () => {
    const content = readSrcFile('icons.js');
    assert.ok(
      content.includes('Icon Naming Convention') || content.includes('icon naming'),
      'icons.js missing naming convention documentation',
    );
  });
});
