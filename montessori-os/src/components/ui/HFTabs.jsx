import { Tabs, Tab, Box } from '@mui/material';
import useSwipeTabs from '../../hooks/useSwipeTabs';

/**
 * Horizontal tab strip with icons + labels and swipe gesture support.
 *
 * @param {{
 *   tabs: Array<{ label: string, icon?: React.ReactNode, value?: string|number }>,
 *   value: string|number,
 *   onChange: (value: string|number) => void,
 *   sx?: object,
 * }} props
 */
export default function HFTabs({ tabs, value, onChange, sx }) {
  const currentIndex = tabs.findIndex((t) => (t.value ?? tabs.indexOf(t)) === value);

  const { containerRef } = useSwipeTabs({
    onSwipeLeft: () => {
      if (currentIndex < tabs.length - 1) {
        const next = tabs[currentIndex + 1];
        onChange(next.value ?? currentIndex + 1);
      }
    },
    onSwipeRight: () => {
      if (currentIndex > 0) {
        const prev = tabs[currentIndex - 1];
        onChange(prev.value ?? currentIndex - 1);
      }
    },
  });

  return (
    <Box ref={containerRef} sx={sx}>
      <Tabs
        value={value}
        onChange={(_, v) => onChange(v)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{
          '& .MuiTab-root': {
            minHeight: 44,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.85rem',
            color: 'var(--color-text-soft)',
            '&.Mui-selected': { color: 'var(--color-primary)' },
          },
          '& .MuiTabs-indicator': {
            backgroundColor: 'var(--color-primary)',
            height: 3,
            borderRadius: 'var(--radius-pill)',
          },
        }}
      >
        {tabs.map((tab, i) => (
          <Tab
            key={tab.value ?? i}
            value={tab.value ?? i}
            label={tab.label}
            icon={tab.icon || undefined}
            iconPosition="start"
          />
        ))}
      </Tabs>
    </Box>
  );
}
