import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import SignIn from "./SignIn";
import AppHeader from "./AppHeader";
import AppFooter from "./AppFooter";
import LandingPage from "./components/LandingPage";
import AIHomePage from "./components/AIHomePage.jsx";
import AITextCleanupEditor from "./components/AITextCleanupEditor.jsx";
import AIVoiceTranscriberEditor from "./components/AIVoiceTranscriberEditor.jsx";
import AICoachEditor from "./components/AICoachEditor.jsx";
import ChatCommandCentreEditor from "./components/ChatCommandCentreEditor.jsx";
import ClassroomList from "./components/ClassroomList";
import StudentList from "./components/StudentList";
import StudentTimeline from "./components/StudentTimeline";
import StudentDashboard from "./components/StudentDashboard";
import StudentStatsPage from "./components/StudentStatsPage";
import ChildChat from "./components/ChildChat";
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
import app, { db, cloudFunctions } from "./firebase";
import { setAnalyticsUserId, setUserProperty, setAppVersionProperty } from './utils/analytics';
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from 'firebase/functions';
import { 
  Box, 
  Typography, 
  CircularProgress, 
  Card
} from "@mui/material";
import AccessDenied from './AccessDenied';
import AddNoteFab from './components/AddNoteFab';
import AddNoteModal from './components/AddNoteModal';
import UpdateNotification from './components/UpdateNotification';
import { NotificationProvider } from './notifications/NotificationContext.jsx';
import NotificationStack from './notifications/NotificationStack.jsx';
import { isSuperAdmin } from './utils/roleUtils';
import SettingsPage from './components/SettingsPage.jsx';
import NotificationsPage, { clearNotificationsCache } from './components/NotificationsPage.jsx';
import ConfigHomePage from './components/ConfigHomePage.jsx';
import LessonNoteConfigEditor from './components/LessonNoteConfigEditor.jsx';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null); // 'superadmin' | 'classroomadmin' | 'teacher'
  const [manageableClassrooms, setManageableClassrooms] = useState([]); // classroomIds scoped for classroom admins
  const [screen, setScreen] = useState('loading'); // 'loading' | 'landingPage' | 'classroomList' | 'classroomTimeline' | 'studentList' | 'studentDashboard' | 'studentStats' | 'timeline' | 'childChat' | 'profile' | 'stats' | 'feedback' | 'feedbackTimeline' | 'addUser' | 'graduateStudents' | 'classroomNotesReview' | 'config' | 'configLessonNotes' | 'configAiTools' | 'aiTextEditor' | 'aiVoiceEditor' | 'aiCoachEditor' | 'chatCommandCentre' | 'studentAliases' | 'settings' | 'notifications' | 'baseballCardConfig'
  const [usersAccessView, setUsersAccessView] = useState('home'); // 'home' | 'add' | 'manage'
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState(null);
  const [lessonNotesReturnScreen, setLessonNotesReturnScreen] = useState('timeline');
  const [studentDashboardReturnScreen, setStudentDashboardReturnScreen] = useState('classroomTimeline');
  const [studentDashboardNoteType, setStudentDashboardNoteType] = useState('textVoice');
  const [lessonNoteInitialSelection, setLessonNoteInitialSelection] = useState({ classroomId: null, studentId: null });
  const [lessonNoteEditObservation, setLessonNoteEditObservation] = useState(null);

  // Global navigation: allow notifications to navigate to a student's Notes page
  const [timelineTitleAsDashboard, setTimelineTitleAsDashboard] = useState(false);
  const [prefilledFeedback, setPrefilledFeedback] = useState('');

  const isTeacher = role === 'teacher';
  const isSuperAdminUser = isSuperAdmin(role);

  const openTimeline = (filter = null) => {
    setTimelineFilter(filter);
    setScreen('timeline');
  };

  const openLessonNotesScreen = () => {
    setLessonNotesReturnScreen(screen);
    setLessonNoteEditObservation(null);
    const targetStudentId = selectedStudent?.id || null;
    const targetClassroomId = selectedStudent?.classroomId || selectedClassroom?.id || null;
    setLessonNoteInitialSelection({ classroomId: targetClassroomId, studentId: targetStudentId });
    setScreen('lessonNotes');
  };

  const handleLessonNotesSaved = (info) => {
    setLessonNoteEditObservation(null);
    if (info?.studentId) {
      setSelectedStudent((prev) => prev?.id === info.studentId ? prev : { ...(prev || {}), id: info.studentId });
      // Navigate to student dashboard showing lesson notes
      setStudentDashboardNoteType('lesson');
      setStudentDashboardReturnScreen(lessonNotesReturnScreen || 'classroomTimeline');
      setScreen('studentDashboard');
    } else {
      // Fallback: return to previous screen if no studentId
      const targetScreen = lessonNotesReturnScreen || 'timeline';
      setScreen(targetScreen);
    }
  };

  const openFeedbackWithMessage = (message = '') => {
    setPrefilledFeedback(message || '');
    setScreen('feedback');
  };

  useEffect(() => {
    const handleNavigateToStudentNotes = (e) => {
      try {
        const detail = e?.detail || {};
        const studentId = detail.studentId || detail?.student?.id;
        if (!studentId) return;
        if (detail.lessonEditObservation) {
          setLessonNotesReturnScreen(screen);
          setLessonNoteEditObservation(detail.lessonEditObservation);
          setLessonNoteInitialSelection({
            classroomId: detail.lessonEditObservation.classroomId || null,
            studentId,
          });
          setSelectedStudent(detail.student || { id: studentId });
          setScreen('lessonNotes');
          return;
        }
        const studentLike = detail.student || { id: studentId };
        setSelectedStudent(studentLike);
        const noteTypeFilter = detail.noteTypeFilter ?? null;
        if (noteTypeFilter === 'lesson') {
          setStudentDashboardNoteType('lesson');
          setScreen('studentDashboard');
        } else if (noteTypeFilter === 'textVoice') {
          setStudentDashboardNoteType('textVoice');
          setScreen('studentDashboard');
        } else {
          setStudentDashboardNoteType('textVoice');
          setScreen('studentDashboard');
        }
        if (detail.titleAsDashboard) setTimelineTitleAsDashboard(true);

        // Best effort: fetch full student profile to populate names for header/dialogs
        // Only fetch if we don't already have a name/displayName/firstName
        const hasName = !!(studentLike?.name || studentLike?.displayName || studentLike?.firstName || studentLike?.lastName);
        if (!hasName) {
          (async () => {
            try {
              const ref = doc(db, 'students', studentId);
              const snap = await getDoc(ref);
              if (snap.exists()) {
                const data = snap.data() || {};
                setSelectedStudent({ id: studentId, ...data });
              }
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn('Failed to load student details for header:', err);
            }
          })();
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Navigation event error', err);
      }
    };
    window.addEventListener('navigateToStudentNotes', handleNavigateToStudentNotes);
    return () => window.removeEventListener('navigateToStudentNotes', handleNavigateToStudentNotes);
  }, []);

  // Reset title override when leaving timeline
  useEffect(() => {
    if (screen !== 'timeline' && timelineTitleAsDashboard) {
      setTimelineTitleAsDashboard(false);
    }
  }, [screen, timelineTitleAsDashboard]);

  // Reset studentDashboard return screen when entering classroomList
  useEffect(() => {
    if (screen === 'classroomList') {
      setStudentDashboardReturnScreen('classroomList');
    }
  }, [screen]);

  useEffect(() => {
    // Record app version as a user property (persists across events)
    setAppVersionProperty();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      // Best-effort associate analytics with the signed-in user
      if (currentUser?.uid) {
        setAnalyticsUserId(currentUser.uid);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Clear notifications cache on login (user change)
    clearNotificationsCache();

    const validateAccess = async () => {
      // Domain check - allow multiple domains
      const allowedDomains = ['@pepschoolv2.com', '@ribbons.education', '@accelschool.in'];
      const emailLower = user.email.toLowerCase();
      if (!allowedDomains.some(domain => emailLower.endsWith(domain))) {
        setUnauthorized(true);
        setScreen('accessDenied');
        return;
      }

      try {
        // Look up by UID (authoritative) instead of email query to avoid case/alias issues
        const userRef = doc(db, 'users', user.uid);
        let userSnap = await getDoc(userRef);
        
        // If not found by UID, try migration via Cloud Function (for pending users)
        if (!userSnap.exists()) {
          try {
            const migrateFn = httpsCallable(cloudFunctions, 'migratePendingUser');
            const migrateResult = await migrateFn({});
            
            if (migrateResult.data?.ok && migrateResult.data?.migrated) {
              // Re-fetch the migrated doc
              userSnap = await getDoc(userRef);
            } else if (migrateResult.data?.ok === false) {
              // No pending user found
            } else {
              // Migration didn't happen, but no error - re-fetch to be sure
              userSnap = await getDoc(userRef);
            }
          } catch (migrateErr) {
            console.error('[Migration] Failed to migrate pending user:', migrateErr);
            // Continue to check if doc exists (might have been migrated by another process)
            try {
              userSnap = await getDoc(userRef);
            } catch (refetchErr) {
              console.error('[Migration] Failed to re-fetch user doc:', refetchErr);
              // userSnap remains as the original (non-existent) snapshot
            }
          }
        }
        
        // Ensure userSnap is valid before checking exists()
        if (!userSnap || !userSnap.exists()) {
          setUnauthorized(true);
          setScreen('accessDenied');
          return;
        }
        const userDoc = userSnap.data();
        if (!userDoc.role) {
          setUnauthorized(true);
          setScreen('accessDenied');
          return;
        }
        // Normalize manageableClassrooms to classroom document IDs.
        // Some older records may store full paths like "classrooms/abc" or doc-ref-ish objects.
        const normalizeClassroomId = (value) => {
          if (!value) return null;
          if (typeof value === 'string') {
            const parts = String(value).trim().split('/').filter(Boolean);
            return parts.length ? parts[parts.length - 1] : null;
          }
          if (typeof value === 'object') {
            if (typeof value.id === 'string') return value.id.trim();
            if (typeof value.path === 'string') {
              const parts = String(value.path).trim().split('/').filter(Boolean);
              return parts.length ? parts[parts.length - 1] : null;
            }
          }
          return null;
        };

        const rawManageable = Array.isArray(userDoc.manageableClassrooms) ? userDoc.manageableClassrooms : [];
        const userManageableClassrooms = Array.from(
          new Set(rawManageable.map(normalizeClassroomId).filter(Boolean))
        );
        // Classroom admins must have manageableClassrooms; surface hard failure if missing to avoid silent permission errors
        if (userDoc.role === 'classroomadmin' && userManageableClassrooms.length === 0) {
          console.error('Classroom admin missing manageableClassrooms');
          alert('Your classroom access is not configured. Please ask a super admin to add manageable classrooms to your account.');
          setUnauthorized(true);
          setScreen('accessDenied');
          return;
        }
        setRole(userDoc.role);
        setManageableClassrooms(userManageableClassrooms);
        // Persist role as a user property for analytics breakdowns
        setUserProperty('role', userDoc.role);
        // Allow both 'teacher' and 'other' to proceed to app; finer gating handled by rules/UI
        setScreen('landingPage');
      } catch (err) {
        console.error('Access validation error', err);
        setUnauthorized(true);
        setScreen('accessDenied');
      }
    };

    validateAccess();
  }, [user]);

  useEffect(() => {
    if (screen !== 'feedback') {
      setPrefilledFeedback('');
    }
  }, [screen]);

  const handleSignOut = async () => {
    try {
      // Clear analytics user_id to avoid linking anonymous sessions
      setAnalyticsUserId(null);
      setRole(null);
      setManageableClassrooms([]);
      // Clear notifications cache on logout
      clearNotificationsCache();
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Derive a readable student name for headers and UI
  const getStudentDisplayName = (studentLike) => {
    if (!studentLike) return 'Student';
    const composedName = [studentLike?.firstName, studentLike?.lastName]
      .filter(Boolean)
      .join(' ');
    return (
      studentLike?.name ||
      studentLike?.displayName ||
      composedName ||
      'Student'
    );
  };

  // Extract student's first name for dashboard title
  const getStudentFirstName = (studentLike) => {
    if (!studentLike) return 'Student';
    if (studentLike?.firstName) return studentLike.firstName;
    const name = studentLike?.name || studentLike?.displayName || [studentLike?.firstName, studentLike?.lastName].filter(Boolean).join(' ');
    return (name || 'Student').split(' ')[0];
  };

  // Determine page title
  let pageTitle = '';
  if (screen === 'landingPage') pageTitle = isTeacher ? 'Teacher Panel' : (isSuperAdminUser ? 'Super Admin Panel' : 'Classroom Admin Panel');
  else if (screen === 'classroomList') pageTitle = isTeacher ? 'My Classrooms' : 'Classrooms & Students';
  else if (screen === 'classroomTimeline') pageTitle = selectedClassroom?.name || 'Classroom Timeline';
  else if (screen === 'studentList') pageTitle = `${selectedClassroom?.name || 'Classroom'} Students`;
  else if (screen === 'studentDashboard') pageTitle = `${getStudentDisplayName(selectedStudent)}'s Dashboard`;
  else if (screen === 'timeline') pageTitle = timelineTitleAsDashboard
    ? `${getStudentDisplayName(selectedStudent)}'s Dashboard`
    : `${getStudentDisplayName(selectedStudent)}'s Timeline`;
  else if (screen === 'profile') pageTitle = 'Profile';
  else if (screen === 'stats') pageTitle = 'Statistics';
  else if (screen === 'feedback') pageTitle = 'Feedback & Suggestions';
  else if (screen === 'feedbackTimeline') pageTitle = 'Feedback Dashboard';
  else if (screen === 'addUser') {
    if (usersAccessView === 'add') pageTitle = 'Add Users';
    else if (usersAccessView === 'manage') pageTitle = 'Manage Users';
    else pageTitle = 'Users & Access';
  }
  else if (screen === 'classroomNotesReview') pageTitle = 'Review Classroom Notes';
  else if (screen === 'config') pageTitle = 'Configurations';
  else if (screen === 'configLessonNotes') pageTitle = 'Lesson Notes Config';
  else if (screen === 'configAiTools') pageTitle = 'AI Tools';
  else if (screen === 'baseballCardConfig') pageTitle = 'Baseball Card Config';
  else if (screen === 'aiTextEditor') pageTitle = 'Text Cleanup Editor';
  else if (screen === 'aiVoiceEditor') pageTitle = 'Voice Transcriber Editor';
  else if (screen === 'aiCoachEditor') pageTitle = 'Coach Editor';
  else if (screen === 'chatCommandCentre') pageTitle = 'Chat Command Centre';
  else if (screen === 'graduateStudents') pageTitle = 'Graduate Students';
  else if (screen === 'lessonNotes') pageTitle = 'Adding Lesson Note';
  else if (screen === 'studentAliases') pageTitle = 'My Student Groups';
  else if (screen === 'settings') pageTitle = 'Settings';
  else if (screen === 'notifications') pageTitle = 'Notifications';
  else if (screen === 'studentStats') {
    const studentName = selectedStudent?.displayName || selectedStudent?.name ||
                       `${selectedStudent?.firstName || ''} ${selectedStudent?.lastName || ''}`.trim() || 'Student';
    pageTitle = `${studentName}'s Stats`;
  }
  else if (screen === 'childChat') {
    pageTitle = 'Chat with Coach Pepper';
  }

  // Determine back navigation for header
  const getBackNavigation = () => {
    if (screen === 'landingPage') return null;
    
    switch (screen) {
      case 'classroomList':
        return () => setScreen('landingPage');
      case 'graduateStudents':
        return () => {
          setScreen('addUser');
          setUsersAccessView('home');
        };
      case 'classroomTimeline':
        return () => setScreen('classroomList');
      case 'studentList':
        return () => setScreen('classroomList');
      case 'studentDashboard':
        return () => setScreen(studentDashboardReturnScreen || 'classroomTimeline');
      case 'studentStats':
        return () => setScreen('studentDashboard');
      case 'timeline':
        return () => setScreen('studentDashboard');
      case 'childChat':
        return () => setScreen('studentDashboard');
      case 'profile':
        return () => setScreen('settings');
      case 'stats':
      case 'feedback':
      case 'classroomNotesReview':
      case 'config':
        return () => setScreen('landingPage');
      case 'configLessonNotes':
      case 'configAiTools':
        return () => setScreen('config');
      case 'baseballCardConfig':
        return () => setScreen('configAiTools');
      case 'aiTextEditor':
        return () => setScreen('configAiTools');
      case 'aiVoiceEditor':
        return () => setScreen('configAiTools');
      case 'aiCoachEditor':
        return () => setScreen('configAiTools');
      case 'chatCommandCentre':
        return () => setScreen('configAiTools');
      case 'studentAliases':
        return () => setScreen('landingPage');
      case 'settings':
        return () => setScreen('landingPage');
      case 'notifications':
        return () => setScreen('landingPage');
      case 'lessonNotes':
        return () => setScreen(lessonNotesReturnScreen || 'landingPage');
      case 'addUser':
        // Handle UsersAccessPage internal navigation
        if (usersAccessView === 'home') {
          return () => setScreen('landingPage');
        } else {
          return () => setUsersAccessView('home');
        }
      case 'feedbackTimeline':
        return () => setScreen('landingPage');
      default:
        return null;
    }
  };

  const backNavigation = getBackNavigation();
  const showBackButton = screen !== 'landingPage' && screen !== 'notifications' && screen !== 'settings';
  const handleNavigation = (path) => {
    if (path === 'settings') {
      setScreen('settings');
      return;
    }
    if (path === 'notifications') {
      setScreen('notifications');
      return;
    }

    if (path === '/profile') {
      setScreen('profile');
    } else if (path === '/stats') {
      setScreen('stats');
    } else if (path === '/feedback') {
      setScreen('feedback');
    } else if (path === '/addUser') {
      setScreen('addUser');
    } else if (path === '/aliases') {
      setScreen('studentAliases');
    } else if (path === '/config') {
      if (isSuperAdminUser) setScreen('config');
    }
  };

  const handleHome = () => {
    setScreen('landingPage');
  };

  // Mobile-first responsive container
  return (
    <>
      <Box
        sx={{
          minHeight: '100vh',
          width: '100vw',
          maxWidth: '100vw',
          overflowX: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8fafc',
        }}
      >
        <Box
          sx={{
            // Mobile: use viewport dimensions but allow scrolling
            width: { xs: '100vw', sm: '420px' },
            maxWidth: { xs: '100vw', sm: '420px' },
            minHeight: { xs: '100vh', sm: '800px' },
            maxHeight: { xs: 'none', sm: '90vh' },
            backgroundColor: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflowX: 'hidden',
            // Removed overflow: 'auto' from here - it breaks sticky positioning
            
            // Desktop: add shadow and border radius
            '@media (min-width: 600px)': {
              borderRadius: '24px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            }
          }}
        >
          <NotificationProvider>
            <NotificationStack />
          {/* Loading State */}
          {loading && (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: 3,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3
                }}
              >
                <CircularProgress
                  size={40}
                  sx={{ 
                    color: '#4f46e5',
                    '& .MuiCircularProgress-circle': {
                      strokeLinecap: 'round',
                    }
                  }}
                />
                <Typography variant="body1" sx={{ color: '#64748b' }}>
                  Coach Pepper is getting things ready...
                </Typography>
              </Box>
            </Box>
          )}

          {/* Unauthenticated State */}
          {!loading && !user && (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: 3,
                position: 'relative',
              }}
            >
              <Card
                sx={{
                  borderRadius: '16px',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                  padding: { xs: '32px 24px', sm: '48px 32px' },
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: '100%',
                  maxWidth: '350px',
                  backgroundColor: 'white'
                }}
              >
                <Box
                  component="img"
                  src="/pep-logo.png"
                  alt="Pep School Logo"
                  sx={{
                    width: { xs: '100px', sm: '120px' },
                    height: { xs: '100px', sm: '120px' },
                    marginBottom: '32px',
                    filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))'
                  }}
                />
                <Typography
                  variant="h3"
                  component="h1"
                  sx={{
                    color: '#1e293b',
                    marginBottom: '20px',
                    fontSize: { xs: '1.75rem', sm: '2rem' },
                    fontWeight: '700',
                    lineHeight: '1.2',
                    textAlign: 'center',
                  }}
                >
                  Welcome to Pep School V2 OS!
                </Typography>
                <Typography
                  variant="body1"
                  sx={{
                    color: '#64748b',
                    marginBottom: '40px',
                    fontSize: { xs: '1rem', sm: '1.1rem' },
                    lineHeight: '1.6',
                    textAlign: 'center',
                  }}
                >
                  Streamline your teaching workflow
                </Typography>
                <SignIn />
              </Card>
            </Box>
          )}

          {/* Authenticated State */}
          {!loading && user && (
            <>
              {/* Sticky Header (outside scrollable content) */}
              {screen !== 'accessDenied' && (
                <AppHeader 
                  title={pageTitle}
                  onBack={backNavigation}
                  showBackButton={showBackButton}
                />
              )}

              {/* Scrollable Main Content */}
              <Box
                sx={{
                  flex: 1,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  paddingTop: { 
                    xs: 'calc(64px + env(safe-area-inset-top, 0px))', 
                    sm: '64px' 
                  }, // Account for fixed header + safe area on mobile
                }}
              >
                <Box
                  sx={{
                    padding: { xs: 2, sm: 3 },
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 'fit-content',
                    pb: { xs: 12, sm: 12 },
                    width: '100%',
                    maxWidth: '100%',
                    overflowX: 'hidden',
                    boxSizing: 'border-box',
                  }}
                >
                                    {screen === 'landingPage' && (
                    <LandingPage
                      onViewClassrooms={() => setScreen('classroomList')}
                      userRole={role}
                      currentUser={user}
                      onNavigateToFeedbackDashboard={() => setScreen('feedbackTimeline')}
                      onNavigateToFeedback={() => setScreen('feedback')}
                      onNavigateToClassroomNotes={() => setScreen('classroomNotesReview')}
                      onNavigate={(path) => {
                        if (path === '/stats') {
                          setScreen('stats');
                        } else if (path === '/addUser') {
                          setScreen('addUser');
                        } else if (path === '/aliases') {
                          setScreen('studentAliases');
                        } else if (path === '/config') {
                          if (isSuperAdminUser) setScreen('config');
                        }
                      }}
                    />
                  )}

                  {screen === 'classroomList' && (
                    <>
                  <ClassroomList
                    onSelectClassroom={(cls) => {
                      setSelectedClassroom(cls);
                      setScreen('classroomTimeline');
                    }}
                    currentUser={user}
                    userRole={role}
                    manageableClassrooms={manageableClassrooms}
                    onNavigateToStudent={(student) => {
                      setSelectedStudent(student);
                      setStudentDashboardReturnScreen('classroomList');
                      setStudentDashboardNoteType('textVoice');
                      setScreen('studentDashboard');
                    }}
                  />
                    </>
                  )}

                  {screen === 'classroomTimeline' && (
                  <ClassroomTimeline
                    classroom={selectedClassroom}
                    currentUser={user}
                    userRole={role}
                    manageableClassrooms={manageableClassrooms}
                    onNavigateToStudent={(student) => {
                      setSelectedStudent(student);
                      setStudentDashboardReturnScreen('classroomTimeline');
                      setStudentDashboardNoteType('textVoice');
                      setScreen('studentDashboard');
                    }}
                  />
                  )}

                  {screen === 'studentList' && (
                    <StudentList
                      classroom={selectedClassroom}
                    onSelectStudent={(stu) => {
                      setSelectedStudent(stu);
                      setStudentDashboardReturnScreen('studentList');
                      setStudentDashboardNoteType('textVoice');
                      setScreen('studentDashboard');
                    }}
                  />
                  )}

                  {screen === 'studentDashboard' && (
                    <StudentDashboard
                      student={selectedStudent}
                      initialNoteType={studentDashboardNoteType}
                      onOpenTimeline={(noteType) => {
                        setTimelineFilter(noteType || null);
                        setScreen('timeline');
                      }}
                      onOpenStats={() => setScreen('studentStats')}
                      onOpenFeedback={openFeedbackWithMessage}
                      onOpenChat={() => {
                        setScreen('childChat');
                      }}
                    />
                  )}

                  {screen === 'studentStats' && (
                    <StudentStatsPage
                      student={selectedStudent}
                    />
                  )}

                  {screen === 'childChat' && (
                    <ChildChat
                      student={selectedStudent}
                      startInLandingPage={true}
                    />
                  )}

                  {screen === 'notifications' && (
                    <NotificationsPage />
                  )}

                  {screen === 'timeline' && (
                    <StudentTimeline
                      student={selectedStudent}
                      currentUser={user}
                      userRole={role}
                      noteTypeFilter={timelineFilter}
                    />
                  )}

                  {screen === 'lessonNotes' && (
                    <LessonNotesPage
                      currentUser={user}
                      userRole={role}
                      initialClassroomId={lessonNoteInitialSelection.classroomId}
                      initialStudentId={lessonNoteInitialSelection.studentId}
                      editObservation={lessonNoteEditObservation}
                      onClose={() => {
                        setLessonNoteEditObservation(null);
                        setScreen(lessonNotesReturnScreen || 'timeline');
                      }}
                      onSaved={handleLessonNotesSaved}
                    />
                  )}

                  {screen === 'studentAliases' && (
                    <StudentAliasesPage
                      currentUser={user}
                      userRole={role}
                    />
                  )}



                  {screen === 'profile' && (
                    <ProfilePage
                      user={user}
                      role={role}
                    />
                  )}

                  {screen === 'stats' && (
                  <StatsPage
                    user={user}
                    role={role}
                    manageableClassrooms={manageableClassrooms}
                    onNavigateToStudent={(student) => {
                      setSelectedStudent(student);
                      setStudentDashboardReturnScreen('stats');
                      setStudentDashboardNoteType('textVoice');
                      setScreen('studentDashboard');
                    }}
                    onNavigateToBaseballCard={(student) => {
                      setSelectedStudent(student);
                      setStudentDashboardReturnScreen('stats');
                      setStudentDashboardNoteType('textVoice');
                      setScreen('studentDashboard');
                    }}
                  />
                  )}

                  {screen === 'graduateStudents' && (
                    <GraduateStudentsPage currentUser={user} userRole={role} />
                  )}

                  {screen === 'feedback' && (
                    <FeedbackPage
                      currentUser={user}
                      userRole={role}
                      prefilledMessage={prefilledFeedback}
                      onNavigateToAdminDashboard={() => setScreen('feedbackTimeline')}
                    />
                  )}

                  {screen === 'feedbackTimeline' && (
                    <FeedbackTimeline
                      currentUser={user}
                      userRole={role}
                    />
                  )}

                  {screen === 'addUser' && (
                  <UsersAccessPage
                    currentUser={user}
                    userRole={role}
                    manageableClassrooms={manageableClassrooms}
                    view={usersAccessView}
                    onViewChange={setUsersAccessView}
                    onNavigateGraduate={() => setScreen('graduateStudents')}
                  />
                  )}

                  {screen === 'classroomNotesReview' && (
                    <ReviewClassroomNotes
                      currentUser={user}
                    />
                  )}

                  {screen === 'settings' && (
                    <SettingsPage
                      currentUser={user}
                      userRole={role}
                      onNavigate={handleNavigation}
                      onSignOut={handleSignOut}
                    />
                  )}

                  {screen === 'config' && (
                    <ConfigHomePage
                      userRole={role}
                      onOpenLessonNoteConfig={() => setScreen('configLessonNotes')}
                      onOpenAiTools={() => setScreen('configAiTools')}
                    />
                  )}

                  {screen === 'configLessonNotes' && (
                    <LessonNoteConfigEditor
                      currentUser={user}
                      userRole={role}
                    />
                  )}

                  {screen === 'configAiTools' && (
                    <AIHomePage
                      userRole={role}
                      onOpenTextEditor={() => setScreen('aiTextEditor')}
                      onOpenVoiceEditor={() => setScreen('aiVoiceEditor')}
                      onOpenCoachEditor={() => setScreen('aiCoachEditor')}
                      onOpenBaseballCardConfig={() => setScreen('baseballCardConfig')}
                      onOpenChatCommandCentre={() => setScreen('chatCommandCentre')}
                    />
                  )}

                  {screen === 'baseballCardConfig' && (
                    <BaseballCardConfigEditor currentUser={user} userRole={role} />
                  )}

                  {screen === 'aiTextEditor' && (
                    <AITextCleanupEditor currentUser={user} userRole={role} />
                  )}

                  {screen === 'aiVoiceEditor' && (
                    <AIVoiceTranscriberEditor currentUser={user} userRole={role} />
                  )}

                  {screen === 'aiCoachEditor' && (
                    <AICoachEditor currentUser={user} userRole={role} />
                  )}

                  {screen === 'chatCommandCentre' && (
                    <ChatCommandCentreEditor currentUser={user} userRole={role} />
                  )}

                  {screen === 'accessDenied' && (
                    <AccessDenied userEmail={user?.email} onSignOut={handleSignOut} />
                  )}

                  {screen === 'loading' && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                      <CircularProgress />
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Global Add Note FAB - hidden on non-observation utility pages */}
              {screen !== 'profile' &&
                screen !== 'stats' &&
                screen !== 'studentStats' &&
                screen !== 'feedback' &&
                screen !== 'feedbackTimeline' &&
                screen !== 'accessDenied' &&
                screen !== 'classroomNotesReview' &&
                screen !== 'graduateStudents' &&
                screen !== 'lessonNotes' &&
                screen !== 'studentAliases' &&
                screen !== 'settings' &&
                screen !== 'addUser' &&
                screen !== 'childChat' &&
                screen !== 'config' &&
                screen !== 'configLessonNotes' &&
                screen !== 'configAiTools' &&
                screen !== 'chatCommandCentre' &&
                screen !== 'baseballCardConfig' &&
                screen !== 'notifications' && (
                <AddNoteFab 
                  showLabel 
                  onClick={() => setAddNoteOpen(true)} 
                  sx={{ 
                    bottom: { xs: 80, sm: 80 },
                    '@media (max-width: 599px)': {
                      '@supports (padding: env(safe-area-inset-bottom))': {
                        bottom: 'calc(80px + env(safe-area-inset-bottom))'
                      }
                    }
                  }}
                />
              )}
              <AddNoteModal
                open={addNoteOpen}
                onClose={() => setAddNoteOpen(false)}
                initialStudents={
                  selectedStudent &&
                  (
                    screen === 'timeline' ||
                    screen === 'studentDashboard' ||
                    screen === 'studentStats'
                  )
                    ? [selectedStudent.id]
                    : []
                }
                currentUser={user}
                userRole={role}
                onOpenLessonNotePage={() => {
                  setAddNoteOpen(false);
                  openLessonNotesScreen();
                }}
              />
              <UpdateNotification />
              {screen !== 'accessDenied' && (
                <AppFooter
                  onHome={handleHome}
                  onNavigate={handleNavigation}
                  active={
                    screen === 'landingPage'
                      ? 'home'
                      : screen === 'settings'
                        ? 'settings'
                        : screen === 'notifications'
                          ? 'notifications'
                          : null
                  }
                />
              )}
            </>
          )}
          </NotificationProvider>
        </Box>
      </Box>
    </>
  );
}

export default App;
