import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { ChevronDown as ExpandMore, ChevronUp as ExpandLess } from '../icons';

const SECTIONS = [
  { key: 'Language', name: 'Language', tint: '#4f46e5', soft: '#e0e7ff' },
  { key: 'Sensorial', name: 'Sensorial', tint: '#0d9488', soft: '#ccfbf1' },
  { key: 'Math', name: 'Math', tint: '#d97706', soft: '#fef3c7' },
  { key: 'Practical Life', name: 'Practical Life', tint: '#e11d48', soft: '#ffe4e6' },
  { key: 'Grace & Courtesy', name: 'Grace & Courtesy', tint: '#7c3aed', soft: '#ede9fe' },
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
  const currentSectionData = sections[activeSection] || null;
  const currentTint = SECTIONS[activeSection]?.tint || '#666';
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
                backgroundColor: isActive ? sec.tint : '#fff',
                color: isActive ? '#fff' : '#64748b',
                border: isActive ? 'none' : '1px solid #e2e8f0',
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
            <Box
              key={idx}
              onClick={() => handleItemToggle(idx)}
              sx={{
                cursor: 'pointer',
                borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none',
                py: 1.25,
              }}
            >
              {/* Collapsed row */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Typography sx={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: currentTint,
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 18,
                  pt: '2px',
                }}>
                  {String(idx + 1).padStart(2, '0')}
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#1f2328', lineHeight: 1.4 }}>
                    {item.work}
                  </Typography>
                  {!isExpanded && item.next && (
                    <Typography sx={{
                      fontSize: '10.5px',
                      color: '#94a3b8',
                      mt: 0.25,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.next}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ pt: '2px', color: '#cbd5e1', flexShrink: 0 }}>
                  {isExpanded ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
                </Box>
              </Box>

              {/* Expanded detail */}
              {isExpanded && (
                <Box sx={{ ml: '26px', mt: 1 }}>
                  <DetailBlock label="WATCH FOR" value={item.watch} />
                  <DetailBlock label="NEXT" value={item.next} />
                  {item.hook && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                      <Typography sx={{ fontSize: '9px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        HOOK
                      </Typography>
                      <Typography sx={{ fontSize: '9px', color: '#94a3b8' }}>↳</Typography>
                      <Chip
                        label={item.hook}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '10px',
                          backgroundColor: SECTIONS[activeSection]?.soft || '#f1f5f9',
                          color: currentTint,
                          fontWeight: 500,
                        }}
                      />
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
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
        color: '#94a3b8',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        mb: 0.25,
      }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '11px', color: '#475569', lineHeight: 1.5 }}>
        {value}
      </Typography>
    </Box>
  );
}

