/**
 * MCP tool definitions and handlers for Pep OS Firestore data.
 * Read-only tools for querying the full Firestore schema.
 */

// --- Helper: convert Firestore Timestamps in an object ---
function serializeTimestamps(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (obj.toDate) return obj.toDate().toISOString();
  if (Array.isArray(obj)) return obj.map(serializeTimestamps);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = serializeTimestamps(v);
  }
  return out;
}

export const TOOL_DEFINITIONS = [
  // ── Students ──
  {
    name: "get_student",
    description:
      "Look up a student by name (case-insensitive partial match) or by student ID. Returns full student profile. When searching by name, only active students are returned by default (set includeInactive to include all).",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Student name to search for (partial/substring match, case-insensitive). Searches displayName, firstName, and lastName.",
        },
        id: {
          type: "string",
          description: "Exact student document ID (e.g., 2025-ALL-001).",
        },
        includeInactive: {
          type: "boolean",
          description:
            "When searching by name, also return inactive/graduated/transferred students (default: false).",
        },
      },
    },
  },
  {
    name: "list_students",
    description:
      "List students in a classroom. Specify either classroomId or classroomName. By default only active students; set includeInactive for all.",
    inputSchema: {
      type: "object",
      properties: {
        classroomId: {
          type: "string",
          description: "Classroom document ID (e.g., allstars, periwinkle).",
        },
        classroomName: {
          type: "string",
          description: "Classroom display name (e.g., All Stars).",
        },
        includeInactive: {
          type: "boolean",
          description: "Include inactive/graduated/transferred students (default: false).",
        },
      },
    },
  },

  // ── Observations ──
  {
    name: "get_observations",
    description:
      "Fetch recent observations for a student. Returns full observation data including coach nudges, ratings, groupId, etc. Ordered by most recent first.",
    inputSchema: {
      type: "object",
      properties: {
        studentId: {
          type: "string",
          description: "Student document ID.",
        },
        days: {
          type: "number",
          description: "Number of days to look back (default: 30).",
        },
        limit: {
          type: "number",
          description: "Max observations to return (default: 100).",
        },
      },
      required: ["studentId"],
    },
  },
  {
    name: "query_observations",
    description:
      "Query observations across all students using collection group queries. Filter by classroomId, createdBy (teacher uid), branchId, and/or date range. Returns observations ordered by most recent first.",
    inputSchema: {
      type: "object",
      properties: {
        classroomId: {
          type: "string",
          description: "Filter by classroom ID.",
        },
        createdBy: {
          type: "string",
          description: "Filter by teacher UID.",
        },
        branchId: {
          type: "string",
          description: "Filter by branch ID (e.g., hsr, whitefield).",
        },
        days: {
          type: "number",
          description: "Number of days to look back (default: 30).",
        },
        limit: {
          type: "number",
          description: "Max observations to return (default: 50).",
        },
      },
    },
  },

  // ── AI Summaries ──
  {
    name: "get_baseball_card",
    description:
      "Fetch the latest AI-generated summary (baseball card) for a student. Includes bullet-point highlights, lesson summary, note count, and coverage info.",
    inputSchema: {
      type: "object",
      properties: {
        studentId: {
          type: "string",
          description: "Student document ID.",
        },
      },
      required: ["studentId"],
    },
  },
  {
    name: "get_ai_summary",
    description:
      "Fetch any AI-generated summary document from a student's ai_summaries subcollection. Known doc IDs: soul, guidelines, open_questions, report_readiness, writing_analysis, weekly_snapshot. Returns all fields.",
    inputSchema: {
      type: "object",
      properties: {
        studentId: {
          type: "string",
          description: "Student document ID.",
        },
        docId: {
          type: "string",
          description:
            "Document ID within ai_summaries (e.g., soul, guidelines, open_questions, report_readiness, writing_analysis, weekly_snapshot).",
        },
      },
      required: ["studentId", "docId"],
    },
  },
  {
    name: "get_ai_summary_history",
    description:
      "Fetch history snapshots for a student's soul, guidelines, or weekly_snapshot document. Returns past versions ordered by most recent first.",
    inputSchema: {
      type: "object",
      properties: {
        studentId: {
          type: "string",
          description: "Student document ID.",
        },
        docId: {
          type: "string",
          description: "Parent doc ID — 'soul', 'guidelines', or 'weekly_snapshot'.",
          enum: ["soul", "guidelines", "weekly_snapshot"],
        },
        limit: {
          type: "number",
          description: "Max snapshots to return (default: 10).",
        },
      },
      required: ["studentId", "docId"],
    },
  },

  // ── Media ──
  {
    name: "list_media",
    description:
      "List media documents for a student (photos, videos, PDFs). Returns individual media docs with metadata, classification, and teacher comments. Ordered by most recent first.",
    inputSchema: {
      type: "object",
      properties: {
        studentId: {
          type: "string",
          description: "Student document ID.",
        },
        mediaKind: {
          type: "string",
          description: "Filter by media kind: photo, video, or pdf.",
          enum: ["photo", "video", "pdf"],
        },
        limit: {
          type: "number",
          description: "Max media docs to return (default: 50).",
        },
      },
      required: ["studentId"],
    },
  },
  {
    name: "get_media_stats",
    description:
      "Aggregate stats across all student media docs. Returns total media count, handwritten count, curriculum area breakdown, per-student counts, and per-classroom counts.",
    inputSchema: {
      type: "object",
      properties: {
        classroomId: {
          type: "string",
          description: "Optional classroom ID to scope stats to.",
        },
      },
    },
  },

  // ── Placements ──
  {
    name: "list_placements",
    description:
      "List placement history for a student (classroom assignments over time). Ordered by startDate descending.",
    inputSchema: {
      type: "object",
      properties: {
        studentId: {
          type: "string",
          description: "Student document ID.",
        },
      },
      required: ["studentId"],
    },
  },

  // ── Interviews ──
  {
    name: "list_interviews",
    description:
      "List interview transcripts for a student. Returns session metadata and exchanges. Ordered by most recent first.",
    inputSchema: {
      type: "object",
      properties: {
        studentId: {
          type: "string",
          description: "Student document ID.",
        },
        days: {
          type: "number",
          description: "Number of days to look back (default: 90).",
        },
        limit: {
          type: "number",
          description: "Max interviews to return (default: 20).",
        },
      },
      required: ["studentId"],
    },
  },

  // ── Chats ──
  {
    name: "list_chats",
    description:
      "List AI chat conversations for a student. Only returns non-deleted chats. Ordered by most recent first.",
    inputSchema: {
      type: "object",
      properties: {
        studentId: {
          type: "string",
          description: "Student document ID.",
        },
        limit: {
          type: "number",
          description: "Max chats to return (default: 20).",
        },
      },
      required: ["studentId"],
    },
  },
  {
    name: "get_chat_messages",
    description:
      "Fetch messages from a specific chat conversation for a student. Returns messages ordered chronologically.",
    inputSchema: {
      type: "object",
      properties: {
        studentId: {
          type: "string",
          description: "Student document ID.",
        },
        chatId: {
          type: "string",
          description: "Chat document ID.",
        },
        limit: {
          type: "number",
          description: "Max messages to return (default: 100).",
        },
      },
      required: ["studentId", "chatId"],
    },
  },

  // ── Classrooms ──
  {
    name: "list_classrooms",
    description:
      "List all active classrooms. Returns name, ID, program, branch, student count, and teacher count.",
    inputSchema: {
      type: "object",
      properties: {
        branchId: {
          type: "string",
          description: "Optional branch filter (e.g., hsr, whitefield).",
        },
      },
    },
  },

  // ── Branches ──
  {
    name: "list_branches",
    description:
      "List all branch documents. Returns branch metadata, classroom lists, and feature flags.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_branch",
    description: "Get a specific branch document by ID.",
    inputSchema: {
      type: "object",
      properties: {
        branchId: {
          type: "string",
          description: "Branch document ID (e.g., hsr, whitefield, varthur, kokapet).",
        },
      },
      required: ["branchId"],
    },
  },

  // ── Programs ──
  {
    name: "list_programs",
    description:
      "List all program documents (toddler, primary, elementary, adolescent) with their classroom mappings.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  // ── Users ──
  {
    name: "get_user",
    description:
      "Look up a user (teacher/admin) by UID, email, or name. Returns profile, role, branch assignments, and manageable classrooms.",
    inputSchema: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          description: "User document ID (Firebase Auth UID).",
        },
        email: {
          type: "string",
          description: "User email (exact match).",
        },
        name: {
          type: "string",
          description: "User display name (case-insensitive partial match).",
        },
      },
    },
  },
  {
    name: "list_users",
    description:
      "List users, optionally filtered by role, branch, or status. Returns profile info.",
    inputSchema: {
      type: "object",
      properties: {
        role: {
          type: "string",
          description: "Filter by role: superadmin, classroomadmin, or teacher.",
          enum: ["superadmin", "classroomadmin", "teacher"],
        },
        branchId: {
          type: "string",
          description: "Filter by branchId (checks branchIds array and homeBranchId).",
        },
        status: {
          type: "string",
          description: "Filter by status (default: active).",
          enum: ["active", "inactive", "suspended"],
        },
      },
    },
  },

  // ── Feedback ──
  {
    name: "list_feedback",
    description:
      "List user feedback entries. Optionally filter by status or category. Ordered by most recent first.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter by status: new, reviewed, implemented, declined.",
          enum: ["new", "reviewed", "implemented", "declined"],
        },
        category: {
          type: "string",
          description: "Filter by category: bug, feature, ui-ux, performance, general.",
          enum: ["bug", "feature", "ui-ux", "performance", "general"],
        },
        limit: {
          type: "number",
          description: "Max entries to return (default: 50).",
        },
      },
    },
  },

  // ── Test Bench ──
  {
    name: "list_testbench_runs",
    description:
      "List prompt test bench runs. Returns run metadata, feature, student, variants, and ratings. Ordered by most recent first.",
    inputSchema: {
      type: "object",
      properties: {
        feature: {
          type: "string",
          description: "Filter by feature (e.g., soul_generation, handwriting_analysis).",
        },
        limit: {
          type: "number",
          description: "Max runs to return (default: 20).",
        },
      },
    },
  },

  // ── Config ──
  {
    name: "get_config",
    description:
      "Fetch a document from the top-level config collection. Returns all fields including AI prompts, model settings, etc.",
    inputSchema: {
      type: "object",
      properties: {
        docId: {
          type: "string",
          description:
            "Document ID in config collection (e.g., baseball_card, report_primary, coach_elementary, text_summarizer, lessonNote, soul_generation, chat_elementary).",
        },
      },
      required: ["docId"],
    },
  },
  {
    name: "list_config",
    description:
      "List all documents in the config collection. Returns document IDs and a preview of top-level field names.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ────────────────────────────────────────────
// Tool Handlers
// ────────────────────────────────────────────

// ── Students ──

export async function handleGetStudent(db, params) {
  const { name, id, includeInactive } = params;

  if (id) {
    const doc = await db.collection("students").doc(id).get();
    if (!doc.exists) return [];
    return [serializeTimestamps({ id: doc.id, ...doc.data() })];
  }

  if (name) {
    const needle = name.toLowerCase();
    let query = db.collection("students");
    if (!includeInactive) {
      query = query.where("isActive", "==", true);
    }
    const snap = await query.get();

    const matches = [];
    snap.forEach((doc) => {
      const d = doc.data();
      const haystack = [d.displayName, d.firstName, d.lastName]
        .filter(Boolean)
        .map((s) => s.toLowerCase());

      if (haystack.some((h) => h.includes(needle))) {
        matches.push(serializeTimestamps({ id: doc.id, ...d }));
      }
    });
    return matches;
  }

  return [];
}

export async function handleListStudents(db, params) {
  let { classroomId, classroomName, includeInactive } = params;

  if (!classroomId && classroomName) {
    const needle = classroomName.toLowerCase();
    const classSnap = await db
      .collection("classrooms")
      .where("status", "==", "active")
      .get();

    classSnap.forEach((doc) => {
      if (doc.data().name?.toLowerCase() === needle) {
        classroomId = doc.id;
      }
    });
    if (!classroomId) return [];
  }

  if (!classroomId) return [];

  let query = db.collection("students").where("classroomId", "==", classroomId);
  if (!includeInactive) {
    query = query.where("isActive", "==", true);
  }
  const snap = await query.get();

  const results = [];
  snap.forEach((doc) => {
    const d = doc.data();
    results.push({
      id: doc.id,
      displayName: d.displayName,
      firstName: d.firstName,
      lastName: d.lastName,
      classroomId: d.classroomId,
      branchId: d.branchId,
      programId: d.programId,
      status: d.status,
      dateOfBirth: d.dateOfBirth?.toDate?.()?.toISOString() ?? d.dateOfBirth ?? null,
    });
  });

  return results;
}

// ── Observations ──

export async function handleGetObservations(db, params) {
  const { studentId, days = 30, limit: maxResults = 100 } = params;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const snap = await db
    .collection("students")
    .doc(studentId)
    .collection("observations")
    .where("observedAt", ">=", cutoff)
    .orderBy("observedAt", "desc")
    .limit(maxResults)
    .get();

  const results = [];
  snap.forEach((doc) => {
    results.push(serializeTimestamps({ id: doc.id, ...doc.data() }));
  });

  return results;
}

export async function handleQueryObservations(db, params) {
  const {
    classroomId,
    createdBy,
    branchId,
    days = 30,
    limit: maxResults = 50,
  } = params;

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  let query = db.collectionGroup("observations").where("observedAt", ">=", cutoff);

  if (classroomId) query = query.where("classroomId", "==", classroomId);
  if (createdBy) query = query.where("createdBy", "==", createdBy);
  if (branchId) query = query.where("branchId", "==", branchId);

  query = query.orderBy("observedAt", "desc").limit(maxResults);

  const snap = await query.get();
  const results = [];
  snap.forEach((doc) => {
    const parentPath = doc.ref.parent.parent?.id;
    results.push(
      serializeTimestamps({ id: doc.id, studentId: parentPath, ...doc.data() })
    );
  });

  return results;
}

// ── AI Summaries ──

export async function handleGetBaseballCard(db, params) {
  const { studentId } = params;

  const doc = await db
    .collection("students")
    .doc(studentId)
    .collection("ai_summaries")
    .doc("weekly_snapshot")
    .get();

  if (!doc.exists) return null;
  return serializeTimestamps({ id: doc.id, ...doc.data() });
}

export async function handleGetAiSummary(db, params) {
  const { studentId, docId } = params;

  const doc = await db
    .collection("students")
    .doc(studentId)
    .collection("ai_summaries")
    .doc(docId)
    .get();

  if (!doc.exists) return null;
  return serializeTimestamps({ id: doc.id, ...doc.data() });
}

export async function handleGetAiSummaryHistory(db, params) {
  const { studentId, docId, limit: maxResults = 10 } = params;

  // weekly_snapshot history uses archivedAt; soul/guidelines use updatedAt
  const orderField = docId === "weekly_snapshot" ? "archivedAt" : "updatedAt";
  const snap = await db
    .collection("students")
    .doc(studentId)
    .collection("ai_summaries")
    .doc(docId)
    .collection("history")
    .orderBy(orderField, "desc")
    .limit(maxResults)
    .get();

  const results = [];
  snap.forEach((doc) => {
    results.push(serializeTimestamps({ id: doc.id, ...doc.data() }));
  });

  return results;
}

// ── Media ──

export async function handleListMedia(db, params) {
  const { studentId, mediaKind, limit: maxResults = 50 } = params;

  let query = db
    .collection("students")
    .doc(studentId)
    .collection("media")
    .orderBy("createdAt", "desc");

  if (mediaKind) {
    query = query.where("mediaKind", "==", mediaKind);
  }

  query = query.limit(maxResults);
  const snap = await query.get();

  const results = [];
  snap.forEach((doc) => {
    results.push(serializeTimestamps({ id: doc.id, ...doc.data() }));
  });

  return results;
}

export async function handleGetMediaStats(db, params) {
  const { classroomId } = params || {};

  let studentQuery = db.collection("students").where("isActive", "==", true);
  if (classroomId) {
    studentQuery = studentQuery.where("classroomId", "==", classroomId);
  }
  const studentSnap = await studentQuery.get();

  let totalMedia = 0;
  let handwrittenCount = 0;
  const curriculumAreas = {};
  const perStudent = [];
  const perClassroom = {};

  for (const studentDoc of studentSnap.docs) {
    const student = studentDoc.data();
    const mediaSnap = await db
      .collection("students")
      .doc(studentDoc.id)
      .collection("media")
      .get();

    let studentTotal = 0;
    let studentHandwritten = 0;
    const studentAreas = {};

    mediaSnap.forEach((doc) => {
      const d = doc.data();
      studentTotal++;
      totalMedia++;

      if (d.handwritten === true) {
        handwrittenCount++;
        studentHandwritten++;
      }

      const area = d.curriculumArea || "unclassified";
      curriculumAreas[area] = (curriculumAreas[area] || 0) + 1;
      studentAreas[area] = (studentAreas[area] || 0) + 1;
    });

    if (studentTotal > 0) {
      perStudent.push({
        id: studentDoc.id,
        displayName: student.displayName,
        classroomId: student.classroomId,
        totalMedia: studentTotal,
        handwritten: studentHandwritten,
        curriculumAreas: studentAreas,
      });
    }

    const cId = student.classroomId || "unknown";
    if (!perClassroom[cId]) {
      perClassroom[cId] = { totalMedia: 0, handwritten: 0 };
    }
    perClassroom[cId].totalMedia += studentTotal;
    perClassroom[cId].handwritten += studentHandwritten;
  }

  perStudent.sort((a, b) => b.totalMedia - a.totalMedia);

  return {
    totalMedia,
    handwrittenCount,
    notHandwritten: totalMedia - handwrittenCount,
    handwrittenPercent:
      totalMedia > 0
        ? Math.round((handwrittenCount / totalMedia) * 100 * 10) / 10
        : 0,
    curriculumAreas,
    perClassroom,
    perStudent,
    studentsWithMedia: perStudent.length,
    studentsScanned: studentSnap.size,
  };
}

// ── Placements ──

export async function handleListPlacements(db, params) {
  const { studentId } = params;

  const snap = await db
    .collection("students")
    .doc(studentId)
    .collection("placements")
    .orderBy("startDate", "desc")
    .get();

  const results = [];
  snap.forEach((doc) => {
    results.push(serializeTimestamps({ id: doc.id, ...doc.data() }));
  });

  return results;
}

// ── Interviews ──

export async function handleListInterviews(db, params) {
  const { studentId, days = 90, limit: maxResults = 20 } = params;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const snap = await db
    .collection("students")
    .doc(studentId)
    .collection("interviews")
    .where("conductedAt", ">=", cutoff)
    .orderBy("conductedAt", "desc")
    .limit(maxResults)
    .get();

  const results = [];
  snap.forEach((doc) => {
    results.push(serializeTimestamps({ id: doc.id, ...doc.data() }));
  });

  return results;
}

// ── Chats ──

export async function handleListChats(db, params) {
  const { studentId, limit: maxResults = 20 } = params;

  const snap = await db
    .collection("students")
    .doc(studentId)
    .collection("chats")
    .where("deleted", "==", false)
    .orderBy("createdAt", "desc")
    .limit(maxResults)
    .get();

  const results = [];
  snap.forEach((doc) => {
    results.push(serializeTimestamps({ id: doc.id, ...doc.data() }));
  });

  return results;
}

export async function handleGetChatMessages(db, params) {
  const { studentId, chatId, limit: maxResults = 100 } = params;

  const snap = await db
    .collection("students")
    .doc(studentId)
    .collection("chats")
    .doc(chatId)
    .collection("messages")
    .orderBy("timestamp", "asc")
    .limit(maxResults)
    .get();

  const results = [];
  snap.forEach((doc) => {
    results.push(serializeTimestamps({ id: doc.id, ...doc.data() }));
  });

  return results;
}

// ── Classrooms ──

export async function handleListClassrooms(db, params) {
  const { branchId } = params || {};

  let query = db.collection("classrooms").where("status", "==", "active");
  if (branchId) {
    query = query.where("branchId", "==", branchId);
  }

  const snap = await query.get();

  const results = [];
  snap.forEach((doc) => {
    const d = doc.data();
    results.push({
      id: doc.id,
      name: d.name,
      programId: d.programId,
      branchId: d.branchId,
      studentCount: d.studentCount || 0,
      teacherCount: Array.isArray(d.teacherIds) ? d.teacherIds.length : 0,
      teacherIds: d.teacherIds || [],
      driveFolderId: d.driveFolderId || null,
    });
  });

  return results;
}

// ── Branches ──

export async function handleListBranches(db) {
  const snap = await db.collection("branches").get();

  const results = [];
  snap.forEach((doc) => {
    results.push(serializeTimestamps({ id: doc.id, ...doc.data() }));
  });

  return results;
}

export async function handleGetBranch(db, params) {
  const { branchId } = params;
  const doc = await db.collection("branches").doc(branchId).get();
  if (!doc.exists) return null;
  return serializeTimestamps({ id: doc.id, ...doc.data() });
}

// ── Programs ──

export async function handleListPrograms(db) {
  const snap = await db.collection("programs").get();

  const results = [];
  snap.forEach((doc) => {
    results.push(serializeTimestamps({ id: doc.id, ...doc.data() }));
  });

  return results;
}

// ── Users ──

export async function handleGetUser(db, params) {
  const { uid, email, name } = params;

  if (uid) {
    const doc = await db.collection("users").doc(uid).get();
    if (!doc.exists) return [];
    return [serializeTimestamps({ id: doc.id, ...doc.data() })];
  }

  if (email) {
    const snap = await db
      .collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();
    if (snap.empty) return [];
    const doc = snap.docs[0];
    return [serializeTimestamps({ id: doc.id, ...doc.data() })];
  }

  if (name) {
    const needle = name.toLowerCase();
    const snap = await db.collection("users").get();
    const matches = [];
    snap.forEach((doc) => {
      const d = doc.data();
      if (d.displayName?.toLowerCase().includes(needle)) {
        matches.push(serializeTimestamps({ id: doc.id, ...d }));
      }
    });
    return matches;
  }

  return [];
}

export async function handleListUsers(db, params) {
  const { role, branchId, status = "active" } = params || {};

  let query = db.collection("users").where("status", "==", status);
  if (role) {
    query = query.where("role", "==", role);
  }

  const snap = await query.get();

  const results = [];
  snap.forEach((doc) => {
    const d = doc.data();

    // Client-side branch filter (branchIds is an array, can't compound-query with status+role)
    if (branchId) {
      const userBranches = d.branchIds || [];
      const home = d.homeBranchId;
      if (!userBranches.includes(branchId) && home !== branchId) return;
    }

    results.push({
      id: doc.id,
      displayName: d.displayName,
      email: d.email,
      role: d.role,
      status: d.status,
      branchIds: d.branchIds || [],
      homeBranchId: d.homeBranchId || null,
      manageableClassrooms: d.manageableClassrooms || [],
      isPending: d.isPending || false,
      createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
      lastLoginAt: d.lastLoginAt?.toDate?.()?.toISOString() ?? null,
    });
  });

  return results;
}

// ── Feedback ──

export async function handleListFeedback(db, params) {
  const { status, category, limit: maxResults = 50 } = params || {};

  let query = db.collection("feedback");

  if (status) {
    query = query.where("status", "==", status);
  }
  if (category) {
    query = query.where("category", "==", category);
  }

  query = query.orderBy("timestamp", "desc").limit(maxResults);
  const snap = await query.get();

  const results = [];
  snap.forEach((doc) => {
    results.push(serializeTimestamps({ id: doc.id, ...doc.data() }));
  });

  return results;
}

// ── Test Bench ──

export async function handleListTestbenchRuns(db, params) {
  const { feature, limit: maxResults = 20 } = params || {};

  let query = db.collection("testbench/settings/runs");

  if (feature) {
    query = query.where("feature", "==", feature);
  }

  query = query.orderBy("timestamp", "desc").limit(maxResults);
  const snap = await query.get();

  const results = [];
  snap.forEach((doc) => {
    results.push(serializeTimestamps({ id: doc.id, ...doc.data() }));
  });

  return results;
}

// ── Config ──

export async function handleGetConfig(db, params) {
  const { docId } = params;
  if (!docId) return null;

  const doc = await db.collection("config").doc(docId).get();
  if (!doc.exists) return null;
  return serializeTimestamps({ id: doc.id, ...doc.data() });
}

export async function handleListConfig(db) {
  const snap = await db.collection("config").get();

  const results = [];
  snap.forEach((doc) => {
    const d = doc.data();
    results.push({
      id: doc.id,
      fields: Object.keys(d),
    });
  });

  return results;
}
