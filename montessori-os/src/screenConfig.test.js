import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPageTitle, getBackNavigation, FAB_HIDDEN_SCREENS, NO_HEADER_SCREENS } from "./screenConfig.js";

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

  it("classroomList navigates to landing and clears student", () => {
    const calls = [];
    const setters = { setScreen: (v) => calls.push(["setScreen", v]), setSelectedStudent: (v) => calls.push(["setSelectedStudent", v]) };
    const fn = getBackNavigation("classroomList", {}, setters);
    fn();
    assert.deepStrictEqual(calls, [["setSelectedStudent", null], ["setScreen", "landingPage"]]);
  });

  it("studentDashboard navigates to return screen", () => {
    const calls = [];
    const setters = { setScreen: (v) => calls.push(v) };
    const fn = getBackNavigation("studentDashboard", { studentDashboardReturnScreen: "classroomTimeline" }, setters);
    fn();
    assert.deepStrictEqual(calls, ["classroomTimeline"]);
  });

  it("studentDashboard defaults to classroomTimeline when no return screen", () => {
    const calls = [];
    const setters = { setScreen: (v) => calls.push(v) };
    const fn = getBackNavigation("studentDashboard", {}, setters);
    fn();
    assert.deepStrictEqual(calls, ["classroomTimeline"]);
  });

  it("config screens navigate to their parent", () => {
    const cases = [
      ["configLessonNotes", "config"],
      ["configAiTools", "config"],
      ["aiTextEditor", "configAiTools"],
      ["aiCoachEditor", "configAiTools"],
      ["config", "settings"],
    ];
    for (const [screen, expected] of cases) {
      const calls = [];
      const setters = { setScreen: (v) => calls.push(v) };
      getBackNavigation(screen, {}, setters)();
      assert.deepStrictEqual(calls, [expected], `${screen} should navigate to ${expected}`);
    }
  });

  it("addUser with home view navigates to landing", () => {
    const calls = [];
    const setters = { setScreen: (v) => calls.push(["setScreen", v]), setSelectedStudent: (v) => calls.push(["setSelectedStudent", v]) };
    const fn = getBackNavigation("addUser", { usersAccessView: "home" }, setters);
    fn();
    assert.deepStrictEqual(calls, [["setSelectedStudent", null], ["setScreen", "landingPage"]]);
  });

  it("addUser with non-home view resets to home view", () => {
    const calls = [];
    const setters = { setUsersAccessView: (v) => calls.push(v) };
    const fn = getBackNavigation("addUser", { usersAccessView: "manage" }, setters);
    fn();
    assert.deepStrictEqual(calls, ["home"]);
  });

  it("lessonNotes navigates to return screen and clears student if landing", () => {
    const calls = [];
    const setters = { setScreen: (v) => calls.push(["setScreen", v]), setSelectedStudent: (v) => calls.push(["setSelectedStudent", v]) };
    const fn = getBackNavigation("lessonNotes", { lessonNotesReturnScreen: "landingPage" }, setters);
    fn();
    assert.deepStrictEqual(calls, [["setSelectedStudent", null], ["setScreen", "landingPage"]]);
  });

  it("lessonNotes navigates to return screen without clearing student", () => {
    const calls = [];
    const setters = { setScreen: (v) => calls.push(["setScreen", v]), setSelectedStudent: (v) => calls.push(["setSelectedStudent", v]) };
    const fn = getBackNavigation("lessonNotes", { lessonNotesReturnScreen: "classroomTimeline" }, setters);
    fn();
    assert.deepStrictEqual(calls, [["setScreen", "classroomTimeline"]]);
  });

  it("classroomTimeline navigates to landingPage and clears student", () => {
    const calls = [];
    const setters = { setScreen: (v) => calls.push(["setScreen", v]), setSelectedStudent: (v) => calls.push(["setSelectedStudent", v]) };
    const fn = getBackNavigation("classroomTimeline", { classroomTimelineReturnScreen: "landingPage" }, setters);
    fn();
    assert.deepStrictEqual(calls, [["setSelectedStudent", null], ["setScreen", "landingPage"]]);
  });

  it("classroomTimeline navigates to classroomList without clearing student", () => {
    const calls = [];
    const setters = { setScreen: (v) => calls.push(["setScreen", v]), setSelectedStudent: (v) => calls.push(["setSelectedStudent", v]) };
    const fn = getBackNavigation("classroomTimeline", { classroomTimelineReturnScreen: "classroomList" }, setters);
    fn();
    assert.deepStrictEqual(calls, [["setScreen", "classroomList"]]);
  });

  it("graduateStudents navigates to addUser and resets view", () => {
    const calls = [];
    const setters = { setScreen: (v) => calls.push(["setScreen", v]), setUsersAccessView: (v) => calls.push(["setUsersAccessView", v]) };
    const fn = getBackNavigation("graduateStudents", {}, setters);
    fn();
    assert.deepStrictEqual(calls, [["setScreen", "addUser"], ["setUsersAccessView", "home"]]);
  });

  it("feedback with feedbackReturnScreen navigates to that screen", () => {
    const calls = [];
    const setters = { setScreen: (v) => calls.push(v) };
    const fn = getBackNavigation("feedback", { feedbackReturnScreen: "feedbackTimeline" }, setters);
    fn();
    assert.deepStrictEqual(calls, ["feedbackTimeline"]);
  });

  it("feedback without feedbackReturnScreen navigates to landing", () => {
    const calls = [];
    const setters = { setScreen: (v) => calls.push(["setScreen", v]), setSelectedStudent: (v) => calls.push(["setSelectedStudent", v]) };
    const fn = getBackNavigation("feedback", {}, setters);
    fn();
    assert.deepStrictEqual(calls, [["setSelectedStudent", null], ["setScreen", "landingPage"]]);
  });

  it("feedback with feedbackReturnScreen landingPage uses goLanding", () => {
    const calls = [];
    const setters = { setScreen: (v) => calls.push(["setScreen", v]), setSelectedStudent: (v) => calls.push(["setSelectedStudent", v]) };
    const fn = getBackNavigation("feedback", { feedbackReturnScreen: "landingPage" }, setters);
    fn();
    assert.deepStrictEqual(calls, [["setSelectedStudent", null], ["setScreen", "landingPage"]]);
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

describe("NO_HEADER_SCREENS", () => {
  it("is a Set", () => {
    assert.ok(NO_HEADER_SCREENS instanceof Set);
  });

  it("contains exactly landingPage, accessDenied, loading", () => {
    const expected = ["landingPage", "accessDenied", "loading"];
    assert.equal(NO_HEADER_SCREENS.size, expected.length);
    for (const s of expected) {
      assert.ok(NO_HEADER_SCREENS.has(s), `Expected NO_HEADER_SCREENS to contain "${s}"`);
    }
  });

  it("does not contain screens that need a header", () => {
    const headerScreens = ["classroomTimeline", "studentDashboard", "timeline", "settings", "childChat"];
    for (const s of headerScreens) {
      assert.ok(!NO_HEADER_SCREENS.has(s), `NO_HEADER_SCREENS should NOT contain "${s}"`);
    }
  });
});
