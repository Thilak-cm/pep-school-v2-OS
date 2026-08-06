import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../../..');
let vite;
let MarkdownMessage;

before(async () => {
  vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });
  ({ default: MarkdownMessage } = await vite.ssrLoadModule('/src/components/chat/MarkdownMessage.jsx'));
});

after(async () => {
  await vite?.close();
});

function renderMarkdown(markdown) {
  return renderToStaticMarkup(React.createElement(MarkdownMessage, null, markdown));
}

test('MarkdownMessage renders the supported Markdown element structure', () => {
  const html = renderMarkdown(`# Heading

## Subheading

### Detail heading

Paragraph with *emphasis*, **strong text**, and \`inline code\`.

1. First ordered item
2. Second ordered item

- First unordered item
- Second unordered item

\`\`\`js
const answer = 42;
\`\`\``);

  assert.match(html, /<h1[^>]*>Heading<\/h1>/);
  assert.match(html, /<h2[^>]*>Subheading<\/h2>/);
  assert.match(html, /<h3[^>]*>Detail heading<\/h3>/);
  assert.match(html, /<p[^>]*>Paragraph with/);
  assert.match(html, /<em[^>]*>emphasis<\/em>/);
  assert.match(html, /<strong[^>]*>strong text<\/strong>/);
  assert.match(html, /<code[^>]*>inline code<\/code>/);
  assert.match(html, /<ol[^>]*>[\s\S]*<li[^>]*>First ordered item<\/li>/);
  assert.match(html, /<ul[^>]*>[\s\S]*<li[^>]*>First unordered item<\/li>/);
  assert.match(html, /<pre[^>]*>[\s\S]*<code[^>]*class="[^"]*language-js[^"]*"[^>]*>const answer = 42;\n<\/code>[\s\S]*<\/pre>/);
});

test('MarkdownMessage secures links and does not render raw HTML', () => {
  const html = renderMarkdown(`[Safe link](https://example.com/docs)

[Unsafe link](javascript:alert('nope'))

<section>Raw HTML must not render</section>`);
  const safeAnchor = html.match(/<a[^>]*href="https:\/\/example\.com\/docs"[^>]*>/)?.[0];

  assert.ok(safeAnchor, 'the safe https link renders as an anchor');
  assert.match(safeAnchor, /target="_blank"/);
  assert.match(safeAnchor, /rel="noopener noreferrer"/);
  assert.match(html, />Unsafe link<\/span>/);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /<section/i);
  assert.doesNotMatch(html, /Raw HTML must not render/);
});
