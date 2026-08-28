import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  classifyNote,
  getObservationDate,
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
