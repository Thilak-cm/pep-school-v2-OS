// LandingPage.jsx — Teacher launchpad (PEP-190)
import React from 'react';
import { Box, Typography, ButtonBase, CircularProgress } from '@mui/material';
import { BarChart3, UserPlus, Download, MessageSquare, ChevronRight } from '../icons';
import { Avatar, MiniTangram } from './ui';

// Deterministic fallback color when classroom has no color field
const FALLBACK_COLORS = [
  '#5C6BC0', '#26A69A', '#EF5350', '#AB47BC',
  '#42A5F5', '#66BB6A', '#FFA726', '#EC407A',
];
const getFallbackColor = (id) =>
  FALLBACK_COLORS[Math.abs([...id].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)) % FALLBACK_COLORS.length];

function LandingPage({
  classrooms = [],
  onViewClassrooms,
  onSelectClassroom,
  userRole,
  currentUser,
  onNavigateToFeedbackDashboard,
  onNavigateToFeedback,
  onNavigateToClassroomNotes,
  onNavigate,
}) {
  const isTeacher = userRole === 'teacher';

  // --- Header data ---
  const displayName = currentUser?.displayName || currentUser?.email || 'there';
  const firstName = displayName.split(' ')[0];
  const now = new Date();
  const dateString = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const totalStudents = classrooms.reduce((sum, c) => sum + (c.studentCount || 0), 0);
  const initials = (currentUser?.displayName || currentUser?.email || 'U')
    .split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  // --- Classroom cards (max 4) ---
  const visibleClassrooms = classrooms.slice(0, 4);
  const hasMoreClassrooms = classrooms.length > 4;

  // --- Quick jump cards (role-based) ---
  const quickJumps = [
    { label: 'Stats', icon: <BarChart3 size={22} />, iconColor: 'var(--color-warning)', action: () => onNavigate('/stats'), roles: 'all' },
    { label: 'People', icon: <UserPlus size={22} />, iconColor: 'var(--color-primary-light)', action: () => onNavigate('/addUser'), roles: 'admin' },
    { label: 'Export', icon: <Download size={22} />, iconColor: 'var(--color-secondary-light)', action: onNavigateToClassroomNotes, roles: 'admin' },
    {
      label: 'Feedback',
      icon: <MessageSquare size={22} />,
      iconColor: 'var(--color-pink)',
      action: isTeacher ? onNavigateToFeedback : onNavigateToFeedbackDashboard,
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
          <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.2 }}>
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

        {classrooms.length === 0 ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3, justifyContent: 'center' }}>
            <CircularProgress size={20} sx={{ color: 'var(--color-primary)' }} />
            <Typography variant="body2" sx={{ color: 'var(--color-text-soft)' }}>
              Coach Pepper is fetching your classrooms...
            </Typography>
          </Box>
        ) : (
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: classrooms.length === 1 ? '1fr' : 'repeat(2, 1fr)',
            gap: 1.5,
          }}>
            {visibleClassrooms.map((classroom) => {
              const cardColor = classroom.color || getFallbackColor(classroom.id);
              return (
                <ButtonBase
                  key={classroom.id}
                  onClick={() => onSelectClassroom(classroom)}
                  sx={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    p: 2, borderRadius: 3,
                    backgroundColor: `${cardColor}14`,
                    textAlign: 'left', width: '100%',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    '&:hover': { transform: 'translateY(-1px)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
                  }}
                >
                  <MiniTangram size={32} color={cardColor} sx={{ mb: 1.5 }} />
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
        <Typography variant="overline" sx={{ fontWeight: 700, color: 'var(--color-text)', letterSpacing: 1, mb: 1, display: 'block' }}>
          Quick jump
        </Typography>
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(quickJumps.length, 4)}, 1fr)`,
          gap: 1,
        }}>
          {quickJumps.map((item) => (
            <ButtonBase
              key={item.label}
              onClick={item.action}
              sx={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                py: 1.5, px: 1, borderRadius: 3,
                backgroundColor: 'var(--color-paper)',
                border: '1px solid var(--color-border)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                '&:hover': { transform: 'translateY(-1px)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
              }}
            >
              <Box sx={{ color: item.iconColor, display: 'flex' }}>
                {item.icon}
              </Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'var(--color-text)' }}>
                {item.label}
              </Typography>
            </ButtonBase>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

export default LandingPage;
