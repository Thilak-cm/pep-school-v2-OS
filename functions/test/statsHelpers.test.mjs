import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  classifyNote,
  getObservationDate,
  buildActivityTiers,
  deduplicateObservations,
  CACHE_TTL_MS,
} from "../stats/helpers.js";

// ── classifyNote ─────────────────────────────────────────────────────

describe("classifyNote", () => {
  it("classifies lesson by type field", () => {
    assert.equal(classifyNote({type: "lesson"}), "lesson");
  });

  it("classifies lesson by lessonTitle (without type field)", () => {
    assert.equal(classifyNote({lessonTitle: "Addition"}), "lesson");
  });

  it("classifies voice by type field", () => {
    assert.equal(classifyNote({type: "voice"}), "voice");
  });

  it("classifies voice by duration (no type)", () => {
    assert.equal(classifyNote({duration: 30}), "voice");
  });

  it("classifies voice by tags array", () => {
    assert.equal(classifyNote({tags: ["voice"]}), "voice");
  });

  it("classifies voice by tags.type object", () => {
    assert.equal(classifyNote({tags: {type: "voice"}}), "voice");
  });

  it("classifies text by type field", () => {
    assert.equal(classifyNote({type: "text", text: "hello"}), "text");
  });

  it("classifies text by text content (no type, no duration)", () => {
    assert.equal(classifyNote({text: "Student worked on math"}), "text");
  });

  it("classifies media by type field", () => {
    assert.equal(classifyNote({type: "media", mediaKind: "photo"}), "media");
  });

  it("returns other for null/undefined", () => {
    assert.equal(classifyNote(null), "other");
    assert.equal(classifyNote(undefined), "other");
  });

  it("returns other for empty object", () => {
    assert.equal(classifyNote({}), "other");
  });

  it("lesson takes priority over duration (would be voice)", () => {
    assert.equal(classifyNote({type: "lesson", duration: 30}), "lesson");
  });

  it("lessonTitle takes priority over text (would be text)", () => {
    assert.equal(
      classifyNote({lessonTitle: "Math", text: "Addition work"}),
      "lesson",
    );
  });

  it("classifies all types without overlap", () => {
    const observations = [
      {id: "1", type: "text", text: "Student worked on math"},
      {id: "2", type: "voice", duration: 30},
      {id: "3", type: "lesson", lessonTitle: "Addition"},
      {id: "4", type: "media", mediaKind: "photo"},
      {id: "5", type: "media", mediaKind: "video"},
      {id: "6", type: "text", text: "Another text note"},
      {id: "7", type: "lesson"},
    ];

    const counts = {lesson: 0, voice: 0, text: 0, media: 0, other: 0};
    for (const obs of observations) {
      counts[classifyNote(obs)]++;
    }

    assert.equal(counts.lesson, 2);
    assert.equal(counts.voice, 1);
    assert.equal(counts.text, 2);
    assert.equal(counts.media, 2);
    assert.equal(counts.other, 0);
    assert.equal(
      Object.values(counts).reduce((a, b) => a + b, 0),
      observations.length,
    );
  });
});

// ── getObservationDate ───────────────────────────────────────────────

describe("getObservationDate", () => {
  it("extracts date from observedAt with toDate()", () => {
    const expected = new Date("2026-05-20T10:00:00Z");
    const obs = {observedAt: {toDate: () => expected}};
    assert.equal(getObservationDate(obs).getTime(), expected.getTime());
  });

  it("extracts date from createdAt with toDate() when observedAt missing", () => {
    const expected = new Date("2026-05-20T10:00:00Z");
    const obs = {createdAt: {toDate: () => expected}};
    assert.equal(getObservationDate(obs).getTime(), expected.getTime());
  });

  it("extracts date from serialized seconds", () => {
    const obs = {observedAt: {seconds: 1716200000}};
    const result = getObservationDate(obs);
    assert.equal(result.getTime(), 1716200000 * 1000);
  });

  it("prefers observedAt over createdAt", () => {
    const observed = new Date("2026-05-20T10:00:00Z");
    const created = new Date("2026-05-19T10:00:00Z");
    const obs = {
      observedAt: {toDate: () => observed},
      createdAt: {toDate: () => created},
    };
    assert.equal(getObservationDate(obs).getTime(), observed.getTime());
  });

  it("returns epoch for null input", () => {
    assert.equal(getObservationDate(null).getTime(), 0);
  });

  it("returns epoch for empty object", () => {
    assert.equal(getObservationDate({}).getTime(), 0);
  });

  it("handles Date objects directly", () => {
    const d = new Date("2026-01-15T12:00:00Z");
    const obs = {observedAt: d};
    assert.equal(getObservationDate(obs).getTime(), d.getTime());
  });
});

// ── buildActivityTiers ───────────────────────────────────────────────

describe("buildActivityTiers", () => {
  const refDate = new Date("2026-05-27T12:00:00Z");

  it("returns empty buckets for empty observations", () => {
    const tiers = buildActivityTiers([], refDate);
    assert.equal(Object.keys(tiers.daily).length, 30);
    assert.equal(Object.keys(tiers.weekly).length, 12);
    assert.equal(Object.keys(tiers.monthly).length, 12);
    // All counts should be 0
    assert.equal(Object.values(tiers.daily).every((v) => v === 0), true);
    assert.equal(Object.values(tiers.weekly).every((v) => v === 0), true);
    assert.equal(Object.values(tiers.monthly).every((v) => v === 0), true);
  });

  it("counts a recent observation in all three tiers", () => {
    const yesterday = new Date("2026-05-26T15:00:00Z");
    const obs = [{observedAt: yesterday}];
    const tiers = buildActivityTiers(obs, refDate);

    assert.equal(tiers.daily["2026-05-26"], 1);

    // Find the weekly bucket that contains yesterday
    const weeklyValues = Object.values(tiers.weekly);
    const weeklyTotal = weeklyValues.reduce((a, b) => a + b, 0);
    assert.equal(weeklyTotal, 1);

    assert.equal(tiers.monthly["2026-05"], 1);
  });

  it("does not count observations older than 30 days in daily", () => {
    const old = new Date("2026-04-01T10:00:00Z"); // ~56 days before refDate
    const obs = [{observedAt: old}];
    const tiers = buildActivityTiers(obs, refDate);

    const dailyTotal = Object.values(tiers.daily).reduce((a, b) => a + b, 0);
    assert.equal(dailyTotal, 0);
  });

  it("counts observations in correct monthly bucket across year boundary", () => {
    const refJan = new Date("2026-01-15T12:00:00Z");
    const decObs = new Date("2025-12-20T10:00:00Z");
    const obs = [{observedAt: decObs}];
    const tiers = buildActivityTiers(obs, refJan);

    assert.equal(tiers.monthly["2025-12"], 1);
  });

  it("handles multiple observations in same bucket", () => {
    const d1 = new Date("2026-05-27T08:00:00Z");
    const d2 = new Date("2026-05-27T14:00:00Z");
    const d3 = new Date("2026-05-27T20:00:00Z");
    const obs = [
      {observedAt: d1},
      {observedAt: d2},
      {observedAt: d3},
    ];
    const tiers = buildActivityTiers(obs, refDate);
    assert.equal(tiers.daily["2026-05-27"], 3);
  });

  it("skips observations with invalid dates", () => {
    const obs = [{observedAt: null}, {}];
    const tiers = buildActivityTiers(obs, refDate);
    const dailyTotal = Object.values(tiers.daily).reduce((a, b) => a + b, 0);
    assert.equal(dailyTotal, 0);
  });
});

// ── deduplicateObservations ──────────────────────────────────────────

describe("deduplicateObservations", () => {
  it("returns 1 doc per unique groupId", () => {
    const obs = [
      {id: "a1", groupId: "g1", type: "lesson"},
      {id: "a2", groupId: "g1", type: "lesson"},
      {id: "a3", groupId: "g1", type: "lesson"},
    ];
    const result = deduplicateObservations(obs);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "a1");
  });

  it("passes through docs without groupId unchanged", () => {
    const obs = [
      {id: "b1", type: "text"},
      {id: "b2", type: "voice"},
    ];
    const result = deduplicateObservations(obs);
    assert.equal(result.length, 2);
  });

  it("handles mixed group + individual docs correctly", () => {
    const obs = [
      {id: "c1", groupId: "g1", type: "lesson"},
      {id: "c2", groupId: "g1", type: "lesson"},
      {id: "c3", type: "text"},
      {id: "c4", groupId: "g2", type: "voice"},
      {id: "c5", groupId: "g2", type: "voice"},
      {id: "c6", type: "media"},
    ];
    const result = deduplicateObservations(obs);
    // g1 → 1, individual text → 1, g2 → 1, individual media → 1
    assert.equal(result.length, 4);
  });

  it("counts two different groupIds as 2", () => {
    const obs = [
      {id: "d1", groupId: "g1", type: "lesson"},
      {id: "d2", groupId: "g1", type: "lesson"},
      {id: "d3", groupId: "g2", type: "lesson"},
      {id: "d4", groupId: "g2", type: "lesson"},
    ];
    const result = deduplicateObservations(obs);
    assert.equal(result.length, 2);
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(deduplicateObservations([]), []);
  });

  it("handles null/undefined groupId as individual docs", () => {
    const obs = [
      {id: "e1", groupId: null, type: "text"},
      {id: "e2", groupId: undefined, type: "voice"},
      {id: "e3", type: "media"},
    ];
    const result = deduplicateObservations(obs);
    assert.equal(result.length, 3);
  });
});

// ── CACHE_TTL_MS ─────────────────────────────────────────────────────

describe("CACHE_TTL_MS", () => {
  it("is 24 hours in milliseconds", () => {
    assert.equal(CACHE_TTL_MS, 24 * 60 * 60 * 1000);
  });
});
