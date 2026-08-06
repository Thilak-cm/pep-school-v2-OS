/**
 * User Deletion Tool
 * 
 * Usage:
 *   node delete-users.js                    # Interactive mode - select user to delete
 *   node delete-users.js "john doe"         # Search and delete user by name/email/UID
 *   node delete-users.js john               # Fuzzy search for users matching "john"
 * 
 * Features:
 *   - Fuzzy search by name, email, or UID
 *   - Interactive user selection when no args provided
 *   - Emergency bulk delete option (with warnings)
 *   - Confirmation prompts for all deletions
 *   - Score-based matching for better results
 */

const admin = require('firebase-admin');
const readline = require('readline');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: 'https://pep-os.firebaseio.com'
});

const db = admin.firestore();

// Simple fuzzy search function
function fuzzySearch(query, text) {
  if (!query || !text) return 0;
  
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Exact match gets highest score
  if (textLower === queryLower) return 100;
  
  // Starts with query gets high score
  if (textLower.startsWith(queryLower)) return 90;
  
  // Contains query gets medium score
  if (textLower.includes(queryLower)) return 70;
  
  // Fuzzy matching - check if all characters in query appear in order
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  
  // Return score based on how many characters matched
  return queryIndex === queryLower.length ? 50 : 0;
}

// Safety check function
function confirmAction(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question(`${message} (type 'YES' to confirm): `, (answer) => {
      rl.close();
      resolve(answer === 'YES');
    });
  });
}

// Get user input function
function getUserInput(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Find users by fuzzy search
function findUsers(users, searchQuery) {
  const results = [];
  
  users.forEach(user => {
    const displayName = user.data.displayName || '';
    const email = user.data.email || '';
    const uid = user.id;
    
    const nameScore = fuzzySearch(searchQuery, displayName);
    const emailScore = fuzzySearch(searchQuery, email);
    const uidScore = fuzzySearch(searchQuery, uid);
    
    const maxScore = Math.max(nameScore, emailScore, uidScore);
    
    if (maxScore > 0) {
      results.push({
        ...user,
        score: maxScore,
        matchField: nameScore >= emailScore && nameScore >= uidScore ? 'name' : 
                   emailScore >= uidScore ? 'email' : 'uid'
      });
    }
  });
  
  // Sort by score (highest first)
  return results.sort((a, b) => b.score - a.score);
}

// Display user selection menu
function displayUserMenu(users, isFuzzy = false) {
  console.log('\n📋 Available users:');
  console.log('─'.repeat(60));
  
  users.forEach((user, index) => {
    const data = user.data;
    const displayName = data.displayName || 'No name';
    const email = data.email || 'No email';
    const role = data.role || 'No role';
    const score = isFuzzy ? ` (Score: ${user.score})` : '';
    
    console.log(`${index + 1}. ${displayName}`);
    console.log(`   Email: ${email}`);
    console.log(`   Role: ${role}`);
    console.log(`   UID: ${user.id}${score}`);
    console.log('');
  });
  
  if (isFuzzy) {
    console.log('0. Search again');
  }
  console.log('─'.repeat(60));
}

// Delete a single user
async function deleteSingleUser(userDoc) {
  try {
    const userData = userDoc.data;
    const displayName = userData.displayName || 'Unknown';
    const email = userData.email || 'No email';
    
    console.log('\n👤 User to be deleted:');
    console.log(`   Name: ${displayName}`);
    console.log(`   Email: ${email}`);
    console.log(`   UID: ${userDoc.id}`);
    console.log(`   Role: ${userData.role || 'No role'}`);
    console.log('');
    
    const confirmed = await confirmAction(`Are you sure you want to delete user "${displayName}"?`);
    
    if (!confirmed) {
      console.log('❌ User deletion cancelled.');
      return false;
    }
    
    console.log('🗑️ Deleting user...');
    await userDoc.ref.delete();
    
    console.log(`✅ Successfully deleted user "${displayName}"!`);
    return true;
    
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    return false;
  }
}

// Interactive user selection
async function interactiveUserSelection() {
  try {
    console.log('\n🔍 Searching for users...');
    
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      console.log('ℹ️ No users found in the database.');
      return;
    }
    
    const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, data: doc.data(), ref: doc.ref }));
    
    while (true) {
      console.log('\n🎯 What would you like to do?');
      console.log('1. Search for a specific user');
      console.log('2. List all users');
      console.log('3. 🚨 EMERGENCY: Delete ALL users');
      console.log('4. Exit');
      
      const choice = await getUserInput('\nEnter your choice (1-4): ');
      
      switch (choice) {
        case '1':
          await searchAndDeleteUser(allUsers);
          break;
        case '2':
          await listAndSelectUser(allUsers);
          break;
        case '3':
          await deleteAllUsers();
          return; // Exit after bulk delete
        case '4':
          console.log('👋 Goodbye!');
          return;
        default:
          console.log('❌ Invalid choice. Please enter 1, 2, 3, or 4.');
      }
    }
    
  } catch (error) {
    console.error('❌ Error in interactive selection:', error);
  }
}

// Search and delete user
async function searchAndDeleteUser(allUsers) {
  const searchQuery = await getUserInput('\n🔍 Enter user name, email, or UID to search: ');
  
  if (!searchQuery) {
    console.log('❌ Search query cannot be empty.');
    return;
  }
  
  const matches = findUsers(allUsers, searchQuery);
  
  if (matches.length === 0) {
    console.log('❌ No users found matching your search.');
    return;
  }
  
  if (matches.length === 1) {
    // Single match - proceed directly to deletion
    await deleteSingleUser(matches[0]);
    return;
  }
  
  // Multiple matches - show selection menu
  displayUserMenu(matches, true);
  
  while (true) {
    const choice = await getUserInput(`\nSelect user to delete (1-${matches.length}) or 0 to search again: `);
    
    if (choice === '0') {
      return; // Go back to search
    }
    
    const userIndex = parseInt(choice) - 1;
    
    if (userIndex >= 0 && userIndex < matches.length) {
      const success = await deleteSingleUser(matches[userIndex]);
      if (success) {
        // Remove deleted user from the list
        allUsers.splice(allUsers.findIndex(u => u.id === matches[userIndex].id), 1);
      }
      return;
    } else {
      console.log('❌ Invalid selection. Please try again.');
    }
  }
}

// List and select user
async function listAndSelectUser(allUsers) {
  displayUserMenu(allUsers);
  
  while (true) {
    const choice = await getUserInput(`\nSelect user to delete (1-${allUsers.length}): `);
    const userIndex = parseInt(choice) - 1;
    
    if (userIndex >= 0 && userIndex < allUsers.length) {
      const success = await deleteSingleUser(allUsers[userIndex]);
      if (success) {
        // Remove deleted user from the list
        allUsers.splice(userIndex, 1);
      }
      return;
    } else {
      console.log('❌ Invalid selection. Please try again.');
    }
  }
}

// Delete all users (emergency function)
async function deleteAllUsers() {
  try {
    console.log('\n🚨🚨🚨 EMERGENCY BULK DELETE 🚨🚨🚨');
    console.log('🚨 WARNING: This will delete ALL users from Firestore!');
    console.log('🚨 This action cannot be undone!');
    console.log('🚨 Make sure you have backups if needed!');
    console.log('🚨 This is a DESTRUCTIVE operation!');
    console.log('');
    
    const confirmed = await confirmAction('Are you sure you want to delete ALL users?');
    
    if (!confirmed) {
      console.log('❌ Bulk deletion cancelled by user.');
      return;
    }
    
    console.log('🗑️ Deleting all users from Firestore...');
    
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      console.log('ℹ️ No users found to delete.');
      return;
    }
    
    console.log(`📝 Found ${usersSnapshot.size} users to delete:`);
    usersSnapshot.docs.forEach(doc => {
      console.log(`   - ${doc.id}: ${doc.data().displayName || 'Unknown'}`);
    });
    
    const confirmedDelete = await confirmAction('Proceed with bulk deletion?');
    
    if (!confirmedDelete) {
      console.log('❌ Bulk deletion cancelled by user.');
      return;
    }
    
    const batch = db.batch();
    usersSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    console.log('✅ Successfully deleted all users!');
    console.log('💡 Other collections (classrooms, students, observations, etc.) remain untouched.');
    
  } catch (error) {
    console.error('❌ Error deleting users:', error);
  }
}

// Main execution logic
async function main() {
  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      // No arguments - interactive mode
      console.log('🎯 User Deletion Tool');
      console.log('===================');
      await interactiveUserSelection();
    } else {
      // Arguments provided - search for specific user
      const searchQuery = args.join(' ');
      console.log(`🔍 Searching for user: "${searchQuery}"`);
      
      const usersSnapshot = await db.collection('users').get();
      
      if (usersSnapshot.empty) {
        console.log('ℹ️ No users found in the database.');
        process.exit(0);
      }
      
      const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, data: doc.data(), ref: doc.ref }));
      const matches = findUsers(allUsers, searchQuery);
      
      if (matches.length === 0) {
        console.log('❌ No users found matching your search.');
        console.log('💡 Try running the script without arguments for interactive mode.');
        process.exit(1);
      }
      
      if (matches.length === 1) {
        // Single match - proceed directly to deletion
        console.log('✅ Found exact match!');
        await deleteSingleUser(matches[0]);
      } else {
        // Multiple matches - show selection menu
        console.log(`✅ Found ${matches.length} matches:`);
        displayUserMenu(matches, true);
        
        while (true) {
          const choice = await getUserInput(`\nSelect user to delete (1-${matches.length}) or 0 to cancel: `);
          
          if (choice === '0') {
            console.log('❌ Operation cancelled.');
            process.exit(0);
          }
          
          const userIndex = parseInt(choice) - 1;
          
          if (userIndex >= 0 && userIndex < matches.length) {
            await deleteSingleUser(matches[userIndex]);
            break;
          } else {
            console.log('❌ Invalid selection. Please try again.');
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error in main execution:', error);
  } finally {
    process.exit(0);
  }
}

// Run the main function
main(); 