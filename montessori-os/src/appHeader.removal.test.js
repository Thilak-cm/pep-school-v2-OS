import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSrcFile(relPath) {
  return readFileSync(join(__dirname, relPath), 'utf-8');
}

// ── PEP-215: AppHeader removal ──────────────────────────────────────────────

describe('PEP-215: AppHeader removed from app shell', () => {
  it('AppHeader.jsx no longer exists', () => {
    assert.ok(
      !existsSync(join(__dirname, 'AppHeader.jsx')),
      'AppHeader.jsx should be deleted'
    );
  });

  it('App.jsx does not import AppHeader', () => {
    const app = readSrcFile('App.jsx');
    assert.ok(
      !app.includes("import AppHeader"),
      'App.jsx should not import AppHeader'
    );
  });

  it('App.jsx does not render <AppHeader', () => {
    const app = readSrcFile('App.jsx');
    assert.ok(
      !app.includes('<AppHeader'),
      'App.jsx should not render AppHeader'
    );
  });

  it('App.jsx does not have the 64px paddingTop offset for AppHeader', () => {
    const app = readSrcFile('App.jsx');
    assert.ok(
      !app.includes("calc(64px"),
      'App.jsx should not have the 64px paddingTop offset'
    );
  });
});

// ── PEP-215: HFHeader is left-aligned ───────────────────────────────────────

describe('PEP-215: HFHeader uses left-aligned titles', () => {
  it('HFHeader does not use textAlign center', () => {
    const header = readSrcFile('components/ui/HFHeader.jsx');
    // Filter out comments
    const codeLines = header.split('\n').filter(l => {
      const trimmed = l.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    });
    const code = codeLines.join('\n');
    assert.ok(
      !code.includes("textAlign: 'center'") && !code.includes('textAlign: "center"'),
      'HFHeader title should not be center-aligned'
    );
  });

  it('HFHeader does not use justifySelf center', () => {
    const header = readSrcFile('components/ui/HFHeader.jsx');
    const codeLines = header.split('\n').filter(l => {
      const trimmed = l.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    });
    const code = codeLines.join('\n');
    assert.ok(
      !code.includes("justifySelf: 'center'") && !code.includes('justifySelf: "center"'),
      'HFHeader title should not use justifySelf center'
    );
  });
});

// ── PEP-215: ScreenRenderer renders HFHeader ────────────────────────────────

describe('PEP-215: ScreenRenderer renders inline headers', () => {
  it('ScreenRenderer imports HFHeader', () => {
    const sr = readSrcFile('ScreenRenderer.jsx');
    assert.ok(
      sr.includes('HFHeader'),
      'ScreenRenderer should import HFHeader'
    );
  });

  it('ScreenRenderer renders HFHeader for authenticated screens', () => {
    const sr = readSrcFile('ScreenRenderer.jsx');
    assert.ok(
      sr.includes('<HFHeader'),
      'ScreenRenderer should render HFHeader'
    );
  });

  it('ScreenRenderer does not render HFHeader for landingPage', () => {
    const sr = readSrcFile('ScreenRenderer.jsx');
    // Find the landingPage case block — it should not contain HFHeader
    const landingMatch = sr.match(/case\s+["']landingPage["']:\s*\n([\s\S]*?)(?=\n\s*case\s+["'])/);
    if (landingMatch) {
      assert.ok(
        !landingMatch[1].includes('<HFHeader'),
        'landingPage should not render HFHeader'
      );
    }
  });

  it('App.jsx passes pageTitle and backNavigation in ctx', () => {
    const app = readSrcFile('App.jsx');
    assert.ok(
      app.includes('pageTitle') && app.includes('backNavigation'),
      'App.jsx ctx should include pageTitle and backNavigation'
    );
  });
});
