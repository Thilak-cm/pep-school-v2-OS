import test from "node:test";
import assert from "node:assert/strict";

import { canTransitionTurn, transitionTurn } from "./chatTurnLifecycle.js";

test("turn lifecycle permits the approved forward transitions", () => {
  assert.equal(canTransitionTurn("persisting", "running"), true);
  assert.equal(canTransitionTurn("running", "completed"), true);
  assert.equal(canTransitionTurn("running", "interrupted"), true);
  assert.equal(canTransitionTurn("running", "failed"), true);
});

test("turn lifecycle rejects restarting terminal states", () => {
  assert.equal(canTransitionTurn("completed", "running"), false);
  assert.equal(canTransitionTurn("interrupted", "completed"), false);
  assert.equal(canTransitionTurn("failed", "running"), false);
});

test("transitionTurn applies state and completion metadata", () => {
  const next = transitionTurn({ status: "running", startedAt: 10 }, "completed", { completedAt: 20, finishReason: "stop" });
  assert.deepEqual(next, { status: "completed", startedAt: 10, completedAt: 20, finishReason: "stop" });
});

test("transitionTurn throws for an invalid transition", () => {
  assert.throws(() => transitionTurn({ status: "completed" }, "running"), /Invalid turn transition/);
});
