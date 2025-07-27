#!/usr/bin/env node

/**
 * Version Management Script
 * 
 * Usage:
 *   node scripts/version.js patch   # 1.1.0 -> 1.1.1
 *   node scripts/version.js minor   # 1.1.0 -> 1.2.0  
 *   node scripts/version.js major   # 1.1.0 -> 2.0.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

function updateVersion(type) {
  // Read current version from package.json
  const packagePath = path.join(rootDir, 'montessori-os', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  const [major, minor, patch] = packageJson.version.split('.').map(Number);
  const oldVersion = packageJson.version; // Store old version before changing
  
  let newVersion;
  switch (type) {
    case 'patch':
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
    default:
      console.error('Usage: node scripts/version.js [patch|minor|major]');
      process.exit(1);
  }
  
  // Update package.json
  packageJson.version = newVersion;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
  
  // Update VersionBadge.jsx
  const versionBadgePath = path.join(rootDir, 'montessori-os', 'src', 'components', 'VersionBadge.jsx');
  let versionBadgeContent = fs.readFileSync(versionBadgePath, 'utf8');
  versionBadgeContent = versionBadgeContent.replace(
    /v\d+\.\d+\.\d+/g,
    `v${newVersion}`
  );
  fs.writeFileSync(versionBadgePath, versionBadgeContent);
  
  console.log(`✅ Updated version from ${oldVersion} to ${newVersion}`);
  console.log(`📝 Don't forget to update CHANGELOG.md with your changes!`);
  console.log(`🚀 Commit with: git commit -m "chore: bump version to v${newVersion}"`);
}

const versionType = process.argv[2];
if (!versionType) {
  console.error('Usage: node scripts/version.js [patch|minor|major]');
  process.exit(1);
}

updateVersion(versionType); 