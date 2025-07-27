import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import SignIn from "./SignIn";
import AppHeader from "./AppHeader";
import AdminPanel from "./components/AdminPanel";
import ClassroomList from "./components/ClassroomList";
import StudentList from "./components/StudentList";
import StudentTimeline from "./components/StudentTimeline";
import ProfilePage from "./components/ProfilePage";
import { db } from "./firebase";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { 
  Box, 
  Container, 
  Typography, 
  CircularProgress, 
  Card
} from "@mui/material";
import VersionBadge from "./components/VersionBadge";
import AccessDenied from './AccessDenied';
import AddNoteFab from './components/AddNoteFab';
import AddNoteModal from './components/AddNoteModal';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null); // 'admin' | 'teacher'
  const [screen, setScreen] = useState('loading'); // 'loading' | 'adminPanel' | 'classroomList' | 'studentList' | 'timeline' | 'profile'
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const logUnauthorized = async (reason) => {
      try {
        await addDoc(collection(db, 'access_logs'), {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          reason,
          timestamp: serverTimestamp(),
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
        const q = query(collection(db, 'users'), where('email', '==', user.email));
        const qSnap = await getDocs(q);
        if (qSnap.empty) {
          await logUnauthorized('not_in_users_collection');
          setUnauthorized(true);
          setScreen('accessDenied');
          return;
        }
        const userDoc = qSnap.docs[0].data();
        if (!userDoc.role) {
          await logUnauthorized('missing_role');
          setUnauthorized(true);
          setScreen('accessDenied');
          return;
        }
        setRole(userDoc.role);
        if (userDoc.role === 'admin') {
          setScreen('adminPanel');
        } else {
          setScreen('teacher');
        }
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
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Determine page title
  let pageTitle = '';
  if (screen === 'adminPanel') pageTitle = 'Admin Panel';
  else if (screen === 'classroomList') pageTitle = 'All Classrooms';
  else if (screen === 'studentList') pageTitle = `${selectedClassroom?.name || 'Classroom'} Students`;
  else if (screen === 'timeline') pageTitle = `${selectedStudent?.name || 'Student'} Timeline`;
  else if (screen === 'teacher') pageTitle = 'Teacher Home';
  else if (screen === 'profile') pageTitle = 'Profile';

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
              <VersionBadge />
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
              <VersionBadge />
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
                    }
                  }}
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
                  {screen === 'adminPanel' && (
                    <AdminPanel onViewClassrooms={() => setScreen('classroomList')} />
                  )}

                  {screen === 'classroomList' && (
                    <ClassroomList
                      onBack={() => setScreen('adminPanel')}
                      onSelectClassroom={(cls) => {
                        setSelectedClassroom(cls);
                        setScreen('studentList');
                      }}
                    />
                  )}

                  {screen === 'studentList' && (
                    <StudentList
                      classroom={selectedClassroom}
                      onBack={() => setScreen('classroomList')}
                      onSelectStudent={(stu) => {
                        setSelectedStudent(stu);
                        setScreen('timeline');
                      }}
                    />
                  )}

                  {screen === 'timeline' && (
                    <StudentTimeline
                      student={selectedStudent}
                      onBack={() => setScreen('studentList')}
                    />
                  )}

                  {screen === 'teacher' && !unauthorized && (
                    <Typography variant="body1">Teacher view coming soon</Typography>
                  )}

                  {screen === 'profile' && (
                    <ProfilePage
                      user={user}
                      role={role}
                      onBack={() => setScreen(role === 'admin' ? 'adminPanel' : 'teacher')}
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

              {/* Global Add Note FAB */}
              <AddNoteFab showLabel onClick={() => setAddNoteOpen(true)} />
              <AddNoteModal
                open={addNoteOpen}
                onClose={() => setAddNoteOpen(false)}
                initialStudents={screen === 'timeline' && selectedStudent ? [selectedStudent.sid || selectedStudent.id] : []}
                currentUser={user}
              />
              <VersionBadge />
            </>
          )}
        </Box>
      </Box>
    </>
  );
}

export default App;
