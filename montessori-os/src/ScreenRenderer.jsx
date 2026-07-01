import React from "react";
import { Box, CircularProgress } from "@mui/material";
import LandingPage from "./components/LandingPage";
import AIHomePage from "./components/AIHomePage.jsx";
import AITextCleanupEditor from "./components/AITextCleanupEditor.jsx";
import AIVoiceTranscriberEditor from "./components/AIVoiceTranscriberEditor.jsx";
import AICoachEditor from "./components/AICoachEditor.jsx";
import ChatCommandCentreEditor from "./components/ChatCommandCentreEditor.jsx";
import ClassroomList from "./components/ClassroomList";
import StudentTimeline from "./components/StudentTimeline";
import StudentDashboard from "./components/StudentDashboard";
import ChildChat from "./components/ChildChat";
import ReportsPage from "./components/ReportsPage";
import ReportTypeLandingPage from "./components/ReportTypeLandingPage";
import LessonNotesPage from "./components/LessonNotesPage";
import StudentAliasesPage from "./components/StudentAliasesPage";
import ClassroomTimeline from "./components/ClassroomTimeline";
import ProfilePage from "./components/ProfilePage";
import StatsPage from "./components/StatsPage";
import GraduateStudentsPage from "./components/GraduateStudentsPage.jsx";
import FeedbackPage from "./components/FeedbackPage";
import FeedbackTimeline from "./components/FeedbackTimeline";
import UsersAccessPage from "./components/UsersAccessPage";
import ReviewClassroomNotes from "./components/ReviewClassroomNotes";
import BaseballCardConfigEditor from "./components/BaseballCardConfigEditor.jsx";
import ReportGenConfigEditor from "./components/ReportGenConfigEditor.jsx";
import AccessDenied from "./AccessDenied";
import SettingsPage from "./components/SettingsPage.jsx";
import NotificationsPage from "./components/NotificationsPage.jsx";
import InterviewsPage from "./components/InterviewsPage.jsx";
import ConfigHomePage from "./components/ConfigHomePage.jsx";
import BulkUploadPage from "./components/BulkUploadPage.jsx";
import BroadcastComposer from "./components/BroadcastComposer.jsx";
import LessonNoteConfigEditor from "./components/LessonNoteConfigEditor.jsx";
import WeeklyDigestConfigEditor from "./components/WeeklyDigestConfigEditor.jsx";

/**
 * Renders the correct screen component based on the current `screen` value.
 * All required state and handlers are passed through the `ctx` prop.
 * Header rendering is handled by AppHeader in App.jsx.
 */
export default function ScreenRenderer({ screen, ctx }) {
  return renderScreen(screen, ctx);
}

function renderScreen(screen, ctx) {
  switch (screen) {
    case "landingPage":
      return (
        <LandingPage
          classrooms={ctx.classrooms}
          classroomsLoaded={ctx.classroomsLoaded}
          onViewClassrooms={() => ctx.setScreen("classroomList")}
          onSelectClassroom={(cls) => {
            ctx.setSelectedClassroom(cls);
            ctx.setClassroomTimelineReturnScreen("landingPage");
            ctx.setScreen("classroomTimeline");
          }}
          userRole={ctx.role}
          currentUser={ctx.user}
          onNavigateToFeedbackDashboard={() => ctx.setScreen("feedbackTimeline")}
          onNavigateToFeedback={() => { ctx.setFeedbackReturnScreen?.(null); ctx.setScreen("feedback"); }}
          onNavigateToClassroomNotes={() => ctx.setScreen("classroomNotesReview")}
          // TODO: ctaParams (alertId, etc.) not yet consumed — deep-linking to specific alerts is a follow-up
          onNavigate={(path, _params) => {
            if (path === "/stats") ctx.setScreen("stats");
            else if (path === "/addUser") ctx.setScreen("addUser");
            else if (path === "/aliases") ctx.setScreen("studentAliases");
            else if (path === "/config" && ctx.isSuperAdminUser) ctx.setScreen("config");
            // DIP alert CTA routing (PEP-296)
            else if (path === "alerts") ctx.setScreen("alerts");
            else if (path === "interviews") ctx.setScreen("interviews");
          }}
          onNavigateToStudent={({ studentId, studentName, classroomId }) => {
            ctx.setSelectedStudent({ id: studentId, displayName: studentName, classroomId });
            ctx.setStudentDashboardReturnScreen("landingPage");
            ctx.setStudentDashboardFlagOpen(true);
            ctx.setScreen("studentDashboard");
          }}
        />
      );

    case "classroomList":
      return (
        <ClassroomList
          classrooms={ctx.classrooms}
          onSelectClassroom={(cls) => {
            ctx.setSelectedClassroom(cls);
            ctx.setClassroomTimelineReturnScreen("classroomList");
            ctx.setScreen("classroomTimeline");
          }}
          currentUser={ctx.user}
          userRole={ctx.role}
          manageableClassrooms={ctx.manageableClassrooms}
          onNavigateToStudent={(student) => {
            ctx.setSelectedStudent(student);
            ctx.setStudentDashboardReturnScreen("classroomList");
            ctx.setStudentDashboardNoteType("textVoice");
            ctx.setScreen("studentDashboard");
          }}
        />
      );

    case "classroomTimeline":
      return (
        <ClassroomTimeline
          classroom={ctx.selectedClassroom}
          currentUser={ctx.user}
          userRole={ctx.role}
          manageableClassrooms={ctx.manageableClassrooms}
          onNavigateToStudent={(student) => {
            ctx.setSelectedStudent(student);
            ctx.setStudentDashboardReturnScreen("classroomTimeline");
            ctx.setStudentDashboardNoteType("textVoice");
            ctx.setScreen("studentDashboard");
          }}
        />
      );

    case "studentDashboard":
      return (
        <StudentDashboard
          student={ctx.selectedStudent}
          initialNoteType={ctx.studentDashboardNoteType}
          userRole={ctx.role}
          onOpenTimeline={(noteType) => {
            ctx.setTimelineFilter(noteType || null);
            ctx.setScreen("timeline");
          }}
          onOpenFeedback={ctx.openFeedbackWithMessage}
          onOpenChat={() => ctx.setScreen("childChat")}
          onOpenReports={() => ctx.setScreen("studentReportTypes")}
          onNavigateToManageStudent={ctx.isTeacher ? undefined : (studentId) => {
            ctx.setInitialStudentId(studentId);
            ctx.setUsersAccessView("manage");
            ctx.setScreen("addUser");
          }}
          initialFlagOpen={ctx.studentDashboardFlagOpen}
          onClearFlagOpen={() => ctx.setStudentDashboardFlagOpen(false)}
        />
      );

    case "studentReportTypes":
      return (
        <ReportTypeLandingPage
          onSelectType={(type) => {
            ctx.setReportTypeFilter(type);
            ctx.setScreen("studentReports");
          }}
          studentLabel={ctx.getStudentDisplayName(ctx.selectedStudent)}
          isSuperAdmin={ctx.isSuperAdminUser}
        />
      );

    case "studentReports":
      return (
        <ReportsPage
          studentId={ctx.selectedStudent?.id || ctx.selectedStudent?.uid}
          studentLabel={ctx.getStudentDisplayName(ctx.selectedStudent)}
          userRole={ctx.role}
          pendingViewReportId={ctx.pendingViewReportId}
          onPendingViewHandled={() => ctx.setPendingViewReportId(null)}
          reportTypeFilter={ctx.reportTypeFilter || 'term'}
        />
      );

    case "childChat":
      return (
        <ChildChat
          student={ctx.selectedStudent}
          startInLandingPage={true}
          currentRole={ctx.role}
        />
      );

    case "alerts":
      return <NotificationsPage />;

    case "interviews":
      return (
        <InterviewsPage
          currentUser={ctx.user}
          userRole={ctx.role}
          manageableClassrooms={ctx.manageableClassrooms}
        />
      );

    case "timeline":
      return (
        <StudentTimeline
          student={ctx.selectedStudent}
          currentUser={ctx.user}
          userRole={ctx.role}
          noteTypeFilter={ctx.timelineFilter}
        />
      );

    case "lessonNotes":
      return (
        <LessonNotesPage
          currentUser={ctx.user}
          userRole={ctx.role}
          initialClassroomId={ctx.lessonNoteInitialSelection.classroomId}
          initialStudentId={ctx.lessonNoteInitialSelection.studentId}
          editObservation={ctx.lessonNoteEditObservation}
          onClose={() => {
            ctx.setLessonNoteEditObservation(null);
            ctx.setScreen(ctx.lessonNotesReturnScreen || "timeline");
          }}
          onSaved={ctx.handleLessonNotesSaved}
        />
      );

    case "studentAliases":
      return <StudentAliasesPage currentUser={ctx.user} userRole={ctx.role} />;

    case "profile":
      return <ProfilePage user={ctx.user} role={ctx.role} />;

    case "stats":
      return (
        <StatsPage
          user={ctx.user}
          role={ctx.role}
          manageableClassrooms={ctx.manageableClassrooms}
          onNavigateToStudent={(student) => {
            ctx.setSelectedStudent(student);
            ctx.setStudentDashboardReturnScreen("stats");
            ctx.setStudentDashboardNoteType("textVoice");
            ctx.setScreen("studentDashboard");
          }}
          onNavigateToBaseballCard={(student) => {
            ctx.setSelectedStudent(student);
            ctx.setStudentDashboardReturnScreen("stats");
            ctx.setStudentDashboardNoteType("textVoice");
            ctx.setScreen("studentDashboard");
          }}
        />
      );

    case "graduateStudents":
      return <GraduateStudentsPage currentUser={ctx.user} userRole={ctx.role} />;

    case "feedback":
      return (
        <FeedbackPage
          currentUser={ctx.user}
          userRole={ctx.role}
          prefilledMessage={ctx.prefilledFeedback}
          onNavigateToAdminDashboard={() => ctx.setScreen("feedbackTimeline")}
        />
      );

    case "feedbackTimeline":
      return (
        <FeedbackTimeline
          currentUser={ctx.user}
          userRole={ctx.role}
          onNavigateToFeedback={() => {
            ctx.setFeedbackReturnScreen?.('feedbackTimeline');
            ctx.setScreen('feedback');
          }}
        />
      );

    case "addUser":
      return (
        <UsersAccessPage
          currentUser={ctx.user}
          userRole={ctx.role}
          manageableClassrooms={ctx.manageableClassrooms}
          view={ctx.usersAccessView}
          onViewChange={ctx.setUsersAccessView}
          onNavigateGraduate={() => ctx.setScreen("graduateStudents")}
          initialStudentId={ctx.initialStudentId}
          onInitialStudentHandled={() => ctx.setInitialStudentId(null)}
        />
      );

    case "classroomNotesReview":
      return (
        <ReviewClassroomNotes
          currentUser={ctx.user}
          userRole={ctx.role}
          manageableClassrooms={ctx.manageableClassrooms}
        />
      );

    case "settings":
      return (
        <SettingsPage
          user={ctx.user}
          userRole={ctx.role}
          classrooms={ctx.classrooms}
          onNavigate={ctx.handleNavigation}
          onSignOut={ctx.handleSignOut}
        />
      );

    case "config":
      return (
        <ConfigHomePage
          userRole={ctx.role}
          onOpenLessonNoteConfig={() => ctx.setScreen("configLessonNotes")}
          onOpenAiTools={() => ctx.setScreen("configAiTools")}
          onOpenDigestConfig={() => ctx.setScreen("configDigest")}
        />
      );

    case "configLessonNotes":
      return <LessonNoteConfigEditor currentUser={ctx.user} userRole={ctx.role} />;

    case "configDigest":
      return <WeeklyDigestConfigEditor userRole={ctx.role} />;

    case "bulkUpload":
      return <BulkUploadPage currentUser={ctx.user} userRole={ctx.role} />;

    case "broadcastComposer":
      return <BroadcastComposer currentUser={ctx.user} userRole={ctx.role} deepLinkBroadcastId={ctx.broadcastDeepLink} onDeepLinkConsumed={() => ctx.setBroadcastDeepLink?.(null)} />;

    case "configAiTools":
      return (
        <AIHomePage
          userRole={ctx.role}
          onOpenTextEditor={() => ctx.setScreen("aiTextEditor")}
          onOpenVoiceEditor={() => ctx.setScreen("aiVoiceEditor")}
          onOpenCoachEditor={() => ctx.setScreen("aiCoachEditor")}
          onOpenBaseballCardConfig={() => ctx.setScreen("baseballCardConfig")}
          onOpenChatCommandCentre={() => ctx.setScreen("chatCommandCentre")}
          onOpenReportGenConfig={() => ctx.setScreen("reportGenConfig")}
        />
      );

    case "baseballCardConfig":
      return <BaseballCardConfigEditor currentUser={ctx.user} userRole={ctx.role} />;

    case "aiTextEditor":
      return <AITextCleanupEditor currentUser={ctx.user} userRole={ctx.role} />;

    case "aiVoiceEditor":
      return <AIVoiceTranscriberEditor currentUser={ctx.user} userRole={ctx.role} />;

    case "aiCoachEditor":
      return <AICoachEditor currentUser={ctx.user} userRole={ctx.role} />;

    case "chatCommandCentre":
      return <ChatCommandCentreEditor currentUser={ctx.user} userRole={ctx.role} />;

    case "reportGenConfig":
      return <ReportGenConfigEditor currentUser={ctx.user} userRole={ctx.role} />;

    case "accessDenied":
      return <AccessDenied userEmail={ctx.user?.email} onSignOut={ctx.handleSignOut} />;

    case "loading":
      return (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
          <CircularProgress />
        </Box>
      );

    default:
      return null;
  }
}
