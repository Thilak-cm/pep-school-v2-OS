/**
 * Access Control Specification - Source of Truth for Security Rules
 *
 * This file defines the non-negotiable security rules that MUST exist in both
 * firestore.rules and storage.rules. If these patterns fail, it means critical
 * access control has been accidentally deleted or broken.
 *
 * Each rule is defined with:
 * - name: Human-readable description
 * - pattern: Regex to find the rule in the rules file
 * - file: Which rules file(s) this applies to ('firestore', 'storage', or 'both')
 * - criticality: 'critical' (breaks everything) or 'important' (breaks specific flow)
 */

export const ACCESS_CONTROL_SPEC = [
  // ============================================================================
  // AUTHENTICATION & ROLE HIERARCHY (Firestore)
  // ============================================================================

  {
    name: 'Authentication gate exists',
    description: 'isSignedIn() checks request.auth != null',
    file: 'firestore',
    criticality: 'critical',
    pattern: /function\s+isSignedIn\s*\(\s*\)\s*\{\s*return\s+request\.auth\s*!=\s*null\s*;\s*\}/,
  },

  {
    name: 'SuperAdmin role check',
    description: 'isSuperAdmin() returns true only for users with role == "superadmin"',
    file: 'firestore',
    criticality: 'critical',
    pattern: /function\s+isSuperAdmin\s*\(\s*\)\s*\{\s*return\s+isSignedIn\s*\(\s*\)\s*&&\s*requesterDoc\s*\(\s*\)\.data\.role\s*==\s*['\"]superadmin['\"]\s*;\s*\}/,
  },

  {
    name: 'ClassroomAdmin role check',
    description: 'isClassroomAdmin() returns true only for users with role == "classroomadmin"',
    file: 'firestore',
    criticality: 'critical',
    pattern: /function\s+isClassroomAdmin\s*\(\s*\)\s*\{\s*return\s+isSignedIn\s*\(\s*\)\s*&&\s*requesterDoc\s*\(\s*\)\.data\.role\s*==\s*['\"]classroomadmin['\"]\s*;\s*\}/,
  },

  {
    name: 'PrivilegedAdmin role check',
    description: 'isPrivilegedAdmin() returns true for superadmin OR classroomadmin',
    file: 'firestore',
    criticality: 'critical',
    pattern: /function\s+isPrivilegedAdmin\s*\(\s*\)\s*\{\s*return\s+isSuperAdmin\s*\(\s*\)\s*\|\|\s*isClassroomAdmin\s*\(\s*\)\s*;\s*\}/,
  },

  {
    name: 'Teacher role check',
    description: 'isTeacher() returns true only for users with role == "teacher"',
    file: 'firestore',
    criticality: 'critical',
    pattern: /function\s+isTeacher\s*\(\s*\)\s*\{\s*return\s+isSignedIn\s*\(\s*\)\s*&&\s*requesterDoc\s*\(\s*\)\.data\.role\s*==\s*['\"]teacher['\"]\s*;\s*\}/,
  },

  // ============================================================================
  // CLASSROOM SCOPING (Firestore) - Prevents classroomadmins from accessing other classrooms
  // ============================================================================

  {
    name: 'Classroom scoping - hasManageableClassroom check',
    description: 'hasManageableClassroom(classroomId) validates classroomadmin has access',
    file: 'firestore',
    criticality: 'critical',
    pattern: /function\s+hasManageableClassroom\s*\(\s*classroomId\s*\)\s*\{[\s\S]*?requesterDoc\s*\(\s*\)\.data\.manageableClassrooms\.hasAny\s*\(\s*\[\s*classroomId\s*\]\s*\)/,
  },

  {
    name: 'Classroom scoping - managesClassroom combines superadmin + scoping',
    description: 'managesClassroom(classroomId) returns true if superadmin OR has classroom access',
    file: 'firestore',
    criticality: 'critical',
    pattern: /function\s+managesClassroom\s*\(\s*classroomId\s*\)\s*\{\s*return\s+isSuperAdmin\s*\(\s*\)\s*\|\|\s*hasManageableClassroom\s*\(\s*classroomId\s*\)\s*;\s*\}/,
  },

  // ============================================================================
  // TEACHER CLASSROOM SCOPING (Firestore) - Teachers only access assigned classrooms
  // ============================================================================

  {
    name: 'Teacher classroom scoping helper exists',
    description: 'isTeacherInClassroom(classroomId) checks teacher UID in classroom teacherIds',
    file: 'firestore',
    criticality: 'critical',
    pattern: /function\s+isTeacherInClassroom\s*\(\s*classroomId\s*\)[\s\S]*?isTeacher\s*\(\s*\)[\s\S]*?teacherIds[\s\S]*?request\.auth\.uid/,
  },

  {
    name: 'Classrooms get scoped for teachers to assigned classrooms',
    description: 'Teachers can only get classrooms where they are in teacherIds (list allows isTeacher)',
    file: 'firestore',
    criticality: 'critical',
    pattern: /match\s+\/classrooms\/\{classroomId\}[\s\S]*?allow\s+get:[\s\S]*?teacherIds[\s\S]*?request\.auth\.uid/,
  },

  // ============================================================================
  // STUDENTS ACCESS CONTROL (Firestore) - Scoped reads, admins can manage
  // ============================================================================

  {
    name: 'Students collection get scoped by role',
    description: 'allow get: superadmin full, classroomadmin scoped to managesClassroom, teacher scoped to isTeacherInClassroom',
    file: 'firestore',
    criticality: 'critical',
    pattern: /match\s+\/students\/\{studentId\}[\s\S]*?allow\s+get:\s*if\s+isSuperAdmin[\s\S]*?managesClassroom[\s\S]*?isTeacherInClassroom/,
  },

  {
    name: 'Students create requires admin in managed classroom',
    description: 'allow create: if isSuperAdmin() || (isClassroomAdmin() && managesClassroom)',
    file: 'firestore',
    criticality: 'critical',
    pattern: /match\s+\/students\/\{studentId\}[\s\S]*?allow\s+create:\s*if\s+isSuperAdmin\s*\(\s*\)\s*\|\|\s*\(\s*isClassroomAdmin\s*\(\s*\)\s*&&\s*managesClassroom\s*\(\s*requestClassroomForStudent\s*\(\s*\)\s*\)\s*\)/,
  },

  // ============================================================================
  // OBSERVATIONS ACCESS CONTROL (Firestore) - Core data, teachers limited to 48h
  // ============================================================================

  {
    name: 'Observations read scoped for admins and teachers',
    description: 'allow read: if adminCanAccessObservation() || isTeacherInClassroom()',
    file: 'firestore',
    criticality: 'critical',
    pattern: /match\s+\/observations\/\{observationId\}[\s\S]*?allow\s+read:\s*if\s+adminCanAccessObservation\s*\(\s*\)\s*\|\|\s*isTeacherInClassroom/,
  },

  {
    name: 'Observations 48-hour edit window for teachers',
    description: 'withinAuthorActionWindow() checks createdAt + 48 hours',
    file: 'firestore',
    criticality: 'critical',
    pattern: /function\s+withinAuthorActionWindow\s*\(\s*\)[\s\S]*?request\.time\s*<\s*resource\.data\.createdAt\s*\+\s*duration\.value\s*\(\s*48\s*,\s*['\"]h['\"]\s*\)/,
  },

  {
    name: 'Observations author can only edit own notes within 48h',
    description: 'authorCanEditObservation() validates isTeacher, isAuthor, within window',
    file: 'firestore',
    criticality: 'critical',
    pattern: /function\s+authorCanEditObservation\s*\(\s*\)[\s\S]*?return\s+isTeacher\s*\(\s*\)\s*&&\s*isAuthor\s*\(\s*\)\s*&&\s*withinAuthorActionWindow\s*\(\s*\)/,
  },

  // ============================================================================
  // SUPERADMIN-ONLY COLLECTIONS (Firestore) - AI prompts, config, programs cannot be modified by others
  // ============================================================================

  // AI Prompts rule removed — PEP-139: migrated to config collection

  {
    name: 'Programs write restricted to superadmin only',
    description: 'allow create, update, delete: if isSuperAdmin()',
    file: 'firestore',
    criticality: 'critical',
    pattern: /match\s+\/programs\/\{programId\}[\s\S]*?allow\s+create,\s*update,\s*delete:\s*if\s+isSuperAdmin\s*\(\s*\)/,
  },

  {
    name: 'Config write restricted to superadmin only',
    description: 'allow create, update, delete: if isSuperAdmin()',
    file: 'firestore',
    criticality: 'critical',
    pattern: /match\s+\/config\/\{docId\}[\s\S]*?allow\s+create,\s*update,\s*delete:\s*if\s+isSuperAdmin\s*\(\s*\)/,
  },

  // ============================================================================
  // TESTBENCH ACCESS CONTROL (Firestore) - Per-teacher feature grants (PEP-224)
  // ============================================================================

  {
    name: 'Testbench settings: superadmin read/write',
    description: 'Superadmins manage the settings anchor doc',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/testbench\/settings[\s\S]*?allow\s+read:\s*if\s+isSuperAdmin/,
  },

  {
    name: 'Testbench access docs: superadmin read/write + self-read for teachers',
    description: 'Superadmins manage access; teachers read their own doc',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/access\/\{uid\}[\s\S]*?isSuperAdmin[\s\S]*?request\.auth\.uid\s*==\s*uid/,
  },

  // ============================================================================
  // TESTBENCH RUNS (Firestore) - Prompt test bench results
  // Nested under testbench/settings/runs/{runId}
  // Superadmins have full access; teachers with access grants get
  // feature-scoped read/create (PEP-224)
  // ============================================================================

  {
    name: 'Testbench runs read: superadmin + granted teachers',
    description: 'allow read: if isSuperAdmin() || teacher with feature in allowedFeatures',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/runs\/\{runId\}[\s\S]*?allow\s+read:\s*if\s+isSuperAdmin[\s\S]*?testbench\/settings\/access[\s\S]*?allowedFeatures/,
  },

  {
    name: 'Testbench runs create: superadmin + granted teachers',
    description: 'allow create: if isSuperAdmin() || teacher with feature in allowedFeatures',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/runs\/\{runId\}[\s\S]*?allow\s+create:\s*if\s+isSuperAdmin[\s\S]*?testbench\/settings\/access[\s\S]*?allowedFeatures/,
  },

  {
    name: 'Testbench runs update restricted to sessionName field only',
    description: 'allow update with affectedKeys().hasOnly([sessionName]) && sessionName is string',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/runs\/\{runId\}[\s\S]*?allow\s+update[\s\S]*?affectedKeys\(\)\.hasOnly\(\[['"]sessionName['"]\]\)[\s\S]*?sessionName\s+is\s+string/,
  },

  {
    name: 'Testbench runs delete denied',
    description: 'allow delete: if false',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/runs\/\{runId\}[\s\S]*?allow\s+delete:\s*if\s+false/,
  },

  // ============================================================================
  // AI SUMMARIES HISTORY ACCESS CONTROL (Firestore) - Soul/guidelines history, superadmin only
  // PEP-149: Soul + guidelines docs live under ai_summaries; history subcollection for audit trail
  // ============================================================================

  {
    name: 'AI summaries history read restricted to superadmin only',
    description: 'allow read: if isSuperAdmin() on ai_summaries/{summaryId}/history/{historyId}',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/ai_summaries\/\{summaryId\}[\s\S]*?match\s+\/history\/\{historyId\}[\s\S]*?allow\s+read:\s*if\s+isSuperAdmin\s*\(\s*\)/,
  },

  {
    name: 'AI summaries history write restricted to superadmin only',
    description: 'allow create, update, delete: if isSuperAdmin() on ai_summaries/{summaryId}/history/{historyId}',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/ai_summaries\/\{summaryId\}[\s\S]*?match\s+\/history\/\{historyId\}[\s\S]*?allow\s+create,\s*update,\s*delete:\s*if\s+isSuperAdmin\s*\(\s*\)/,
  },

  // ============================================================================
  // INTERVIEW TRANSCRIPTS ACCESS CONTROL (Firestore) - Append-only, CF writes, teacher read
  // ============================================================================

  {
    name: 'Interview transcripts read scoped for admins and teachers',
    description: 'allow read: if isPrivilegedAdmin() || isTeacherInClassroom()',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/interviews\/\{interviewId\}[\s\S]*?allow\s+read:\s*if\s+isPrivilegedAdmin\s*\(\s*\)\s*\|\|\s*isTeacherInClassroom/,
  },

  {
    name: 'Interview transcripts are append-only — no client writes',
    description: 'allow create, update, delete: if false',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/interviews\/\{interviewId\}[\s\S]*?allow\s+create,\s*update,\s*delete:\s*if\s+false/,
  },

  // ============================================================================
  // COLLECTION GROUP RULES (Firestore) - Cross-student queries use student's current classroom
  // ============================================================================

  {
    name: 'Collection group observations: teacher branch uses resource.data.classroomId',
    description: 'Teacher read on collectionGroup observations checks resource.data.classroomId directly (1 get instead of 2)',
    file: 'firestore',
    criticality: 'critical',
    pattern: /match\s+\/\{path=\*\*\}\/observations\/\{observationId\}[\s\S]*?isTeacher\s*\(\s*\)[\s\S]*?\(\s*'classroomId'\s*in\s*resource\.data\s*\)[\s\S]*?isTeacherInClassroom\s*\(\s*resource\.data\.classroomId\s*\)/,
  },

  {
    name: 'Collection group observations: author can read own (PEP-255)',
    description: 'isSignedIn() && resource.data.createdBy == request.auth.uid clause on collectionGroup observations',
    file: 'firestore',
    criticality: 'critical',
    pattern: /match\s+\/\{path=\*\*\}\/observations\/\{observationId\}[\s\S]*?isSignedIn\s*\(\s*\)\s*&&\s*resource\.data\.createdBy\s*==\s*request\.auth\.uid/,
  },

  // ============================================================================
  // ALERTS COLLECTION (Firestore) - Alert bus for Dynamic Island + Alerts page (PEP-296)
  // ============================================================================

  {
    name: 'Alerts collection read restricted to signed-in users',
    description: 'allow read: if isSignedIn() on alerts/{alertId}',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/alerts\/\{alertId\}[\s\S]*?allow\s+read:\s*if\s+isSignedIn\s*\(\s*\)/,
  },

  {
    name: 'Alerts collection create restricted to superadmin',
    description: 'allow create: if isSuperAdmin() on alerts/{alertId}',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/alerts\/\{alertId\}[\s\S]*?allow\s+create:\s*if\s+isSuperAdmin\s*\(\s*\)/,
  },

  {
    name: 'Alerts collection update: superadmin broadcast edit OR dismissedBy-only for others',
    description: 'allow update: if (isSuperAdmin() && type == broadcast) || (isSignedIn() && affectedKeys dismissedBy-only)',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/alerts\/\{alertId\}[\s\S]*?allow\s+update:[\s\S]*?isSuperAdmin[\s\S]*?broadcast[\s\S]*?isSignedIn[\s\S]*?affectedKeys\(\)\.hasOnly\(\['dismissedBy'\]\)/,
  },

  {
    name: 'Alerts collection delete restricted to superadmin',
    description: 'allow delete: if isSuperAdmin() on alerts/{alertId}',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/alerts\/\{alertId\}[\s\S]*?allow\s+delete:\s*if\s+isSuperAdmin\(\)/,
  },

  // ============================================================================
  // STORAGE RULES (Storage) - Media upload/download with strict budget
  // ============================================================================

  {
    name: 'Storage auth gate - isSignedIn check',
    description: 'Storage rules check isSignedIn()',
    file: 'storage',
    criticality: 'critical',
    pattern: /function\s+isSignedIn\s*\(\s*\)\s*\{\s*return\s+request\.auth\s*!=\s*null\s*;\s*\}/,
  },

  {
    name: 'Storage role gate - only known roles',
    description: 'isKnownRole() restricts to teacher, superadmin, classroomadmin',
    file: 'storage',
    criticality: 'critical',
    pattern: /function\s+isKnownRole\s*\(\s*\)[\s\S]*?requesterDoc\s*\(\s*\)\.data\.role\s*in\s*\[\s*['\"]teacher['\"]\s*,\s*['\"]superadmin['\"]\s*,\s*['\"]classroomadmin['\"]\s*\]/,
  },

  {
    name: 'Storage cross-service budget maintained - only 2 firestore.get() calls',
    description: 'firestore.get() only called for requesterDoc and mediaDoc, never studentClassroomId',
    file: 'storage',
    criticality: 'critical',
    pattern: /function\s+requesterDoc\s*\(\s*\)[\s\S]*?firestore\.get[\s\S]*?function\s+mediaDoc\s*\(\s*studentId\s*,\s*mediaId\s*\)[\s\S]*?firestore\.get/,
  },

  {
    name: 'Storage media read requires pending_upload status',
    description: 'allow read checks mediaDoc status == "pending_upload"',
    file: 'storage',
    criticality: 'important',
    pattern: /allow\s+read:[\s\S]*?mediaDoc\s*\(\s*studentId\s*,\s*mediaId\s*\)\.data\.status\s*==\s*['\"]pending_upload['\"]/,
  },

  {
    name: 'Storage media upload restricted to allowed content types',
    description: 'allowedContent() validates webp, pdf, mp4 only',
    file: 'storage',
    criticality: 'important',
    pattern: /function\s+allowedContent\s*\(\s*mediaKind[\s\S]*?mediaKind\s*==\s*['\"]photo['\"]\s*&&[\s\S]*?\.\w+p\$[\s\S]*?mediaKind\s*==\s*['\"]pdf['\"]\s*&&[\s\S]*?\.pdf\$[\s\S]*?mediaKind\s*==\s*['\"]video['\"]\s*&&[\s\S]*?\.mp4\$/,
  },

  {
    name: 'Storage photo upload size limited to 2MB',
    description: 'sizeAllowed() restricts photos to 2 * 1024 * 1024 bytes',
    file: 'storage',
    criticality: 'important',
    pattern: /function\s+sizeAllowed\s*\(\s*mediaKind[\s\S]*?mediaKind\s*==\s*['\"]photo['\"]\s*&&\s*bytes\s*<=\s*2\s*\*\s*1024\s*\*\s*1024/,
  },

  {
    name: 'Storage teacher delete restricted to authors within 48h',
    description: 'teacher can only delete if isAuthor && withinDeleteWindow',
    file: 'storage',
    criticality: 'important',
    pattern: /allow\s+delete:[\s\S]*?requesterDoc\s*\(\s*\)\.data\.role\s*==\s*['\"]teacher['\"]\s*&&[\s\S]*?isAuthor[\s\S]*?withinDeleteWindow/,
  },

  {
    name: 'Storage classroomadmin delete scoped to managed classrooms',
    description: 'classroomadmin can only delete media if manageableClassrooms contains the media classroomId',
    file: 'storage',
    criticality: 'critical',
    pattern: /allow\s+delete:[\s\S]*?role\s*==\s*['\"]classroomadmin['\"]\s*&&[\s\S]*?manageableClassrooms[\s\S]*?hasAny/,
  },

  // ============================================================================
  // BRAIN KNOWLEDGE BASE (Firestore) - Admin-only read, no client writes (#157)
  // ============================================================================

  {
    name: 'Brain collection read restricted to privileged admins',
    description: 'allow read: if isPrivilegedAdmin() on brain/{program} and brain/{program}/files/{fileId}',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/brain\/\{program\}[\s\S]*?allow\s+read:\s*if\s+isPrivilegedAdmin\s*\(\s*\)/,
  },

  {
    name: 'Brain collection write denied for all clients',
    description: 'allow write: if false on brain/{program} and files subcollection',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/brain\/\{program\}[\s\S]*?allow\s+write:\s*if\s+false/,
  },
];
