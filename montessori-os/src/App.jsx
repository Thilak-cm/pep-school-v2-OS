import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import SignIn from "./SignIn";
import AppHeader from "./AppHeader";
import LandingPage from "./components/LandingPage";
import ClassroomList from "./components/ClassroomList";
import StudentList from "./components/StudentList";
import StudentTimeline from "./components/StudentTimeline";
import StudentDashboard from "./components/StudentDashboard";
import ClassroomTimeline from "./components/ClassroomTimeline";
import ProfilePage from "./components/ProfilePage";
import StatsPage from "./components/StatsPage";
import FeedbackPage from "./components/FeedbackPage";
import FeedbackTimeline from "./components/FeedbackTimeline";
import AddUserPage from "./components/AddUserPage";
import ReviewClassroomNotes from "./components/ReviewClassroomNotes";
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
import VersionBadge from "./components/VersionBadge";
import AccessDenied from './AccessDenied';
import AddNoteFab from './components/AddNoteFab';
import AddNoteModal from './components/AddNoteModal';
import UpdateNotification from './components/UpdateNotification';
import { NotificationProvider } from './notifications/NotificationContext.jsx';
import NotificationStack from './notifications/NotificationStack.jsx';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null); // 'admin' | 'teacher'
  const [screen, setScreen] = useState('loading'); // 'loading' | 'landingPage' | 'classroomList' | 'classroomTimeline' | 'studentList' | 'studentDashboard' | 'timeline' | 'profile' | 'stats' | 'feedback' | 'feedbackTimeline' | 'addUser' | 'classroomNotesReview'
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);

  // Global navigation: allow notifications to navigate to a student's Notes page
  useEffect(() => {
    const handleNavigateToStudentNotes = (e) => {
      try {
        const detail = e?.detail || {};
        const studentId = detail.studentId || detail?.student?.id;
        if (!studentId) return;
        const studentLike = detail.student || { id: studentId };
        setSelectedStudent(studentLike);
        setScreen('timeline');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Navigation event error', err);
      }
    };
    window.addEventListener('navigateToStudentNotes', handleNavigateToStudentNotes);
    return () => window.removeEventListener('navigateToStudentNotes', handleNavigateToStudentNotes);
  }, []);

  useEffect(() => {
    // Log runtime Firebase project configuration once on mount
    try {
      // eslint-disable-next-line no-console
      console.info('[Runtime] Firebase projectId:', app?.options?.projectId, '| env:', import.meta.env?.VITE_FIREBASE_PROJECT_ID);
    } catch (e) {
      // ignore
    }

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

    // Log current user info and role resolution
    // eslint-disable-next-line no-console
    console.info('[Runtime] Auth user:', { uid: user?.uid, email: user?.email });

    const logUnauthorized = async (reason) => {
      try {
        const fn = httpsCallable(cloudFunctions, 'logUnauthorizedAccess');
        await fn({
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          reason,
          userAgent: navigator.userAgent,
        });
      } catch (err) {
        console.error('Error logging unauthorized access', err);
      }
    };

    const validateAccess = async () => {
      // Domain check
      if (!user.email.endsWith('@pepschoolv2.com')) {
        await logUnauthorized('invalid_domain');
        setUnauthorized(true);
        setScreen('accessDenied');
        return;
      }

      try {
        // Look up by UID (authoritative) instead of email query to avoid case/alias issues
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await logUnauthorized('not_in_users_collection');
          setUnauthorized(true);
          setScreen('accessDenied');
          return;
        }
        const userDoc = userSnap.data();
        if (!userDoc.role) {
          await logUnauthorized('missing_role');
          setUnauthorized(true);
          setScreen('accessDenied');
          return;
        }
        setRole(userDoc.role);
        // Persist role as a user property for analytics breakdowns
        setUserProperty('role', userDoc.role);
        // Allow both 'teacher' and 'other' to proceed to app; finer gating handled by rules/UI
        setScreen('landingPage');
      } catch (err) {
        console.error('Access validation error', err);
        await logUnauthorized('validation_error');
        setUnauthorized(true);
        setScreen('accessDenied');
      }
    };

    validateAccess();
  }, [user]);

  const handleSignOut = async () => {
    try {
      // Clear analytics user_id to avoid linking anonymous sessions
      setAnalyticsUserId(null);
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
  if (screen === 'landingPage') pageTitle = role === 'teacher' ? 'Teacher Panel' : 'Admin Panel';
  else if (screen === 'classroomList') pageTitle = role === 'teacher' ? 'My Classrooms' : 'All Classrooms';
  else if (screen === 'classroomTimeline') pageTitle = selectedClassroom?.name || 'Classroom Timeline';
  else if (screen === 'studentList') pageTitle = `${selectedClassroom?.name || 'Classroom'} Students`;
  else if (screen === 'studentDashboard') pageTitle = `${getStudentFirstName(selectedStudent)}'s Dashboard`;
  else if (screen === 'timeline') pageTitle = `${getStudentDisplayName(selectedStudent)} Timeline`;
  else if (screen === 'profile') pageTitle = 'Profile';
  else if (screen === 'stats') pageTitle = 'Statistics';
  else if (screen === 'feedback') pageTitle = 'Feedback & Suggestions';
  else if (screen === 'feedbackTimeline') pageTitle = 'Feedback Dashboard';
  else if (screen === 'addUser') pageTitle = 'Add New User';
  else if (screen === 'classroomNotesReview') pageTitle = 'Review Classroom Notes';

  // Determine back navigation for header
  const getBackNavigation = () => {
    if (screen === 'landingPage') return null;
    
    switch (screen) {
      case 'classroomList':
        return () => setScreen('landingPage');
      case 'classroomTimeline':
        return () => setScreen('classroomList');
      case 'studentList':
        return () => setScreen('classroomList');
      case 'studentDashboard':
        return () => setScreen('classroomTimeline');
      case 'timeline':
        return () => setScreen('studentDashboard');
      case 'profile':
      case 'stats':
      case 'feedback':
      case 'addUser':
      case 'classroomNotesReview':
        return () => setScreen('landingPage');
      case 'feedbackTimeline':
        return () => setScreen('landingPage');
      default:
        return null;
    }
  };

  const backNavigation = getBackNavigation();
  const showBackButton = screen !== 'landingPage';

  // Mobile-first responsive container
  return (
    <>
      <Box
        sx={{
          minHeight: '100vh',
          width: '100vw',
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
            minHeight: { xs: '100vh', sm: '800px' },
            maxHeight: { xs: 'none', sm: '90vh' },
            backgroundColor: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
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
                  Loading...
                </Typography>
              </Box>
              <VersionBadge userRole={role} />
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
              <VersionBadge userRole={role} />
            </Box>
          )}

          {/* Authenticated State */}
          {!loading && user && (
            <>
              {/* Sticky Header (outside scrollable content) */}
              {screen !== 'accessDenied' && (
                <AppHeader 
                  user={user} 
                  onSignOut={handleSignOut} 
                  title={pageTitle}
                  onNavigate={(path) => {
                    if (path === '/profile') {
                      setScreen('profile');
                    } else if (path === '/stats') {
                      setScreen('stats');
                    } else if (path === '/feedback') {
                      setScreen('feedback');
                    } else if (path === '/addUser') {
                      setScreen('addUser');
                    }
                  }}
                  onHome={() => setScreen('landingPage')}
                  onBack={backNavigation}
                  showBackButton={showBackButton}
                />
              )}

              {/* Scrollable Main Content */}
              <Box
                sx={{
                  flex: 1,
                  overflow: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box
                  sx={{
                    padding: { xs: 2, sm: 3 },
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 'fit-content',
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
                      />
                    </>
                  )}

                  {screen === 'classroomTimeline' && (
                    <ClassroomTimeline
                      classroom={selectedClassroom}
                      currentUser={user}
                      userRole={role}
                      onNavigateToStudent={(student) => {
                        setSelectedStudent(student);
                        setScreen('studentDashboard');
                      }}
                    />
                  )}

                  {screen === 'studentList' && (
                    <StudentList
                      classroom={selectedClassroom}
                      onSelectStudent={(stu) => {
                        setSelectedStudent(stu);
                        setScreen('studentDashboard');
                      }}
                    />
                  )}

                  {screen === 'studentDashboard' && (
                    <StudentDashboard
                      student={selectedStudent}
                      onOpenNotes={() => setScreen('timeline')}
                    />
                  )}

                  {screen === 'timeline' && (
                    <StudentTimeline
                      student={selectedStudent}
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
                    />
                  )}

                  {screen === 'feedback' && (
                    <FeedbackPage
                      currentUser={user}
                      userRole={role}
                      onNavigateToAdminDashboard={() => setScreen('feedbackTimeline')}
                    />
                  )}

                  {screen === 'feedbackTimeline' && (
                    <FeedbackTimeline
                    />
                  )}

                  {screen === 'addUser' && (
                    <AddUserPage
                      currentUser={user}
                      userRole={role}
                    />
                  )}

                  {screen === 'classroomNotesReview' && (
                    <ReviewClassroomNotes
                      currentUser={user}
                    />
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

              {/* Global Add Note FAB - hidden on profile, stats, feedback, feedbackTimeline, and accessDenied pages */}
              {screen !== 'profile' && screen !== 'stats' && screen !== 'feedback' && screen !== 'feedbackTimeline' && screen !== 'accessDenied' && screen !== 'classroomNotesReview' && (
                <AddNoteFab showLabel onClick={() => setAddNoteOpen(true)} />
              )}
              <AddNoteModal
                open={addNoteOpen}
                onClose={() => setAddNoteOpen(false)}
                initialStudents={screen === 'timeline' && selectedStudent ? [selectedStudent.id] : []}
                currentUser={user}
                userRole={role}
              />
              <VersionBadge userRole={role} />
              <UpdateNotification />
            </>
          )}
          </NotificationProvider>
        </Box>
      </Box>
    </>
  );
}

export default App;
