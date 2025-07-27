const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK
// You'll need to download your service account key from Firebase Console
// Go to Project Settings > Service Accounts > Generate New Private Key
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://pep-os.firebaseio.com' // Replace with your project ID
});

const db = admin.firestore();

// Read seed data
const seedData = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));

// Helper function to convert timestamp strings to Firestore timestamps
function convertTimestamps(obj) {
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && value.__type__ === 'timestamp') {
      converted[key] = admin.firestore.Timestamp.fromDate(new Date(value.value));
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      converted[key] = convertTimestamps(value);
    } else {
      converted[key] = value;
    }
  }
  return converted;
}

// Upload data to Firestore
async function uploadSeedData() {
  console.log('🚀 Starting seed data upload...\n');

  try {
    // Upload users
    console.log('📝 Uploading users...');
    for (const [userId, userData] of Object.entries(seedData.users)) {
      const convertedData = convertTimestamps(userData);
      await db.collection('users').doc(userId).set(convertedData);
      console.log(`  ✅ Uploaded user: ${userData.displayName}`);
    }

    // Upload classrooms
    console.log('\n🏫 Uploading classrooms...');
    for (const [classroomId, classroomData] of Object.entries(seedData.classrooms)) {
      const convertedData = convertTimestamps(classroomData);
      await db.collection('classrooms').doc(classroomId).set(convertedData);
      console.log(`  ✅ Uploaded classroom: ${classroomData.name}`);
    }

    // Upload students
    console.log('\n👦 Uploading students...');
    for (const [studentId, studentData] of Object.entries(seedData.students)) {
      const convertedData = convertTimestamps(studentData);
      await db.collection('students').doc(studentId).set(convertedData);
      console.log(`  ✅ Uploaded student: ${studentData.name}`);
    }

    // Upload tags
    console.log('\n🏷️ Uploading tags...');
    for (const [tagId, tagData] of Object.entries(seedData.tags)) {
      const convertedData = convertTimestamps(tagData);
      await db.collection('tags').doc(tagId).set(convertedData);
      console.log(`  ✅ Uploaded tag: ${tagData.name}`);
    }

    // Upload observations
    console.log('\n📝 Uploading observations...');
    for (const [observationId, observationData] of Object.entries(seedData.observations)) {
      const convertedData = convertTimestamps(observationData);
      await db.collection('observations').doc(observationId).set(convertedData);
      console.log(`  ✅ Uploaded observation: ${observationId}`);
    }

    // Upload attendance
    console.log('\n📅 Uploading attendance...');
    for (const [attendanceId, attendanceData] of Object.entries(seedData.attendance)) {
      const convertedData = convertTimestamps(attendanceData);
      await db.collection('attendance').doc(attendanceId).set(convertedData);
      console.log(`  ✅ Uploaded attendance: ${attendanceId}`);
    }

    console.log('\n🎉 Seed data upload completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`  👥 Users: ${Object.keys(seedData.users).length}`);
    console.log(`  🏫 Classrooms: ${Object.keys(seedData.classrooms).length}`);
    console.log(`  👦 Students: ${Object.keys(seedData.students).length}`);
    console.log(`  🏷️ Tags: ${Object.keys(seedData.tags).length}`);
    console.log(`  📝 Observations: ${Object.keys(seedData.observations).length}`);
    console.log(`  📅 Attendance records: ${Object.keys(seedData.attendance).length}`);

  } catch (error) {
    console.error('❌ Error uploading seed data:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the upload
uploadSeedData(); 