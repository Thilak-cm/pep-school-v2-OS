import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

import { DEFAULT_CHAT_TOOL_IDS, TOOL_CATALOG_META } from "./toolCatalog.js";

test("default chat tools are derived from catalog metadata", () => {
  const derived = TOOL_CATALOG_META
    .filter((tool) => tool.scope === "student" && tool.defaultEnabled)
    .map((tool) => tool.id);

  assert.deepEqual(DEFAULT_CHAT_TOOL_IDS, derived);
  assert.equal(DEFAULT_CHAT_TOOL_IDS.includes("fetch_soul"), false);
});

test("catalog contains every default chat tool exactly once", () => {
  const catalogIds = TOOL_CATALOG_META.map((tool) => tool.id);
  assert.equal(new Set(catalogIds).size, catalogIds.length);
  assert.deepEqual(
    DEFAULT_CHAT_TOOL_IDS.filter((id) => !catalogIds.includes(id)),
    [],
  );
});

test("chat runtime preserves an explicitly empty allowedTools array", async () => {
  const source = await readFile(new URL("../chat/index.js", import.meta.url), "utf8");
  assert.match(
    source,
    /allowedTools: Array\.isArray\(data\.allowedTools\) \? data\.allowedTools : DEFAULT_CHAT_TOOL_IDS/,
  );
});
