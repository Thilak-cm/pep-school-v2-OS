const admin = require('firebase-admin');
const readline = require('readline');
const { addStudent } = require('./add-student');

// Initialize only once in case this is required by other scripts
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: 'https://pep-os.firebaseio.com'
  });
}

const db = admin.firestore();

// CLI interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to ask questions
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Safety check function
function confirmAction(message) {
  return new Promise((resolve) => {
    rl.question(`${message} (type 'YES' to confirm): `, (answer) => {
      resolve(answer === 'YES');
    });
  });
}

async function getAvailableClassrooms() {
  try {
    const classroomsSnapshot = await db.collection('classrooms').get();
    const classrooms = [];
    
    classroomsSnapshot.forEach((doc) => {
      const data = doc.data();
      classrooms.push({
        id: doc.id,
        name: data.name || 'Unnamed Classroom',
        studentCount: data.studentCount || 0
      });
    });
    
    return classrooms.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('❌ Error fetching classrooms:', error.message);
    return [];
  }
}

async function assignTeacherToClassrooms(teacherUid, selectedClassroomIds) {
  try {
    let assignedCount = 0;
    
    for (const classroomId of selectedClassroomIds) {
      try {
        await db.collection('classrooms').doc(classroomId).update({
          teacherIds: admin.firestore.FieldValue.arrayUnion(teacherUid),
          updatedAt: admin.firestore.Timestamp.now()
        });
        assignedCount++;
        console.log(`   ✅ Assigned to: ${classroomId}`);
      } catch (error) {
        console.log(`   ❌ Failed to assign to ${classroomId}: ${error.message}`);
      }
    }
    
    return assignedCount;
  } catch (error) {
    console.error('❌ Error assigning teacher to classrooms:', error.message);
    return 0;
  }
}

async function createUserAccount() {
  try {
    console.log('👤 Montessori OS - Account Creator');
    console.log('=================================');
    console.log('');

    // Choose what to create first
    console.log('What would you like to create?');
    console.log('1. admin');
    console.log('2. teacher');
    console.log('3. student');
    const typeChoice = await askQuestion('Select (1/2/3): ');

    // Handle student flow (separate from teacher/admin)
    if (typeChoice === '3') {
      await createStudentFlow();
      return;
    }

    // From here on, teacher/admin flow is identical except role-specific bits
    const email = await askQuestion('📧 Email address: ');
    const firstName = await askQuestion('👤 First name: ');
    const lastName = await askQuestion('👤 Last name: ');
    const displayName = `${firstName} ${lastName}`; // Computed field for Firebase Auth

    // Get role
    let role = 'teacher';
    let adminLevel = null;
    let permissions = [];

    if (typeChoice === '1') {
      role = 'admin';
      console.log('\n👑 Admin level:');
      console.log('1. super - Full admin (founder level)');
      console.log('2. regular - Standard admin');
      const adminChoice = await askQuestion('Select admin level (1 or 2): ');

      if (adminChoice === '1') {
        adminLevel = 'super';
        permissions = ['manage_users', 'view_reports', 'manage_classrooms', 'manage_students', 'manage_attendance', 'manage_settings'];
      } else {
        adminLevel = 'regular';
        permissions = ['view_reports', 'manage_classrooms', 'manage_students'];
      }
    } else {
      role = 'teacher';
    }
    
    // Validate email domain
    if (!email.endsWith('@pepschoolv2.com')) {
      console.log('❌ Error: Email must be @pepschoolv2.com domain');
      return;
    }
    
    // For teachers, get classroom assignments
    let selectedClassroomIds = [];
    if (role === 'teacher') {
      console.log('\n🏫 Classroom Assignment:');
      
      const availableClassrooms = await getAvailableClassrooms();
      
      if (availableClassrooms.length === 0) {
        console.log('⚠️  No classrooms found in the system.');
        console.log('   Teacher will be created without classroom assignments.');
        console.log('   You can assign them to classrooms later using the classroom management tools.');
      } else {
        console.log('\nAvailable classrooms:');
        availableClassrooms.forEach((classroom, index) => {
          console.log(`   ${index + 1}. ${classroom.name} (${classroom.studentCount} students)`);
        });
        
        console.log('\nEnter classroom numbers to assign (comma-separated, e.g., 1,3,5)');
        console.log('Or press Enter to skip classroom assignment:');
        
        const classroomInput = await askQuestion('Classroom assignments: ');
        
        if (classroomInput.trim()) {
          const selectedNumbers = classroomInput.split(',').map(s => s.trim()).filter(s => s);
          
          for (const numStr of selectedNumbers) {
            const num = parseInt(numStr) - 1; // Convert to 0-based index
            if (num >= 0 && num < availableClassrooms.length) {
              selectedClassroomIds.push(availableClassrooms[num].id);
            } else {
              console.log(`   ⚠️  Invalid classroom number: ${numStr}`);
            }
          }
        }
        
        if (selectedClassroomIds.length > 0) {
          console.log('\nSelected classrooms:');
          selectedClassroomIds.forEach(classroomId => {
            const classroom = availableClassrooms.find(c => c.id === classroomId);
            if (classroom) {
              console.log(`   • ${classroom.name}`);
            }
          });
        } else {
          console.log('   ℹ️  No classrooms selected.');
        }
      }
    }
    
    // Show summary
    console.log('\n📋 Account Summary:');
    console.log(`   Email: ${email}`);
    console.log(`   First Name: ${firstName}`);
    console.log(`   Last Name: ${lastName}`);
    console.log(`   Display Name: ${displayName}`);
    console.log(`   Role: ${role}`);
    if (role === 'admin') {
      console.log(`   Admin Level: ${adminLevel}`);
      console.log(`   Permissions: ${permissions.join(', ')}`);
    }
    if (role === 'teacher' && selectedClassroomIds.length > 0) {
      console.log(`   Classroom Assignments: ${selectedClassroomIds.length} classroom(s)`);
    }
    console.log('');
    
    const confirmed = await confirmAction('Create this account?');
    
    if (!confirmed) {
      console.log('❌ Operation cancelled by user.');
      return;
    }
    
    console.log(`\n👤 Creating account for: ${email}`);
    
    let userRecord;
    
    try {
      // Step 1: Create Firebase Auth account
      userRecord = await admin.auth().createUser({
        email: email,
        displayName: displayName,
        emailVerified: true // Since you're creating it as admin
      });
      
      console.log(`✅ Firebase Auth account created:`);
      console.log(`   UID: ${userRecord.uid}`);
      console.log(`   Email: ${userRecord.email}`);
      console.log(`   Display Name: ${userRecord.displayName}`);
      
    } catch (authError) {
      if (authError.code === 'auth/email-already-exists') {
        console.log('💡 User already exists in Firebase Auth.');
        console.log('   Getting existing user UID...');
        
        userRecord = await admin.auth().getUserByEmail(email);
        console.log(`✅ Found existing user: ${userRecord.uid}`);
      } else {
        throw authError;
      }
    }
    
    // Step 2: Create Firestore user document (per DATA_STRUCTURE.md)
    const userData = {
      displayName: `${firstName} ${lastName}`.trim(),
      email: email,
      role: role, // 'admin' | 'teacher'
      status: 'active',
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    };
    
    // Add role-specific fields (optional fields for admin)
    if (role === 'admin') {
      userData.adminLevel = adminLevel;       // Optional field
      userData.permissions = permissions;     // Optional field
    }
    
    // Note: Teachers are assigned to classrooms via classroom.teacherIDs array
    // No assignedClassrooms field needed in user document
    
    await db.collection('users').doc(userRecord.uid).set(userData, { merge: true });
    
    console.log(`✅ Firestore user document created:`);
    console.log(`   Document ID: ${userRecord.uid}`);
    console.log(`   UID: ${userRecord.uid}`);
    console.log(`   Name: ${userData.displayName}`);
    console.log(`   Role: ${role}`);
    console.log(`   Status: active`);
    
    // Step 3: Assign teacher to classrooms if applicable
    if (role === 'teacher' && selectedClassroomIds.length > 0) {
      console.log(`\n🏫 Assigning teacher to ${selectedClassroomIds.length} classroom(s)...`);
      const assignedCount = await assignTeacherToClassrooms(userRecord.uid, selectedClassroomIds);
      console.log(`✅ Successfully assigned to ${assignedCount} classroom(s)`);
    }
    
    console.log(`\n🎉 Account creation successful!`);
    console.log(`📧 User can now sign in with: ${email}`);
    console.log(`🔑 No password needed - they'll use Google Sign-in`);

    // Ask if user wants to create another account
    const createAnother = await askQuestion('\nCreate another? (y/n): ');
    if (createAnother.toLowerCase() === 'y' || createAnother.toLowerCase() === 'yes') {
      console.log('\n' + '='.repeat(50) + '\n');
      await createUserAccount();
    } else {
      console.log('\n👋 All done!');
    }
    
  } catch (error) {
    console.error('❌ Error creating account:', error.message);
  } finally {
    rl.close();
    process.exit(0);
  }
}

// Start the CLI
createUserAccount();

// ----- Student flow helpers -----
async function createStudentFlow() {
  try {
    const firstName = await askQuestion('👶 Student first name: ');
    const lastName = await askQuestion('👶 Student last name (optional): ');

    // Choose classroom (single selection)
    console.log('\n🏫 Choose classroom:');
    const availableClassrooms = await getAvailableClassrooms();
    if (availableClassrooms.length === 0) {
      console.log('❌ No classrooms found. Create a classroom first.');
      return;
    }
    availableClassrooms.forEach((c, idx) => {
      console.log(`   ${idx + 1}. ${c.name} (${c.id})`);
    });

    let classroomId = null;
    while (!classroomId) {
      const sel = await askQuestion('Pick a classroom by number: ');
      const n = parseInt(sel, 10) - 1;
      if (Number.isFinite(n) && n >= 0 && n < availableClassrooms.length) {
        classroomId = availableClassrooms[n].id;
      } else {
        console.log('   ⚠️  Invalid selection. Try again.');
      }
    }

    // Summary
    console.log('\n📋 Student Summary:');
    console.log(`   Name: ${firstName} ${lastName}`.trim());
    console.log(`   Classroom: ${classroomId}`);
    const confirmed = await confirmAction('Create this student?');
    if (!confirmed) {
      console.log('❌ Operation cancelled.');
      return;
    }

    // Create via shared addStudent()
    const res = await addStudent({ firstName, lastName, classroomInput: classroomId, dryRun: false });
    if (res && res.studentId) {
      console.log(`🎉 Student created with ID: ${res.studentId}`);
    }

    // Ask to create another
    const again = await askQuestion('\nCreate another? (y/n): ');
    if (again.toLowerCase() === 'y' || again.toLowerCase() === 'yes') {
      console.log('\n' + '='.repeat(50) + '\n');
      await createUserAccount();
    }
  } catch (err) {
    console.error('❌ Error creating student:', err.message);
  }
}
