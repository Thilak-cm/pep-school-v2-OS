import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'MarkdownMessage.jsx'), 'utf-8');

test('MarkdownMessage renders safe progressive Markdown without raw HTML', () => {
  assert.match(source, /ReactMarkdown/);
  assert.match(source, /skipHtml/);
  assert.match(source, /components/);
  assert.match(source, /code/);
  assert.match(source, /ul/);
  assert.match(source, /ol/);
  assert.match(source, /a/);
  assert.doesNotMatch(source, /rehypeRaw/);
});

test('MarkdownMessage uses safe external link attributes', () => {
  assert.match(source, /safeLinkProps/);
  assert.match(source, /href/);
});
