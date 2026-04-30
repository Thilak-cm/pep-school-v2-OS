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
    'MessageCircle', 'Sparkles', 'ShieldCheck', 'Circle',
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
