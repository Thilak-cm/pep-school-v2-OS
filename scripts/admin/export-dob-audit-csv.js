/*
  Export Student DoB Audit CSV (read-only)

  Columns:
  - student_id
  - student_name
  - dob_raw_value

  Usage:
    node scripts/admin/export-dob-audit-csv.js
    node scripts/admin/export-dob-audit-csv.js ./scripts/data/processed/student-dob-audit.csv
*/

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, '../data/processed/student-dob-audit.csv');
const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '../../firebase-service-account.json');
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'pep-os';

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function hasValue(value) {
  return value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '');
}

function buildStudentName(data) {
  const displayName = (data.displayName || '').trim();
  if (displayName) return displayName;
  const fullName = [data.firstName, data.lastName]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ');
  return fullName || 'Unknown Student';
}

function pickDobValue(data) {
  if (hasValue(data.dateOfBirth)) return data.dateOfBirth;
  if (hasValue(data.dob)) return data.dob;
  return '';
}

function toDateOnlyString(date) {
  return date.toISOString().slice(0, 10);
}

function formatDobRawValue(value) {
  if (value === null || value === undefined) return '';

  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    if (date && !Number.isNaN(date.getTime())) {
      return toDateOnlyString(date);
    }
    return String(value);
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? String(value) : toDateOnlyString(value);
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : toDateOnlyString(date);
  }

  if (typeof value === 'string') {
    const text = value.trim();
    const isoPrefix = text.match(/^(\d{4}-\d{2}-\d{2})T/);
    if (isoPrefix) return isoPrefix[1];
    return text;
  }

  if (typeof value === 'object') {
    if (typeof value.seconds === 'number') {
      const date = new Date(value.seconds * 1000);
      return Number.isNaN(date.getTime()) ? JSON.stringify(value) : toDateOnlyString(date);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function getOutputPathFromArgs() {
  const argPath = process.argv[2];
  if (!argPath) return DEFAULT_OUTPUT_PATH;
  return path.isAbsolute(argPath) ? argPath : path.resolve(process.cwd(), argPath);
}

function initFirebaseAdmin() {
  const usingServiceAccount = fs.existsSync(SERVICE_ACCOUNT_PATH);
  if (usingServiceAccount) {
    const serviceAccount = require(SERVICE_ACCOUNT_PATH);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: 'https://pep-os.firebaseio.com',
      projectId: FIREBASE_PROJECT_ID,
    });
    console.log(`🔐 Auth mode: service account (${SERVICE_ACCOUNT_PATH})`);
    return;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: 'https://pep-os.firebaseio.com',
    projectId: FIREBASE_PROJECT_ID,
  });
  console.log('🔐 Auth mode: application default credentials (gcloud ADC)');
}

async function main() {
  initFirebaseAdmin();
  const db = admin.firestore();
  const outputPath = getOutputPathFromArgs();

  console.log('🔍 Running read-only DoB audit export from Firestore/students...');
  const studentsSnap = await db.collection('students').get();

  const rows = [['student_id', 'student_name', 'dob_raw_value'].join(',')];
  let missingDobCount = 0;

  studentsSnap.forEach((doc) => {
    const data = doc.data() || {};
    const studentName = buildStudentName(data);
    const dobRaw = pickDobValue(data);
    if (!hasValue(dobRaw)) missingDobCount += 1;

    rows.push([
      escapeCSV(doc.id),
      escapeCSV(studentName),
      escapeCSV(formatDobRawValue(dobRaw)),
    ].join(','));
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, rows.join('\n'), 'utf8');

  console.log(`✅ Exported ${studentsSnap.size} students`);
  console.log(`📁 CSV path: ${outputPath}`);
  console.log(`📊 Missing DoB values: ${missingDobCount}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Export failed:', error?.message || error);
    process.exit(1);
  });
}
