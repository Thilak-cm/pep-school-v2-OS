/**
 * Screen configuration extracted from App.jsx.
 * Provides page titles, back navigation, and FAB visibility
 * without any React dependencies (pure functions + data).
 */

// ── Page titles ────────────────────────────────────────────────────────────

const STATIC_TITLES = {
  profile: "Profile",
  stats: "Statistics",
  feedback: "Feedback & Suggestions",
  feedbackTimeline: "Feedback Dashboard",
  classroomNotesReview: "Review Classroom Notes",
  config: "Configurations",
  configLessonNotes: "Lesson Notes Config",
  configAiTools: "AI Tools",
  configDigest: "School Context Notes",
  bulkUpload: "Bulk Upload",
  aiTextEditor: "Text Cleanup Editor",
  aiVoiceEditor: "Voice Transcriber Editor",
  aiCoachEditor: "Coach Editor",
  chatCommandCentre: "Chat Command Centre",
  reportGenConfig: "Report Generation Config",
  graduateStudents: "Graduate Students",
  lessonNotes: "Adding Lesson Note",
  studentAliases: "My Student Groups",
  settings: "Settings",
  alerts: "Alerts",
  interviews: "Interviews",
  childChat: "Chat with Coach Pepper",
  broadcastComposer: "Broadcasts",
};

/**
 * Compute the page title for a given screen.
 * @param {string} screen
 * @param {object} state - { isTeacher, isSuperAdminUser, selectedClassroom,
 *   selectedStudent, timelineTitleAsDashboard, usersAccessView,
 *   getStudentDisplayName }
 */
export function getPageTitle(screen, state) {
  // Check static titles first
  if (STATIC_TITLES[screen]) return STATIC_TITLES[screen];

  switch (screen) {
    case "landingPage":
      return state.isTeacher
        ? "Teacher Panel"
        : state.isSuperAdminUser
          ? "Super Admin Panel"
          : "Classroom Admin Panel";

    case "classroomList":
      return state.isTeacher ? "My Classrooms" : "Classrooms & Students";

    case "classroomTimeline":
      return state.selectedClassroom?.name || "Classroom Timeline";

    case "studentDashboard":
      return `${state.getStudentDisplayName?.() || "Student"}'s Dashboard`;

    case "timeline":
      return state.timelineTitleAsDashboard
        ? `${state.getStudentDisplayName?.() || "Student"}'s Dashboard`
        : `${state.getStudentDisplayName?.() || "Student"}'s Timeline`;

    case "studentReportTypes":
      return `${state.getStudentDisplayName?.() || "Student"}'s Reports`;
    case "studentReports":
      return `${state.getStudentDisplayName?.() || "Student"}'s Reports`;

    case "addUser":
      if (state.usersAccessView === "add") return "Add Users";
      if (state.usersAccessView === "manage") return "Manage Users";
      return "Users & Access";

    default:
      return "";
  }
}

// ── Back navigation ────────────────────────────────────────────────────────

/**
 * Return a back-navigation handler for the given screen, or null if none.
 * @param {string} screen
 * @param {object} state - { studentDashboardReturnScreen, lessonNotesReturnScreen,
 *   usersAccessView }
 * @param {object} setters - { setScreen, setSelectedStudent, setUsersAccessView }
 */
export function getBackNavigation(screen, state, setters) {
  if (screen === "landingPage") return null;

  const goLanding = () => { setters.setSelectedStudent?.(null); setters.setScreen?.("landingPage"); };

  switch (screen) {
    case "classroomList":
      return goLanding;
    case "graduateStudents":
      return () => { setters.setScreen?.("addUser"); setters.setUsersAccessView?.("home"); };
    case "classroomTimeline":
      return () => {
        const returnTo = state.classroomTimelineReturnScreen || "classroomList";
        if (returnTo === "landingPage") {
          setters.setSelectedStudent?.(null);
        }
        setters.setScreen?.(returnTo);
      };
    case "studentDashboard":
      return () => setters.setScreen?.(state.studentDashboardReturnScreen || "classroomTimeline");
    case "timeline":
    case "childChat":
    case "studentReportTypes":
      return () => setters.setScreen?.("studentDashboard");
    case "studentReports":
      return () => setters.setScreen?.("studentReportTypes");
    case "profile":
      return () => setters.setScreen?.("settings");
    case "feedback": {
      const returnTo = state.feedbackReturnScreen || "landingPage";
      if (returnTo === "landingPage") return goLanding;
      return () => setters.setScreen?.(returnTo);
    }
    case "stats":
    case "classroomNotesReview":
    case "studentAliases":
    case "settings":
    case "alerts":
    case "interviews":
    case "feedbackTimeline":
      return goLanding;
    case "config":
      return () => setters.setScreen?.("settings");
    case "configLessonNotes":
    case "configAiTools":
    case "configDigest":
      return () => setters.setScreen?.("config");
    case "bulkUpload":
    case "broadcastComposer":
      return () => setters.setScreen?.("settings");
    case "aiTextEditor":
    case "aiVoiceEditor":
    case "aiCoachEditor":
    case "chatCommandCentre":
    case "reportGenConfig":
      return () => setters.setScreen?.("configAiTools");
    case "lessonNotes":
      return () => {
        const target = state.lessonNotesReturnScreen || "landingPage";
        if (target === "landingPage") setters.setSelectedStudent?.(null);
        setters.setScreen?.(target);
      };
    case "addUser":
      if (state.usersAccessView === "home") return goLanding;
      return () => setters.setUsersAccessView?.("home");
    default:
      return null;
  }
}

// ── FAB visibility ─────────────────────────────────────────────────────────

export const FAB_HIDDEN_SCREENS = new Set([
  "profile", "stats", "feedback", "feedbackTimeline",
  "accessDenied", "classroomNotesReview", "graduateStudents", "lessonNotes",
  "studentAliases", "settings", "addUser", "childChat", "config",
  "configLessonNotes", "configAiTools", "configDigest", "chatCommandCentre",
  "reportGenConfig", "bulkUpload", "alerts", "interviews", "broadcastComposer",
]);

// ── Footer tab mapping ─────────────────────────────────────────────────────

export const FOOTER_TAB_SCREENS = {
  landingPage: "home",
  settings: "settings",
  alerts: "alerts",
  interviews: "interviews",
};

// ── Header visibility ─────────────────────────────────────────────────────

export const NO_HEADER_SCREENS = new Set([
  "landingPage", "accessDenied", "loading",
]);

// ── Header / back-button visibility ────────────────────────────────────────

export const NO_BACK_BUTTON_SCREENS = new Set([
  "landingPage", "alerts", "interviews", "settings",
]);
