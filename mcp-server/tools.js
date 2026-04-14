/**
 * MCP tool definitions and handlers for Pep OS Firestore data.
 * Read-only tools for querying students, observations, baseball cards, and classrooms.
 */

export const TOOL_DEFINITIONS = [
  {
    name: "get_student",
    description:
      "Look up a student by name (case-insensitive partial match) or by student ID. Returns student profile fields. When searching by name, only active students are returned. When looking up by ID, any student is returned regardless of status — useful for checking graduated or archived students.",
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
      },
    },
  },
  {
    name: "get_observations",
    description:
      "Fetch recent observations for a student. Returns observation text, type, date, and author. Ordered by most recent first.",
    inputSchema: {
      type: "object",
      properties: {
        studentId: {
          type: "string",
          description: "Student document ID.",
        },
        days: {
          type: "number",
          description:
            "Number of days to look back (default: 30). Observations older than this are excluded.",
        },
      },
      required: ["studentId"],
    },
  },
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
    name: "list_students",
    description:
      "List all active students in a classroom. Specify either classroomId (document ID) or classroomName (display name).",
    inputSchema: {
      type: "object",
      properties: {
        classroomId: {
          type: "string",
          description: "Classroom document ID (e.g., allstars, periwinkle).",
        },
        classroomName: {
          type: "string",
          description:
            "Classroom display name (e.g., All Stars). Used to look up the classroomId.",
        },
      },
    },
  },
  {
    name: "list_classrooms",
    description:
      "List all active classrooms. Returns name, ID, program, branch, student count, and teacher count.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_ai_prompt",
    description:
      "Fetch an AI prompt document from the ai_prompts collection. Returns all fields including systemPrompt, userPrompt, version, etc.",
    inputSchema: {
      type: "object",
      properties: {
        docId: {
          type: "string",
          description:
            "Document ID in ai_prompts collection (e.g., text_summarizer, report_adolescent, baseball_card, coach_primary, chat_elementary).",
        },
      },
      required: ["docId"],
    },
  },
  {
    name: "list_ai_prompts",
    description:
      "List all documents in the ai_prompts collection. Returns document IDs and key metadata fields (title, description, version, updatedAt) without full prompt content.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_config",
    description:
      "Fetch a document from the top-level config collection. Returns all fields. Use for operational config docs like baseball_card_config, report_generation, etc.",
    inputSchema: {
      type: "object",
      properties: {
        docId: {
          type: "string",
          description:
            "Document ID in config collection (e.g., baseball_card_config, report_generation).",
        },
      },
      required: ["docId"],
    },
  },
  {
    name: "list_config",
    description:
      "List all documents in the top-level config collection. Returns document IDs and a preview of top-level field names for each doc.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// --- Tool Handlers ---

export async function handleGetStudent(db, params) {
  const { name, id } = params;

  if (id) {
    const doc = await db.collection("students").doc(id).get();
    if (!doc.exists) return [];
    const d = doc.data();
    return [
      {
        id: doc.id,
        displayName: d.displayName,
        firstName: d.firstName,
        lastName: d.lastName,
        classroomId: d.classroomId,
        programId: d.programId,
        dateOfBirth: d.dateOfBirth?.toDate?.() ?? d.dateOfBirth ?? null,
        status: d.status,
      },
    ];
  }

  if (name) {
    const needle = name.toLowerCase();
    const snap = await db
      .collection("students")
      .where("isActive", "==", true)
      .get();

    const matches = [];
    snap.forEach((doc) => {
      const d = doc.data();
      const haystack = [d.displayName, d.firstName, d.lastName]
        .filter(Boolean)
        .map((s) => s.toLowerCase());

      if (haystack.some((h) => h.includes(needle))) {
        matches.push({
          id: doc.id,
          displayName: d.displayName,
          firstName: d.firstName,
          lastName: d.lastName,
          classroomId: d.classroomId,
          programId: d.programId,
          dateOfBirth: d.dateOfBirth?.toDate?.() ?? d.dateOfBirth ?? null,
          status: d.status,
        });
      }
    });

    return matches;
  }

  return [];
}

export async function handleGetObservations(db, params) {
  const { studentId, days = 30 } = params;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const snap = await db
    .collection("students")
    .doc(studentId)
    .collection("observations")
    .where("observedAt", ">=", cutoff)
    .orderBy("observedAt", "desc")
    .limit(100)
    .get();

  const results = [];
  snap.forEach((doc) => {
    const d = doc.data();
    const observedAt = d.observedAt?.toDate?.() ?? d.observedAt;
    results.push({
      id: doc.id,
      text: d.text || d.lessonTitle || null,
      type: d.type,
      observedAt: observedAt
        ? observedAt.toISOString()
        : null,
      createdByName: d.createdByName || null,
      classroomId: d.classroomId,
      lessonTitle: d.lessonTitle || null,
      lessonDescription: d.lessonDescription || null,
      ratings: d.ratings || null,
      starScore: d.starScore || null,
    });
  });

  return results;
}

export async function handleGetBaseballCard(db, params) {
  const { studentId } = params;

  const doc = await db
    .collection("students")
    .doc(studentId)
    .collection("ai_summaries")
    .doc("baseball_card")
    .get();

  if (!doc.exists) return null;

  const d = doc.data();
  return {
    bullets: d.bullets || [],
    lessonSummary: d.lessonSummary || null,
    noteCount: d.noteCount || 0,
    windowDays: d.windowDays || null,
    generatedAt: d.generatedAt?.toDate?.()?.toISOString() ?? null,
    status: d.status || null,
    sourceNoteIds: d.sourceNoteIds || null,
  };
}

export async function handleListStudents(db, params) {
  let { classroomId, classroomName } = params;

  // Resolve classroomName → classroomId
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

  const snap = await db
    .collection("students")
    .where("classroomId", "==", classroomId)
    .where("isActive", "==", true)
    .get();

  const results = [];
  snap.forEach((doc) => {
    const d = doc.data();
    results.push({
      id: doc.id,
      displayName: d.displayName,
      classroomId: d.classroomId,
      programId: d.programId,
    });
  });

  return results;
}

export async function handleGetAiPrompt(db, params) {
  const { docId } = params;
  if (!docId) return null;

  const doc = await db.collection("ai_prompts").doc(docId).get();
  if (!doc.exists) return null;

  const d = doc.data();
  const result = { id: doc.id };
  for (const [key, value] of Object.entries(d)) {
    if (value?.toDate) {
      result[key] = value.toDate().toISOString();
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function handleListAiPrompts(db) {
  const snap = await db.collection("ai_prompts").get();

  const results = [];
  snap.forEach((doc) => {
    const d = doc.data();
    results.push({
      id: doc.id,
      title: d.title || null,
      description: d.description || null,
      version: d.version || null,
      updatedAt: d.updatedAt?.toDate?.()?.toISOString() ?? null,
    });
  });

  return results;
}

export async function handleGetConfig(db, params) {
  const { docId } = params;
  if (!docId) return null;

  const doc = await db.collection("config").doc(docId).get();
  if (!doc.exists) return null;

  const d = doc.data();
  const result = { id: doc.id };
  for (const [key, value] of Object.entries(d)) {
    if (value?.toDate) {
      result[key] = value.toDate().toISOString();
    } else {
      result[key] = value;
    }
  }
  return result;
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

export async function handleListClassrooms(db) {
  const snap = await db
    .collection("classrooms")
    .where("status", "==", "active")
    .get();

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
    });
  });

  return results;
}
