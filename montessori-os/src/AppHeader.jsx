import { Typography, IconButton, Box } from '@mui/material';
import { ArrowLeft } from './icons';
import MiniTangram from './components/ui/MiniTangram.jsx';
import Avatar from './components/ui/Avatar.jsx';
import { calculateAgeFromDob } from './utils/dateFormat';

export const HEADER_HEIGHT = 60;

function getHeaderActions(screen, ctx) {
  switch (screen) {
    case 'classroomTimeline':
      return <MiniTangram size={28} />;
    case 'studentDashboard':
    case 'timeline':
    case 'studentReports':
    case 'childChat':
      return ctx.selectedStudent ? (
        <Avatar name={ctx.getStudentDisplayName(ctx.selectedStudent)} size="sm" />
      ) : null;
    default:
      return undefined;
  }
}

const AGE_SCREENS = new Set(['studentDashboard', 'timeline', 'studentReportTypes', 'studentReports', 'childChat']);

export default function AppHeader({ screen, ctx, onTitleClick }) {
  const onBack = ctx.showBackButton ? ctx.backNavigation : undefined;
  const actions = getHeaderActions(screen, ctx);
  const title = ctx.pageTitle;
  const isStudentScreen = AGE_SCREENS.has(screen);
  const ageString = isStudentScreen
    ? calculateAgeFromDob(ctx.selectedStudent?.dateOfBirth || ctx.selectedStudent?.dob)
    : null;
  const classroomName = isStudentScreen ? ctx.selectedClassroom?.name : null;
  const subtitle = [ageString, classroomName].filter(Boolean).join(' · ') || null;

  return (
    <Box
      component="header"
      sx={{
        position: 'fixed',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: { xs: '100%', sm: '420px' },
        zIndex: 1040,
        backgroundColor: 'color-mix(in srgb, var(--color-bg) 80%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        pb: '16px',
        maskImage: 'linear-gradient(to bottom, black calc(100% - 16px), transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 16px), transparent 100%)',
        px: { xs: 2, sm: 3 },
        boxSizing: 'border-box',
        '@media (max-width: 599px)': {
          '@supports (padding: env(safe-area-inset-top))': {
            paddingTop: 'env(safe-area-inset-top)',
          },
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 60,
          gap: 0.5,
        }}
      >
        {onBack && (
          <IconButton
            onClick={onBack}
            size="small"
            aria-label="Go back"
            sx={{
              color: 'var(--color-text-soft)',
              '&:hover': { backgroundColor: 'color-mix(in srgb, var(--color-text-soft) 8%, transparent)' },
            }}
          >
            <ArrowLeft size={20} />
          </IconButton>
        )}

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="h6"
            component="h1"
            onClick={onTitleClick}
            sx={{
              color: 'var(--color-text)',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '1.05rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              cursor: onTitleClick ? 'pointer' : 'default',
              userSelect: 'none',
              lineHeight: subtitle ? 1.2 : undefined,
            }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography
              sx={{
                color: 'var(--color-text-faint)',
                fontFamily: 'var(--font-body, inherit)',
                fontWeight: 400,
                fontSize: '0.75rem',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                userSelect: 'none',
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>

        {actions && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {actions}
          </Box>
        )}
      </Box>
    </Box>
  );
}
