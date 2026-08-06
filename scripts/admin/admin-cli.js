/*
  Unified Admin CLI
  Interactive menu-driven CLI for searching and listing students and users
  
  Usage:
    node scripts/admin/admin-cli.js
  
  Features:
  - Search students by name (fuzzy matching)
  - List all students (with optional filter)
  - Search users by name (fuzzy matching)
  - Search users by UID (exact match)
  - List all users
  - Formatted table output with rich UI
  - Data quality warnings
*/

import admin from 'firebase-admin';
import chalk from 'chalk';
import Table from 'cli-table3';
import boxen from 'boxen';
import { select, input, confirm } from '@inquirer/prompts';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'pep-os',
  databaseURL: 'https://pep-os.firebaseio.com',
});

const db = admin.firestore();

// ============================================================================
// Shared Utility Functions
// ============================================================================

function normalize(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokens(str) {
  return normalize(str)
    .split(' ')
    .filter(Boolean);
}

function getStudentLabel(data) {
  const displayName =
    data.displayName ||
    data.name ||
    [data.firstName, data.lastName].filter(Boolean).join(' ');
  return String(displayName || '').trim();
}

// Calculate Levenshtein distance between two strings
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return matrix[len1][len2];
}

// Calculate similarity score between two strings (0.0 to 1.0)
function similarity(str1, str2) {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
}

// Find best matching token in nameTokens for a target token
function findBestMatch(targetToken, nameTokens, threshold) {
  let bestMatch = null;
  let bestScore = 0;

  for (const token of nameTokens) {
    // Try exact match first (fast path)
    if (targetToken === token) {
      return { token, score: 1.0, exact: true };
    }

    // Calculate similarity
    const score = similarity(targetToken, token);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { token, score, exact: false };
    }
  }

  // Return match if it meets threshold
  if (bestMatch && bestScore >= threshold) {
    return bestMatch;
  }

  return null;
}

// Check if search string appears as substring in full name
function hasSubstringMatch(targetNormalized, nameNormalized) {
  return nameNormalized.includes(targetNormalized);
}

// Check if any target token appears as substring in any name token
function hasTokenSubstringMatch(targetTokens, nameTokens) {
  return targetTokens.every((targetToken) => {
    return nameTokens.some((nameToken) => nameToken.includes(targetToken));
  });
}

// Exact token matching function
function hasExactMatch(targetTokens, nameTokens) {
  return targetTokens.every((targetToken) => {
    return nameTokens.includes(targetToken);
  });
}

// Fuzzy token matching function
function hasFuzzyMatch(targetTokens, nameTokens, threshold) {
  const matches = targetTokens.map((targetToken) => {
    return findBestMatch(targetToken, nameTokens, threshold);
  });

  // All tokens must have a match
  if (matches.some((m) => m === null)) {
    return null;
  }

  // Calculate overall similarity score (average of individual token scores)
  const avgScore = matches.reduce((sum, m) => sum + m.score, 0) / matches.length;
  const isExact = matches.every((m) => m.exact);

  return {
    score: avgScore,
    exact: isExact,
    matches,
  };
}

// ============================================================================
// Output Formatting Functions
// ============================================================================

function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  try {
    if (timestamp.toDate) {
      return timestamp.toDate().toLocaleDateString();
    }
    if (timestamp._seconds) {
      return new Date(timestamp._seconds * 1000).toLocaleDateString();
    }
    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      return new Date(timestamp).toLocaleDateString();
    }
  } catch (e) {
    return 'Invalid Date';
  }
  return 'N/A';
}

function formatTimestamp(value) {
  if (!value) return null;
  try {
    if (typeof value.toDate === 'function') {
      return value.toDate().toISOString();
    }
    if (value._seconds) {
      return new Date(value._seconds * 1000).toISOString();
    }
  } catch (_) {
    // ignore
  }
  return value;
}

function formatValue(value, maxLength = 80) {
  if (value === null || value === undefined) {
    return chalk.dim('null');
  }
  if (typeof value === 'boolean') {
    return value ? chalk.green('true') : chalk.red('false');
  }
  if (typeof value === 'object') {
    // Check if it's a Firestore timestamp
    if (value.toDate || value._seconds) {
      return formatTimestamp(value);
    }
    // Check if it's an array
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return chalk.dim('[]');
      }
      const str = JSON.stringify(value);
      if (str.length > maxLength) {
        return chalk.dim(`[${value.length} items] `) + str.substring(0, maxLength - 20) + chalk.dim('...');
      }
      return str;
    }
    // Regular object - check if it's empty
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return chalk.dim('{}');
    }
    const str = JSON.stringify(value, null, 2);
    if (str.length > maxLength) {
      return chalk.dim(`{${keys.length} keys} `) + str.substring(0, maxLength - 20) + chalk.dim('...');
    }
    return str;
  }
  const str = String(value);
  if (str.length > maxLength) {
    return str.substring(0, maxLength) + chalk.dim('...');
  }
  return str;
}

function formatMatchType(matchType, similarity) {
  if (matchType === 'substring') {
    return chalk.green('✓ Substring');
  } else if (matchType === 'exact') {
    return chalk.green('✓ Exact');
  } else {
    return chalk.yellow(`🔍 Fuzzy (${(similarity * 100).toFixed(1)}% similar)`);
  }
}

function displayStudentSearchResults(results) {
  if (results.length === 0) {
    console.log(chalk.red('❌ No students found matching your search.'));
    return;
  }

  console.log(chalk.green(`\n✅ Found ${results.length} matching student(s):\n`));

  results.forEach((r, i) => {
    const label = r._studentLabel || getStudentLabel(r) || '(unknown)';
    const matchLabel = formatMatchType(r.matchType, r.similarity);

    // Extract all fields except internal ones
    const internalFields = ['matchType', 'similarity', '_studentLabel'];
    const allFields = Object.keys(r).filter(key => !internalFields.includes(key));
    
    // Sort fields: put important ones first
    const priorityFields = ['id', 'displayName', 'name', 'firstName', 'lastName'];
    const sortedFields = [
      ...priorityFields.filter(f => allFields.includes(f)),
      ...allFields.filter(f => !priorityFields.includes(f))
    ];

    const details = [
      `Student ${i + 1}`,
      '',
      chalk.bold('Match Information:'),
      `  Match:     ${matchLabel}`,
      '',
      chalk.bold('All Fields:'),
    ];

    sortedFields.forEach(key => {
      const value = r[key];
      const formattedValue = formatValue(value, 60);
      const keyLabel = key.padEnd(18);
      // Handle multi-line values (like JSON objects)
      const lines = formattedValue.split('\n');
      if (lines.length > 1) {
        details.push(`  ${chalk.cyan(keyLabel)} ${lines[0]}`);
        lines.slice(1).forEach(line => {
          details.push(`  ${' '.repeat(20)}${line}`);
        });
      } else {
        details.push(`  ${chalk.cyan(keyLabel)} ${formattedValue}`);
      }
    });

    console.log(
      boxen(details.join('\n'), {
        title: chalk.bold.cyan(`Student Details - ${label}`),
        titleAlignment: 'center',
        padding: 1,
        borderColor: 'cyan',
        borderStyle: 'round',
      })
    );
  });
}

function displayUserSearchResults(results) {
  if (results.length === 0) {
    console.log(chalk.red('❌ No users found matching your search.'));
    return;
  }

  console.log(chalk.green(`\n✅ Found ${results.length} matching user(s):\n`));

  results.forEach((r, i) => {
    const displayName = r.displayName || 'No Name';
    const matchLabel = formatMatchType(r.matchType, r.similarity);

    // Extract all fields except internal ones
    const internalFields = ['matchType', 'similarity'];
    const allFields = Object.keys(r).filter(key => !internalFields.includes(key));
    
    // Sort fields: put important ones first
    const priorityFields = ['uid', 'displayName', 'email', 'role'];
    const sortedFields = [
      ...priorityFields.filter(f => allFields.includes(f)),
      ...allFields.filter(f => !priorityFields.includes(f))
    ];

    const details = [
      `User ${i + 1}`,
      '',
      chalk.bold('Match Information:'),
      `  Match:     ${matchLabel}`,
      '',
      chalk.bold('All Fields:'),
    ];

    sortedFields.forEach(key => {
      const value = r[key];
      const formattedValue = formatValue(value, 60);
      const keyLabel = key.padEnd(18);
      // Handle multi-line values (like JSON objects)
      const lines = formattedValue.split('\n');
      if (lines.length > 1) {
        details.push(`  ${chalk.magenta(keyLabel)} ${lines[0]}`);
        lines.slice(1).forEach(line => {
          details.push(`  ${' '.repeat(20)}${line}`);
        });
      } else {
        details.push(`  ${chalk.magenta(keyLabel)} ${formattedValue}`);
      }
    });

    console.log(
      boxen(details.join('\n'), {
        title: chalk.bold.magenta(`User Details - ${displayName}`),
        titleAlignment: 'center',
        padding: 1,
        borderColor: 'magenta',
        borderStyle: 'round',
      })
    );
  });
}

function displayStudentList(students) {
  console.log(chalk.blue(`\n📊 Total Students: ${chalk.bold(students.length)}\n`));

  if (students.length === 0) {
    console.log(chalk.yellow('No students found.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('#'),
      chalk.cyan('Name'),
      chalk.cyan('Classroom'),
      chalk.cyan('Branch'),
      chalk.cyan('Status'),
    ],
    style: {
      head: ['cyan'],
      border: ['gray'],
    },
    colWidths: [5, 30, 20, 20, 15],
  });

  students.forEach((student, index) => {
    table.push([
      index + 1,
      student.displayName || 'No Name',
      student.classroomId || 'N/A',
      student.branchId || 'N/A',
      student.status || 'unknown',
    ]);
  });

  console.log(table.toString());
}

function displayUserList(users) {
  console.log(chalk.blue(`\n📊 Total Users: ${chalk.bold(users.length)}\n`));

  if (users.length === 0) {
    console.log(chalk.yellow('No users found.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.magenta('#'),
      chalk.magenta('Name'),
      chalk.magenta('Email'),
      chalk.magenta('Role'),
    ],
    style: {
      head: ['magenta'],
      border: ['gray'],
    },
    colWidths: [5, 25, 35, 15],
  });

  users.forEach((user, index) => {
    table.push([
      index + 1,
      user.displayName || 'No Name',
      user.email || 'No Email',
      user.role || 'unknown',
    ]);
  });

  console.log(table.toString());
}

function displayDataQualityWarnings(entityType, entities) {
  console.log(chalk.yellow('\n🔍 POTENTIAL ISSUES:'));
  console.log(chalk.gray('='.repeat(80)));

  if (entityType === 'students') {
    const noNameStudents = entities.filter(
      (s) => !s.displayName || s.displayName === 'No Name'
    );
    const noClassroomStudents = entities.filter(
      (s) => !s.classroomId || s.classroomId === 'N/A'
    );
    const noBranchStudents = entities.filter(
      (s) => !s.branchId || s.branchId === 'N/A'
    );
    const inactiveStudents = entities.filter(
      (s) => s.status !== 'active' && s.isActive !== true
    );
    const noDOBStudents = entities.filter((s) => !s.dateOfBirth && !s.dob);

    if (noNameStudents.length > 0) {
      console.log(
        chalk.yellow(`⚠️  Students without names: ${chalk.bold(noNameStudents.length)}`)
      );
    }
    if (noClassroomStudents.length > 0) {
      console.log(
        chalk.yellow(
          `⚠️  Students without classroom assignment: ${chalk.bold(noClassroomStudents.length)}`
        )
      );
    }
    if (noBranchStudents.length > 0) {
      console.log(
        chalk.yellow(
          `⚠️  Students without branch assignment: ${chalk.bold(noBranchStudents.length)}`
        )
      );
    }
    if (inactiveStudents.length > 0) {
      console.log(
        chalk.yellow(
          `⚠️  Inactive/graduated/transferred students: ${chalk.bold(inactiveStudents.length)}`
        )
      );
    }
    if (noDOBStudents.length > 0) {
      console.log(
        chalk.yellow(
          `⚠️  Students without date of birth: ${chalk.bold(noDOBStudents.length)}`
        )
      );
    }

    if (
      noNameStudents.length === 0 &&
      noClassroomStudents.length === 0 &&
      noBranchStudents.length === 0 &&
      inactiveStudents.length === 0 &&
      noDOBStudents.length === 0
    ) {
      console.log(chalk.green('✅ No obvious data quality issues found'));
    }
  } else if (entityType === 'users') {
    const noEmailUsers = entities.filter(
      (u) => !u.email || u.email === 'No Email'
    );
    const noNameUsers = entities.filter(
      (u) => !u.displayName || u.displayName === 'No Name'
    );
    const neverLoggedIn = entities.filter((u) => !u.lastLoginAt);

    if (noEmailUsers.length > 0) {
      console.log(
        chalk.yellow(`⚠️  Users without emails: ${chalk.bold(noEmailUsers.length)}`)
      );
    }
    if (noNameUsers.length > 0) {
      console.log(
        chalk.yellow(`⚠️  Users without names: ${chalk.bold(noNameUsers.length)}`)
      );
    }
    if (neverLoggedIn.length > 0) {
      console.log(
        chalk.yellow(
          `⚠️  Users who never logged in: ${chalk.bold(neverLoggedIn.length)}`
        )
      );
    }

    if (
      noEmailUsers.length === 0 &&
      noNameUsers.length === 0 &&
      neverLoggedIn.length === 0
    ) {
      console.log(chalk.green('✅ No obvious data quality issues found'));
    }
  }
}

// ============================================================================
// Search Functions
// ============================================================================

async function searchStudents(query, threshold = 0.7) {
  const targetNormalized = normalize(query);
  const targetTokens = tokens(query);

  const snap = await db.collection('students').get();
  const results = [];

  snap.forEach((doc) => {
    const data = doc.data() || {};
    const label = getStudentLabel(data);
    const nameNormalized = normalize(label);
    if (!nameNormalized) return;

    const nameTokens = tokens(label);

    // 1. Substring match
    if (hasSubstringMatch(targetNormalized, nameNormalized)) {
      results.push({
        id: doc.id,
        ...data,
        _studentLabel: label,
        matchType: 'substring',
        similarity: 1.0,
      });
      return;
    }

    // 2. Token substring match
    if (hasTokenSubstringMatch(targetTokens, nameTokens)) {
      results.push({
        id: doc.id,
        ...data,
        _studentLabel: label,
        matchType: 'substring',
        similarity: 1.0,
      });
      return;
    }

    // 3. Exact token match
    if (hasExactMatch(targetTokens, nameTokens)) {
      results.push({
        id: doc.id,
        ...data,
        _studentLabel: label,
        matchType: 'exact',
        similarity: 1.0,
      });
      return;
    }

    // 4. Fuzzy token match
    const fuzzyMatch = hasFuzzyMatch(targetTokens, nameTokens, threshold);
    if (fuzzyMatch) {
      results.push({
        id: doc.id,
        ...data,
        _studentLabel: label,
        matchType: fuzzyMatch.exact ? 'exact' : 'fuzzy',
        similarity: fuzzyMatch.score,
      });
    }
  });

  // Sort results: substring > exact > fuzzy, then by similarity score (descending)
  results.sort((a, b) => {
    const typeOrder = { substring: 0, exact: 1, fuzzy: 2 };
    const aOrder = typeOrder[a.matchType] ?? 2;
    const bOrder = typeOrder[b.matchType] ?? 2;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.similarity - a.similarity;
  });

  // If we found any substring matches, suppress fuzzy results entirely (reduce noise)
  if (results.some((r) => r.matchType === 'substring')) {
    return results.filter((r) => r.matchType !== 'fuzzy');
  }

  return results;
}

async function searchUsers(query, threshold = 0.7) {
  const targetNormalized = normalize(query);
  const targetTokens = tokens(query);

  const snap = await db.collection('users').get();
  const results = [];

  snap.forEach((doc) => {
    const data = doc.data() || {};
    const dn = normalize(data.displayName || '');
    if (!dn) return;

    const dnTokens = tokens(dn);

    // 1. Substring match
    if (hasSubstringMatch(targetNormalized, dn)) {
      results.push({
        uid: doc.id,
        ...data,
        matchType: 'substring',
        similarity: 1.0,
      });
      return;
    }

    // 2. Token substring match
    if (hasTokenSubstringMatch(targetTokens, dnTokens)) {
      results.push({
        uid: doc.id,
        ...data,
        matchType: 'substring',
        similarity: 1.0,
      });
      return;
    }

    // 3. Exact token match
    if (hasExactMatch(targetTokens, dnTokens)) {
      results.push({
        uid: doc.id,
        ...data,
        matchType: 'exact',
        similarity: 1.0,
      });
      return;
    }

    // 4. Fuzzy token match
    const fuzzyMatch = hasFuzzyMatch(targetTokens, dnTokens, threshold);
    if (fuzzyMatch) {
      results.push({
        uid: doc.id,
        ...data,
        matchType: fuzzyMatch.exact ? 'exact' : 'fuzzy',
        similarity: fuzzyMatch.score,
      });
    }
  });

  // Sort results: substring > exact > fuzzy, then by similarity score (descending)
  results.sort((a, b) => {
    const typeOrder = { substring: 0, exact: 1, fuzzy: 2 };
    const aOrder = typeOrder[a.matchType] ?? 2;
    const bOrder = typeOrder[b.matchType] ?? 2;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.similarity - a.similarity;
  });

  return results;
}

async function searchUserByUid(uid) {
  try {
    const docRef = db.collection('users').doc(uid);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return [];
    }
    
    const data = docSnap.data() || {};
    return [{
      uid: docSnap.id,
      ...data,
      matchType: 'exact',
      similarity: 1.0,
    }];
  } catch (error) {
    console.error('Error searching user by UID:', error);
    return [];
  }
}

async function listStudents(filterQuery = null) {
  const snap = await db.collection('students').get();
  const students = [];

  snap.forEach((doc) => {
    const data = doc.data() || {};
    const student = {
      id: doc.id,
      displayName: getStudentLabel(data),
      firstName: data.firstName || 'N/A',
      lastName: data.lastName || 'N/A',
      classroomId: data.classroomId || 'N/A',
      branchId: data.branchId || 'N/A',
      status: data.status || 'unknown',
      isActive: data.isActive !== undefined ? data.isActive : 'N/A',
      dateOfBirth: data.dateOfBirth || null,
      dob: data.dob || null,
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
      createdBy: data.createdBy || 'N/A',
    };

    // Filter by search query if provided
    if (filterQuery) {
      const searchLower = filterQuery.toLowerCase();
      const nameMatch =
        student.displayName.toLowerCase().includes(searchLower) ||
        student.firstName.toLowerCase().includes(searchLower) ||
        student.lastName.toLowerCase().includes(searchLower) ||
        `${student.firstName} ${student.lastName}`.toLowerCase().includes(searchLower);

      if (nameMatch) {
        students.push(student);
      }
    } else {
      students.push(student);
    }
  });

  // Sort by displayName for easier inspection
  students.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return students;
}

async function listUsers() {
  const snap = await db.collection('users').get();
  const users = [];

  snap.forEach((doc) => {
    const data = doc.data() || {};
    users.push({
      uid: doc.id,
      email: data.email || 'No Email',
      displayName: data.displayName || 'No Name',
      role: data.role || 'unknown',
      createdAt: data.createdAt || null,
      lastLoginAt: data.lastLoginAt || null,
    });
  });

  // Sort by email for easier inspection
  users.sort((a, b) => a.email.localeCompare(b.email));

  return users;
}

// ============================================================================
// Menu System
// ============================================================================

function displayMainMenu() {
  console.log(
    boxen(
      chalk.bold('ADMIN CLI - Main Menu\n\n') +
        chalk.cyan('1.') + ' Students\n' +
        chalk.cyan('2.') + ' Users\n' +
        chalk.cyan('3.') + ' Exit',
      {
        title: chalk.bold.blue('🎮 Admin CLI'),
        titleAlignment: 'center',
        padding: 1,
        borderColor: 'blue',
        borderStyle: 'round',
      }
    )
  );
}

function displayStudentMenu() {
  console.log(
    boxen(
      chalk.bold('STUDENTS\n\n') +
        chalk.cyan('1.') + ' Search student by name\n' +
        chalk.cyan('2.') + ' List all students\n' +
        chalk.cyan('3.') + ' Back to main menu',
      {
        title: chalk.bold.cyan('👶 Students'),
        titleAlignment: 'center',
        padding: 1,
        borderColor: 'cyan',
        borderStyle: 'round',
      }
    )
  );
}

function displayUserMenu() {
  console.log(
    boxen(
      chalk.bold('USERS\n\n') +
        chalk.magenta('1.') + ' Search user by name\n' +
        chalk.magenta('2.') + ' List all users\n' +
        chalk.magenta('3.') + ' Search user by UID\n' +
        chalk.magenta('4.') + ' Back to main menu',
      {
        title: chalk.bold.magenta('👥 Users'),
        titleAlignment: 'center',
        padding: 1,
        borderColor: 'magenta',
        borderStyle: 'round',
      }
    )
  );
}

async function handleStudentMenu() {
  while (true) {
    displayStudentMenu();
    const choice = await select({
      message: 'Select an option',
      choices: [
        { name: 'Search student by name', value: '1' },
        { name: 'List all students', value: '2' },
        { name: 'Back to main menu', value: '3' },
      ],
    });

    if (choice === '1') {
      const query = await input({
        message: 'Enter student name to search',
      });
      if (query) {
        console.log(chalk.dim(`\n🔎 Searching for student: "${query}"...`));
        const results = await searchStudents(query);
        displayStudentSearchResults(results);
      }
    } else if (choice === '2') {
      const shouldFilter = await confirm({
        message: 'Do you want to filter by name?',
        default: false,
      });
      let filterQuery = null;
      if (shouldFilter) {
        filterQuery = await input({
          message: 'Enter name filter (partial match)',
        });
      }

      console.log(chalk.dim('\n🔍 Fetching students from Firestore...'));
      const students = await listStudents(filterQuery);
      displayStudentList(students);
      displayDataQualityWarnings('students', students);
    } else if (choice === '3') {
      break;
    }
  }
}

async function handleUserMenu() {
  while (true) {
    displayUserMenu();
    const choice = await select({
      message: 'Select an option',
      choices: [
        { name: 'Search user by name', value: '1' },
        { name: 'List all users', value: '2' },
        { name: 'Search user by UID', value: '3' },
        { name: 'Back to main menu', value: '4' },
      ],
    });

    if (choice === '1') {
      const query = await input({
        message: 'Enter user name to search',
      });
      if (query) {
        console.log(chalk.dim(`\n🔎 Searching for user: "${query}"...`));
        const results = await searchUsers(query);
        displayUserSearchResults(results);
      }
    } else if (choice === '2') {
      console.log(chalk.dim('\n🔍 Fetching users from Firestore...'));
      const users = await listUsers();
      displayUserList(users);
      displayDataQualityWarnings('users', users);
    } else if (choice === '3') {
      const uid = await input({
        message: 'Enter user UID to search',
      });
      if (uid) {
        console.log(chalk.dim(`\n🔎 Searching for user with UID: "${uid}"...`));
        const results = await searchUserByUid(uid);
        displayUserSearchResults(results);
      }
    } else if (choice === '4') {
      break;
    }
  }
}

async function main() {
  try {
    console.log(chalk.bold.blue('\n👋 Welcome to Admin CLI!\n'));

    while (true) {
      displayMainMenu();
      const choice = await select({
        message: 'Select an option',
        choices: [
          { name: 'Students', value: '1' },
          { name: 'Users', value: '2' },
          { name: 'Exit', value: '3' },
        ],
      });

      if (choice === '1') {
        await handleStudentMenu();
      } else if (choice === '2') {
        await handleUserMenu();
      } else if (choice === '3') {
        console.log(chalk.green('\n👋 Goodbye!\n'));
        break;
      }
    }
  } catch (error) {
    if (error.name === 'CancelError' || error.message === 'User force closed the prompt with SIGINT') {
      console.log(chalk.yellow('\n\n👋 Goodbye!\n'));
      process.exit(0);
    }
    console.error(chalk.red('\n❌ Error:'), error.message);
    if (error.stack) {
      console.error(chalk.dim(error.stack));
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(chalk.red('❌ Fatal error:'), err && err.message ? err.message : err);
  process.exit(1);
});
