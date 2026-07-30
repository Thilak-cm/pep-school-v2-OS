import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { doc, setDoc } from 'firebase/firestore';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let testEnvironment;

export async function initializeRulesTestEnvironment() {
  testEnvironment = await initializeTestEnvironment({
    projectId: 'pep-os',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8'),
    },
  });
}

export function createAuthenticatedDb(uid) {
  if (!testEnvironment) throw new Error('Rules test environment is not initialized');
  return testEnvironment.authenticatedContext(uid).firestore();
}

export async function seedFirestore(fixture) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [documentPath, data] of Object.entries(fixture)) {
      await setDoc(doc(db, ...documentPath.split('/')), data);
    }
  });
}

export async function clearTestData() {
  await testEnvironment.clearFirestore();
}

export async function closeTestEnvironment() {
  if (testEnvironment) await testEnvironment.cleanup();
}
