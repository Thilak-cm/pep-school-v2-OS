import { Box, Typography } from '@mui/material';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';

/**
 * Ring/donut chart with center text.
 * Uses Recharts — color props require raw hex with exempt marker.
 *
 * @param {{
 *   data: Array<{ name: string, value: number, color?: string }>,
 *   centerLabel?: string,
 *   centerValue?: string|number,
 *   size?: number,
 *   innerRadius?: number,
 *   outerRadius?: number,
 *   sx?: object,
 * }} props
 */

const DEFAULT_COLORS = [
  '#4f46e5', /* Recharts — hex required */
  '#059669', /* Recharts — hex required */
  '#f59e0b', /* Recharts — hex required */
  '#dc2626', /* Recharts — hex required */
  '#8b5cf6', /* Recharts — hex required */
  '#0ea5e9', /* Recharts — hex required */
];

export default function Donut({
  data = [],
  centerLabel,
  centerValue,
  size = 160,
  innerRadius,
  outerRadius,
  sx,
}) {
  const outer = outerRadius || size * 0.42;
  const inner = innerRadius || outer * 0.65;

  return (
    <Box sx={{ position: 'relative', width: size, height: size, ...sx }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={inner}
            outerRadius={outer}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, i) => (
              <Cell
                key={entry.name || i}
                fill={entry.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} /* Recharts — hex required */
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Center text overlay */}
      {(centerLabel || centerValue != null) && (
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          {centerValue != null && (
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: size * 0.14,
                lineHeight: 1.1,
                color: 'var(--color-text)',
              }}
            >
              {centerValue}
            </Typography>
          )}
          {centerLabel && (
            <Typography
              sx={{
                fontSize: size * 0.07,
                color: 'var(--color-text-soft)',
                fontWeight: 500,
              }}
            >
              {centerLabel}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
