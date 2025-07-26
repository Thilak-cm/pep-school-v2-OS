import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import SignIn from "./SignIn";
import AppHeader from "./AppHeader";
import AdminPanel from "./components/AdminPanel";
import ClassroomList from "./components/ClassroomList";
import StudentList from "./components/StudentList";
import StudentTimeline from "./components/StudentTimeline";
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
  const [screen, setScreen] = useState('loading'); // 'loading' | 'adminPanel' | 'classroomList' | 'studentList' | 'timeline'
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
        if (!userDoc.type) {
          await logUnauthorized('missing_role');
          setUnauthorized(true);
          setScreen('accessDenied');
          return;
        }
        setRole(userDoc.type);
        if (userDoc.type === 'admin') {
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

  // Centering container for all app states
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
        {/* Loading State */}
        {loading && (
          <Box
            sx={{
              width: '375px',
              height: '812px',
              boxShadow: '0 0 24px rgba(0,0,0,0.10)',
              borderRadius: '32px',
              overflow: 'hidden',
              backgroundColor: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '20px'
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
              width: '375px',
              height: '812px',
              boxShadow: '0 0 24px rgba(0,0,0,0.10)',
              borderRadius: '32px',
              overflow: 'hidden',
              backgroundColor: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative',
            }}
          >
            <Card
              sx={{
                borderRadius: '16px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                padding: '48px 32px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                maxWidth: '100%',
                width: '100%',
                backgroundColor: 'white'
              }}
            >
              <Box
                component="img"
                src="/pep-logo.png"
                alt="Pep School Logo"
                sx={{
                  width: '120px',
                  height: '120px',
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
                  fontSize: '2rem',
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
                  fontSize: '1.1rem',
                  lineHeight: '1.6',
                  maxWidth: '100%',
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
          <Box
            sx={{
              width: '375px',
              height: '812px',
              backgroundColor: '#f8fafc',
              boxShadow: '0 0 24px rgba(0,0,0,0.10)',
              borderRadius: '32px',
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
            }}
          >
            {/* Header (hidden on Access Denied) */}
            {screen !== 'accessDenied' && (
              <AppHeader user={user} onSignOut={handleSignOut} title={pageTitle} />
            )}

            {/* Main Content */}
            <Container maxWidth={false} sx={{ py: 3, px: 2, maxWidth: '375px', flexGrow: 1 }}>
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

              {screen === 'accessDenied' && (
                <AccessDenied userEmail={user?.email} onSignOut={handleSignOut} />
              )}

              {screen === 'loading' && (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <CircularProgress />
                </Box>
              )}
            </Container>
            {/* Global Add Note FAB */}
            <AddNoteFab showLabel onClick={() => setAddNoteOpen(true)} />
            <AddNoteModal
              open={addNoteOpen}
              onClose={() => setAddNoteOpen(false)}
              initialStudents={selectedStudent ? [selectedStudent.uid || selectedStudent.id] : []}
              currentUser={user}
            />
            <VersionBadge />
          </Box>
        )}
      </Box>
    </>
  );
}

export default App;
