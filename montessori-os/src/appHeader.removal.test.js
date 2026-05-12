import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSrcFile(relPath) {
  return readFileSync(join(__dirname, relPath), 'utf-8');
}

// ── PEP-231: AppHeader is the sticky shell header ──────────────────────────

describe('PEP-231: AppHeader exists as sticky shell header', () => {
  it('AppHeader.jsx exists', () => {
    assert.ok(
      existsSync(join(__dirname, 'AppHeader.jsx')),
      'AppHeader.jsx should exist'
    );
  });

  it('App.jsx imports AppHeader', () => {
    const app = readSrcFile('App.jsx');
    assert.ok(
      app.includes('import AppHeader'),
      'App.jsx should import AppHeader'
    );
  });

  it('App.jsx renders <AppHeader', () => {
    const app = readSrcFile('App.jsx');
    assert.ok(
      app.includes('<AppHeader'),
      'App.jsx should render AppHeader'
    );
  });
});

// ── PEP-231: AppHeader uses fixed positioning ──────────────────────────────

describe('PEP-231: AppHeader fixed positioning', () => {
  it('uses position fixed', () => {
    const header = readSrcFile('AppHeader.jsx');
    assert.ok(
      header.includes("position: 'fixed'") || header.includes('position: "fixed"'),
      'AppHeader should use position: fixed'
    );
  });

  it('uses top: 0', () => {
    const header = readSrcFile('AppHeader.jsx');
    assert.ok(
      header.includes('top: 0') || header.includes("top: '0'"),
      'AppHeader should use top: 0'
    );
  });

  it('uses zIndex 1040', () => {
    const header = readSrcFile('AppHeader.jsx');
    assert.ok(
      header.includes('zIndex: 1040') || header.includes('zIndex:1040'),
      'AppHeader should use zIndex 1040'
    );
  });

  it('uses minHeight 60', () => {
    const header = readSrcFile('AppHeader.jsx');
    assert.ok(
      header.includes('minHeight: 60') || header.includes('minHeight:60'),
      'AppHeader should use minHeight 60'
    );
  });

  it('includes safe-area-inset-top', () => {
    const header = readSrcFile('AppHeader.jsx');
    assert.ok(
      header.includes('safe-area-inset-top'),
      'AppHeader should respect env(safe-area-inset-top)'
    );
  });
});

// ── PEP-231: AppHeader renders title, back, actions ────────────────────────

describe('PEP-231: AppHeader renders header elements', () => {
  it('renders a title element', () => {
    const header = readSrcFile('AppHeader.jsx');
    assert.ok(
      header.includes('title') && header.includes('Typography'),
      'AppHeader should render a title via Typography'
    );
  });

  it('renders a back button conditionally', () => {
    const header = readSrcFile('AppHeader.jsx');
    assert.ok(
      header.includes('onBack') && header.includes('ArrowLeft'),
      'AppHeader should render a back button with ArrowLeft icon'
    );
  });

  it('supports an actions slot', () => {
    const header = readSrcFile('AppHeader.jsx');
    assert.ok(
      header.includes('actions'),
      'AppHeader should support an actions prop'
    );
  });

  it('supports scroll-to-top on title click', () => {
    const header = readSrcFile('AppHeader.jsx');
    assert.ok(
      header.includes('onTitleClick') || header.includes('scrollTo'),
      'AppHeader should support scroll-to-top via onTitleClick or scrollTo'
    );
  });
});

// ── PEP-231: HFHeader deleted ──────────────────────────────────────────────

describe('PEP-231: HFHeader removed after migration', () => {
  it('HFHeader.jsx no longer exists', () => {
    assert.ok(
      !existsSync(join(__dirname, 'components/ui/HFHeader.jsx')),
      'HFHeader.jsx should be deleted'
    );
  });

  it('ScreenRenderer does not import HFHeader', () => {
    const sr = readSrcFile('ScreenRenderer.jsx');
    assert.ok(
      !sr.includes('HFHeader'),
      'ScreenRenderer should not reference HFHeader'
    );
  });

  it('ScreenRenderer does not render <HFHeader', () => {
    const sr = readSrcFile('ScreenRenderer.jsx');
    assert.ok(
      !sr.includes('<HFHeader'),
      'ScreenRenderer should not render HFHeader'
    );
  });
});

// ── PEP-231: ScreenRenderer only renders content ──────────────────────────

describe('PEP-231: ScreenRenderer renders content only', () => {
  it('does not contain getHeaderActions', () => {
    const sr = readSrcFile('ScreenRenderer.jsx');
    assert.ok(
      !sr.includes('getHeaderActions'),
      'ScreenRenderer should not contain getHeaderActions — it moved to AppHeader'
    );
  });

  it('does not define NO_HEADER_SCREENS locally', () => {
    const sr = readSrcFile('ScreenRenderer.jsx');
    // Should import from screenConfig, not define locally
    assert.ok(
      !sr.includes('const NO_HEADER_SCREENS') && !sr.includes('let NO_HEADER_SCREENS'),
      'ScreenRenderer should not define NO_HEADER_SCREENS locally — it lives in screenConfig.js'
    );
  });
});
