// LandingPage.jsx — Teacher launchpad (PEP-190)
import React from 'react';
import { Box, Typography, ButtonBase, CircularProgress } from '@mui/material';
import { BarChart3, UserPlus, Download, MessageSquare, ChevronRight } from '../icons';
import { Avatar, MiniTangram, QuickJumpButton } from './ui';
import { trackEvent } from '../utils/analytics';
import DynamicIslandPill from './DynamicIslandPill';

// Fallback palette: [cardColor, bgColor, borderColor] — CSS-var safe
const FALLBACK_PALETTES = [
  ['var(--color-primary)', 'var(--color-indigo-bg)', 'var(--color-indigo-soft)'],
  ['var(--color-secondary)', 'var(--color-green-bg)', 'var(--color-green-mint)'],
  ['var(--color-warning)', 'var(--color-amber-bg)', 'var(--color-amber-yellow)'],
  ['var(--color-pink)', 'rgba(236, 72, 153, 0.1)', 'rgba(236, 72, 153, 0.2)'],
];

function LandingPage({
  classrooms = [],
  classroomsLoaded = false,
  onViewClassrooms,
  onSelectClassroom,
  userRole,
  currentUser,
  onNavigateToFeedbackDashboard,
  onNavigateToFeedback,
  onNavigateToClassroomNotes,
  onNavigate,
  onNavigateToStudent,
}) {
  const isTeacher = userRole === 'teacher';

  // --- Header data ---
  const displayName = currentUser?.displayName || currentUser?.email || 'there';
  const firstName = displayName.split(' ')[0];
  const now = new Date();
  const dateString = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const totalStudents = classrooms.reduce((sum, c) => sum + (c.studentCount || 0), 0);

  // --- Classroom cards (max 4) ---
  const visibleClassrooms = classrooms.slice(0, 4);
  const hasMoreClassrooms = classrooms.length > 4;

  // --- Quick jump cards (role-based) ---
  const quickJumps = [
    { label: 'Stats', icon: <BarChart3 size={22} />, iconColor: 'var(--color-warning)', action: () => { trackEvent('quick_jump', { target: 'stats' }); onNavigate('/stats'); }, roles: 'all' },
    { label: 'People', icon: <UserPlus size={22} />, iconColor: 'var(--color-primary-light)', action: () => { trackEvent('quick_jump', { target: 'people' }); onNavigate('/addUser'); }, roles: 'admin' },
    { label: 'Export', icon: <Download size={22} />, iconColor: 'var(--color-secondary-light)', action: () => { trackEvent('quick_jump', { target: 'export' }); onNavigateToClassroomNotes?.(); }, roles: 'admin' },
    {
      label: 'Feedback',
      icon: <MessageSquare size={22} />,
      iconColor: 'var(--color-pink)',
      action: () => { trackEvent('quick_jump', { target: 'feedback' }); (isTeacher ? onNavigateToFeedback : onNavigateToFeedbackDashboard)?.(); },
      roles: 'all',
    },
  ].filter(j => j.roles === 'all' || (!isTeacher && j.roles === 'admin'));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', mb: 0.5 }}>
            {dateString}
          </Typography>
          <Typography sx={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.2 }}>
            Hey, {firstName}
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', mt: 0.5 }}>
            {classrooms.length} classroom{classrooms.length !== 1 ? 's' : ''} · {totalStudents} students
          </Typography>
        </Box>
        <Avatar
          name={currentUser?.displayName || currentUser?.email || 'U'}
          size="lg"
          color="var(--color-primary)"
          src={currentUser?.photoURL || undefined}
        />
      </Box>

      {/* ── Dynamic Island alert pill ─────────────────────── */}
      <DynamicIslandPill
        onNavigateToStudent={onNavigateToStudent}
        classrooms={classrooms}
      />

      {/* ── Classrooms section ─────────────────────────────── */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography variant="overline" sx={{ fontWeight: 700, color: 'var(--color-text)', letterSpacing: 1 }}>
            Your classrooms
          </Typography>
          {hasMoreClassrooms && (
            <ButtonBase
              onClick={onViewClassrooms}
              disableRipple
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.25,
                color: 'var(--color-text-soft)', fontSize: '0.75rem', fontWeight: 600,
              }}
            >
              View all <ChevronRight size={14} />
            </ButtonBase>
          )}
        </Box>

        {!classroomsLoaded ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3, justifyContent: 'center' }}>
            <CircularProgress size={20} sx={{ color: 'var(--color-primary)' }} />
            <Typography variant="body2" sx={{ color: 'var(--color-text-soft)' }}>
              Coach Pepper is fetching your classrooms...
            </Typography>
          </Box>
        ) : classrooms.length === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'var(--color-text-soft)' }}>
              You are assigned to zero classrooms. Please talk to admin.
            </Typography>
          </Box>
        ) : (
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: classrooms.length === 1 ? '1fr' : 'repeat(2, 1fr)',
            gap: 1.5,
          }}>
            {visibleClassrooms.map((classroom, index) => {
              const hasHex = classroom.color;
              const fallback = FALLBACK_PALETTES[index % FALLBACK_PALETTES.length];
              const iconColor = hasHex ? classroom.color : fallback[0];
              const bgColor = hasHex ? `${classroom.color}18` : fallback[1];
              const borderColor = hasHex ? `${classroom.color}30` : fallback[2];
              return (
                <ButtonBase
                  key={classroom.id}
                  onClick={() => onSelectClassroom(classroom)}
                  sx={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    p: 2, borderRadius: 3,
                    backgroundColor: bgColor,
                    border: `1px solid ${borderColor}`,
                    textAlign: 'left', width: '100%',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    '&:hover': { transform: 'translateY(-1px)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
                  }}
                >
                  <MiniTangram size={32} color={iconColor} sx={{ mb: 1.5 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.3 }}>
                    {classroom.name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'var(--color-text-soft)', mt: 0.25 }}>
                    {classroom.studentCount || 0} students
                  </Typography>
                </ButtonBase>
              );
            })}
          </Box>
        )}
      </Box>

      {/* ── Quick jump ─────────────────────────────────────── */}
      <Box>
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(quickJumps.length, 4)}, 1fr)`,
          gap: 1,
        }}>
          {quickJumps.map((item) => (
            <QuickJumpButton
              key={item.label}
              icon={item.icon}
              label={item.label}
              iconColor={item.iconColor}
              onClick={item.action}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

export default LandingPage;
