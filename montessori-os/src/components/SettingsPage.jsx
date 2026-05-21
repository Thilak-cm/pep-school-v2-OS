// SettingsPage.jsx — Card-of-cards layout with inline profile hero (PEP-199)
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  ButtonBase,
  Paper,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import {
  Bell,
  Users,
  ChevronRight,
  LogOut,
  FileUp,
  Sparkles,
} from '../icons';
import { collectionGroup, query, where, getCountFromServer, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Avatar } from './ui';
import VersionBadge from './VersionBadge';
import { isSuperAdmin, isAdminRole, isClassroomAdmin, getRoleLabel } from '../utils/roleUtils';

function SettingsPage({ user, userRole, classrooms = [], onNavigate, onSignOut }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notesThisWeek, setNotesThisWeek] = useState(null);
  const [notesLoading, setNotesLoading] = useState(true);

  const isSuperAdminUser = isSuperAdmin(userRole);
  const isAdmin = isAdminRole(userRole);

  // --- Computed stats (instant) ---
  const classroomCount = classrooms.length;
  const studentCount = classrooms.reduce((sum, c) => sum + (c.studentCount || 0), 0);

  // --- Notes this week (async fetch) ---
  // All roles scope by classroomId to satisfy collection group security rules.
  // Without scoping, the rule evaluates resource.data per doc and denies the
  // entire query if any doc belongs to a classroom the user lost access to (PEP-255).
  useEffect(() => {
    if (!user?.uid) return;
    const classroomIds = classrooms.map(c => c.id);
    if (classroomIds.length === 0) {
      setNotesThisWeek(0);
      setNotesLoading(false);
      return;
    }
    let cancelled = false;

    const fetchNotes = async () => {
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const ts = Timestamp.fromDate(sevenDaysAgo);

        // Firestore 'in' filter supports max 30 values; batch if needed.
        const chunks = [];
        for (let i = 0; i < classroomIds.length; i += 30) {
          chunks.push(classroomIds.slice(i, i + 30));
        }

        const counts = await Promise.all(chunks.flatMap(chunk => [
          getCountFromServer(query(
            collectionGroup(db, 'observations'),
            where('classroomId', 'in', chunk),
            where('createdBy', '==', user.uid),
            where('observedAt', '>=', ts),
          )),
          getCountFromServer(query(
            collectionGroup(db, 'media'),
            where('classroomId', 'in', chunk),
            where('createdBy', '==', user.uid),
            where('observedAt', '>=', ts),
          )),
        ]));

        if (!cancelled) {
          const total = counts.reduce((sum, snap) => sum + snap.data().count, 0);
          setNotesThisWeek(total);
          setNotesLoading(false);
        }
      } catch (err) {
        console.error('[SettingsPage] notes-this-week fetch failed', err);
        if (!cancelled) {
          setNotesThisWeek(0);
          setNotesLoading(false);
        }
      }
    };

    fetchNotes();
    return () => { cancelled = true; };
  }, [user?.uid, classrooms]);

  // --- Profile data ---
  const displayName = user?.displayName || 'Pep School User';
  const roleLabel = getRoleLabel(userRole);
  const roleColor = isSuperAdminUser
    ? 'var(--color-error)'
    : isClassroomAdmin(userRole)
      ? 'var(--color-orange-dark)'
      : 'var(--color-primary)';

  // --- Sign out ---
  const handleLogout = () => setConfirmOpen(true);
  const confirmLogout = () => {
    setConfirmOpen(false);
    if (onSignOut) onSignOut();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

      {/* ── Profile Hero Card ────────────────────────────── */}
      <ButtonBase
        onClick={() => onNavigate('/profile')}
        sx={{ display: 'block', textAlign: 'left', width: '100%', borderRadius: 3 }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            borderRadius: 3,
            border: '1px solid var(--color-border)',
            background: 'linear-gradient(135deg, var(--color-indigo-bg) 0%, white 100%)',
            overflow: 'hidden',
          }}
        >
          {/* Top row: avatar + info + chevron */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar
              name={displayName}
              size="xl"
              color="var(--color-primary)"
              src={user?.photoURL || undefined}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-text)', lineHeight: 1.3 }}>
                {displayName}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: roleColor, fontWeight: 600, mt: 0.25 }}
              >
                {roleLabel}
              </Typography>
            </Box>
            <ChevronRight size={20} style={{ color: 'var(--color-text-soft)', flexShrink: 0 }} />
          </Box>

          {/* Mini stats row */}
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <StatBox
              value={notesLoading ? null : notesThisWeek}
              label="notes this week"
              loading={notesLoading}
            />
            <StatBox value={studentCount} label="students" />
            <StatBox value={classroomCount} label={classroomCount === 1 ? 'classroom' : 'classrooms'} />
          </Box>
        </Paper>
      </ButtonBase>

      {/* ── Preferences Card ─────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: '1px solid var(--color-border)',
          backgroundColor: 'white',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
          <Typography variant="overline" sx={{ fontWeight: 700, color: 'var(--color-text-soft)', letterSpacing: 1 }}>
            Preferences
          </Typography>
        </Box>
        <SettingsRow
          icon={<Bell size={20} />}
          label="Notifications"
          onClick={() => onNavigate('alerts')}
        />
        <SettingsRow
          icon={<Users size={20} />}
          label="My Student Groups"
          onClick={() => onNavigate('/aliases')}
        />
      </Paper>

      {/* ── Admin Tools Card (role-gated) ────────────────── */}
      {isAdmin && (
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            border: '1px solid var(--color-border)',
            backgroundColor: 'white',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
            <Typography variant="overline" sx={{ fontWeight: 700, color: 'var(--color-violet)', letterSpacing: 1 }}>
              Admin Tools
            </Typography>
          </Box>
          <SettingsRow
            icon={<Users size={20} />}
            iconColor="var(--color-violet)"
            label="Users & Access"
            onClick={() => onNavigate('/addUser')}
          />
          {isSuperAdminUser && (
            <>
              <SettingsRow
                icon={<FileUp size={20} />}
                iconColor="var(--color-violet)"
                label="Bulk Upload"
                onClick={() => onNavigate('/bulkUpload')}
              />
              <SettingsRow
                icon={<Sparkles size={20} />}
                iconColor="var(--color-violet)"
                label="AI Configurations"
                onClick={() => onNavigate('/config')}
              />
            </>
          )}
        </Paper>
      )}

      {/* ── Sign Out Card ────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: '1px solid var(--color-error-light)',
          backgroundColor: 'white',
          overflow: 'hidden',
        }}
      >
        <SettingsRow
          icon={<LogOut size={20} />}
          iconColor="var(--color-error)"
          label="Sign out"
          labelColor="var(--color-error)"
          labelWeight={700}
          onClick={handleLogout}
        />
      </Paper>

      <VersionBadge userRole={userRole} showInProfile />

      {/* ── Confirm Dialog ───────────────────────────────── */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        aria-labelledby="logout-dialog-title"
        aria-describedby="logout-dialog-description"
        PaperProps={{ sx: { borderRadius: 3, maxWidth: 400, width: '90%' } }}
      >
        <DialogTitle id="logout-dialog-title" component="div" sx={{ pb: 1 }}>
          <Typography component="h2" variant="h6">Confirm Logout</Typography>
        </DialogTitle>
        <DialogContent sx={{ pb: 2 }}>
          <DialogContentText id="logout-dialog-description">
            Are you sure you want to log out? Any unsaved changes will be lost.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={() => setConfirmOpen(false)} variant="outlined" sx={{ minWidth: 80 }}>
            Cancel
          </Button>
          <Button onClick={confirmLogout} variant="contained" color="error" sx={{ minWidth: 80 }}>
            Logout
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ── Helper: Settings row ──────────────────────────────── */
function SettingsRow({ icon, iconColor, label, labelColor, labelWeight, onClick }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        px: 2,
        py: 1.5,
        gap: 1.5,
        '&:hover': { backgroundColor: 'rgba(79, 70, 229, 0.04)' },
      }}
    >
      <Box sx={{ color: iconColor || 'var(--color-primary)', display: 'flex', flexShrink: 0 }}>
        {icon}
      </Box>
      <Typography
        sx={{
          flex: 1,
          fontWeight: labelWeight || 600,
          color: labelColor || 'var(--color-text)',
          fontSize: '0.95rem',
          textAlign: 'left',
        }}
      >
        {label}
      </Typography>
      <ChevronRight size={18} style={{ color: 'var(--color-text-faint)', flexShrink: 0 }} />
    </ButtonBase>
  );
}

/* ── Helper: Stat box ──────────────────────────────────── */
function StatBox({ value, label, loading }) {
  return (
    <Box
      sx={{
        flex: 1,
        textAlign: 'center',
        py: 1,
        px: 0.5,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.7)',
        border: '1px solid var(--color-border)',
      }}
    >
      {loading ? (
        <Skeleton width={24} height={24} sx={{ mx: 'auto', borderRadius: 1 }} />
      ) : (
        <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-text)', lineHeight: 1 }}>
          {value ?? 0}
        </Typography>
      )}
      <Typography variant="caption" sx={{ color: 'var(--color-text-soft)', lineHeight: 1.2, mt: 0.25, display: 'block' }}>
        {label}
      </Typography>
    </Box>
  );
}

export default SettingsPage;
