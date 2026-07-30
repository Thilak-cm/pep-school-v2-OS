#!/usr/bin/env node
// One-off script: create a test alert doc in the alerts collection for DIP testing.
// Run: node scripts/admin/seed-test-alert.mjs
// Delete after testing: node scripts/admin/seed-test-alert.mjs --delete

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault(), projectId: 'pep-os' });
const db = getFirestore();

const TEST_ALERT_ID = 'test:broadcast:peek-demo';

if (process.argv.includes('--delete')) {
  await db.collection('alerts').doc(TEST_ALERT_ID).delete();
  console.log(`Deleted ${TEST_ALERT_ID}`);
  process.exit(0);
}

await db.collection('alerts').doc(TEST_ALERT_ID).set({
  type: 'broadcast',
  dip: true,
  priority: 10,
  source: 'admin:test',
  payload: {
    message: 'Staff meeting moved to 3 PM tomorrow',
    senderName: 'Ms. Rao',
    audience: 'All staff',
  },
  targetRoles: [],
  targetClassrooms: [],
  targetTeachers: [],
  dismissedBy: {},
  expiresAt: null,
  createdAt: Timestamp.now(),
  createdBy: 'test-script',
});

console.log(`Created test alert: ${TEST_ALERT_ID}`);
console.log('You should now see 2 alerts in the DIP (red flag + broadcast).');
console.log('Run with --delete to remove it when done.');
