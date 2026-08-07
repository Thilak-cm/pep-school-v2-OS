#!/usr/bin/env node
/**
 * Fetch observation timestamps from Firestore and generate a heatmap
 * of when teachers log notes, in IST (UTC+5:30).
 *
 * Output: scripts/data/observation-heatmap.html (interactive heatmap)
 *         scripts/data/observation-heatmap-data.json (timestamp-level source data)
 *         scripts/data/observation-heatmap-summary.json (aggregated results)
 *
 * Run live:   node scripts/data/observation-heatmap.mjs
 * From cache: node scripts/data/observation-heatmap.mjs --cache
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const useCache = args.has('--cache');
const dataPath = join(__dirname, 'observation-heatmap-data.json');

// Requested date range: June 1, 2026 through the time the script runs.
const START = new Date('2026-06-01T00:00:00+05:30'); // IST midnight
const END = new Date(); // now

const toIso = value => value?.toDate?.()?.toISOString() ?? null;

async function mapWithConcurrency(items, concurrency, task) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  ));
  return results;
}

async function fetchObservations() {
  initializeApp({ credential: applicationDefault(), projectId: 'pep-os' });
  const db = getFirestore();
  console.log(`Querying note creation times from ${START.toISOString()} to ${END.toISOString()}`);

  // A collection-group createdAt index is not enabled in this project. Querying
  // each student's subcollection uses Firestore's automatic single-field index
  // and, unlike the old observedAt workaround, selects the requested logging window.
  const studentsSnap = await db.collection('students').select().get();
  console.log(`  Students: ${studentsSnap.size}`);

  let completed = 0;
  const batches = await mapWithConcurrency(studentsSnap.docs, 20, async studentDoc => {
    const snap = await studentDoc.ref.collection('observations')
      .where('createdAt', '>=', Timestamp.fromDate(START))
      .where('createdAt', '<=', Timestamp.fromDate(END))
      .orderBy('createdAt', 'desc')
      .get();

    completed++;
    if (completed % 100 === 0 || completed === studentsSnap.size) {
      console.log(`  Queried ${completed}/${studentsSnap.size} students`);
    }

    return snap.docs.map(doc => {
      const d = doc.data();
      return {
        createdAt: toIso(d.createdAt),
        observedAt: toIso(d.observedAt),
        type: d.type ?? 'unknown',
        createdByName: d.createdByName ?? d.teacherName ?? 'unknown',
        studentId: studentDoc.id,
        classroomId: d.classroomId ?? 'unknown',
        branchId: d.branchId ?? 'unknown',
      };
    });
  });

  return batches.flat();
}

let allObs;
if (useCache) {
  allObs = JSON.parse(readFileSync(dataPath, 'utf8')).filter(obs => {
    const createdAt = obs.createdAt ? new Date(obs.createdAt) : null;
    return createdAt && createdAt >= START && createdAt <= END;
  });
  console.log(`Loaded ${allObs.length.toLocaleString()} observations from cache`);
} else {
  allObs = await fetchObservations();
  writeFileSync(dataPath, JSON.stringify(allObs, null, 2));
  console.log(`Timestamp-level data saved to ${dataPath}`);
}

console.log(`Total observations: ${allObs.length.toLocaleString()}`);

// --- Build heatmap data ---
// Convert UTC timestamps to IST and bucket by day-of-week and hour.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isWeekday = day => day >= 1 && day <= 5;
const isWorkWindow = (day, hour) => isWeekday(day) && hour >= 8 && hour < 16;
const latestCachedTimestamp = useCache
  ? Math.max(...allObs.map(obs => new Date(obs.createdAt).getTime()).filter(Number.isFinite))
  : NaN;
const ANALYSIS_END = Number.isFinite(latestCachedTimestamp)
  ? new Date(latestCachedTimestamp)
  : END;

// Heatmap: 7 days x 24 hours
const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0));

// Include every calendar date so zero-activity dates remain visible.
const dailyVolume = {};
for (
  let date = new Date(START.getTime() + IST_OFFSET_MS);
  date <= new Date(ANALYSIS_END.getTime() + IST_OFFSET_MS);
  date.setUTCDate(date.getUTCDate() + 1)
) {
  dailyVolume[date.toISOString().slice(0, 10)] = 0;
}

// Anomalies are entries outside 08:00-16:00 Monday-Friday in IST.
const anomalies = [];
const teacherTotals = {};
let validTimestampCount = 0;

for (const obs of allObs) {
  const ts = obs.createdAt;
  if (!ts) continue;

  const utcDate = new Date(ts);
  if (Number.isNaN(utcDate.getTime())) continue;
  validTimestampCount++;
  const istDate = new Date(utcDate.getTime() + IST_OFFSET_MS);

  const dayOfWeek = istDate.getUTCDay(); // 0=Sun
  const hour = istDate.getUTCHours();
  const teacher = obs.createdByName || 'unknown';

  heatmap[dayOfWeek][hour]++;
  teacherTotals[teacher] = (teacherTotals[teacher] || 0) + 1;

  // Daily volume
  const dateKey = istDate.toISOString().slice(0, 10);
  dailyVolume[dateKey] = (dailyVolume[dateKey] || 0) + 1;

  if (!isWorkWindow(dayOfWeek, hour)) {
    const category = !isWeekday(dayOfWeek)
      ? 'weekend'
      : hour < 8 ? 'early' : 'late';
    anomalies.push({
      createdAt: ts,
      istTime: `${hour.toString().padStart(2, '0')}:${istDate.getUTCMinutes().toString().padStart(2, '0')}`,
      istDay: DAY_NAMES[dayOfWeek],
      dateKey,
      category,
      type: obs.type,
      teacher,
      classroom: obs.classroomId,
    });
  }
}

// Summary stats
const totalInWindow = validTimestampCount - anomalies.length;
const anomalyCategoryCounts = anomalies.reduce((counts, anomaly) => {
  counts[anomaly.category]++;
  return counts;
}, { early: 0, late: 0, weekend: 0 });
const percent = (part, whole = validTimestampCount) =>
  whole ? (part / whole * 100).toFixed(1) : '0.0';

console.log(`\nIn-window (weekdays, 8am-4pm IST): ${totalInWindow} (${percent(totalInWindow)}%)`);
console.log(`Out-of-window: ${anomalies.length} (${percent(anomalies.length)}%)`);
console.log(`  Before 8am: ${anomalyCategoryCounts.early}`);
console.log(`  At/after 4pm: ${anomalyCategoryCounts.late}`);
console.log(`  Weekends: ${anomalyCategoryCounts.weekend}`);

// --- Generate HTML heatmap ---

// Prepare heatmap data for the chart
const heatmapPoints = [];
for (let day = 0; day < 7; day++) {
  for (let hour = 0; hour < 24; hour++) {
    heatmapPoints.push({ day, hour, count: heatmap[day][hour] });
  }
}

// Anomaly breakdown by hour (for the bar chart)
const anomalyByHour = new Array(24).fill(0);
for (const a of anomalies) {
  const h = parseInt(a.istTime.split(':')[0]);
  anomalyByHour[h]++;
}

// Anomaly breakdown by teacher
const anomalyByTeacher = {};
for (const a of anomalies) {
  anomalyByTeacher[a.teacher] = (anomalyByTeacher[a.teacher] || 0) + 1;
}
const topAnomalyTeachers = Object.entries(anomalyByTeacher)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .map(([teacher, count]) => ({
    teacher,
    count,
    total: teacherTotals[teacher] || count,
    percent: Number(percent(count, teacherTotals[teacher] || count)),
  }));

// Daily volume sorted
const dailySorted = Object.entries(dailyVolume).sort((a, b) => a[0].localeCompare(b[0]));
const activeDays = dailySorted.filter(([, count]) => count > 0).length;
const avgDailyVolume = dailySorted.length
  ? Math.round(validTimestampCount / dailySorted.length)
  : 0;

const hotspots = heatmapPoints
  .filter(point => point.count > 0)
  .sort((a, b) => b.count - a.count)
  .slice(0, 10)
  .map(point => ({
    day: DAY_NAMES[point.day],
    hour: point.hour,
    count: point.count,
    inWorkWindow: isWorkWindow(point.day, point.hour),
  }));

const summary = {
  generatedAt: new Date().toISOString(),
  timezone: 'Asia/Kolkata (IST, UTC+05:30)',
  dateRange: {
    startInclusive: START.toISOString(),
    endInclusive: ANALYSIS_END.toISOString(),
  },
  source: useCache ? 'cache' : 'Firestore students/{studentId}/observations createdAt',
  totalObservations: allObs.length,
  validCreatedAt: validTimestampCount,
  missingOrInvalidCreatedAt: allObs.length - validTimestampCount,
  calendarDays: dailySorted.length,
  activeDays,
  workWindow: {
    definition: 'Monday-Friday, 08:00 inclusive to 16:00 exclusive, IST',
    count: totalInWindow,
    percent: Number(percent(totalInWindow)),
  },
  offHours: {
    count: anomalies.length,
    percent: Number(percent(anomalies.length)),
    ...anomalyCategoryCounts,
  },
  hotspots,
  topOffHoursTeachers: topAnomalyTeachers,
};

const summaryPath = join(__dirname, 'observation-heatmap-summary.json');
writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(`Summary saved to ${summaryPath}`);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Observation Logging Heatmap - Pep OS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: #0f1117;
      color: #e0e0e0;
      padding: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 { font-size: 24px; margin-bottom: 4px; color: #fff; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 32px; }
    .stats-row {
      display: flex;
      gap: 16px;
      margin-bottom: 32px;
      flex-wrap: wrap;
    }
    .stat-card {
      background: #1a1d27;
      border: 1px solid #2a2d3a;
      border-radius: 12px;
      padding: 20px 24px;
      flex: 1;
      min-width: 180px;
    }
    .stat-card .label { color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-card .value { font-size: 32px; font-weight: 700; margin-top: 4px; }
    .stat-card .value.green { color: #4ade80; }
    .stat-card .value.amber { color: #fbbf24; }
    .stat-card .value.blue { color: #60a5fa; }

    .section { margin-bottom: 40px; }
    .section h2 { font-size: 18px; margin-bottom: 16px; color: #fff; }

    /* Heatmap */
    .heatmap-container { overflow-x: auto; }
    .heatmap {
      display: grid;
      grid-template-columns: 80px repeat(24, 1fr);
      gap: 2px;
      min-width: 700px;
    }
    .heatmap .day-label {
      font-size: 13px;
      display: flex;
      align-items: center;
      padding-right: 8px;
      color: #aaa;
    }
    .heatmap .hour-label {
      font-size: 11px;
      text-align: center;
      color: #666;
      padding-bottom: 4px;
    }
    .heatmap .cell {
      aspect-ratio: 1;
      min-height: 28px;
      border-radius: 4px;
      position: relative;
      cursor: pointer;
      transition: transform 0.1s;
    }
    .heatmap .cell:hover {
      transform: scale(1.2);
      z-index: 10;
    }
    .heatmap .cell .tooltip {
      display: none;
      position: absolute;
      bottom: 110%;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: #fff;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      white-space: nowrap;
      z-index: 20;
    }
    .heatmap .cell:hover .tooltip { display: block; }
    .heatmap .work-marker {
      border: 1px solid rgba(74, 222, 128, 0.3);
    }

    .legend {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 12px;
      font-size: 12px;
      color: #888;
    }
    .legend-cell {
      width: 16px;
      height: 16px;
      border-radius: 3px;
    }

    /* Daily volume chart */
    .daily-chart {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 200px;
      padding: 0 0 24px 0;
      position: relative;
    }
    .daily-bar-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      justify-content: flex-end;
      position: relative;
    }
    .daily-bar {
      width: 100%;
      max-width: 20px;
      border-radius: 3px 3px 0 0;
      position: relative;
      cursor: pointer;
    }
    .daily-bar:hover::after {
      content: attr(data-tip);
      position: absolute;
      bottom: 110%;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: #fff;
      padding: 3px 6px;
      border-radius: 4px;
      font-size: 11px;
      white-space: nowrap;
      z-index: 10;
    }
    .daily-label {
      font-size: 9px;
      color: #555;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      position: absolute;
      bottom: -60px;
      max-height: 50px;
      overflow: hidden;
    }

    /* Anomaly table */
    .anomaly-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .anomaly-table th {
      text-align: left;
      padding: 8px 12px;
      border-bottom: 1px solid #2a2d3a;
      color: #888;
      font-weight: 500;
    }
    .anomaly-table td {
      padding: 8px 12px;
      border-bottom: 1px solid #1a1d27;
    }
    .anomaly-table tr:hover td { background: #1a1d27; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
    }
    .badge.early { background: #312e81; color: #a5b4fc; }
    .badge.late { background: #78350f; color: #fcd34d; }

    .work-window-note {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(74, 222, 128, 0.1);
      border: 1px solid rgba(74, 222, 128, 0.2);
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 12px;
      color: #4ade80;
      margin-bottom: 12px;
    }
  </style>
</head>
<body>
  <h1>Observation Logging Heatmap</h1>
  <p class="subtitle">Pep OS - ${validTimestampCount.toLocaleString()} observations from ${dailySorted.at(0)?.[0] ?? 'n/a'} to ${dailySorted.at(-1)?.[0] ?? 'n/a'} · logging time from createdAt · all times IST${useCache ? ' · cached snapshot' : ''}</p>

  <div class="stats-row">
    <div class="stat-card">
      <div class="label">Total observations</div>
      <div class="value blue">${validTimestampCount.toLocaleString()}</div>
    </div>
    <div class="stat-card">
      <div class="label">In work window (weekdays, 8am-4pm)</div>
      <div class="value green">${totalInWindow.toLocaleString()} <span style="font-size:16px;color:#888">(${percent(totalInWindow)}%)</span></div>
    </div>
    <div class="stat-card">
      <div class="label">Outside work window</div>
      <div class="value amber">${anomalies.length.toLocaleString()} <span style="font-size:16px;color:#888">(${percent(anomalies.length)}%)</span></div>
      <div style="font-size:11px;color:#777;margin-top:5px">${anomalyCategoryCounts.early.toLocaleString()} early · ${anomalyCategoryCounts.late.toLocaleString()} late · ${anomalyCategoryCounts.weekend.toLocaleString()} weekend</div>
    </div>
    <div class="stat-card">
      <div class="label">Avg per calendar day</div>
      <div class="value blue">${avgDailyVolume.toLocaleString()}</div>
    </div>
  </div>

  <div class="section">
    <h2>Day of Week x Hour Heatmap</h2>
    <div class="work-window-note">&#9632; Green border = Monday-Friday, 8am-4pm work window</div>
    <div class="heatmap-container">
      <div class="heatmap" id="heatmap"></div>
    </div>
    <div class="legend">
      <span>Less</span>
      <div class="legend-cell" style="background: #161b22"></div>
      <div class="legend-cell" style="background: #0e4429"></div>
      <div class="legend-cell" style="background: #006d32"></div>
      <div class="legend-cell" style="background: #26a641"></div>
      <div class="legend-cell" style="background: #39d353"></div>
      <span>More</span>
    </div>
  </div>

  <div class="section">
    <h2>Daily Volume</h2>
    <div class="daily-chart" id="dailyChart"></div>
  </div>

  <div class="section">
    <h2>Off-Hours Logging by Teacher</h2>
    <p style="color:#888;font-size:13px;margin-bottom:12px">Teachers logging observations outside Monday-Friday, 8am-4pm IST</p>
    <table class="anomaly-table">
      <thead><tr><th>Teacher</th><th>Off-hours</th><th>Total</th><th>% off-hours</th></tr></thead>
      <tbody id="anomalyTeachers"></tbody>
    </table>
  </div>

  <script>
    const heatmapData = ${JSON.stringify(heatmapPoints)};
    const dailyData = ${JSON.stringify(dailySorted)};
    const anomalyTeachers = ${JSON.stringify(topAnomalyTeachers)};
    const dayNames = ${JSON.stringify(DAY_NAMES)};

    // Max value for color scale
    const maxCount = Math.max(...heatmapData.map(d => d.count));

    function getColor(count) {
      if (count === 0) return '#161b22';
      const ratio = count / maxCount;
      if (ratio < 0.15) return '#0e4429';
      if (ratio < 0.35) return '#006d32';
      if (ratio < 0.6) return '#26a641';
      return '#39d353';
    }

    // Build heatmap grid
    const grid = document.getElementById('heatmap');

    // Header row - corner cell + 24 hour labels
    grid.appendChild(Object.assign(document.createElement('div'), { className: 'day-label' }));
    for (let h = 0; h < 24; h++) {
      const label = document.createElement('div');
      label.className = 'hour-label';
      label.textContent = h.toString().padStart(2, '0');
      grid.appendChild(label);
    }

    // Data rows
    // Render Mon-Sun order (1,2,3,4,5,6,0)
    const dayOrder = [1, 2, 3, 4, 5, 6, 0];
    for (const day of dayOrder) {
      const dayLabel = document.createElement('div');
      dayLabel.className = 'day-label';
      dayLabel.textContent = dayNames[day];
      grid.appendChild(dayLabel);

      for (let hour = 0; hour < 24; hour++) {
        const point = heatmapData.find(d => d.day === day && d.hour === hour);
        const count = point ? point.count : 0;
        const cell = document.createElement('div');
        cell.className = 'cell' + (day >= 1 && day <= 5 && hour >= 8 && hour < 16 ? ' work-marker' : '');
        cell.style.backgroundColor = getColor(count);
        cell.innerHTML = '<span class="tooltip">' + dayNames[day] + ' ' + hour.toString().padStart(2, '0') + ':00 - ' + count + ' obs</span>';
        grid.appendChild(cell);
      }
    }

    // Daily volume chart
    const chart = document.getElementById('dailyChart');
    const maxDaily = Math.max(...dailyData.map(d => d[1]));
    for (const [date, count] of dailyData) {
      const wrap = document.createElement('div');
      wrap.className = 'daily-bar-wrap';
      const bar = document.createElement('div');
      bar.className = 'daily-bar';
      const heightPct = (count / maxDaily) * 100;
      bar.style.height = heightPct + '%';

      // Weekend coloring
      const dow = new Date(date + 'T00:00:00+05:30').getDay();
      bar.style.backgroundColor = (dow === 0 || dow === 6) ? '#fbbf24' : '#60a5fa';
      bar.setAttribute('data-tip', date + ': ' + count);
      wrap.appendChild(bar);
      chart.appendChild(wrap);
    }

    // Anomaly teachers table
    const tbody = document.getElementById('anomalyTeachers');
    for (const item of anomalyTeachers) {
      const row = document.createElement('tr');
      row.innerHTML = '<td>' + item.teacher + '</td><td>' + item.count.toLocaleString() +
        '</td><td>' + item.total.toLocaleString() + '</td><td>' + item.percent.toFixed(1) + '%</td>';
      tbody.appendChild(row);
    }
  </script>
</body>
</html>`;

const htmlPath = join(__dirname, 'observation-heatmap.html');
writeFileSync(htmlPath, html);
console.log(`\nHeatmap saved to ${htmlPath}`);

// Print heatmap summary to console
console.log('\n--- Heatmap (Day x Hour, IST) ---');
console.log('Hour:  ' + Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')).join(' '));
for (const day of [1, 2, 3, 4, 5, 6, 0]) {
  const row = heatmap[day].map(v => v.toString().padStart(2, ' ')).join('  ');
  console.log(`${DAY_NAMES[day].padEnd(10)} ${row}`);
}

console.log('\n--- Top off-hours teachers ---');
for (const item of topAnomalyTeachers) {
  console.log(`  ${item.teacher}: ${item.count}/${item.total} (${item.percent.toFixed(1)}%) outside work hours`);
}

console.log('\n--- Top day/hour hotspots ---');
for (const hotspot of hotspots) {
  console.log(
    `  ${hotspot.day} ${hotspot.hour.toString().padStart(2, '0')}:00: ` +
    `${hotspot.count} observations${hotspot.inWorkWindow ? ' (work window)' : ' (off-hours)'}`,
  );
}

console.log('\nDone!');
