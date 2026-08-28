import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
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
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: fs.readFileSync(path.join(rootDir, 'storage.rules'), 'utf8'),
    },
  });
}

export function createAuthenticatedDb(uid) {
  if (!testEnvironment) throw new Error('Rules test environment is not initialized');
  return testEnvironment.authenticatedContext(uid).firestore();
}

export function createUnauthenticatedDb() {
  if (!testEnvironment) throw new Error('Rules test environment is not initialized');
  return testEnvironment.unauthenticatedContext().firestore();
}

export function createAuthenticatedStorage(uid, bucket = 'pep-os.appspot.com') {
  if (!testEnvironment) throw new Error('Rules test environment is not initialized');
  return testEnvironment
    .authenticatedContext(uid)
    .storage(`gs://${bucket}`);
}

export function createUnauthenticatedStorage() {
  if (!testEnvironment) throw new Error('Rules test environment is not initialized');
  return testEnvironment
    .unauthenticatedContext()
    .storage('gs://pep-os.appspot.com');
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

export async function clearStorageData() {
  await testEnvironment.clearStorage();
}

export async function seedStorageObject(
  pathname,
  data,
  contentType,
  bucket = 'pep-os.appspot.com',
) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const storage = context.storage(`gs://${bucket}`);
    await uploadBytes(ref(storage, pathname), data, { contentType });
  });
}

export async function closeTestEnvironment() {
  if (testEnvironment) await testEnvironment.cleanup();
}
