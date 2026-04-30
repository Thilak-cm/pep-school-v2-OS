import { createTheme } from '@mui/material/styles';

// MUI theme — palette values mirror CSS custom properties in index.css.
// The CSS vars are the canonical source of truth; this theme exists
// so MUI components (Button, Card, AppBar, etc.) pick up the right
// palette for their internal styling.
const theme = createTheme({
  palette: {
    primary: {
      main: '#4f46e5', // sync with --color-primary in index.css
      light: '#6366f1',
      dark: '#4338ca',
    },
    secondary: {
      main: '#059669',
      light: '#10b981',
      dark: '#047857',
    },
    error: {
      main: '#dc2626',
      light: '#ef4444',
      dark: '#b91c1c',
    },
    warning: {
      main: '#f59e0b',
      light: '#fbbf24',
      dark: '#d97706',
    },
    info: {
      main: '#3b82f6',
      light: '#60a5fa',
      dark: '#2563eb',
    },
    success: {
      main: '#059669',
      light: '#10b981',
      dark: '#047857',
    },
    grey: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
    text: {
      primary: '#1e293b',
      secondary: '#64748b',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700, fontSize: '2rem', lineHeight: 1.2 },
    h2: { fontWeight: 600, fontSize: '1.875rem', lineHeight: 1.2 },
    h3: { fontWeight: 600, fontSize: '1.5rem', lineHeight: 1.2 },
    h4: { fontWeight: 600, fontSize: '1.25rem', lineHeight: 1.2 },
    h5: { fontWeight: 600, fontSize: '1.125rem', lineHeight: 1.2 },
    h6: { fontWeight: 600, fontSize: '1rem', lineHeight: 1.2 },
    body1: { fontSize: '1rem', lineHeight: 1.6 },
    body2: { fontSize: '0.875rem', lineHeight: 1.6 },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: 'var(--shadow-md)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'var(--color-paper)',
          color: 'var(--color-text)',
          boxShadow: 'var(--shadow-sm)',
        },
      },
    },
  },
});

export default theme;
