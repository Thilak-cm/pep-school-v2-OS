import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const instructions = readFileSync(resolve(__dirname, "coach-pepper-instructions.md"), "utf8");

describe("Coach Pepper channel instructions", () => {
  it("AC1: file exists and is non-empty", () => {
    assert.ok(instructions.length > 100, "Instructions file should be substantial");
  });

  it("AC2: defines Coach Pepper identity", () => {
    assert.ok(
      /coach\s*pepper/i.test(instructions),
      "Should mention Coach Pepper by name"
    );
    assert.ok(
      /montessori/i.test(instructions),
      "Should mention Montessori"
    );
  });

  it("AC3: leadership-oriented tone", () => {
    const hasLeadershipTerms =
      /school.wide|cross.classroom|leadership|admin|developmental insight/i.test(
        instructions
      );
    assert.ok(hasLeadershipTerms, "Should contain leadership-oriented language");
    const hasNotTeacher =
      /not.*teacher.facing|admin.*not.*teacher|leadership.*not.*classroom/i.test(
        instructions
      );
    assert.ok(
      hasNotTeacher,
      "Should distinguish from teacher-facing Coach Pepper"
    );
  });

  it("AC4: school context — programs, branches, classrooms", () => {
    assert.ok(/toddler/i.test(instructions), "Should mention toddler program");
    assert.ok(/primary/i.test(instructions), "Should mention primary program");
    assert.ok(/elementary/i.test(instructions), "Should mention elementary program");
    assert.ok(/adolescent/i.test(instructions), "Should mention adolescent program");
    assert.ok(/hsr/i.test(instructions), "Should mention HSR branch");
    assert.ok(/whitefield/i.test(instructions), "Should mention Whitefield branch");
  });

  it("AC5: MCP tool guidance for all 5 tools", () => {
    assert.ok(/get_student/i.test(instructions), "Should mention get_student");
    assert.ok(/get_observations/i.test(instructions), "Should mention get_observations");
    assert.ok(/get_baseball_card/i.test(instructions), "Should mention get_baseball_card");
    assert.ok(/list_students/i.test(instructions), "Should mention list_students");
    assert.ok(/list_classrooms/i.test(instructions), "Should mention list_classrooms");
    assert.ok(/read.only/i.test(instructions), "Should note tools are read-only");
  });

  it("AC6: multi-student and comparative queries", () => {
    assert.ok(
      /compar|multiple students|cross.student/i.test(instructions),
      "Should mention comparative or multi-student queries"
    );
  });

  it("AC7: always query fresh data via MCP tools", () => {
    assert.ok(
      /fresh|always.*query|do not rely.*prior|re.?fetch|never assume.*data/i.test(
        instructions
      ),
      "Should instruct to always query fresh data"
    );
  });
});
