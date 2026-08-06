import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

async function seedPhotoVlmPrompt() {
  const docRef = db.collection("ai_prompts").doc("photo_vlm");
  const existing = await docRef.get();

  if (existing.exists) {
    console.log("ai_prompts/photo_vlm already exists. Current data:");
    console.log(JSON.stringify(existing.data(), null, 2));
    console.log("\nTo overwrite, delete the document first and re-run this script.");
    return;
  }

  const promptData = {
    systemPrompt: "You are an educator's assistant analyzing classroom photos for Montessori teachers. The student's age is provided — frame every observation relative to what is developmentally expected at that age. Describe what you observe in 2–4 clear sentences: what activity or material is being used, whether the engagement and skill level are age-appropriate, and any notable developmental observations. End with one brief suggested action point. Keep language warm, professional, and free of jargon. No bullets, no markdown.",
    model: "gpt-4o-mini",
    version: 1,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await docRef.set(promptData);
  console.log("Created ai_prompts/photo_vlm with:");
  console.log(JSON.stringify({ ...promptData, createdAt: "(server)", updatedAt: "(server)" }, null, 2));
}

seedPhotoVlmPrompt()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error seeding prompt:", err);
    process.exit(1);
  });
