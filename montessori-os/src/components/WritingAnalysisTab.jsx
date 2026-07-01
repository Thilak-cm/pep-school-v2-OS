import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import {
  TrendingUp,
  TrendingDown,
  MinusCircle,
  ChevronDown as ExpandMore,
  ChevronUp as ExpandLess,
  Pencil,
  Image as ImageIcon,
} from '../icons';

const MIN_SAMPLES = 3;

/**
 * Convert a camelCase key to a human-readable label.
 * e.g. "handControl" → "Hand Control", "spellingAndSoundWork" → "Spelling & Sound Work"
 */
function camelCaseToLabel(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/\band\b/gi, '&')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}


function TrendIcon({ trend }) {
  if (trend === 'improving') return <TrendingUp size={16} style={{ color: '#16a34a' }} />;
  if (trend === 'declining') return <TrendingDown size={16} style={{ color: '#d97706' }} />;
  if (trend === 'stable') return <MinusCircle size={14} style={{ color: 'var(--grey-400, #9ca3af)' }} />;
  return <MinusCircle size={14} style={{ color: 'var(--grey-300, #d1d5db)' }} />;
}

// ── Empty states ──

function EmptyNoPhotos() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, minHeight: 'calc(100% - 48px)', textAlign: 'center' }}>
      <Box sx={{ width: 56, height: 56, borderRadius: 4, background: 'linear-gradient(135deg, var(--color-violet-bg) 0%, rgba(79, 70, 229, 0.08) 100%)', border: '1px solid var(--color-violet-soft, rgba(124, 58, 237, 0.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-violet)' }}>
        <ImageIcon size={26} />
      </Box>
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)' }}>
        No photos uploaded yet
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: 'var(--color-text-soft)', maxWidth: 260, lineHeight: 1.5 }}>
        Upload 3 handwritten notes to trigger writing analysis for this week
      </Typography>
    </Box>
  );
}

function EmptyBelowThreshold({ hwCount, totalMediaCount }) {
  const needed = MIN_SAMPLES - hwCount;
  const otherCount = totalMediaCount - hwCount;
  const progress = (hwCount / MIN_SAMPLES) * 100;
  const hasAnyHw = hwCount > 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, minHeight: 'calc(100% - 48px)', textAlign: 'center' }}>
      <Box sx={{ width: 56, height: 56, borderRadius: 4, background: 'linear-gradient(135deg, var(--color-violet-bg) 0%, rgba(79, 70, 229, 0.08) 100%)', border: '1px solid var(--color-violet-soft, rgba(124, 58, 237, 0.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-violet)' }}>
        <Pencil size={26} />
      </Box>
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)', maxWidth: 280 }}>
        {hasAnyHw
          ? `${hwCount} handwriting photo${hwCount === 1 ? '' : 's'} out of ${totalMediaCount} total — need at least 3`
          : `${totalMediaCount} photo${totalMediaCount === 1 ? '' : 's'} uploaded, but none detected as handwriting`}
      </Typography>

      {/* Breakdown bar */}
      <Box sx={{ width: '100%', maxWidth: 280, border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 2, p: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography sx={{ fontSize: '0.75rem', color: 'var(--color-text)' }}>
            <strong>{hwCount}</strong> handwriting
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'var(--color-text-soft)' }}>
            of 3 needed
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={Math.min(progress, 100)}
          sx={{
            height: 6, borderRadius: 3, mb: 0.75,
            backgroundColor: 'var(--grey-200, #e5e7eb)',
            '& .MuiLinearProgress-bar': { backgroundColor: 'var(--color-primary, #4f46e5)', borderRadius: 3 },
          }}
        />
        <Box sx={{ display: 'flex', gap: 1.5, fontSize: '0.7rem', color: 'var(--color-text-soft)' }}>
          <span>■ Handwriting ({hwCount})</span>
          <span style={{ color: 'var(--grey-400, #9ca3af)' }}>■ Other ({otherCount})</span>
        </Box>
      </Box>

      <Typography sx={{ fontSize: '0.8rem', color: 'var(--color-text-soft)', maxWidth: 280, lineHeight: 1.5 }}>
        {hasAnyHw
          ? `Log ${needed} more handwriting photo${needed === 1 ? '' : 's'} this week to see a writing snapshot next Monday`
          : 'Log at least 3 handwriting photos (notebooks, worksheets, written work) this week to see a writing snapshot next Monday'}
      </Typography>
    </Box>
  );
}

// ── Dimension rating card ──

function DimensionCard({ dimKey, rating }) {
  const label = camelCaseToLabel(dimKey);
  const hasScore = rating.score !== null && rating.score !== undefined;

  return (
    <Box sx={{
      border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 2, p: 1.25,
      display: 'flex', flexDirection: 'column', gap: 0.25, position: 'relative', minHeight: 64,
    }}>
      <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
        <TrendIcon trend={rating.trend} />
      </Box>
      <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: hasScore ? 'var(--color-text)' : 'var(--grey-400)' }}>
        {hasScore ? rating.score : '–'}
        <Typography component="span" sx={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--color-text-soft)' }}>/5</Typography>
      </Typography>
      <Typography sx={{ fontSize: '0.72rem', color: 'var(--color-text-soft)', lineHeight: 1.3, pr: 2 }}>
        {label}
      </Typography>
    </Box>
  );
}

// ── Recommendation row ──

function RecommendationRow({ rec, isExpanded, onToggle, isLast }) {
  const contentRef = useRef(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);

  const measureRef = useCallback((node) => {
    contentRef.current = node;
    if (node) setMeasuredHeight(node.scrollHeight);
  }, []);

  // Re-measure when expanded (must be in useEffect, not render phase)
  useEffect(() => {
    if (isExpanded && contentRef.current) {
      const h = contentRef.current.scrollHeight;
      if (h !== measuredHeight) setMeasuredHeight(h);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- measuredHeight intentionally omitted to avoid re-measure loop
  }, [isExpanded]);

  return (
    <Box
      onClick={onToggle}
      sx={{
        cursor: 'pointer', py: 1,
        borderBottom: isLast ? 'none' : '1px solid var(--color-border, #e5e7eb)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
          background: 'var(--color-primary, #4f46e5)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.7rem', fontWeight: 700,
        }}>
          {rec.priority}
        </Box>
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)', flex: 1, lineHeight: 1.3 }}>
          {rec.area}
        </Typography>
        <Chip
          label={rec.montessoriApproach}
          size="small"
          sx={{
            fontSize: '0.65rem', height: 20, flexShrink: 0,
            backgroundColor: 'var(--color-violet-bg, #ede9fe)',
            color: 'var(--color-violet, #7c3aed)',
            fontWeight: 600, border: 'none',
          }}
        />
        <Box sx={{ pt: '2px', color: 'var(--grey-300)', flexShrink: 0 }}>
          {isExpanded ? <ExpandLess size={16} /> : <ExpandMore size={16} />}
        </Box>
      </Box>
      <Box sx={{
        height: isExpanded ? measuredHeight : 0,
        opacity: isExpanded ? 1 : 0,
        overflow: 'hidden',
        transition: 'height 280ms ease, opacity 250ms ease 80ms',
      }}>
        <Box ref={measureRef}>
          <Typography sx={{ fontSize: '0.78rem', color: 'var(--grey-600)', mt: 0.75, ml: 3.75, lineHeight: 1.5 }}>
            {rec.action}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

// ── Main component ──

export default function WritingAnalysisTab({ writingData, hwCount, totalMediaCount }) {
  const [expandedRec, setExpandedRec] = useState(0);

  // ── Empty states ──
  if (!writingData || writingData.status === 'skipped') {
    // No media at all
    if (!totalMediaCount || totalMediaCount === 0) {
      return <EmptyNoPhotos />;
    }
    // Has media but below threshold
    return <EmptyBelowThreshold hwCount={hwCount || 0} totalMediaCount={totalMediaCount} />;
  }

  // ── Data present — render full analysis ──
  const { narrative, dimensionRatings, recommendations } = writingData;
  const sortedRecs = Array.isArray(recommendations)
    ? [...recommendations].sort((a, b) => (a.priority || 0) - (b.priority || 0))
    : [];
  const dimEntries = dimensionRatings ? Object.entries(dimensionRatings) : [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 0.5 }}>
      {/* ── Narrative ── */}
      {narrative && (
        <Typography variant="body2" sx={{ color: 'var(--grey-700)', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
          {narrative}
        </Typography>
      )}

      {/* ── Ratings ── */}
      {dimEntries.length > 0 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
            <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text)' }}>
              Ratings
            </Typography>
            <Typography sx={{ fontSize: '0.68rem', color: 'var(--color-text-soft)' }}>
              score 1–5 · trend vs. last
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            {dimEntries.map(([key, rating]) => (
              <DimensionCard key={key} dimKey={key} rating={rating} />
            ))}
          </Box>
        </Box>
      )}

      {/* ── Recommendations ── */}
      {sortedRecs.length > 0 && (
        <Box>
          <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text)', mb: 0.5 }}>
            What to offer next
          </Typography>
          {sortedRecs.map((rec, idx) => (
            <RecommendationRow
              key={idx}
              rec={rec}
              isExpanded={expandedRec === idx}
              onToggle={() => setExpandedRec(expandedRec === idx ? -1 : idx)}
              isLast={idx === sortedRecs.length - 1}
            />
          ))}
        </Box>
      )}

      {/* Confidence moved to parent chip row (Gauge icon) */}
    </Box>
  );
}
