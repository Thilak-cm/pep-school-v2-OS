// Barrel file — re-exports all Cloud Functions from domain modules.
// Firebase deploys from this entry point (package.json "main": "index.js").

// Auth
export {
  createAuthUserAndProfile,
  updateUserProfileIfExists,
  updateUserWithEmailCheck,
  migratePendingUser,
} from "./auth/index.js";

// Media
export {
  suggestPdfTitle,
  extractPdfEssence,
  analyzePhotoVLM,
  detectHandwritingVLM,
  mediaFinalize,
  mediaCleanup,
} from "./media/index.js";

// AI — Text Cleanup
export { aiTextCleanup } from "./ai/textCleanup.js";

// AI — Whisper STT
export {
  aiWhisperTranscribe,
  aiWhisperTranslate,
} from "./ai/whisper.js";

// AI — Coach Review
export { aiCoachReview } from "./ai/coach.js";

// AI — Baseball Card
export {
  previewBaseballCard,
  regenerateBaseballCardForStudent,
  generateBaseballCards,
} from "./ai/baseballCard.js";

// AI — Writing Analysis (PEP-263: per-program config + weekly scheduled)
export { batchAnalyzeWriting, generateWritingAnalysis } from "./ai/handwriting.js";

// Chat
export {
  childChat,
  childChatStream,
  cleanupDeletedChats,
} from "./chat/index.js";

// Reports
export {
  generateStudentReport,
  previewStudentReport,
  exportReportToDrive,
  checkReportReadiness,
  deleteStudentReport,
} from "./reports/index.js";

// Classroom & Drive Permissions
export {
  onClassroomUpdate,
  onUserUpdate,
  onUserDelete,
  bulkSyncDrivePermissions,
} from "./classroom/index.js";

// Student Soul
export {
  generateStudentProfile,
  backfillStudentProfiles,
} from "./students/soul.js";

// Monthly Plan (PEP-260, PEP-279)
export { generateMonthlyPlan, exportMonthlyPlanToDrive, batchGenerateMonthlyPlans } from "./monthlyPlan/index.js";

// Stats (PEP-285)
export { recomputeStats } from "./stats/index.js";

// Test Bench
export { testBenchRun } from "./testbench/index.js";

// Weekly Digest (PEP-297)
export { weeklyDigestClassroomAdmin, weeklyDigestSuperadmin } from "./digest/index.js";
