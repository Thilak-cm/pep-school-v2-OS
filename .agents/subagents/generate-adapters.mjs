#!/usr/bin/env node

import {mkdir, readdir, readFile, writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";

const subagentsRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(subagentsRoot, "../..");
const definitionsRoot = path.join(subagentsRoot, "definitions");
const claudeAgentsRoot = path.join(repoRoot, ".claude/agents");
const codexAgentsRoot = path.join(repoRoot, ".codex/agents");

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const unknownArgs = [...args].filter((arg) => arg !== "--check");
if (unknownArgs.length > 0) {
  throw new Error(`Unknown arguments: ${unknownArgs.join(", ")}`);
}

function validateDefinition(definition, definitionDir) {
  const directoryName = path.basename(definitionDir);
  if (definition.name !== directoryName) {
    throw new Error(
        `Agent name ${definition.name} must match directory ${directoryName}`,
    );
  }
  for (const key of ["name", "description", "claude", "codex"]) {
    if (!definition[key]) {
      throw new Error(`Missing ${key} in ${definitionDir}/agent.json`);
    }
  }
  for (const key of ["model", "modelReasoningEffort", "sandboxMode"]) {
    if (!definition.codex[key]) {
      throw new Error(`Missing codex.${key} in ${definitionDir}/agent.json`);
    }
  }
  for (const key of ["model", "tools"]) {
    if (!definition.claude[key]) {
      throw new Error(`Missing claude.${key} in ${definitionDir}/agent.json`);
    }
  }
}

function renderClaude(definition, instructions) {
  const lines = [
    "---",
    "# Generated from .agents/subagents/definitions. Do not edit directly.",
    `name: ${definition.name}`,
    `description: ${JSON.stringify(definition.description)}`,
    `tools: ${definition.claude.tools}`,
    `model: ${definition.claude.model}`,
  ];
  if (definition.claude.color) lines.push(`color: ${definition.claude.color}`);
  if (definition.claude.memory) lines.push(`memory: ${definition.claude.memory}`);
  lines.push("---", "", instructions.trim(), "");
  return lines.join("\n");
}

function renderCodex(definition, instructions) {
  if (instructions.includes("'''")) {
    throw new Error(
        `${definition.name} instructions contain unsupported triple apostrophes`,
    );
  }
  return [
    "# Generated from .agents/subagents/definitions. Do not edit directly.",
    `name = ${JSON.stringify(definition.name)}`,
    `description = ${JSON.stringify(definition.description)}`,
    `model = ${JSON.stringify(definition.codex.model)}`,
    `model_reasoning_effort = ${JSON.stringify(definition.codex.modelReasoningEffort)}`,
    `sandbox_mode = ${JSON.stringify(definition.codex.sandboxMode)}`,
    "",
    "developer_instructions = '''",
    instructions.trim(),
    "'''",
    "",
  ].join("\n");
}

async function readDefinitions() {
  const entries = await readdir(definitionsRoot, {withFileTypes: true});
  const definitions = [];
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const definitionDir = path.join(definitionsRoot, entry.name);
    const definition = JSON.parse(
        await readFile(path.join(definitionDir, "agent.json"), "utf8"),
    );
    validateDefinition(definition, definitionDir);
    const instructions = await readFile(
        path.join(definitionDir, "instructions.md"),
        "utf8",
    );
    definitions.push({definition, instructions});
  }
  return definitions.sort((a, b) =>
    a.definition.name.localeCompare(b.definition.name));
}

async function syncFile(filePath, expected) {
  if (checkOnly) {
    let actual;
    try {
      actual = await readFile(filePath, "utf8");
    } catch {
      throw new Error(`Missing generated adapter: ${path.relative(repoRoot, filePath)}`);
    }
    if (actual !== expected) {
      throw new Error(`Generated adapter is stale: ${path.relative(repoRoot, filePath)}`);
    }
    return;
  }
  await writeFile(filePath, expected);
}

async function generateAdapters() {
  await mkdir(claudeAgentsRoot, {recursive: true});
  await mkdir(codexAgentsRoot, {recursive: true});
  const definitions = await readDefinitions();
  for (const {definition, instructions} of definitions) {
    await syncFile(
        path.join(claudeAgentsRoot, `${definition.name}.md`),
        renderClaude(definition, instructions),
    );
    await syncFile(
        path.join(codexAgentsRoot, `${definition.name}.toml`),
        renderCodex(definition, instructions),
    );
  }
  console.log(
      checkOnly ?
        `Verified ${definitions.length} Claude/Codex agent adapter pairs.` :
        `Generated ${definitions.length} Claude/Codex agent adapter pairs.`,
  );
}

await generateAdapters();
