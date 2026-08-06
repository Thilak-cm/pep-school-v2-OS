import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const sourceUrl = new URL("./index.js", import.meta.url);

test("chat stream does not treat normal request close as a client disconnect", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.doesNotMatch(source, /req\.on\("close"/);
  assert.match(source, /req\.on\("aborted"/);
  assert.match(source, /res\.on\("close"/);
});
