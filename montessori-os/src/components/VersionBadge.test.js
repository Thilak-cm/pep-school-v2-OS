import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJson from '../../package.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'VersionBadge.jsx'), 'utf-8');

describe('VersionBadge', () => {
  it('derives the displayed version from canonical package metadata', () => {
    assert.match(
      source,
      /import packageJson from ['"]\.\.\/\.\.\/package\.json['"] with \{ type: ['"]json['"] \}/
    );
    assert.ok(source.includes('`v${packageJson.version}`'));
    assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  });

  it('uses the canonical version in both display paths without a hard-coded version', () => {
    assert.equal(source.match(/\{APP_VERSION\}/g)?.length, 2);
    assert.doesNotMatch(source, />\s*v\d+\.\d+\.\d+\s*</);
  });
});
