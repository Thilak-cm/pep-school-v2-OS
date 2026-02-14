#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../../");
const appRoot = path.join(repoRoot, "montessori-os");
const srcRoot = path.join(appRoot, "src");
const componentsRoot = path.join(srcRoot, "components");
const defaultOutputPath = path.join(
  repoRoot,
  ".claude/skills/codebase-context-scan/references/pep-os-overview.md",
);
const deepDiveRoot = path.join(
  repoRoot,
  ".claude/skills/codebase-context-deep-dive/references/deep-dives",
);

const AREA_DEFINITIONS = [
  {
    tag: "observation-capture",
    name: "Observation Capture",
    intent:
      "Teachers capture text, voice, lesson, and media observations with low-friction mobile flows.",
    keyPaths: [
      "montessori-os/src/components/AddNoteFab.jsx",
      "montessori-os/src/components/AddNoteModal.jsx",
      "montessori-os/src/components/LessonNotesPage.jsx",
      "montessori-os/src/components/LessonNotes.jsx",
      "montessori-os/src/VoiceRecorder.jsx",
      "montessori-os/src/components/MentionTextArea.jsx",
      "montessori-os/src/components/ClassroomStudentPicker.jsx",
    ],
    matchers: [
      /AddNote/i,
      /LessonNote/i,
      /Mention/i,
      /VoiceRecorder/i,
      /ClassroomStudentPicker/i,
      /NoteExpansionDialog/i,
    ],
  },
  {
    tag: "timelines-and-media",
    name: "Timelines and Media",
    intent:
      "Student and classroom timelines surface text/voice/lesson/media events with filtering and expansion flows.",
    keyPaths: [
      "montessori-os/src/components/StudentTimeline.jsx",
      "montessori-os/src/components/ClassroomTimeline.jsx",
      "montessori-os/src/components/FilterPanel.jsx",
      "montessori-os/src/components/StudentDashboard.jsx",
      "montessori-os/src/components/StudentStatsPage.jsx",
    ],
    matchers: [
      /Timeline/i,
      /FilterPanel/i,
      /StudentDashboard/i,
      /StudentStats/i,
      /StudentList/i,
      /ClassroomList/i,
      /ExportWizard/i,
    ],
  },
  {
    tag: "analytics-and-notifications",
    name: "Analytics and Notifications",
    intent:
      "Stats, performance cards, and escalation notifications highlight behavior/engagement patterns.",
    keyPaths: [
      "montessori-os/src/components/StatsPage.jsx",
      "montessori-os/src/components/NotificationsPage.jsx",
      "montessori-os/src/components/PerformanceSummaryCard.jsx",
      "montessori-os/src/components/BaseballCardSnapshotCard.jsx",
      "montessori-os/src/notifications/NotificationStack.jsx",
    ],
    matchers: [
      /StatsPage/i,
      /NotificationsPage/i,
      /PerformanceSummary/i,
      /BaseballCardSnapshot/i,
      /Notification/i,
      /FeatureTag/i,
      /NewFeaturePill/i,
    ],
  },
  {
    tag: "ai-tools-and-chat",
    name: "AI Tools and Chat",
    intent:
      "Admin-configurable AI prompts and teacher-facing copilots (cleanup, transcriber, coach, chat).",
    keyPaths: [
      "montessori-os/src/components/AIHomePage.jsx",
      "montessori-os/src/components/AITextCleanupEditor.jsx",
      "montessori-os/src/components/AIVoiceTranscriberEditor.jsx",
      "montessori-os/src/components/AICoachEditor.jsx",
      "montessori-os/src/components/ChatCommandCentreEditor.jsx",
      "montessori-os/src/components/ChildChat.jsx",
      "montessori-os/src/services/promptProvider.js",
    ],
    matchers: [
      /^AI/i,
      /AICoach/i,
      /ChatCommandCentre/i,
      /ChildChat/i,
      /coach/i,
      /promptProvider/i,
    ],
  },
  {
    tag: "admin-and-access",
    name: "Admin and Access",
    intent:
      "Role-aware access, user management, classroom operations, aliases, and graduation workflows.",
    keyPaths: [
      "montessori-os/src/components/UsersAccessPage.jsx",
      "montessori-os/src/components/GraduateStudentsPage.jsx",
      "montessori-os/src/components/StudentAliasesPage.jsx",
      "montessori-os/src/components/ConfigHomePage.jsx",
      "montessori-os/src/components/LessonNoteConfigEditor.jsx",
      "montessori-os/src/utils/roleUtils.js",
      "firestore.rules",
    ],
    matchers: [
      /UsersAccess/i,
      /GraduateStudents/i,
      /StudentAliases/i,
      /ConfigHome/i,
      /ConfigEditor/i,
      /AccessDenied/i,
      /SignIn/i,
    ],
  },
  {
    tag: "settings-feedback-shell",
    name: "Settings, Feedback, and App Shell",
    intent:
      "Global navigation, profile/settings, feedback loops, and version/update surfaces.",
    keyPaths: [
      "montessori-os/src/App.jsx",
      "montessori-os/src/AppHeader.jsx",
      "montessori-os/src/AppFooter.jsx",
      "montessori-os/src/components/SettingsPage.jsx",
      "montessori-os/src/components/ProfilePage.jsx",
      "montessori-os/src/components/FeedbackPage.jsx",
      "montessori-os/src/components/UpdateNotification.jsx",
    ],
    matchers: [
      /^App$/i,
      /AppHeader/i,
      /AppFooter/i,
      /SettingsPage/i,
      /ProfilePage/i,
      /Feedback/i,
      /VersionBadge/i,
      /LandingPage/i,
      /UpdateNotification/i,
      /CopyToClipboardButton/i,
    ],
  },
];

const ROLE_SUMMARY = [
  {
    role: "Teacher",
    capabilities:
      "Create observations and lesson notes for assigned classrooms, view timelines/dashboards, submit feedback.",
  },
  {
    role: "Classroom Admin",
    capabilities:
      "Manage teacher/student operations within manageable classrooms, review stats/timelines, operate Users & Access for teachers.",
  },
  {
    role: "Super Admin",
    capabilities:
      "Full workspace control: user roles, classroom/branch/program/config management, AI tool configuration, and global analytics.",
  },
];

function parseArgs(argv) {
  const args = { output: defaultOutputPath };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--output" && argv[i + 1]) {
      args.output = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectComponentEntries() {
  const entries = [];
  const componentFiles = await fs.readdir(componentsRoot, { withFileTypes: true });
  for (const entry of componentFiles) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(componentsRoot, entry.name);
    entries.push({
      name: entry.name.replace(/\.[^.]+$/, ""),
      relPath: path.relative(repoRoot, fullPath),
    });
  }

  const rootCandidates = [
    "App.jsx",
    "AppHeader.jsx",
    "AppFooter.jsx",
    "SignIn.jsx",
    "AccessDenied.jsx",
    "VoiceRecorder.jsx",
  ];
  for (const filename of rootCandidates) {
    const fullPath = path.join(srcRoot, filename);
    if (await exists(fullPath)) {
      entries.push({
        name: filename.replace(/\.[^.]+$/, ""),
        relPath: path.relative(repoRoot, fullPath),
      });
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

function areaForComponent(name) {
  for (const area of AREA_DEFINITIONS) {
    if (area.matchers.some((matcher) => matcher.test(name))) {
      return area.tag;
    }
  }
  return "settings-feedback-shell";
}

async function parseFirestoreSurface() {
  const rulesPath = path.join(repoRoot, "firestore.rules");
  const content = await fs.readFile(rulesPath, "utf8");
  const paths = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const lineMatch = line.match(/^\s*match\s+([^\s]+)\s*\{/);
    if (!lineMatch) continue;
    const rawPath = lineMatch[1];
    if (rawPath.startsWith("/databases/")) continue;
    paths.push(rawPath);
  }

  const collections = new Set();
  for (const rawPath of paths) {
    const segments = rawPath.split("/").filter(Boolean);
    for (let i = 0; i < segments.length; i += 1) {
      if (i % 2 === 0) {
        const segment = segments[i];
        if (!segment.startsWith("{")) {
          collections.add(segment);
        }
      }
    }
  }

  const preferredOrder = [
    "users",
    "branches",
    "programs",
    "classrooms",
    "students",
    "observations",
    "media",
    "ai_summaries",
    "config",
    "feedback",
    "ai_prompts",
    "placements",
    "chats",
    "messages",
  ];
  const collectionsSorted = [...collections].sort((a, b) => {
    const ai = preferredOrder.indexOf(a);
    const bi = preferredOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const uniquePaths = [...new Set(paths)].sort((a, b) => {
    const depthA = a.split("/").length;
    const depthB = b.split("/").length;
    if (depthA !== depthB) return depthA - depthB;
    return a.localeCompare(b);
  });

  return { collectionsSorted, uniquePaths };
}

function parseRecentReleases(changelog, count = 4) {
  const headingRegex = /^#\s+(\d+\.\d+\.\d+)\s+—\s+(\d{4}-\d{2}-\d{2})\s*$/gm;
  const headers = [];
  let match;
  while ((match = headingRegex.exec(changelog)) !== null) {
    headers.push({
      version: match[1],
      date: match[2],
      startIndex: match.index,
      headingEnd: headingRegex.lastIndex,
    });
  }

  const releases = [];
  for (let i = 0; i < headers.length && releases.length < count; i += 1) {
    const current = headers[i];
    const next = headers[i + 1];
    const section = changelog.slice(current.headingEnd, next ? next.startIndex : changelog.length);
    const bullets = section
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .slice(0, 3)
      .map((line) => line.replace(/^- /, ""));
    releases.push({
      version: current.version,
      date: current.date,
      bullets,
    });
  }
  return releases;
}

function shortVersion(depVersion) {
  return String(depVersion || "").replace(/^[~^]/, "");
}

function toMarkdownList(items, prefix = "- ") {
  if (items.length === 0) return `${prefix}None`;
  return items.map((item) => `${prefix}${item}`).join("\n");
}

async function buildOverview() {
  const rootPackage = await readJson(path.join(repoRoot, "package.json"));
  const appPackage = await readJson(path.join(appRoot, "package.json"));
  const changelog = await fs.readFile(path.join(repoRoot, "CHANGELOG.md"), "utf8");
  const { collectionsSorted, uniquePaths } = await parseFirestoreSurface();
  const releases = parseRecentReleases(changelog, 4);
  const components = await collectComponentEntries();

  const grouped = new Map(AREA_DEFINITIONS.map((area) => [area.tag, []]));
  for (const component of components) {
    const areaTag = areaForComponent(component.name);
    grouped.get(areaTag).push(component);
  }

  const deepPointers = [];
  for (const area of AREA_DEFINITIONS) {
    const reportRelPath = `.claude/skills/codebase-context-deep-dive/references/deep-dives/${area.tag}.md`;
    const reportAbsPath = path.join(repoRoot, reportRelPath);
    deepPointers.push({
      tag: area.tag,
      relPath: reportRelPath,
      status: (await exists(reportAbsPath)) ? "present" : "missing",
    });
  }

  const now = new Date().toISOString();
  const appVersion = appPackage.version;
  const reactVersion = shortVersion(appPackage.dependencies.react);
  const muiVersion = shortVersion(appPackage.dependencies["@mui/material"]);
  const firebaseVersion = shortVersion(appPackage.dependencies.firebase);
  const viteVersion = shortVersion(appPackage.devDependencies.vite);

  const lines = [];
  lines.push("# Pep OS Overview");
  lines.push("");
  lines.push(`Generated: ${now}`);
  lines.push(`App version: ${appVersion}`);
  lines.push("");
  lines.push("## App Snapshot");
  lines.push("");
  lines.push(
    `- Mobile-first web app for Montessori classrooms (repo root package: \`${rootPackage.name}\`, app package: \`${appPackage.name}\`).`,
  );
  lines.push(
    `- Frontend stack: React ${reactVersion}, MUI ${muiVersion}, Firebase ${firebaseVersion}, Vite ${viteVersion}.`,
  );
  lines.push("- Product focus: fast classroom note capture, timeline review, analytics, and AI-assisted educator workflows.");
  lines.push("");
  lines.push("## Roles");
  lines.push("");
  lines.push("| Role | Primary Capabilities |");
  lines.push("| --- | --- |");
  for (const role of ROLE_SUMMARY) {
    lines.push(`| ${role.role} | ${role.capabilities} |`);
  }
  lines.push("");
  lines.push("## Area Map");
  lines.push("");
  lines.push("| area_tag | area_name | intent | key_paths |");
  lines.push("| --- | --- | --- | --- |");
  for (const area of AREA_DEFINITIONS) {
    const existingPaths = [];
    for (const relPath of area.keyPaths) {
      if (await exists(path.join(repoRoot, relPath))) {
        existingPaths.push(`\`${relPath}\``);
      }
    }
    lines.push(
      `| ${area.tag} | ${area.name} | ${area.intent} | ${existingPaths.join("<br>")} |`,
    );
  }
  lines.push("");
  lines.push("## Existing Pages and Components");
  lines.push("");
  for (const area of AREA_DEFINITIONS) {
    const entries = grouped.get(area.tag) || [];
    const componentNames = entries.map((entry) => `\`${entry.name}\``);
    lines.push(`### ${area.name} (\`${area.tag}\`)`);
    lines.push(`- Count: ${entries.length}`);
    lines.push(`- Components: ${componentNames.join(", ") || "None"}`);
    lines.push("- Representative paths:");
    const samplePaths = entries.slice(0, 8).map((entry) => `\`${entry.relPath}\``);
    lines.push(toMarkdownList(samplePaths));
    lines.push("");
  }

  lines.push("## Existing UX Patterns");
  lines.push("");
  lines.push("- Mobile-first navigation with header/back handling plus bottom app footer navigation.");
  lines.push("- Quick capture pattern: floating action (`AddNoteFab`) opens modal (`AddNoteModal`) and branches into text/voice/lesson/media flows.");
  lines.push("- Timeline-first review model with filters and expansion dialogs for note details/media context.");
  lines.push("- MUI-centered component system for cards, dialogs, chips, selectors, and status indicators.");
  lines.push("- Voice input support exists in both note capture (`VoiceRecorder`) and AI tooling flows.");
  lines.push("");
  lines.push("## Firestore/Data Surface");
  lines.push("");
  lines.push(`- Core collections/signals: ${collectionsSorted.map((name) => `\`${name}\``).join(", ")}`);
  lines.push("- Rule-declared paths:");
  lines.push(toMarkdownList(uniquePaths.map((p) => `\`${p}\``)));
  lines.push("");
  lines.push("## Recent Changes");
  lines.push("");
  for (const release of releases) {
    lines.push(`### ${release.version} (${release.date})`);
    lines.push(toMarkdownList(release.bullets));
    lines.push("");
  }

  lines.push("## Deep Dive Pointers");
  lines.push("");
  lines.push("| area_tag | report_path | status |");
  lines.push("| --- | --- | --- |");
  for (const pointer of deepPointers) {
    lines.push(`| ${pointer.tag} | \`${pointer.relPath}\` | ${pointer.status} |`);
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const markdown = await buildOverview();
  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await fs.writeFile(args.output, markdown, "utf8");
  const outputRel = path.relative(repoRoot, args.output);
  process.stdout.write(`Overview written: ${outputRel}\n`);
}

main().catch((error) => {
  process.stderr.write(`generate-overview failed: ${error.message}\n`);
  process.exitCode = 1;
});
