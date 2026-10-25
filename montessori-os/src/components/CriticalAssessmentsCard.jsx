// CriticalAssessmentsCard.jsx - #313: High-criticality assessment chips on student dashboard
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Card, Typography } from '@mui/material';
import Chip from '@mui/material/Chip';
import { ChevronUp, ChevronDown } from '../icons';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import AssessmentMatrixSheet from './AssessmentMatrixSheet.jsx';

// Rolling window: 182 days (~6 months). Chosen over academic-year cutoff because
// criticality data starts flowing mid-year and a hard cutoff would show nothing
// for new schools.
const ROLLING_DAYS = 182;

// "Current value" contract (#313): attempts.length > 0 ? last(attempts).values[resultNumber] : results[0].sourceValue
function currentValue(obs) {
  const attempts = obs.attempts || [];
  if (attempts.length > 0) {
    const last = attempts[attempts.length - 1];
    const firstResultNum = (obs.resultDefinitions || [])[0]?.number;
    return firstResultNum != null ? (last.values?.[firstResultNum] ?? '') : '';
  }
  return (obs.results || [])[0]?.sourceValue ?? '';
}

export default function CriticalAssessmentsCard({ studentId }) {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;

    (async () => {
      try {
        const obsRef = collection(db, 'students', studentId, 'observations');
        const q = query(
          obsRef,
          where('type', '==', 'assessment'),
          where('assessmentKind', '==', 'structured'),
          where('criticality', '==', 'high'),
          orderBy('assessmentDate.endDate', 'desc'),
          limit(10),
        );
        const snap = await getDocs(q);
        if (cancelled) return;

        // Client-side rolling window filter
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - ROLLING_DAYS);
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        const results = snap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((obs) => (obs.assessmentDate?.endDate || '') >= cutoffStr);

        setAssessments(results);
      } catch (err) {
        // Error: log and return null - must not block dashboard
        console.error('[CriticalAssessmentsCard] query failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [studentId]);

  const handleChipClick = useCallback((obs) => {
    setSelectedSourceId(obs.sourceId);
    setMatrixOpen(true);
  }, []);

  const toggle = () => setExpanded((prev) => !prev);

  if (!loading && assessments.length === 0) return null;
  if (loading) return null;

  return (
    <>
      <Card sx={{
        borderRadius: 2,
        border: '1px solid var(--color-border)',
        background: 'var(--color-paper)',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        {/* Header - tap to toggle */}
        <Box
          onClick={toggle}
          role="button"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse critical assessments' : 'Expand critical assessments'}
          sx={{
            cursor: 'pointer',
            py: 1.25,
            px: 2,
            transition: 'background-color 0.15s ease',
            '&:hover': { backgroundColor: 'rgba(0,0,0,0.02)' },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{
              fontSize: '0.69rem', fontWeight: 700, color: 'var(--color-text-soft)',
              letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1,
            }}>
              Critical assessments
            </Typography>
            {expanded
              ? <ChevronUp size={16} style={{ color: 'var(--color-text-soft)' }} />
              : <ChevronDown size={16} style={{ color: 'var(--color-text-soft)' }} />}
          </Box>

          {/* Collapsed: horizontal scrollable chip row */}
          {!expanded && (
            <Box sx={{
              display: 'flex',
              gap: 0.75,
              mt: 1,
              overflowX: 'auto',
              pb: 0.5,
              '&::-webkit-scrollbar': { display: 'none' },
              scrollbarWidth: 'none',
            }}>
              {assessments.map((obs) => (
                <Chip
                  key={obs.id}
                  label={`${(obs.assessmentName || '').slice(0, 20)} - ${currentValue(obs)}`}
                  size="small"
                  variant="outlined"
                  onClick={(e) => { e.stopPropagation(); handleChipClick(obs); }}
                  sx={{
                    flexShrink: 0,
                    borderColor: 'var(--color-indigo-soft)',
                    color: 'var(--color-text)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    '&:hover': { backgroundColor: 'var(--color-indigo-bg)' },
                  }}
                />
              ))}
            </Box>
          )}
        </Box>

        {/* Expanded: vertical list */}
        {expanded && (
          <Box sx={{ px: 2, pb: 1.5 }}>
            {assessments.map((obs) => (
              <Box
                key={obs.id}
                onClick={() => handleChipClick(obs)}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  py: 1,
                  borderBottom: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  '&:last-child': { borderBottom: 'none' },
                  '&:hover': { backgroundColor: 'rgba(0,0,0,0.02)' },
                }}
              >
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--color-text)', fontWeight: 500 }}>
                  {obs.assessmentName}
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                  {currentValue(obs)}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Card>

      {/* Matrix sheet opened on chip/row tap */}
      <AssessmentMatrixSheet
        open={matrixOpen}
        onClose={() => setMatrixOpen(false)}
        sourceId={selectedSourceId}
        studentId={studentId}
        focusStudentId={studentId}
      />
    </>
  );
}
