import React, { useEffect, useState } from 'react';
import { Box, BottomNavigation, BottomNavigationAction, Badge } from '@mui/material';
import { Home, Settings, Notifications } from '@mui/icons-material';
import { collectionGroup, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { getIstIsoWeekKey } from './utils/weekKey';

const FOOTER_HEIGHT = 64;

function AppFooter({ onHome, onNavigate, active = null }) {
  const [value, setValue] = useState(active || 'none');
  const [badgeCount, setBadgeCount] = useState(0);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    setValue(active || 'none');
  }, [active]);

  useEffect(() => {
    let activeFlag = true;

    const fetchBadge = async (uid) => {
      if (!uid) {
        if (activeFlag) {
          setBadgeCount(0);
        }
        return;
      }

      try {
        // Determine user role and classroom scope
        const userSnap = await getDoc(doc(db, 'users', uid));
        const role = userSnap.exists() ? (userSnap.data()?.role || null) : null;

        // Non-superadmins do not see notifications yet
        if (role !== 'superadmin') {
          setIsSuperAdmin(false);
          setBadgeCount(0);
          return;
        }
        setIsSuperAdmin(true);

        let accessibleClassrooms = null; // null => all classrooms
        if (role === 'superadmin') {
          accessibleClassrooms = null;
        } else if (role === 'classroomadmin') {
          accessibleClassrooms = Array.isArray(userSnap.data()?.manageableClassrooms)
            ? userSnap.data().manageableClassrooms.filter(Boolean)
            : [];
        } else {
          const classroomsSnap = await getDocs(query(collection(db, 'classrooms')));
          accessibleClassrooms = classroomsSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() || {}) }))
            .filter((c) => (c.status || 'active') !== 'archived')
            .filter((c) => Array.isArray(c.teacherIds) && c.teacherIds.includes(uid))
            .map((c) => c.id);
        }

        // If no accessible classrooms and not superadmin, short-circuit
        if (accessibleClassrooms !== null && accessibleClassrooms.length === 0) {
          setBadgeCount(0);
          return;
        }

        const weekKey = getIstIsoWeekKey();
        const signalsQuery = query(
          collectionGroup(db, 'ai_summaries'),
          where('weekKey', '==', weekKey)
        );
        const snapshot = await getDocs(signalsQuery);
        if (!activeFlag) return;

        const rows = snapshot.docs
          .filter((d) => d.id === 'signals')
          .map((d) => {
            const studentId = d.ref.parent?.parent?.id || null;
            const data = d.data() || {};
            return {
              studentId,
              ...data,
              severity: data.severity || 'clear',
              severityScore: Number.isFinite(data.severityScore) ? data.severityScore : 0,
              evidenceCount: Number.isFinite(data.evidenceCount) ? data.evidenceCount : (Number.isFinite(data.noteCount) ? data.noteCount : 0),
            };
          });

        // If user can see all classrooms (superadmin), no need to scope
        if (accessibleClassrooms === null) {
          const escalatedCount = rows.filter((r) => r.escalatedThisWeek).length;
          setBadgeCount(escalatedCount);
          return;
        }

        // Fetch student classroom mapping for scoped filtering
        const studentIds = Array.from(
          new Set(
            rows
              .map((r) => r.studentId)
              .filter(Boolean)
          )
        );

        const studentEntries = await Promise.all(studentIds.map(async (sid) => {
          try {
            const sSnap = await getDoc(doc(db, 'students', sid));
            if (!sSnap.exists()) return [sid, null];
            const s = sSnap.data() || {};
            return [sid, s.classroomId || null];
          } catch (err) {
            return [sid, null];
          }
        }));
        const studentClassrooms = Object.fromEntries(studentEntries);

        const filtered = rows.filter((r) => {
          const classroomId = r.studentId ? studentClassrooms[r.studentId] : null;
          return classroomId && accessibleClassrooms.includes(classroomId);
        });

        const escalatedCount = filtered.filter((r) => r.escalatedThisWeek).length;
        setBadgeCount(escalatedCount);
      } catch (err) {
        console.warn('Failed to load notifications badge', err);
        if (activeFlag) {
          setBadgeCount(0);
        }
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      fetchBadge(user?.uid);
    });

    fetchBadge(auth?.currentUser?.uid);

    return () => {
      activeFlag = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const handleAction = (target) => {
    if (target === 'home' && onHome) {
      onHome();
    } else if (target === 'settings' && onNavigate) {
      onNavigate('settings');
    } else if (target === 'notifications' && onNavigate) {
      onNavigate('notifications');
    }
  };

  const handleChange = (_, newValue) => {
    setValue(newValue);
    if (newValue !== 'none') {
      handleAction(newValue);
    }
  };

  const handleClickSelected = (target) => {
    if (target === value) {
      handleAction(target);
    }
  };

  const notificationsIcon = (
    <Badge
      color="error"
      overlap="circular"
      badgeContent={badgeCount > 99 ? '99+' : badgeCount}
      invisible={!isSuperAdmin || badgeCount <= 0}
    >
      <Notifications />
    </Badge>
  );

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: { xs: '100%', sm: '420px' },
        overflowX: 'hidden',
        zIndex: 1050,
        px: { xs: 0, sm: 1 },
        '@media (max-width: 599px)': {
          '@supports (padding: env(safe-area-inset-bottom))': {
            paddingBottom: 'env(safe-area-inset-bottom)'
          }
        }
      }}
    >
      <Box
        sx={{
          height: FOOTER_HEIGHT,
          backgroundColor: 'white',
          borderTop: '1px solid #e2e8f0',
          boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.08)',
          display: 'flex',
          alignItems: 'center',
          borderRadius: { xs: 0, sm: '12px' },
          overflow: 'hidden'
        }}
      >
        <BottomNavigation
          value={value}
          onChange={handleChange}
          showLabels
          sx={{
            width: '100%',
            height: FOOTER_HEIGHT,
            backgroundColor: 'transparent',
            '& .MuiBottomNavigationAction-root': {
              minWidth: 0,
              color: '#64748b',
              paddingTop: 0.5,
              paddingBottom: 0.5,
              '& .MuiBottomNavigationAction-label': {
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: 0.2
              }
            },
            '& .Mui-selected': {
              color: '#4f46e5'
            }
          }}
        >
          <BottomNavigationAction
            label="Settings"
            value="settings"
            icon={<Settings />}
            onClick={() => handleClickSelected('settings')}
          />
          <BottomNavigationAction
            label="Notifications"
            value="notifications"
            icon={notificationsIcon}
            onClick={() => handleClickSelected('notifications')}
          />
          <BottomNavigationAction
            label="Home"
            value="home"
            icon={<Home />}
            onClick={() => handleClickSelected('home')}
          />
        </BottomNavigation>
      </Box>
    </Box>
  );
}

export default AppFooter;
