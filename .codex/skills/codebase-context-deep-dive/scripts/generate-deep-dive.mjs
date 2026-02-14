#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../../");
const overviewPath = path.join(
  repoRoot,
  ".codex/skills/codebase-context-scan/references/pep-os-overview.md",
);
const deepDiveDir = path.join(
  repoRoot,
  ".codex/skills/codebase-context-deep-dive/references/deep-dives",
);

const AREA_CONSTRAINTS = {
  "observation-capture": [
    "Capture flow is optimized for quick mobile input and should minimize step friction.",
    "Role-aware recipient/classroom scoping must remain consistent with current permissions.",
    "Media and lesson-note behavior must stay compatible with timeline rendering expectations.",
  ],
  "timelines-and-media": [
    "Timeline grouping and filter behavior should stay consistent across note/media types.",
    "Media interactions must align with Firestore + Storage constraints and status transitions.",
    "Teacher-visible text/labels should preserve concise, scan-friendly timeline readability.",
  ],
  "analytics-and-notifications": [
    "Metrics should remain role-scoped and not leak classroom data across boundaries.",
    "Notification counters and escalation badges should avoid stale-cache regressions.",
    "Query/index strategy should remain compatible with collection-group reads in Firestore rules.",
  ],
  "ai-tools-and-chat": [
    "Prompt/config changes are admin-scoped and must respect existing enable/disable gates.",
    "Chat and coach flows should preserve program-aware configuration behavior.",
    "AI UX changes should keep clear fallback behavior when model calls are skipped/unavailable.",
  ],
  "admin-and-access": [
    "Role transitions and access scopes must preserve classroom-admin manageableClassrooms semantics.",
    "User/admin operations should remain compatible with migration and authorization flows.",
    "Config editors remain privileged surfaces and should avoid exposing super-admin actions to lower roles.",
  ],
  "settings-feedback-shell": [
    "Navigation and footer/header behavior should stay predictable on mobile-first screens.",
    "Feedback/settings/profile paths should keep low-friction access without bypassing auth guards.",
    "Global UI changes should remain consistent with existing MUI interaction patterns.",
  ],
};

const AREA_QUESTIONS = {
  "observation-capture": [
    "Which note mode is affected (text, voice, lesson, media), and for which role(s)?",
    "What is the expected capture speed or interaction target on mobile devices?",
    "Are there classroom/student selection edge cases (group notes, mentions, reassignment)?",
  ],
  "timelines-and-media": [
    "Which timeline view is in scope (student, classroom, dashboard card, media dialog)?",
    "What filter/grouping behavior must remain unchanged?",
    "Does this change impact media status states, batch summaries, or delete behavior?",
  ],
  "analytics-and-notifications": [
    "Which metric cards/tabs are in scope and for which role(s)?",
    "What date window and aggregation semantics are required?",
    "Should escalations/notifications trigger new badge, query, or cache behavior?",
  ],
  "ai-tools-and-chat": [
    "Is this about configuration UX, runtime inference behavior, or both?",
    "Which program or AI surface is targeted (coach, cleanup, transcriber, chat)?",
    "What is the expected fallback when AI is disabled, unavailable, or low confidence?",
  ],
  "admin-and-access": [
    "Which actor role is initiating the action and which role/data is being affected?",
    "What are the exact permission boundaries that must be preserved?",
    "Does the request involve user lifecycle steps (invite, migrate, deactivate, delete)?",
  ],
  "settings-feedback-shell": [
    "Which entrypoint screen should expose the change (footer tab, profile, settings, feedback)?",
    "Are there mobile navigation/back-stack expectations that must not regress?",
    "Should this behavior differ by role or remain global?",
  ],
};

function parseArgs(argv) {
  const areas = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--area" && argv[i + 1]) {
      areas.push(argv[i + 1].trim());
      i += 1;
      continue;
    }
    if (argv[i] === "--areas" && argv[i + 1]) {
      const values = argv[i + 1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      areas.push(...values);
      i += 1;
    }
  }
  return { areas: [...new Set(areas)] };
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseAreaMap(markdown) {
  const lines = markdown.split("\n");
  const headerIndex = lines.findIndex(
    (line) => line.trim() === "| area_tag | area_name | intent | key_paths |",
  );
  if (headerIndex === -1) {
    throw new Error("Could not find `## Area Map` table in overview.");
  }

  const areaMap = new Map();
  for (let i = headerIndex + 2; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) break;
    const columns = line
      .split("|")
      .slice(1, -1)
      .map((value) => value.trim());
    if (columns.length < 4) continue;
    const [tag, areaName, intent, keyPathsRaw] = columns;
    const keyPaths = keyPathsRaw
      .split("<br>")
      .map((value) => value.trim().replace(/`/g, ""))
      .filter(Boolean);
    areaMap.set(tag, { tag, areaName, intent, keyPaths });
  }
  return areaMap;
}

function parseCoreCollections(markdown) {
  const line = markdown
    .split("\n")
    .find((rawLine) => rawLine.startsWith("- Core collections/signals:"));
  if (!line) return new Set();
  const collectionRegex = /`([^`]+)`/g;
  const collections = new Set();
  let match;
  while ((match = collectionRegex.exec(line)) !== null) {
    collections.add(match[1]);
  }
  return collections;
}

function resolveImportPath(fromFileAbs, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFileAbs), specifier);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.js"),
    path.join(base, "index.jsx"),
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  return candidates;
}

function parseImportSpecifiers(content) {
  const specs = new Set();
  const importRegex =
    /\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const spec = match[1] || match[2];
    if (spec) specs.add(spec);
  }
  return [...specs];
}

function parseCallableNames(content) {
  const names = new Set();
  const callableRegex = /httpsCallable\([^,]+,\s*["']([^"']+)["']\s*\)/g;
  let match;
  while ((match = callableRegex.exec(content)) !== null) {
    names.add(match[1]);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function parseHooks(content) {
  const hooks = new Set();
  const hookRegex = /\buse(State|Effect|Memo|Callback|Ref|Reducer)\b/g;
  let match;
  while ((match = hookRegex.exec(content)) !== null) {
    hooks.add(`use${match[1]}`);
  }
  return [...hooks].sort((a, b) => a.localeCompare(b));
}

function detectCollections(content, knownCollections) {
  const used = [];
  for (const name of knownCollections) {
    const regex = new RegExp(`[\\\`"']${name}[\\\`"']`, "g");
    if (regex.test(content)) used.push(name);
  }
  return used.sort((a, b) => a.localeCompare(b));
}

function fileKind(relPath) {
  if (relPath.includes("/components/")) return "UI component";
  if (relPath.includes("/hooks/")) return "React hook";
  if (relPath.includes("/services/")) return "Service module";
  if (relPath.includes("/utils/")) return "Utility module";
  if (relPath.endsWith("firestore.rules")) return "Security rules";
  return "App/module";
}

function summarizeFile(relPath) {
  const base = path.basename(relPath, path.extname(relPath));
  const label = base
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
  return `Primary logic for ${label}.`;
}

function confidenceSummary(declaredCount, existingCount, relatedCount) {
  const coverage = declaredCount === 0 ? 0 : Math.round((existingCount / declaredCount) * 100);
  const score = Math.min(100, Math.round(coverage * 0.75 + Math.min(relatedCount, 12) * 2));
  const level = score >= 75 ? "High" : score >= 50 ? "Medium" : "Low";
  return { score, level, coverage };
}

function buildReport({
  area,
  generatedAt,
  keyFiles,
  relatedFiles,
  usedCollections,
  callableNames,
  hooks,
  missingPaths,
}) {
  const { score, level, coverage } = confidenceSummary(
    area.keyPaths.length,
    keyFiles.length,
    relatedFiles.length,
  );

  const constraints = AREA_CONSTRAINTS[area.tag] || [
    "Preserve role-aware behavior and avoid scope creep beyond this area.",
  ];
  const guidance = AREA_QUESTIONS[area.tag] || [
    "Who is impacted and what behavior should change?",
    "What edge cases are explicitly in scope?",
    "What outcomes define success for this issue?",
  ];

  const openQuestions = [];
  if (missingPaths.length > 0) {
    openQuestions.push(
      `Mapped key paths missing in repo snapshot: ${missingPaths.map((value) => `\`${value}\``).join(", ")}`,
    );
  }
  if (usedCollections.length === 0) {
    openQuestions.push("No direct Firestore collection strings detected in scoped files.");
  }
  if (callableNames.length === 0) {
    openQuestions.push("No explicit Cloud Function call names detected in scoped files.");
  }
  if (openQuestions.length === 0) {
    openQuestions.push("No major structural unknowns from the current scoped scan.");
  }

  const lines = [];
  lines.push(`# Deep Dive: ${area.areaName}`);
  lines.push("");
  lines.push(`Generated: ${generatedAt}`);
  lines.push(`Source overview: \`.codex/skills/codebase-context-scan/references/pep-os-overview.md\``);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push(`- area_tag: \`${area.tag}\``);
  lines.push(`- Intent: ${area.intent}`);
  lines.push(`- Declared key paths: ${area.keyPaths.length}`);
  lines.push(`- Existing key paths found: ${keyFiles.length}`);
  lines.push("");
  lines.push("## Architecture and Data Flow");
  lines.push("");
  lines.push(`- Primary key files: ${keyFiles.map((f) => `\`${f}\``).join(", ") || "None"}`);
  lines.push(
    `- Related imports discovered: ${relatedFiles.map((f) => `\`${f}\``).join(", ") || "None"}`,
  );
  lines.push(
    `- Firestore collections referenced in scoped files: ${usedCollections.map((c) => `\`${c}\``).join(", ") || "None detected"}`,
  );
  lines.push(
    `- Cloud Functions referenced: ${callableNames.map((name) => `\`${name}\``).join(", ") || "None detected"}`,
  );
  lines.push(
    `- React hooks commonly used: ${hooks.map((name) => `\`${name}\``).join(", ") || "None detected"}`,
  );
  lines.push("");
  lines.push("## Key Components/Files");
  lines.push("");
  lines.push("| Path | Type | Notes |");
  lines.push("| --- | --- | --- |");
  for (const relPath of keyFiles) {
    lines.push(`| \`${relPath}\` | ${fileKind(relPath)} | ${summarizeFile(relPath)} |`);
  }
  if (keyFiles.length === 0) {
    lines.push("| _None_ | _None_ | No key files matched this area in the current repo snapshot. |");
  }
  lines.push("");
  lines.push("## Operational Constraints");
  lines.push("");
  for (const item of constraints) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("## Open Questions / Unknowns");
  lines.push("");
  for (const item of openQuestions) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("## Issue-Drafting Guidance");
  lines.push("");
  for (const item of guidance) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("## Confidence + Gaps");
  lines.push("");
  lines.push(`- Confidence: ${level} (${score}/100)`);
  lines.push(`- Key path coverage: ${coverage}% (${keyFiles.length}/${area.keyPaths.length})`);
  lines.push(`- Related file count: ${relatedFiles.length}`);
  lines.push(
    `- Missing key paths: ${missingPaths.length > 0 ? missingPaths.map((value) => `\`${value}\``).join(", ") : "None"}`,
  );
  lines.push("");

  return `${lines.join("\n")}\n`;
}

async function deepDiveArea(area, knownCollections) {
  const keyFiles = [];
  const missingPaths = [];
  const relatedFiles = new Set();
  const usedCollections = new Set();
  const callableNames = new Set();
  const hooks = new Set();

  for (const relPath of area.keyPaths) {
    const absPath = path.join(repoRoot, relPath);
    if (!(await exists(absPath))) {
      missingPaths.push(relPath);
      continue;
    }
    keyFiles.push(relPath);
    const content = await fs.readFile(absPath, "utf8");

    for (const collection of detectCollections(content, knownCollections)) {
      usedCollections.add(collection);
    }
    for (const name of parseCallableNames(content)) {
      callableNames.add(name);
    }
    for (const hook of parseHooks(content)) {
      hooks.add(hook);
    }

    const specs = parseImportSpecifiers(content);
    for (const spec of specs) {
      const candidates = resolveImportPath(absPath, spec);
      if (!candidates) continue;
      for (const candidate of candidates) {
        if (await exists(candidate)) {
          const rel = path.relative(repoRoot, candidate);
          if (!keyFiles.includes(rel)) relatedFiles.add(rel);
          break;
        }
      }
    }
  }

  const relatedFilesList = [...relatedFiles].sort((a, b) => a.localeCompare(b)).slice(0, 16);
  const keyFilesSorted = [...new Set(keyFiles)].sort((a, b) => a.localeCompare(b));
  const generatedAt = new Date().toISOString();

  return buildReport({
    area,
    generatedAt,
    keyFiles: keyFilesSorted,
    relatedFiles: relatedFilesList,
    usedCollections: [...usedCollections].sort((a, b) => a.localeCompare(b)),
    callableNames: [...callableNames].sort((a, b) => a.localeCompare(b)),
    hooks: [...hooks].sort((a, b) => a.localeCompare(b)),
    missingPaths,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!(await exists(overviewPath))) {
    throw new Error(
      "Overview file is missing. Run codebase-context-scan first to generate pep-os-overview.md.",
    );
  }
  const overview = await fs.readFile(overviewPath, "utf8");
  const areaMap = parseAreaMap(overview);
  const knownCollections = parseCoreCollections(overview);

  if (args.areas.length === 0) {
    const availableTags = [...areaMap.keys()].sort((a, b) => a.localeCompare(b));
    throw new Error(
      `No area tags provided. Use --area <tag>. Available tags: ${availableTags.join(", ")}`,
    );
  }

  await fs.mkdir(deepDiveDir, { recursive: true });
  const writtenFiles = [];
  for (const areaTag of args.areas) {
    const area = areaMap.get(areaTag);
    if (!area) {
      throw new Error(`Unknown area tag: ${areaTag}`);
    }
    const report = await deepDiveArea(area, knownCollections);
    const outPath = path.join(deepDiveDir, `${areaTag}.md`);
    await fs.writeFile(outPath, report, "utf8");
    writtenFiles.push(path.relative(repoRoot, outPath));
  }

  process.stdout.write(`Deep dive report(s) written:\n${writtenFiles.map((f) => `- ${f}`).join("\n")}\n`);
}

main().catch((error) => {
  process.stderr.write(`generate-deep-dive failed: ${error.message}\n`);
  process.exitCode = 1;
});
