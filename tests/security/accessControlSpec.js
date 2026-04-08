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
  // STUDENTS ACCESS CONTROL (Firestore) - Teachers can only read, admins can manage
  // ============================================================================

  {
    name: 'Students collection read restricted to privileged admins or teachers',
    description: 'allow read: if isPrivilegedAdmin() || isTeacher()',
    file: 'firestore',
    criticality: 'critical',
    pattern: /match\s+\/students\/\{studentId\}[\s\S]*?allow\s+read:\s*if\s+isPrivilegedAdmin\s*\(\s*\)\s*\|\|\s*isTeacher\s*\(\s*\)/,
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
    name: 'Observations read allowed for admins and teachers',
    description: 'allow read: if adminCanAccessObservation() || isTeacher()',
    file: 'firestore',
    criticality: 'critical',
    pattern: /match\s+\/observations\/\{observationId\}[\s\S]*?allow\s+read:\s*if\s+adminCanAccessObservation\s*\(\s*\)\s*\|\|\s*isTeacher\s*\(\s*\)/,
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

  {
    name: 'AI Prompts write restricted to superadmin only',
    description: 'allow create, update, delete: if isSuperAdmin()',
    file: 'firestore',
    criticality: 'critical',
    pattern: /match\s+\/ai_prompts\/\{docId\}[\s\S]*?allow\s+create,\s*update,\s*delete:\s*if\s+isSuperAdmin\s*\(\s*\)/,
  },

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
  // STUDENT PROFILE ACCESS CONTROL (Firestore) - AI-only writes, superadmin read only
  // ============================================================================

  {
    name: 'Student profile read restricted to superadmin only',
    description: 'allow read: if isSuperAdmin()',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/profile\/\{dimensionId\}[\s\S]*?allow\s+read:\s*if\s+isSuperAdmin\s*\(\s*\)/,
  },

  {
    name: 'Student profile write restricted to superadmin only (Cloud Functions use admin SDK)',
    description: 'allow create, update, delete: if isSuperAdmin()',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/profile\/\{dimensionId\}[\s\S]*?allow\s+create,\s*update,\s*delete:\s*if\s+isSuperAdmin\s*\(\s*\)/,
  },

  {
    name: 'Student profile history read restricted to superadmin only',
    description: 'allow read: if isSuperAdmin()',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/profile\/\{dimensionId\}[\s\S]*?match\s+\/history\/\{historyId\}[\s\S]*?allow\s+read:\s*if\s+isSuperAdmin\s*\(\s*\)/,
  },

  {
    name: 'Student profile history write restricted to superadmin only',
    description: 'allow create, update, delete: if isSuperAdmin()',
    file: 'firestore',
    criticality: 'important',
    pattern: /match\s+\/profile\/\{dimensionId\}[\s\S]*?match\s+\/history\/\{historyId\}[\s\S]*?allow\s+create,\s*update,\s*delete:\s*if\s+isSuperAdmin\s*\(\s*\)/,
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
    pattern: /function\s+sizeAllowed\s*\(\s*mediaKind[\s\S]*?mediaKind\s*!=\s*['\"]photo['\"]\s*\|\|\s*bytes\s*<=\s*2\s*\*\s*1024\s*\*\s*1024/,
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
];
