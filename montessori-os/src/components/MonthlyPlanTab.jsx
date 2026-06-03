import { useCallback, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { ChevronDown as ExpandMore, ChevronUp as ExpandLess } from '../icons';

const SECTIONS = [ // hex required — per-section brand tints, not theme tokens
  { key: 'Language', name: 'Language', tint: '#4f46e5', soft: '#e0e7ff' }, // hex required
  { key: 'Sensorial', name: 'Sensorial', tint: '#0d9488', soft: '#ccfbf1' }, // hex required
  { key: 'Math', name: 'Math', tint: '#d97706', soft: '#fef3c7' }, // hex required
  { key: 'Practical Life', name: 'Practical Life', tint: '#e11d48', soft: '#ffe4e6' }, // hex required
  { key: 'Grace & Courtesy', name: 'Grace & Courtesy', tint: '#7c3aed', soft: '#ede9fe' }, // hex required
];

export default function MonthlyPlanTab({ planData }) {
  const [activeSection, setActiveSection] = useState(0);
  const [expandedItem, setExpandedItem] = useState(-1); // all collapsed by default

  if (!planData) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No monthly plan available yet.
        </Typography>
      </Box>
    );
  }

  const sections = planData.sections || [];
  const currentSectionData = sections.find(s => s.name === SECTIONS[activeSection]?.key) || sections[activeSection] || null;
  const sectionMeta = SECTIONS.find(s => s.key === currentSectionData?.name) || SECTIONS[activeSection];
  const currentTint = sectionMeta?.tint || 'var(--grey-600)';
  const items = currentSectionData?.items || [];

  const handleSectionChange = (idx) => {
    setActiveSection(idx);
    setExpandedItem(-1); // all collapsed on section switch
  };

  const handleItemToggle = (idx) => {
    setExpandedItem(expandedItem === idx ? -1 : idx);
  };

  return (
    <Box sx={{ overflowX: 'hidden' }}>
      {/* Section pills — horizontally scrollable */}
      <Box sx={{
        display: 'flex',
        gap: 0.75,
        mb: 2,
        overflowX: 'auto',
        pb: 0.5,
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}>
        {SECTIONS.map((sec, idx) => {
          const isActive = activeSection === idx;
          return (
            <Chip
              key={sec.key}
              label={sec.name}
              size="small"
              onClick={() => handleSectionChange(idx)}
              sx={{
                flexShrink: 0,
                fontWeight: 600,
                fontSize: '12px',
                backgroundColor: isActive ? sec.tint : 'var(--color-paper)',
                color: isActive ? 'var(--color-paper)' : 'var(--color-text-soft)',
                border: isActive ? 'none' : '1px solid var(--color-border)',
                '&:hover': {
                  backgroundColor: isActive ? sec.tint : sec.soft,
                },
              }}
            />
          );
        })}
      </Box>

      {/* Item list */}
      <Box>
        {items.map((item, idx) => {
          const isExpanded = expandedItem === idx;
          return (
            <PlanItem
              key={idx}
              item={item}
              index={idx}
              isExpanded={isExpanded}
              isLast={idx === items.length - 1}
              currentTint={currentTint}
              sectionMeta={sectionMeta}
              onToggle={handleItemToggle}
            />
          );
        })}
      </Box>
    </Box>
  );
}

function PlanItem({ item, index, isExpanded, isLast, currentTint, sectionMeta, onToggle }) {
  const contentRef = useRef(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);

  const measureRef = useCallback((node) => {
    contentRef.current = node;
    if (node) {
      setMeasuredHeight(node.scrollHeight);
    }
  }, []);

  // Re-measure when expanded changes (content might differ)
  if (contentRef.current && isExpanded) {
    const h = contentRef.current.scrollHeight;
    if (h !== measuredHeight) setMeasuredHeight(h);
  }

  return (
    <Box
      onClick={() => onToggle(index)}
      sx={{
        cursor: 'pointer',
        borderBottom: !isLast ? '1px solid var(--color-surface)' : 'none',
        py: 1.25,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Header row — always visible */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 0.5 }}>
        <Typography sx={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.4 }}>
          <Typography component="span" sx={{
            fontSize: '10px',
            fontWeight: 700,
            color: currentTint,
            fontVariantNumeric: 'tabular-nums',
            mr: 0.75,
          }}>
            {String(index + 1).padStart(2, '0')}
          </Typography>
          {item.work}
        </Typography>
        <Box sx={{ pt: '2px', color: 'var(--grey-300)', flexShrink: 0 }}>
          {isExpanded ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
        </Box>
      </Box>

      {/* Collapsed preview — fades out when expanding */}
      <Box sx={{
        height: !isExpanded && item.next ? 'auto' : 0,
        opacity: !isExpanded && item.next ? 1 : 0,
        overflow: 'hidden',
        transition: 'opacity 200ms ease, height 200ms ease',
      }}>
        <Typography sx={{
          fontSize: '10.5px',
          color: 'var(--color-text-faint)',
          mt: 0.25,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {item.next}
        </Typography>
      </Box>

      {/* Expanded detail — animated height + opacity */}
      <Box sx={{
        height: isExpanded ? measuredHeight : 0,
        opacity: isExpanded ? 1 : 0,
        overflow: 'hidden',
        transition: 'height 280ms ease, opacity 250ms ease 80ms',
      }}>
        <Box ref={measureRef} sx={{ mt: 1 }}>
          <DetailBlock label="NEXT" value={item.next} />
          <DetailBlock label="WATCH FOR" value={item.watch} />
          {item.hook && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
              <Typography sx={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-text-faint)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                HOOK
              </Typography>
              <Typography sx={{ fontSize: '9px', color: 'var(--color-text-faint)' }}>↳</Typography>
              <Chip
                label={item.hook}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '10px',
                  backgroundColor: sectionMeta?.soft || 'var(--color-surface)',
                  color: currentTint,
                  fontWeight: 500,
                }}
              />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function DetailBlock({ label, value }) {
  if (!value) return null;
  return (
    <Box sx={{ mb: 1 }}>
      <Typography sx={{
        fontSize: '9px',
        fontWeight: 600,
        color: 'var(--color-text-faint)',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        mb: 0.25,
      }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '11px', color: 'var(--grey-600)', lineHeight: 1.5 }}>
        {value}
      </Typography>
    </Box>
  );
}
