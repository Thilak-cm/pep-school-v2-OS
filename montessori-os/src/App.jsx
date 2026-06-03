import React, { useCallback, useState, useEffect, useRef } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db, cloudFunctions } from "./firebase";
import SignIn from "./SignIn";
import AppFooter from "./AppFooter";
import { setAnalyticsUserId, setUserProperty, setAppVersionProperty, trackEvent } from './utils/analytics';
import { doc, getDoc, collection, query, where, getDocs, documentId } from "firebase/firestore";
import { httpsCallable } from 'firebase/functions';
import { Box, Typography, CircularProgress, Card } from "@mui/material";
import AddNoteFab from './components/AddNoteFab';
import AddNoteModal from './components/AddNoteModal';
import UpdateNotification from './components/UpdateNotification';
import { NotificationProvider } from './notifications/NotificationContext.jsx';
import NotificationStack from './notifications/NotificationStack.jsx';
import SaveQueueNotificationBridge from './notifications/SaveQueueNotificationBridge.jsx';
import { isSuperAdmin } from './utils/roleUtils';
import { normalizeClassroomId } from './utils/lessonNoteConstraints';
import { clearNotificationsCache } from './components/NotificationsPage.jsx';
import { initSaveQueue } from './services/saveQueue';
import { getPageTitle, getBackNavigation, FAB_HIDDEN_SCREENS, FOOTER_TAB_SCREENS, NO_BACK_BUTTON_SCREENS, NO_HEADER_SCREENS } from './screenConfig.js';
import AppHeader, { HEADER_HEIGHT } from './AppHeader.jsx';
import ScreenRenderer from './ScreenRenderer.jsx';
import { useNavigationState } from './hooks/useNavigationState.js';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [manageableClassrooms, setManageableClassrooms] = useState([]);
  const [_unauthorized, setUnauthorized] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [addNoteInitialStep, setAddNoteInitialStep] = useState('record');
  const [prefilledFeedback, setPrefilledFeedback] = useState('');
  const [classrooms, setClassrooms] = useState([]);
  const [classroomsLoaded, setClassroomsLoaded] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [noteDrawerOpen, setNoteDrawerOpen] = useState(false);

  const {
    screen, setScreen,
    selectedClassroom, setSelectedClassroom,
    selectedStudent, setSelectedStudent,
    usersAccessView, setUsersAccessView,
    classroomTimelineReturnScreen, setClassroomTimelineReturnScreen,
    studentDashboardReturnScreen, setStudentDashboardReturnScreen,
    studentDashboardNoteType, setStudentDashboardNoteType,
    timelineFilter, setTimelineFilter,
    lessonNotesReturnScreen, setLessonNotesReturnScreen,
    lessonNoteInitialSelection, setLessonNoteInitialSelection,
    lessonNoteEditObservation, setLessonNoteEditObservation,
    timelineTitleAsDashboard, setTimelineTitleAsDashboard,
    pendingViewReportId, setPendingViewReportId,
    initialStudentId, setInitialStudentId,
    feedbackReturnScreen, setFeedbackReturnScreen,
  } = useNavigationState();

  const handleNavigateToReport = useCallback(({ studentId: sid, docId }) => {
    setSelectedStudent((prev) => prev?.id === sid ? prev : { id: sid });
    // Hydrate stub so header can show age (PEP-243)
    (async () => {
      try {
        const ref = doc(db, 'students', sid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setSelectedStudent((prev) => prev?.id === sid ? { id: sid, ...snap.data() } : prev);
        }
      } catch { /* ignored */ }
    })();
    setPendingViewReportId(docId);
    setScreen('studentReports');
  }, []);

  const isTeacher = role === 'teacher';
  const isSuperAdminUser = isSuperAdmin(role);

  const getStudentDisplayName = (studentLike) => {
    if (!studentLike) return 'Student';
    const composedName = [studentLike?.firstName, studentLike?.lastName].filter(Boolean).join(' ');
    return studentLike?.name || studentLike?.displayName || composedName || 'Student';
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
      setStudentDashboardNoteType('lesson');
      setStudentDashboardReturnScreen(lessonNotesReturnScreen || 'classroomTimeline');
      setScreen('studentDashboard');
    } else {
      setScreen(lessonNotesReturnScreen || 'timeline');
    }
  };

  const openFeedbackWithMessage = (message = '') => {
    setPrefilledFeedback(message || '');
    setFeedbackReturnScreen(null);
    setScreen('feedback');
  };

  const handleNavigation = (path) => {
    if (path === 'settings') { setScreen('settings'); return; }
    if (path === 'alerts') { setScreen('alerts'); return; }
    if (path === 'interviews') { setScreen('interviews'); return; }
    if (path === '/profile') setScreen('profile');
    else if (path === '/stats') setScreen('stats');
    else if (path === '/feedback') { setFeedbackReturnScreen(null); setScreen('feedback'); }
    else if (path === '/addUser') setScreen('addUser');
    else if (path === '/aliases') setScreen('studentAliases');
    else if (path === '/config' && isSuperAdminUser) setScreen('config');
    else if (path === '/bulkUpload' && isSuperAdminUser) setScreen('bulkUpload');
  };

  const handleSignOut = async () => {
    try {
      setAnalyticsUserId(null);
      setRole(null);
      setManageableClassrooms([]);
      clearNotificationsCache();
      await signOut(auth);
    } catch { /* ignored */ }
  };

  const handleHome = () => { setSelectedStudent(null); setScreen('landingPage'); };

  const scrollRef = useRef(null);
  const handleScrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ── Effects ────────────────────────────────────────────────────────────

  useEffect(() => { initSaveQueue(); }, []);

  // Hide footer when mobile soft keyboard is open (visualViewport shrinks)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const KEYBOARD_THRESHOLD = 150;
    const handleResize = () => {
      setInputFocused(window.innerHeight - vv.height > KEYBOARD_THRESHOLD);
    };
    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleNavigateToStudentNotes = (e) => {
      try {
        const detail = e?.detail || {};
        const studentId = detail.studentId || detail?.student?.id;
        if (!studentId) return;
        if (detail.lessonEditObservation) {
          setLessonNotesReturnScreen(screen);
          setLessonNoteEditObservation(detail.lessonEditObservation);
          setLessonNoteInitialSelection({ classroomId: detail.lessonEditObservation.classroomId || null, studentId });
          setSelectedStudent(detail.student || { id: studentId });
          setScreen('lessonNotes');
          return;
        }
        const studentLike = detail.student || { id: studentId };
        setSelectedStudent(studentLike);
        const noteTypeFilter = detail.noteTypeFilter ?? null;
        if (noteTypeFilter === 'lesson') { setStudentDashboardNoteType('lesson'); setScreen('studentDashboard'); }
        else if (noteTypeFilter === 'textVoice') { setStudentDashboardNoteType('textVoice'); setScreen('studentDashboard'); }
        else if (noteTypeFilter === 'media') { setTimelineFilter('media'); setScreen('timeline'); }
        else { setStudentDashboardNoteType('textVoice'); setScreen('studentDashboard'); }
        if (detail.titleAsDashboard) setTimelineTitleAsDashboard(true);
        const hasName = !!(studentLike?.name || studentLike?.displayName || studentLike?.firstName || studentLike?.lastName);
        if (!hasName) {
          (async () => {
            try {
              const ref = doc(db, 'students', studentId);
              const snap = await getDoc(ref);
              if (snap.exists()) setSelectedStudent({ id: studentId, ...snap.data() });
            } catch { /* ignored */ }
          })();
        }
      } catch { /* ignored */ }
    };
    window.addEventListener('navigateToStudentNotes', handleNavigateToStudentNotes);
    const handleNoteDrawerToggle = (e) => setNoteDrawerOpen(!!e?.detail?.open);
    window.addEventListener('noteDrawerToggle', handleNoteDrawerToggle);
    return () => {
      window.removeEventListener('navigateToStudentNotes', handleNavigateToStudentNotes);
      window.removeEventListener('noteDrawerToggle', handleNoteDrawerToggle);
    };
  }, []);

  // ── Track screen views for GA4 path analysis ──
  useEffect(() => {
    if (screen && screen !== 'loading') {
      trackEvent('screen_view', { screen_name: screen });
    }
  }, [screen]);

  useEffect(() => { if (screen !== 'timeline' && timelineTitleAsDashboard) setTimelineTitleAsDashboard(false); }, [screen, timelineTitleAsDashboard]);
  useEffect(() => { if (screen === 'classroomList') setStudentDashboardReturnScreen('classroomList'); }, [screen]);
  useEffect(() => { if (screen !== 'feedback') setPrefilledFeedback(''); }, [screen]);

  useEffect(() => {
    setAppVersionProperty();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser?.uid) setAnalyticsUserId(currentUser.uid);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    clearNotificationsCache();
    const validateAccess = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        let userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          try {
            const migrateFn = httpsCallable(cloudFunctions, 'migratePendingUser');
            const migrateResult = await migrateFn({});
            if (migrateResult.data?.ok && migrateResult.data?.migrated) userSnap = await getDoc(userRef);
            else if (migrateResult.data?.ok === false) { /* no pending user */ }
            else userSnap = await getDoc(userRef);
          } catch (_migrateErr) {
            try { userSnap = await getDoc(userRef); } catch (_refetchErr) { /* keep original */ }
          }
        }
        if (!userSnap || !userSnap.exists()) { setUnauthorized(true); setScreen('accessDenied'); return; }
        const userDoc = userSnap.data();
        if (!userDoc.role) { setUnauthorized(true); setScreen('accessDenied'); return; }
        const rawManageable = Array.isArray(userDoc.manageableClassrooms) ? userDoc.manageableClassrooms : [];
        const userManageableClassrooms = Array.from(new Set(rawManageable.map(normalizeClassroomId).filter(Boolean)));
        if (userDoc.role === 'classroomadmin' && userManageableClassrooms.length === 0) {
          alert('Your classroom access is not configured. Please ask a super admin to add manageable classrooms to your account.');
          setUnauthorized(true); setScreen('accessDenied'); return;
        }
        setRole(userDoc.role);
        setManageableClassrooms(userManageableClassrooms);
        setUserProperty('role', userDoc.role);
        setScreen('landingPage');
      } catch (_err) { setScreen('accessDenied'); }
    };
    validateAccess();
  }, [user]);

  // ── Fetch classrooms once after login (shared by LandingPage + ClassroomList) ──
  useEffect(() => {
    if (!user || !role) { setClassrooms([]); setClassroomsLoaded(false); return; }

    const CACHE_KEY = `pep-classrooms:${role}:${user.uid}:${manageableClassrooms.slice().sort().join('|') || 'all'}`;
    const CACHE_TTL = 24 * 60 * 60 * 1000;

    // Try cache first
    try {
      const raw = window.localStorage?.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.timestamp && Date.now() - parsed.timestamp < CACHE_TTL) {
          setClassrooms(parsed.classrooms || []);
          setClassroomsLoaded(true);
          return; // cache hit — skip fetch
        }
      }
    } catch { /* proceed to fetch */ }

    const fetchClassrooms = async () => {
      try {
        let result = [];
        if (role === 'teacher') {
          const snap = await getDocs(query(collection(db, 'classrooms'), where('status', '==', 'active')));
          result = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(c => c.teacherIds?.includes(user.uid));
        } else if (role === 'classroomadmin') {
          const ids = (manageableClassrooms || []).filter(Boolean);
          if (ids.length > 0) {
            const batchSize = 10;
            const all = [];
            for (let i = 0; i < ids.length; i += batchSize) {
              const batch = ids.slice(i, i + batchSize);
              const snap = await getDocs(query(collection(db, 'classrooms'), where(documentId(), 'in', batch), where('status', '==', 'active')));
              all.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }
            const deduped = {};
            all.forEach(c => { if (c?.id) deduped[c.id] = c; });
            result = Object.values(deduped);
          }
        } else {
          const snap = await getDocs(query(collection(db, 'classrooms'), where('status', '==', 'active')));
          result = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        // Exclude adolescent classrooms
        result = result.filter(c => !String(c?.name || '').toLowerCase().includes('adolescent'));
        setClassrooms(result);
        setClassroomsLoaded(true);
        try {
          window.localStorage?.setItem(CACHE_KEY, JSON.stringify({ classrooms: result, timestamp: Date.now() }));
        } catch { /* ignored */ }
      } catch {
        setClassroomsLoaded(true);
      }
    };
    fetchClassrooms();
  }, [user, role, manageableClassrooms]);

  // ── Derived values ─────────────────────────────────────────────────────

  const titleState = { isTeacher, isSuperAdminUser, selectedClassroom, selectedStudent, timelineTitleAsDashboard, usersAccessView, getStudentDisplayName: () => getStudentDisplayName(selectedStudent) };
  const pageTitle = getPageTitle(screen, titleState);
  const backNavigation = getBackNavigation(screen, { classroomTimelineReturnScreen, studentDashboardReturnScreen, lessonNotesReturnScreen, feedbackReturnScreen, usersAccessView }, { setScreen, setSelectedStudent, setUsersAccessView });
  const showBackButton = !NO_BACK_BUTTON_SCREENS.has(screen);
  const showFooter = !loading && user && screen !== 'accessDenied' && !inputFocused;
  const showHeader = !loading && user && !NO_HEADER_SCREENS.has(screen);

  // Context object passed to ScreenRenderer
  const ctx = {
    user, role, isTeacher, isSuperAdminUser, manageableClassrooms, classrooms, classroomsLoaded,
    selectedClassroom, selectedStudent,
    studentDashboardNoteType, timelineFilter, prefilledFeedback,
    usersAccessView, pendingViewReportId, initialStudentId,
    lessonNoteInitialSelection, lessonNoteEditObservation, lessonNotesReturnScreen,
    setScreen, setSelectedClassroom, setSelectedStudent, setClassroomTimelineReturnScreen, setStudentDashboardReturnScreen,
    setStudentDashboardNoteType, setTimelineFilter, setUsersAccessView, setPendingViewReportId, setInitialStudentId,
    setLessonNoteEditObservation, setFeedbackReturnScreen,
    openFeedbackWithMessage, handleLessonNotesSaved, handleNavigation, handleSignOut,
    getStudentDisplayName,
    pageTitle, backNavigation, showBackButton,
  };

  return (
    <>
      <Box sx={{ minHeight: '100vh', width: '100vw', maxWidth: '100vw', overflowX: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg)' }}>
        <Box sx={{
          width: { xs: '100vw', sm: '420px' }, maxWidth: { xs: '100vw', sm: '420px' },
          minHeight: { xs: '100vh', sm: '800px' }, maxHeight: { xs: 'none', sm: '90vh' },
          backgroundColor: 'var(--color-bg)', display: 'flex', flexDirection: 'column', position: 'relative', overflowX: 'hidden',
          '@media (min-width: 600px)': { borderRadius: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }
        }}>
          <NotificationProvider>
            <NotificationStack />
            <SaveQueueNotificationBridge onNavigateToReport={handleNavigateToReport} />

            {/* Loading State */}
            {loading && (
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 3 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <CircularProgress size={40} sx={{ color: 'var(--color-primary)', '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }} />
                  <Typography variant="body1" sx={{ color: 'var(--color-text-soft)' }}>Coach Pepper is getting things ready...</Typography>
                </Box>
              </Box>
            )}

            {/* Unauthenticated State */}
            {!loading && !user && (
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 3, position: 'relative' }}>
                <Card sx={{ borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: { xs: '32px 24px', sm: '48px 32px' }, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '350px', backgroundColor: 'white' }}>
                  <Box component="img" src="/pep-logo.png" alt="Pep School Logo" sx={{ width: { xs: '100px', sm: '120px' }, height: { xs: '100px', sm: '120px' }, marginBottom: '32px', filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))' }} />
                  <Typography variant="h3" component="h1" sx={{ color: 'var(--color-text)', marginBottom: '20px', fontSize: { xs: '1.75rem', sm: '2rem' }, fontFamily: 'var(--font-body)', fontWeight: '700', lineHeight: '1.2', textAlign: 'center' }}>Welcome to Pep School V2 OS!</Typography>
                  <Typography variant="body1" sx={{ color: 'var(--color-text-soft)', marginBottom: '40px', fontSize: { xs: '1rem', sm: '1.1rem' }, lineHeight: '1.6', textAlign: 'center' }}>Streamline your teaching workflow</Typography>
                  <SignIn />
                </Card>
              </Box>
            )}

            {/* Authenticated State */}
            {!loading && user && (
              <>
                {showHeader && (
                  <AppHeader screen={screen} ctx={ctx} onTitleClick={handleScrollToTop} />
                )}
                <Box ref={scrollRef} sx={{
                  flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column',
                }}>
                  <Box sx={{ px: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', minHeight: 0, pt: showHeader ? `calc(${HEADER_HEIGHT}px + env(safe-area-inset-top, 0px) + 16px)` : { xs: 2, sm: 3 }, pb: showFooter ? { xs: 12, sm: 12 } : 0, width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
                    <ScreenRenderer screen={screen} ctx={ctx} />
                  </Box>
                </Box>

                {!FAB_HIDDEN_SCREENS.has(screen) && !noteDrawerOpen && (
                  <AddNoteFab
                    onVoice={() => { setAddNoteInitialStep('record'); setAddNoteOpen(true); }}
                    onLesson={() => openLessonNotesScreen()}
                    onMedia={() => { setAddNoteInitialStep('media'); setAddNoteOpen(true); }}
                    sx={{
                      bottom: { xs: 80, sm: 80 },
                      '@media (max-width: 599px)': { '@supports (padding: env(safe-area-inset-bottom))': { bottom: 'calc(80px + env(safe-area-inset-bottom))' } }
                    }}
                  />
                )}
                <AddNoteModal
                  open={addNoteOpen}
                  onClose={() => { setAddNoteOpen(false); setAddNoteInitialStep('record'); }}
                  initialStep={addNoteInitialStep}
                  initialStudents={selectedStudent && (screen === 'timeline' || screen === 'studentDashboard' || screen === 'studentStats' || screen === 'studentReports') ? [selectedStudent.id] : []}
                  currentUser={user}
                  userRole={role}
                />
                <UpdateNotification />
                {showFooter && (
                  <AppFooter
                    onHome={handleHome}
                    onNavigate={handleNavigation}
                    active={FOOTER_TAB_SCREENS[screen] || null}
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
