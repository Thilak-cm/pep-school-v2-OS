/**
 * Create a new classroom end-to-end, touching every Firestore touchpoint:
 *
 *   1. classrooms/{classroomId}          — new classroom doc (full schema)
 *   2. branches/{branchId}.classrooms[]  — arrayUnion classroom id
 *   3. programs/{programId}.classrooms[] — arrayUnion "classrooms/{id}" path
 *   4. Seed users (at least one, role-based):
 *        teacher        → added to classroom teacherIds (+ branchIds on user doc)
 *        classroomadmin → classroom added to their manageableClassrooms (+ branchIds)
 *        superadmin     → no wiring needed (global access)
 *
 * All writes go in a single atomic batch.
 *
 * Two modes:
 *
 * INTERACTIVE (for humans) — run with no flags; prompts for everything:
 *   node scripts/admin/create-classroom.mjs
 *
 * FLAG MODE (for agents / automation) — no prompts, fails fast with actionable
 * errors on missing or ambiguous input:
 *   node scripts/admin/create-classroom.mjs \
 *     --name "Phoenix" --branch varthur --program elementary \
 *     --user ajay@ribbons.education --dry-run
 *
 *   --name     Classroom display name (doc ID auto-derived as slug)
 *   --branch   Branch doc ID (e.g. varthur)
 *   --program  One of: toddler | primary | elementary | adolescent
 *   --user     Name or email of a seed user; must match exactly one active
 *              teacher or classroomadmin. Repeatable for multiple users.
 *   --dry-run  Print the write plan and exit without writing.
 *   --yes      Actually apply the writes (required in flag mode to write).
 */
import admin from "firebase-admin";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { stdin, stdout } from "node:process";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();
const { FieldValue } = admin.firestore;

const VALID_PROGRAMS = ["toddler", "primary", "elementary", "adolescent"];

// Same palette as seed-classroom-colors.mjs — earthy/warm tones for home page cards
const COLOR_PALETTE = [
  "#5C6BC0", "#26A69A", "#AB47BC", "#42A5F5", "#66BB6A", "#EF5350",
  "#FFA726", "#E91E63", "#78909C", "#EC407A", "#8D6E63", "#CE93D8",
  "#26C6DA", "#FFCA28", "#7E57C2", "#FF7043", "#9CCC65", "#29B6F6",
  "#0097A7", "#7CB342", "#F06292", "#4DB6AC", "#9575CD", "#FFB74D",
];

const { values: flags } = parseArgs({
  options: {
    "name": { type: "string" },
    "branch": { type: "string" },
    "program": { type: "string" },
    "user": { type: "string", multiple: true },
    "yes": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const flagMode =
  flags.name !== undefined ||
  flags.branch !== undefined ||
  flags.program !== undefined ||
  (flags.user && flags.user.length > 0) ||
  flags["dry-run"] ||
  flags.yes;

const rl = flagMode ? null : readline.createInterface({ input: stdin, output: stdout });

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function ask(question, { defaultValue } = {}) {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue || "";
}

async function askYesNo(question, { defaultYes = false } = {}) {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = (await rl.question(`${question} (${hint}): `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

async function pickFromList(question, items, renderItem) {
  if (items.length === 1) {
    console.log(`  ${renderItem(items[0])}`);
    return (await askYesNo(`${question} — use this?`, { defaultYes: true })) ? items[0] : null;
  }
  items.forEach((item, i) => console.log(`  ${i + 1}. ${renderItem(item)}`));
  while (true) {
    const answer = (await rl.question(`${question} (1-${items.length}, or q to cancel): `)).trim();
    if (answer.toLowerCase() === "q") return null;
    const idx = Number(answer) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < items.length) return items[idx];
    console.log("  Invalid choice, try again.");
  }
}

function pickColor(existingColors) {
  const used = new Set(existingColors.filter(Boolean).map((c) => c.toUpperCase()));
  const unused = COLOR_PALETTE.find((c) => !used.has(c.toUpperCase()));
  if (unused) return unused;
  // Palette exhausted — generate a random mid-tone hex
  const channel = () => (64 + Math.floor(Math.random() * 128)).toString(16).padStart(2, "0");
  return `#${channel()}${channel()}${channel()}`.toUpperCase();
}

function searchUsers(users, query, excludeUids = new Set()) {
  const q = query.toLowerCase();
  return users.filter(
    (u) =>
      !excludeUids.has(u.uid) &&
      ((u.displayName || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q))
  );
}

function renderUser(u) {
  return `${u.displayName || "(no name)"} <${u.email || "no email"}> — role: ${u.role}`;
}

// --- Input resolution: flag mode (non-interactive, fail fast) ---
function resolveFromFlags(state) {
  const { existingClassroomIds, branches, users } = state;

  if (!flags.name) fail("--name is required in flag mode.");
  const classroomName = flags.name.trim();
  const classroomId = slugify(classroomName);
  if (!classroomId) fail(`Could not derive a valid doc ID from name "${flags.name}".`);
  if (existingClassroomIds.has(classroomId)) {
    fail(`Classroom "${classroomId}" already exists. Pick a different name.`);
  }

  const branchIds = branches.map((b) => b.id);
  if (!flags.branch) fail(`--branch is required. Valid branches: ${branchIds.join(", ")}`);
  const branch = branches.find((b) => b.id === flags.branch.trim().toLowerCase());
  if (!branch) fail(`Unknown branch "${flags.branch}". Valid branches: ${branchIds.join(", ")}`);

  if (!flags.program) fail(`--program is required. Valid programs: ${VALID_PROGRAMS.join(", ")}`);
  const programId = flags.program.trim().toLowerCase();
  if (!VALID_PROGRAMS.includes(programId)) {
    fail(`Unknown program "${flags.program}". Valid programs: ${VALID_PROGRAMS.join(", ")}`);
  }

  const userQueries = flags.user || [];
  if (userQueries.length === 0) {
    fail("At least one --user is required (name or email of a teacher or classroomadmin).");
  }

  const seedTeachers = [];
  const seedAdmins = [];
  const pickedUids = new Set();
  for (const query of userQueries) {
    const matches = searchUsers(users, query, pickedUids);
    if (matches.length === 0) {
      fail(`--user "${query}" matched no active users.`);
    }
    if (matches.length > 1) {
      fail(
        `--user "${query}" is ambiguous (${matches.length} matches). Be more specific (use email):\n` +
        matches.slice(0, 10).map((u) => `  - ${renderUser(u)}`).join("\n")
      );
    }
    const user = matches[0];
    if (user.role === "teacher") {
      seedTeachers.push(user);
    } else if (user.role === "classroomadmin") {
      seedAdmins.push(user);
    } else {
      fail(
        `--user "${query}" matched ${renderUser(user)} — only teachers and classroomadmins ` +
        "can seed a classroom (superadmins already have global access)."
      );
    }
    pickedUids.add(user.uid);
  }

  return { classroomName, classroomId, branch, programId, seedTeachers, seedAdmins };
}

// --- Input resolution: interactive mode ---
async function resolveInteractively(state) {
  const { existingClassroomIds, branches, users } = state;

  let classroomName;
  let classroomId;
  while (true) {
    classroomName = await ask("Classroom display name");
    if (!classroomName) {
      console.log("  Name is required.");
      continue;
    }
    classroomId = slugify(classroomName);
    if (!classroomId) {
      console.log("  Could not derive a valid ID from that name, try again.");
      continue;
    }
    if (existingClassroomIds.has(classroomId)) {
      console.log(`  A classroom with ID "${classroomId}" already exists. Pick another name.`);
      continue;
    }
    break;
  }

  console.log("\nExisting branches:");
  const branch = await pickFromList(
    "Which branch does this classroom belong to?",
    branches,
    (b) => `${b.id}${b.name ? ` (${b.name})` : ""} — classrooms: [${(b.classrooms || []).join(", ")}]`
  );
  if (!branch) return null;

  console.log("\nPrograms:");
  const programId = await pickFromList(
    "Which program is this classroom?",
    VALID_PROGRAMS,
    (p) => p
  );
  if (!programId) return null;

  const seedTeachers = [];
  const seedAdmins = [];
  const pickedUids = new Set();

  console.log("\nSeed the classroom with at least one user (teacher or classroom admin).");

  while (true) {
    const query = await ask("\nSearch user by name or email (substring)");
    if (!query) {
      console.log("  Enter a search term.");
      continue;
    }
    const matches = searchUsers(users, query, pickedUids);
    if (matches.length === 0) {
      console.log("  No matching active users found.");
      continue;
    }

    console.log("");
    const user = await pickFromList("Select user", matches.slice(0, 15), renderUser);
    if (!user) continue;

    if (user.role === "teacher") {
      seedTeachers.push(user);
      pickedUids.add(user.uid);
      console.log(`  Added ${user.displayName} as teacher.`);
    } else if (user.role === "classroomadmin") {
      seedAdmins.push(user);
      pickedUids.add(user.uid);
      console.log(`  Added ${user.displayName} as classroom admin.`);
    } else if (user.role === "superadmin") {
      console.log(`  ${user.displayName} is a superadmin — already has access, nothing to wire. Pick a teacher or classroom admin.`);
    } else {
      console.log(`  Unknown role "${user.role}" — skipping.`);
    }

    const total = seedTeachers.length + seedAdmins.length;
    if (total > 0 && !(await askYesNo("Add another user?"))) break;
  }

  return { classroomName, classroomId, branch, programId, seedTeachers, seedAdmins };
}

function printWritePlan(plan, color) {
  const { classroomName, classroomId, branch, programId, seedTeachers, seedAdmins } = plan;
  console.log("\n=== WRITE PLAN ===\n");
  console.log(`CREATE classrooms/${classroomId}`);
  console.log(`    name:          "${classroomName}"`);
  console.log(`    programId:     "${programId}"`);
  console.log(`    branchId:      "${branch.id}"`);
  console.log(`    status:        "active"`);
  console.log(`    teacherIds:    [${seedTeachers.map((t) => t.uid).join(", ")}]`);
  console.log(`    teacherCount:  ${seedTeachers.length}`);
  console.log(`    studentCount:  0`);
  console.log(`    color:         ${color}`);
  console.log(`    driveFolderId: null`);
  console.log(`UPDATE branches/${branch.id}`);
  console.log(`    classrooms: arrayUnion("${classroomId}")`);
  console.log(`UPDATE programs/${programId}`);
  console.log(`    classrooms: arrayUnion("classrooms/${classroomId}")`);
  for (const t of seedTeachers) {
    console.log(`UPDATE users/${t.uid} (${t.displayName}, teacher)`);
    console.log(`    branchIds: arrayUnion("${branch.id}")`);
  }
  for (const a of seedAdmins) {
    console.log(`UPDATE users/${a.uid} (${a.displayName}, classroomadmin)`);
    console.log(`    manageableClassrooms: arrayUnion("${classroomId}")`);
    console.log(`    branchIds: arrayUnion("${branch.id}")`);
  }
  console.log("");
}

async function commitWrites(plan, color) {
  const { classroomName, classroomId, branch, programId, seedTeachers, seedAdmins } = plan;
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();

  batch.set(db.collection("classrooms").doc(classroomId), {
    name: classroomName,
    programId,
    branchId: branch.id,
    status: "active",
    teacherIds: seedTeachers.map((t) => t.uid),
    teacherCount: seedTeachers.length,
    studentCount: 0,
    deletedStudentCount: 0,
    driveFolderId: null,
    color,
    createdAt: now,
    updatedAt: now,
    createdBy: "create-classroom-script",
  });

  batch.update(db.collection("branches").doc(branch.id), {
    classrooms: FieldValue.arrayUnion(classroomId),
    updatedAt: now,
  });

  batch.update(db.collection("programs").doc(programId), {
    classrooms: FieldValue.arrayUnion(`classrooms/${classroomId}`),
    updatedAt: now,
  });

  for (const t of seedTeachers) {
    batch.update(db.collection("users").doc(t.uid), {
      branchIds: FieldValue.arrayUnion(branch.id),
      updatedAt: now,
    });
  }

  for (const a of seedAdmins) {
    batch.update(db.collection("users").doc(a.uid), {
      manageableClassrooms: FieldValue.arrayUnion(classroomId),
      branchIds: FieldValue.arrayUnion(branch.id),
      updatedAt: now,
    });
  }

  await batch.commit();

  console.log(`SUCCESS: Classroom "${classroomName}" (${classroomId}) created in ${branch.id} / ${programId}.`);
  console.log("\nReminders:");
  console.log("  - Stats cache: trigger recomputeStats (Stats page in the app, or wait for the");
  console.log(`    scheduled run) so statsCache/classroom_${classroomId} gets created.`);
  console.log("  - Drive folder: driveFolderId is set automatically on first report export.");
}

async function main() {
  console.log("=== Create Classroom ===\n");
  console.log("Loading current Firestore state...");

  const [classroomsSnap, branchesSnap, programsSnap, usersSnap] = await Promise.all([
    db.collection("classrooms").get(),
    db.collection("branches").get(),
    db.collection("programs").get(),
    db.collection("users").get(),
  ]);

  const state = {
    existingClassroomIds: new Set(classroomsSnap.docs.map((d) => d.id)),
    existingColors: classroomsSnap.docs.map((d) => d.data().color),
    branches: branchesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    programIds: new Set(programsSnap.docs.map((d) => d.id)),
    users: usersSnap.docs
      .map((d) => ({ uid: d.id, ...d.data() }))
      .filter((u) => u.status !== "inactive" && u.status !== "suspended"),
  };

  console.log(
    `Loaded ${state.existingClassroomIds.size} classrooms, ${state.branches.length} branches, ` +
    `${state.programIds.size} programs, ${state.users.length} active users.\n`
  );

  const plan = flagMode ? resolveFromFlags(state) : await resolveInteractively(state);
  if (!plan) {
    console.log("Cancelled.");
    return;
  }

  if (!state.programIds.has(plan.programId)) {
    // Should never happen (all 4 program docs exist), but fail loudly rather than
    // silently creating a program doc with an unexpected shape.
    fail(`programs/${plan.programId} doc does not exist in Firestore. Aborting.`);
  }

  const color = pickColor(state.existingColors);
  printWritePlan(plan, color);

  if (flagMode) {
    if (flags["dry-run"]) {
      console.log("DRY RUN: no writes performed. Re-run with --yes to apply.");
      return;
    }
    if (!flags.yes) {
      fail("Refusing to write without confirmation. Pass --yes to apply, or --dry-run to preview.");
    }
  } else if (!(await askYesNo("Apply these writes to Firestore?"))) {
    console.log("Aborted — nothing written.");
    return;
  }

  await commitWrites(plan, color);
}

main()
  .catch((err) => {
    console.error("\nFATAL:", err);
    process.exitCode = 1;
  })
  .finally(() => rl?.close());
