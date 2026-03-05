/**
 * One-time script to upload branding assets to Firebase Storage.
 * Run from repo root: node scripts/admin/upload-report-assets.mjs
 *
 * Expected files in repo root:
 *   - montessori-os/public/pep-logo.png        (logo)
 *   - Educator_Summary_25-26_Mi-012.png         (footer pattern)
 *   - Educator_Summary_25-26_Mi-002.png         (first-page header decoration)
 *   - Educator_Summary_25-26_Mi-014.png         (default header decoration)
 *
 * Also accepts /tmp/ overrides if present.
 */
import admin from "firebase-admin";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../..");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
    storageBucket: "pep-os.firebasestorage.app",
  });
}

const bucket = admin.storage().bucket();

const ASSETS = [
  {
    localPaths: ["/tmp/pep-logo.png", path.join(repoRoot, "montessori-os/public/pep-logo.png")],
    storagePath: "assets/branding/pep-logo.png",
    contentType: "image/png",
  },
  {
    localPaths: ["/tmp/footer-pattern.png", path.join(repoRoot, "Educator_Summary_25-26_Mi-012.png")],
    storagePath: "assets/branding/footer-pattern.png",
    contentType: "image/png",
  },
  {
    localPaths: ["/tmp/header-first-page.png", path.join(repoRoot, "Educator_Summary_25-26_Mi-002.png")],
    storagePath: "assets/branding/header-first-page.png",
    contentType: "image/png",
  },
  {
    localPaths: ["/tmp/header-default.png", path.join(repoRoot, "Educator_Summary_25-26_Mi-014.png")],
    storagePath: "assets/branding/header-default.png",
    contentType: "image/png",
  },
];

async function uploadAsset({ localPaths, storagePath, contentType }) {
  const localPath = localPaths.find((p) => existsSync(p));
  if (!localPath) {
    console.warn(`  Skipping ${storagePath} — no local file found at: ${localPaths.join(", ")}`);
    return null;
  }

  const fileBuffer = readFileSync(localPath);
  const file = bucket.file(storagePath);

  await file.save(fileBuffer, {
    metadata: { contentType },
    public: true,
  });

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
  console.log(`  Uploaded ${path.basename(localPath)} -> ${publicUrl}`);
  return publicUrl;
}

async function main() {
  console.log("Uploading branding assets to Firebase Storage...\n");

  for (const asset of ASSETS) {
    await uploadAsset(asset);
  }

  console.log("\nDone. Deploy storage rules to allow public reads:");
  console.log("  firebase deploy --only storage");
}

main().catch((err) => {
  console.error("Upload failed:", err);
  process.exit(1);
});
