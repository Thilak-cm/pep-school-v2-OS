import { Box } from '@mui/material';
import {
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

/**
 * Vertical bar chart with labels.
 * Uses Recharts — color props require raw hex with exempt marker.
 *
 * @param {{
 *   data: Array<Object>,
 *   xKey?: string,
 *   bars?: Array<{ key: string, color?: string, stackId?: string }>,
 *   height?: number,
 *   showGrid?: boolean,
 *   showTooltip?: boolean,
 *   sx?: object,
 * }} props
 */
export default function BarChart({
  data = [],
  xKey = 'name',
  bars = [{ key: 'value' }],
  height = 250,
  showGrid = true,
  showTooltip = true,
  sx,
}) {
  return (
    <Box sx={{ height, width: '100%', minWidth: 0, ...sx }}>
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#f0f0f0" /* Recharts — hex required */
              vertical={false}
            />
          )}
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: '#64748b' /* Recharts — hex required */ }}
            axisLine={{ stroke: '#e2e8f0' /* Recharts — hex required */ }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#64748b' /* Recharts — hex required */ }}
            axisLine={false}
            tickLine={false}
          />
          {showTooltip && (
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-paper)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
              }}
            />
          )}
          {bars.map((bar) => (
            <Bar
              key={bar.key}
              dataKey={bar.key}
              fill={bar.color || '#4f46e5' /* Recharts — hex required */}
              radius={[4, 4, 0, 0]}
              stackId={bar.stackId}
            />
          ))}
        </RBarChart>
      </ResponsiveContainer>
    </Box>
  );
}
