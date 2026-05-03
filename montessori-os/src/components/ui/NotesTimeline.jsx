import { Box } from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

/**
 * Compact line graph with week markers — designed for the student dashboard
 * baseball card footer. Shows notes-over-time with minimal chrome.
 * Uses Recharts — color props require raw hex with exempt marker.
 *
 * @param {{
 *   data: Array<{ week: string, count: number }>,
 *   height?: number,
 *   color?: string,
 *   sx?: object,
 * }} props
 */
export default function NotesTimeline({
  data = [],
  height = 80,
  color,
  sx,
}) {
  const strokeColor = color || '#4f46e5'; /* Recharts — hex required */

  return (
    <Box sx={{ height, width: '100%', minWidth: 0, ...sx }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <XAxis
            dataKey="week"
            tick={{ fontSize: 9, fill: '#94a3b8' /* Recharts — hex required */ }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <ReferenceLine y={0} stroke="#e2e8f0" /* Recharts — hex required */ />
          <Line
            type="monotone"
            dataKey="count"
            stroke={strokeColor} /* Recharts — hex required */
            strokeWidth={2}
            dot={{ r: 2.5, fill: strokeColor /* Recharts — hex required */ }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
