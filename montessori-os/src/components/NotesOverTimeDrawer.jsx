import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { ChevronUp, ChevronDown } from '../icons';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';

const EXPANDED_CHART_HEIGHT = 160;

export default function NotesOverTimeDrawer({ data = [], loading = false, onToggle }) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    onToggle?.(next);
  };

  if (loading && data.length === 0) return null;
  if (data.length === 0) return null;

  return (
    <Box sx={{ borderTop: '1px solid var(--color-border)', flexShrink: 0, overflow: 'hidden' }}>
      {/* Grab handle + header — always visible, acts as tap target */}
      <Box
        onClick={toggle}
        role="button"
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse notes chart' : 'Expand notes chart'}
        sx={{
          cursor: 'pointer',
          backgroundColor: '#fafaf7',
          pt: 1,
          pb: expanded ? 0.5 : 1,
          px: 2,
          transition: 'background-color 0.15s ease',
          '&:hover': { backgroundColor: '#f5f5f0' },
        }}
      >
        {/* Header row */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography sx={{
              fontSize: '0.69rem', fontWeight: 700, color: 'var(--color-text-soft)',
              letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1,
            }}>
              Notes over time
            </Typography>

            {/* Mini sparkline — collapsed only */}
            {!expanded && (
              <Box sx={{ width: 80, height: 18, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#4f46e5" /* Recharts */
                      strokeWidth={1.5}
                      dot={({ cx, cy, index }) => index === data.length - 1 ? <circle key="last" cx={cx} cy={cy} r={2.5} fill="#4f46e5" /> : null} /* Recharts */
                      activeDot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Box>

          {expanded
            ? <ChevronUp size={20} style={{ color: 'var(--color-text-soft)' }} />
            : <ChevronDown size={20} style={{ color: 'var(--color-text-soft)' }} />
          }
        </Box>
      </Box>

      {/* Expandable chart area */}
      <Box sx={{
        height: expanded ? EXPANDED_CHART_HEIGHT : 0,
        transition: 'height 280ms ease',
        overflow: 'hidden',
        backgroundColor: '#fafaf7',
      }}>
        <Box sx={{
          opacity: expanded ? 1 : 0,
          transition: 'opacity 250ms ease 80ms',
          px: 2, pb: 1.5,
        }}>
          <Box sx={{ height: 120, width: '100%' }}>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} /> {/* Recharts */}
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 9, fill: '#94a3b8' /* Recharts */ }}
                  axisLine={{ stroke: '#e2e8f0' /* Recharts */ }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: '#94a3b8' /* Recharts */ }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                  tickFormatter={(v) => Math.round(v)}
                  allowDecimals={false}
                />
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (active && payload?.length) {
                      return (
                        <Box sx={{
                          backgroundColor: 'var(--color-paper)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 1.5, px: 1.5, py: 0.75,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}>
                          <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                            {payload[0].value} {payload[0].value === 1 ? 'note' : 'notes'}
                          </Typography>
                          <Typography sx={{ fontSize: '0.65rem', color: 'var(--color-text-faint)' }}>
                            {payload[0].payload.period}
                          </Typography>
                        </Box>
                      );
                    }
                    return null;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#4f46e5" /* Recharts */
                  strokeWidth={2.5}
                  dot={{ fill: '#4f46e5', strokeWidth: 2, r: 3, stroke: '#fff' /* Recharts */ }}
                  activeDot={{ r: 5, stroke: '#4f46e5', strokeWidth: 2, fill: '#fff' /* Recharts */ }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
