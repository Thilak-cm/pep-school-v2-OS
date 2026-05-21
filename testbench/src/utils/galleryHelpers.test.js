/**
 * PEP-241: Gallery helper tests — navigation, metadata extraction, storage path extraction.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  extractStoragePaths,
  buildGalleryItems,
  navigateGallery,
} from "./galleryHelpers.js";

describe("extractStoragePaths", () => {
  it("extracts media[0].storagePath from each doc", () => {
    const docs = [
      { media: [{ storagePath: "students/S1/media/m1/original.webp" }] },
      { media: [{ storagePath: "students/S1/media/m2/original.webp" }] },
    ];
    assert.deepEqual(extractStoragePaths(docs), [
      "students/S1/media/m1/original.webp",
      "students/S1/media/m2/original.webp",
    ]);
  });

  it("skips docs with no media array", () => {
    const docs = [{ media: [{ storagePath: "a/b" }] }, {}, { media: [] }];
    assert.deepEqual(extractStoragePaths(docs), ["a/b"]);
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(extractStoragePaths([]), []);
    assert.deepEqual(extractStoragePaths(null), []);
  });
});

describe("buildGalleryItems", () => {
  it("merges media docs with resolved URLs", () => {
    const docs = [
      { id: "m1", observedAt: { toDate: () => new Date("2026-01-15") }, teacherComment: "Good progress", curriculumArea: "Language", createdByName: "Ms. Rao", media: [{ storagePath: "path/m1" }] },
      { id: "m2", observedAt: { toDate: () => new Date("2026-02-01") }, teacherComment: null, curriculumArea: "Math", createdByName: "Ms. Patel", media: [{ storagePath: "path/m2" }] },
    ];
    const urlMap = { "path/m1": "https://cdn/m1.webp", "path/m2": "https://cdn/m2.webp" };
    const items = buildGalleryItems(docs, urlMap);

    assert.equal(items.length, 2);
    assert.equal(items[0].id, "m1");
    assert.equal(items[0].url, "https://cdn/m1.webp");
    assert.equal(items[0].teacherComment, "Good progress");
    assert.equal(items[0].curriculumArea, "Language");
    assert.equal(items[0].createdByName, "Ms. Rao");
    assert.ok(items[0].observedAt instanceof Date);
    assert.equal(items[1].url, "https://cdn/m2.webp");
    assert.equal(items[1].teacherComment, null);
  });

  it("excludes docs with no resolved URL", () => {
    const docs = [
      { id: "m1", observedAt: { toDate: () => new Date() }, media: [{ storagePath: "path/m1" }] },
      { id: "m2", observedAt: { toDate: () => new Date() }, media: [{ storagePath: "path/m2" }] },
    ];
    const urlMap = { "path/m1": "https://cdn/m1.webp" };
    const items = buildGalleryItems(docs, urlMap);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "m1");
  });

  it("returns empty array when docs is empty", () => {
    assert.deepEqual(buildGalleryItems([], {}), []);
  });
});

describe("navigateGallery", () => {
  it("moves forward within bounds", () => {
    assert.equal(navigateGallery(0, 1, 5), 1);
    assert.equal(navigateGallery(3, 1, 5), 4);
  });

  it("moves backward within bounds", () => {
    assert.equal(navigateGallery(3, -1, 5), 2);
    assert.equal(navigateGallery(1, -1, 5), 0);
  });

  it("clamps at upper bound", () => {
    assert.equal(navigateGallery(4, 1, 5), 4);
  });

  it("clamps at lower bound", () => {
    assert.equal(navigateGallery(0, -1, 5), 0);
  });

  it("returns 0 for empty list", () => {
    assert.equal(navigateGallery(0, 1, 0), 0);
  });
});
