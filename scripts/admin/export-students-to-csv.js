/*
  Export Students to CSV
  
  One-time script to export all enrolled students with their class names to CSV
  
  Usage:
    node scripts/admin/export-students-to-csv.js
*/

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin using the local service account
const serviceAccount = require(path.resolve(__dirname, '../../firebase-service-account.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://pep-os.firebaseio.com',
});

const db = admin.firestore();

// Helper function to format date for CSV
function formatDateForCSV(timestamp) {
  if (!timestamp) return '';
  try {
    if (timestamp.toDate) {
      return timestamp.toDate().toISOString().split('T')[0]; // YYYY-MM-DD format
    }
    return new Date(timestamp).toISOString().split('T')[0];
  } catch (e) {
    return '';
  }
}

// Helper function to escape CSV fields
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

async function main() {
  try {
    console.log('🔍 Fetching students and classrooms from Firestore...\n');
    
    // Fetch all classrooms first to build a lookup map
    const classroomsSnap = await db.collection('classrooms').get();
    const classroomMap = {};
    
    classroomsSnap.forEach((doc) => {
      const data = doc.data() || {};
      classroomMap[doc.id] = {
        name: data.name || 'Unknown Classroom',
        programId: data.programId || 'N/A',
        branchId: data.branchId || 'N/A',
      };
    });
    
    console.log(`📚 Found ${Object.keys(classroomMap).length} classrooms\n`);
    
    // Fetch all students
    const studentsSnap = await db.collection('students').get();
    const students = [];
    
    studentsSnap.forEach((doc) => {
      const data = doc.data() || {};
      const classroomId = data.classroomId || '';
      const classroom = classroomMap[classroomId] || { name: 'Unknown Classroom', programId: 'N/A', branchId: 'N/A' };
      
      students.push({
        studentId: doc.id,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        displayName: data.displayName || '',
        classroomId: classroomId,
        className: classroom.name,
        programId: classroom.programId,
        branchId: data.branchId || classroom.branchId,
        status: data.status || 'unknown',
        isActive: data.isActive !== undefined ? data.isActive : false,
        dateOfBirth: formatDateForCSV(data.dateOfBirth),
      });
    });
    
    // Sort by studentId in ascending order
    students.sort((a, b) => a.studentId.localeCompare(b.studentId));
    
    console.log(`📊 Total Students: ${students.length}\n`);
    
    // Generate CSV content
    const csvHeaders = [
      'Student ID',
      'First Name',
      'Last Name',
      'Display Name',
      'Class Name',
      'Classroom ID',
      'Program ID',
      'Branch ID',
      'Status',
      'Is Active',
      'Date of Birth'
    ];
    
    const csvRows = [csvHeaders.map(escapeCSV).join(',')];
    
    students.forEach((student) => {
      const row = [
        student.studentId,
        student.firstName,
        student.lastName,
        student.displayName,
        student.className,
        student.classroomId,
        student.programId,
        student.branchId,
        student.status,
        student.isActive,
        student.dateOfBirth,
      ];
      csvRows.push(row.map(escapeCSV).join(','));
    });
    
    const csvContent = csvRows.join('\n');
    
    // Write to file
    const outputPath = path.resolve(__dirname, '../data/processed/students-export.csv');
    fs.writeFileSync(outputPath, csvContent, 'utf8');
    
    console.log(`✅ Successfully exported ${students.length} students to CSV`);
    console.log(`📁 Output file: ${outputPath}\n`);
    
    // Print summary
    const activeStudents = students.filter(s => s.isActive === true);
    const studentsWithDOB = students.filter(s => s.dateOfBirth !== '');
    const studentsWithoutDOB = students.filter(s => s.dateOfBirth === '');
    
    console.log('📊 Summary:');
    console.log(`   Total students: ${students.length}`);
    console.log(`   Active students: ${activeStudents.length}`);
    console.log(`   Students with DOB: ${studentsWithDOB.length}`);
    console.log(`   Students without DOB: ${studentsWithoutDOB.length}`);
    
    if (studentsWithoutDOB.length > 0) {
      console.log(`\n⚠️  Students missing Date of Birth (${studentsWithoutDOB.length}):`);
      studentsWithoutDOB.slice(0, 10).forEach(s => {
        console.log(`   - ${s.displayName} (${s.className})`);
      });
      if (studentsWithoutDOB.length > 10) {
        console.log(`   ... and ${studentsWithoutDOB.length - 10} more`);
      }
    }
    
    console.log('\n✅ Export complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}
