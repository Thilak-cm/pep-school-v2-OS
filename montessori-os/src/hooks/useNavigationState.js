import { useState } from 'react';

/**
 * Custom hook that groups all navigation-related state for App.jsx.
 * Pure refactor — no behavior changes from PEP-161.
 *
 * @returns {Object} Navigation state values and their setters.
 */
export const useNavigationState = () => {
  const [screen, setScreen] = useState('loading');
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [usersAccessView, setUsersAccessView] = useState('home');
  const [studentDashboardReturnScreen, setStudentDashboardReturnScreen] = useState('classroomTimeline');
  const [studentDashboardNoteType, setStudentDashboardNoteType] = useState('textVoice');
  const [timelineFilter, setTimelineFilter] = useState(null);
  const [lessonNotesReturnScreen, setLessonNotesReturnScreen] = useState('timeline');
  const [lessonNoteInitialSelection, setLessonNoteInitialSelection] = useState({ classroomId: null, studentId: null });
  const [lessonNoteEditObservation, setLessonNoteEditObservation] = useState(null);
  const [timelineTitleAsDashboard, setTimelineTitleAsDashboard] = useState(false);
  const [pendingViewReportId, setPendingViewReportId] = useState(null);

  return {
    screen, setScreen,
    selectedClassroom, setSelectedClassroom,
    selectedStudent, setSelectedStudent,
    usersAccessView, setUsersAccessView,
    studentDashboardReturnScreen, setStudentDashboardReturnScreen,
    studentDashboardNoteType, setStudentDashboardNoteType,
    timelineFilter, setTimelineFilter,
    lessonNotesReturnScreen, setLessonNotesReturnScreen,
    lessonNoteInitialSelection, setLessonNoteInitialSelection,
    lessonNoteEditObservation, setLessonNoteEditObservation,
    timelineTitleAsDashboard, setTimelineTitleAsDashboard,
    pendingViewReportId, setPendingViewReportId,
  };
};

export default useNavigationState;
