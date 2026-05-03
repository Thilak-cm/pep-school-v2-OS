import { Box } from '@mui/material';
import {
  BarChart,
  Bar,
  ResponsiveContainer,
} from 'recharts';

/**
 * Mini sparkline bar chart — used for classroom activity indicators.
 * No axes, no labels, just tiny bars showing relative activity.
 * Uses Recharts — color props require raw hex with exempt marker.
 *
 * @param {{
 *   data: Array<{ value: number }>,
 *   height?: number,
 *   width?: number,
 *   color?: string,
 *   sx?: object,
 * }} props
 */
export default function Spark({
  data = [],
  height = 24,
  width = 60,
  color,
  sx,
}) {
  return (
    <Box sx={{ height, width, minWidth: 0, ...sx }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <Bar
            dataKey="value"
            fill={color || '#4f46e5' /* Recharts — hex required */}
            radius={[1, 1, 0, 0]}
            barSize={4}
          />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
