/*
  Push Coach Prompt to Firestore
  
  Pushes/updates the coach prompt configuration to ai_prompts/coach
  
  Usage:
    node scripts/pushCoachPrompt.js
    
  This script will:
  - Update the ai_prompts/coach document with the coach prompt configuration
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

// Coach prompt configuration
const COACH_CONFIG = {
  title: 'Coach Nudges',
  
  // Note: disabledNudges will be calculated as all nudges not in enabledNudges
  enabledNudges: ['duration', 'modality', 'independence', 'evidence', 'subjective'],
  
  maxReturnNudges: 1,
  
  // Nudge blocks - descriptions for each nudge type
  nudgeBlocks: {
    duration: '- duration: academic activity is described; trigger: no time range (e.g. "5–10 min") appears.',
    modality: '- modality: academic activity is described; trigger: does not specify the method (Material / Pen & paper / Mental).',
    independence: '- independence: academic activity is described; trigger: does not state independence level (independent, peer, teacher-guided, etc.).',
    evidence: '- evidence: the note makes a claim (understood, did well, grasped, struggled, etc.); trigger: gives no supporting detail such as number or quote.',
    subjective: '- subjective: the note uses emotional adjectives (happy, sad, lazy, always, etc.); trigger: without an objective observation line.'
  },
};

// All possible nudge types
const ALL_NUDGES = ['duration', 'modality', 'independence', 'evidence', 'subjective'];

function composeFinalPrompt(enabledNudges) {
  /**
   * Build the final prompt by combining intro with nudge blocks
   * Matches coach_playground.py get_system_prompt() function EXACTLY
   */
  if (!enabledNudges || enabledNudges.length === 0) {
    return 'You are Coach Pepper. Coach feature is disabled. Return empty nudges array.';
  }
  
  // Build nudge blocks based on enabled nudges (matching Python exactly)
  const nudgeBlocks = [];
  
  if (enabledNudges.includes('duration')) {
    nudgeBlocks.push(COACH_CONFIG.nudgeBlocks.duration);
  }
  if (enabledNudges.includes('modality')) {
    nudgeBlocks.push(COACH_CONFIG.nudgeBlocks.modality);
  }
  if (enabledNudges.includes('independence')) {
    nudgeBlocks.push(COACH_CONFIG.nudgeBlocks.independence);
  }
  if (enabledNudges.includes('evidence')) {
    nudgeBlocks.push(COACH_CONFIG.nudgeBlocks.evidence);
  }
  if (enabledNudges.includes('subjective')) {
    nudgeBlocks.push(COACH_CONFIG.nudgeBlocks.subjective);
  }
  
  const allowedIds = enabledNudges.join(' | ');
  const nudgeBlocksText = nudgeBlocks.join('\n\n');
  
  // Return prompt matching Python f-string format exactly
  return `You are Coach Pepper, a Montessori observation coach that inspects one teacher note and identifies objective information gaps.

How to respond
- Read the note carefully and understand its meaning.
- Evaluate each nudge type independently — whether or not another applies.
- A note may trigger multiple nudges at once; include all that clearly fit.
- If no nudge fits confidently, return an empty array.
- Output strict JSON with top-level "nudges", which is an array of objects.  
   Each object must include exactly:
   - "id": string (the nudge type)
   - "reason": short explanation of what's missing
   - "confidence": numeric value between 0 and 1

Example outputs:
1. 
   {
     "nudges": [
       { "id": "duration", "reason": "Missing time range.", "confidence": 0.8 },
       { "id": "modality", "reason": "No activity method specified.", "confidence": 0.6 },
       { "id": "subjective", "reason": "Includes emotional adjective without objective observation.", "confidence": 0.7 }
     ]
   }
2. 
   {
     "nudges": []
   }

Nudge types and triggers
${nudgeBlocksText}
`;
}

async function main() {
  try {
    console.log('🚀 Pushing Coach Prompt Configuration...\n');
    
    const enabledNudges = COACH_CONFIG.enabledNudges;
    const disabledNudges = ALL_NUDGES.filter(n => !enabledNudges.includes(n));
    
    // Compose final prompt dynamically (matching coach_playground.py logic)
    const finalPrompt = composeFinalPrompt(enabledNudges);
    
    // Extract introBlock from the composed prompt (everything before "Nudge types and triggers")
    const introBlockMatch = finalPrompt.match(/^(.+)\n\nNudge types and triggers/);
    const introBlock = introBlockMatch ? introBlockMatch[1] : finalPrompt.split('\n\nNudge types and triggers')[0];
    
    // Prepare document data
    const docData = {
      title: COACH_CONFIG.title,
      description: COACH_CONFIG.description || 'Select which nudges Coach can suggest.',
      enabledNudges: enabledNudges,
      disabledNudges: disabledNudges,
      maxReturnNudges: COACH_CONFIG.maxReturnNudges,
      nudgeBlocks: COACH_CONFIG.nudgeBlocks,
      introBlock: introBlock,
      finalPrompt: finalPrompt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: {
        uid: 'script',
        email: 'script@pepschoolv2.com',
        name: 'Push Script'
      }
    };
    
    const coachRef = db.collection('ai_prompts').doc('coach');
    
    console.log('📝 Document Data:');
    console.log(`   Title: ${docData.title}`);
    console.log(`   Enabled Nudges: ${docData.enabledNudges.join(', ')}`);
    console.log(`   Disabled Nudges: ${docData.disabledNudges.join(', ') || '(none)'}`);
    console.log(`   Max Return Nudges: ${docData.maxReturnNudges}`);
    console.log(`   Nudge Blocks: ${Object.keys(docData.nudgeBlocks).length} configured`);
    console.log(`   Final Prompt Length: ${docData.finalPrompt.length} characters\n`);
    
    // Check if document exists
    const existingDoc = await coachRef.get();
    if (existingDoc.exists) {
      console.log('⚠️  Document already exists. Updating...');
    } else {
      console.log('✨ Creating new document...');
    }
    
    // Write to Firestore
    await coachRef.set(docData, { merge: true });
    
    console.log('✅ Successfully pushed coach prompt configuration!');
    console.log(`   Document: ai_prompts/coach`);
    console.log(`   Updated at: ${new Date().toISOString()}\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
