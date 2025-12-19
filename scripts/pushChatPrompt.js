/*
  Push Chat Prompt Configuration to Firestore
  
  Pushes/updates chat prompt configurations to ai_prompts/chat_<branchname>
  Creates 4 documents: chat_hsr, chat_whitefield, chat_varthur, chat_hyderabad
  
  Usage:
    node scripts/pushChatPrompt.js
    
  This script will:
  - Create/update ai_prompts/chat_<branchname> documents for each branch
  - Set updatedAt to server timestamp
  - Requires firebase-service-account.json in project root
*/

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin using the local service account
const serviceAccount = require(path.resolve(__dirname, '../firebase-service-account.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://pep-os.firebaseio.com',
});

const db = admin.firestore();

// Chat prompt configuration (default values)
const CHAT_CONFIG = {
  title: 'Chat Command Centre',
  description: 'Configure AI chat settings for per-student conversations',
  
  // Model configuration
  model: 'gpt-4o',
  temperature: 0.7,
  max_tokens: 2000,
  
  // Context limits
  chatMessageLimit: 6, // Number of recent chat messages to include
  observationLimit: 'all', // 'all' or number - number of recent observations to include
  
  // System prompt
  systemPrompt: `You are a helpful AI assistant specialized in Montessori education. Your role is to help teachers understand and reflect on student development based on observation notes.

You have access to recent observation notes for the student being discussed. Use this context to:
- Answer questions about the student's progress, interests, and development
- Identify patterns or trends in their learning
- Suggest areas for further observation or support
- Help teachers reflect on the student's growth over time

Be conversational, supportive, and focused on the student's development. Reference specific observations when relevant, but keep responses concise and actionable.`,
  
  // Change tracking
  version: 1,
  seed: true,
};

// Branch IDs
const BRANCHES = ['hsr', 'whitefield', 'varthur', 'hyderabad'];

async function pushChatPrompt(branchId) {
  const docId = `chat_${branchId}`;
  const chatRef = db.collection('ai_prompts').doc(docId);
  
  const docData = {
    ...CHAT_CONFIG,
    branchId: branchId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: {
      uid: 'script',
      email: 'script@pepschoolv2.com',
      name: 'Push Script'
    }
  };
  
  // Check if document exists
  const existingDoc = await chatRef.get();
  if (existingDoc.exists) {
    console.log(`   ⚠️  Document ${docId} already exists. Updating...`);
    await chatRef.update(docData);
    console.log(`   ✅ Updated ${docId}`);
  } else {
    console.log(`   📝 Creating ${docId}...`);
    await chatRef.set(docData);
    console.log(`   ✅ Created ${docId}`);
  }
  
  return docId;
}

async function main() {
  try {
    console.log('🚀 Pushing Chat Prompt Configurations...\n');
    console.log('📋 Configuration:');
    console.log(`   Model: ${CHAT_CONFIG.model}`);
    console.log(`   Temperature: ${CHAT_CONFIG.temperature}`);
    console.log(`   Max Tokens: ${CHAT_CONFIG.max_tokens}`);
    console.log(`   Chat Message Limit: ${CHAT_CONFIG.chatMessageLimit}`);
    console.log(`   Observation Limit: ${CHAT_CONFIG.observationLimit}`);
    console.log(`   System Prompt Length: ${CHAT_CONFIG.systemPrompt.length} characters\n`);
    
    console.log('📤 Pushing to Firestore...\n');
    
    for (const branchId of BRANCHES) {
      await pushChatPrompt(branchId);
    }
    
    console.log('\n✅ Success! All chat prompt configurations have been pushed to Firestore.');
    console.log(`\n📚 Created/Updated documents:`);
    BRANCHES.forEach(branchId => {
      console.log(`   - ai_prompts/chat_${branchId}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
