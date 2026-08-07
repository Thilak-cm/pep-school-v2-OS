import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workflowPath = resolve('.github/workflows/security-rules-check.yml');

test('security rules workflow gates pull requests and protected branch pushes', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /-\s+master/);
  assert.match(workflow, /tests\/rules\/\*\*/);
  assert.match(workflow, /shared\/firebase\/\*\*/);
});

test('security rules workflow installs Java and runs static plus emulator suites', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /actions\/setup-java@v4/);
  assert.match(workflow, /java-version:\s*['"]21['"]/);
  assert.match(workflow, /npm run test:security/);
  assert.match(workflow, /npm run test:rules/);
});
