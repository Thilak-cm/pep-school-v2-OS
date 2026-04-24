import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPageTitle, getBackNavigation, FAB_HIDDEN_SCREENS } from "./screenConfig.js";

describe("getPageTitle", () => {
  it("returns correct title for landingPage (teacher)", () => {
    const title = getPageTitle("landingPage", { isTeacher: true });
    assert.equal(title, "Teacher Panel");
  });

  it("returns correct title for landingPage (superadmin)", () => {
    const title = getPageTitle("landingPage", { isTeacher: false, isSuperAdminUser: true });
    assert.equal(title, "Super Admin Panel");
  });

  it("returns correct title for landingPage (classroomadmin)", () => {
    const title = getPageTitle("landingPage", { isTeacher: false, isSuperAdminUser: false });
    assert.equal(title, "Classroom Admin Panel");
  });

  it("returns correct title for classroomList (teacher)", () => {
    const title = getPageTitle("classroomList", { isTeacher: true });
    assert.equal(title, "My Classrooms");
  });

  it("returns correct title for classroomList (admin)", () => {
    const title = getPageTitle("classroomList", { isTeacher: false });
    assert.equal(title, "Classrooms & Students");
  });

  it("returns classroom name for classroomTimeline", () => {
    const title = getPageTitle("classroomTimeline", { selectedClassroom: { name: "Periwinkle" } });
    assert.equal(title, "Periwinkle");
  });

  it("returns fallback for classroomTimeline without classroom", () => {
    const title = getPageTitle("classroomTimeline", {});
    assert.equal(title, "Classroom Timeline");
  });

  it("returns student dashboard title", () => {
    const title = getPageTitle("studentDashboard", { getStudentDisplayName: () => "Aarav" });
    assert.equal(title, "Aarav's Dashboard");
  });

  it("returns timeline title with dashboard override", () => {
    const title = getPageTitle("timeline", { timelineTitleAsDashboard: true, getStudentDisplayName: () => "Aarav" });
    assert.equal(title, "Aarav's Dashboard");
  });

  it("returns timeline title without dashboard override", () => {
    const title = getPageTitle("timeline", { timelineTitleAsDashboard: false, getStudentDisplayName: () => "Aarav" });
    assert.equal(title, "Aarav's Timeline");
  });

  it("returns static titles for simple screens", () => {
    assert.equal(getPageTitle("profile", {}), "Profile");
    assert.equal(getPageTitle("stats", {}), "Statistics");
    assert.equal(getPageTitle("feedback", {}), "Feedback & Suggestions");
    assert.equal(getPageTitle("config", {}), "Configurations");
    assert.equal(getPageTitle("settings", {}), "Settings");
    assert.equal(getPageTitle("alerts", {}), "Alerts");
    assert.equal(getPageTitle("interviews", {}), "Interviews");
    assert.equal(getPageTitle("childChat", {}), "Chat with Coach Pepper");
  });

  it("returns addUser title based on usersAccessView", () => {
    assert.equal(getPageTitle("addUser", { usersAccessView: "add" }), "Add Users");
    assert.equal(getPageTitle("addUser", { usersAccessView: "manage" }), "Manage Users");
    assert.equal(getPageTitle("addUser", { usersAccessView: "home" }), "Users & Access");
  });
});

describe("getBackNavigation", () => {
  it("returns null for landingPage", () => {
    assert.equal(getBackNavigation("landingPage", {}, {}), null);
  });

  it("returns a function for classroomList", () => {
    const fn = getBackNavigation("classroomList", {}, {});
    assert.equal(typeof fn, "function");
  });

  it("returns a function for studentDashboard", () => {
    const fn = getBackNavigation("studentDashboard", { studentDashboardReturnScreen: "classroomTimeline" }, {});
    assert.equal(typeof fn, "function");
  });

  it("returns a function for config screens", () => {
    for (const screen of ["configLessonNotes", "configAiTools", "aiTextEditor", "aiCoachEditor"]) {
      const fn = getBackNavigation(screen, {}, {});
      assert.equal(typeof fn, "function", `Expected function for ${screen}`);
    }
  });

  it("returns correct handler for addUser with home view", () => {
    const fn = getBackNavigation("addUser", { usersAccessView: "home" }, {});
    assert.equal(typeof fn, "function");
  });

  it("returns correct handler for addUser with non-home view", () => {
    const fn = getBackNavigation("addUser", { usersAccessView: "manage" }, {});
    assert.equal(typeof fn, "function");
  });
});

describe("FAB_HIDDEN_SCREENS", () => {
  it("is a Set", () => {
    assert.ok(FAB_HIDDEN_SCREENS instanceof Set);
  });

  it("contains all non-observation screens", () => {
    const expected = [
      "profile", "stats", "studentStats", "feedback", "feedbackTimeline",
      "accessDenied", "classroomNotesReview", "graduateStudents", "lessonNotes",
      "studentAliases", "settings", "addUser", "childChat", "config",
      "configLessonNotes", "configAiTools", "chatCommandCentre", "baseballCardConfig",
      "reportGenConfig", "bulkUpload", "alerts", "interviews",
    ];
    for (const s of expected) {
      assert.ok(FAB_HIDDEN_SCREENS.has(s), `Expected FAB_HIDDEN_SCREENS to contain "${s}"`);
    }
  });

  it("does not contain observation screens", () => {
    const observationScreens = ["landingPage", "classroomList", "classroomTimeline", "studentDashboard", "timeline", "studentReports"];
    for (const s of observationScreens) {
      assert.ok(!FAB_HIDDEN_SCREENS.has(s), `FAB_HIDDEN_SCREENS should NOT contain "${s}"`);
    }
  });
});
