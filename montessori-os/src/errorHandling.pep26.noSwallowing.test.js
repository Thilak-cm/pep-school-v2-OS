import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SCOPED_FILES = [
  './components/ChildChat.jsx',
  './components/ClassroomTimeline.jsx',
  './components/AddNoteModal.jsx',
  './components/GraduateStudentsPage.jsx',
  './components/noteBottomSheet/NoteBottomSheet.jsx',
  './components/noteBottomSheet/useMediaPreview.js',
  './components/UsersAccessPage.jsx',
  './components/StudentTimeline.jsx',
  './components/NotificationsPage.jsx',
  './notifications/NotificationContext.jsx',
  './VoiceRecorder.jsx',
  './whisperSTT.js',
];

const CATCH_BLOCK_RE = /catch\s*\(([^)]*)\)\s*\{([\s\S]*?)\}/g;
const PROMISE_CATCH_ARROW_RE = /\.catch\s*\(\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{([\s\S]*?)\}\s*\)/g;

function stripComments(text) {
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1');
}

function isCommentOnly(text) {
  return stripComments(text).trim() === '';
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

async function collectFileViolations() {
  const violations = [];

  for (const relativePath of SCOPED_FILES) {
    const sourceUrl = new URL(relativePath, import.meta.url);
    const source = await readFile(sourceUrl, 'utf8');

    for (const match of source.matchAll(CATCH_BLOCK_RE)) {
      const body = match[2] ?? '';
      if (!isCommentOnly(body)) continue;
      violations.push({
        file: relativePath.replace(/^\.\//, 'src/'),
        line: lineNumber(source, match.index ?? 0),
        type: 'empty-try-catch',
      });
    }

    for (const match of source.matchAll(PROMISE_CATCH_ARROW_RE)) {
      const body = match[1] ?? '';
      if (!isCommentOnly(body)) continue;
      violations.push({
        file: relativePath.replace(/^\.\//, 'src/'),
        line: lineNumber(source, match.index ?? 0),
        type: 'empty-promise-catch',
      });
    }
  }

  return violations.sort((a, b) =>
    a.file.localeCompare(b.file) || a.line - b.line || a.type.localeCompare(b.type)
  );
}

function formatViolations(violations) {
  return violations
    .map((v) => `- ${v.type} at ${v.file}:${v.line}`)
    .join('\n');
}

test('PEP-26 scoped files do not silently swallow caught errors', async () => {
  const violations = await collectFileViolations();

  assert.equal(
    violations.length,
    0,
    `Found silent catch handlers that should log/report errors:\n${formatViolations(violations)}`,
  );
});
