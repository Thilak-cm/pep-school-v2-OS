import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_EMAIL_DOMAINS,
  isAllowedEmail,
} from "../config/authConstants.js";

describe("ALLOWED_EMAIL_DOMAINS", () => {
  it("contains the three school domains", () => {
    assert.deepEqual(ALLOWED_EMAIL_DOMAINS, [
      "@pepschoolv2.com",
      "@ribbons.education",
      "@accelschool.in",
    ]);
  });

  it("every entry starts with @ so endsWith cannot be fooled by substrings", () => {
    for (const domain of ALLOWED_EMAIL_DOMAINS) {
      assert.ok(domain.startsWith("@"), `${domain} must start with @`);
    }
  });
});

describe("isAllowedEmail", () => {
  it("accepts emails from each allowed domain", () => {
    assert.equal(isAllowedEmail("teacher@pepschoolv2.com"), true);
    assert.equal(isAllowedEmail("admin@ribbons.education"), true);
    assert.equal(isAllowedEmail("staff@accelschool.in"), true);
  });

  it("rejects other domains", () => {
    assert.equal(isAllowedEmail("someone@gmail.com"), false);
    assert.equal(isAllowedEmail("x@pepschoolv2.com.evil.com"), false);
  });

  it("rejects lookalike domains without the @ boundary", () => {
    assert.equal(isAllowedEmail("user@notpepschoolv2.com"), false);
  });

  it("is case-insensitive and trims whitespace", () => {
    assert.equal(isAllowedEmail("  Teacher@PepSchoolV2.COM  "), true);
  });

  it("rejects empty, null, and undefined", () => {
    assert.equal(isAllowedEmail(""), false);
    assert.equal(isAllowedEmail(null), false);
    assert.equal(isAllowedEmail(undefined), false);
  });
});
