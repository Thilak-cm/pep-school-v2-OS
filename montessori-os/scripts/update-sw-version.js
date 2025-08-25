#!/usr/bin/env node

// Script to update service worker version during build
// This ensures the cache name matches the app version

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const swPath = path.join(projectRoot, 'public', 'sw.js');

try {
  // Read package.json to get current version
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = packageJson.version;
  
  console.log(`Updating service worker version to ${version}...`);
  
  // Read current service worker
  let swContent = fs.readFileSync(swPath, 'utf8');
  
  // Update the version constant
  const versionRegex = /const APP_VERSION = '([^']+)';/;
  if (versionRegex.test(swContent)) {
    swContent = swContent.replace(versionRegex, `const APP_VERSION = '${version}';`);
    console.log(`Updated APP_VERSION to ${version}`);
  } else {
    console.warn('Could not find APP_VERSION constant in service worker');
  }
  
  // Write updated service worker
  fs.writeFileSync(swPath, swContent, 'utf8');
  
  console.log('✅ Service worker version updated successfully');
  
} catch (error) {
  console.error('❌ Error updating service worker version:', error);
  process.exit(1);
}
