import { Box } from '@mui/material';
import {
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

/**
 * Line chart with X/Y axis labels and gridlines.
 * Uses Recharts — color props require raw hex with exempt marker.
 *
 * @param {{
 *   data: Array<Object>,
 *   xKey?: string,
 *   lines?: Array<{ key: string, color?: string, strokeWidth?: number }>,
 *   height?: number,
 *   showGrid?: boolean,
 *   showTooltip?: boolean,
 *   sx?: object,
 * }} props
 */
export default function LineChart({
  data = [],
  xKey = 'name',
  lines = [{ key: 'value' }],
  height = 250,
  showGrid = true,
  showTooltip = true,
  sx,
}) {
  return (
    <Box sx={{ height, width: '100%', minWidth: 0, ...sx }}>
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
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
          {lines.map((line) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              stroke={line.color || '#4f46e5' /* Recharts — hex required */}
              strokeWidth={line.strokeWidth || 2}
              dot={{ r: 3, fill: line.color || '#4f46e5' /* Recharts — hex required */ }}
              activeDot={{ r: 5 }}
            />
          ))}
        </RLineChart>
      </ResponsiveContainer>
    </Box>
  );
}
