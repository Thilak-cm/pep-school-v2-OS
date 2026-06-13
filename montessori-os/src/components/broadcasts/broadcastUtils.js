// broadcastUtils.js — Shared helpers for broadcast components
// Centralises classification, audience resolution, and display formatting.

// ── Label color mapping ────────────────────────────────────────────────────────

const LABEL_COLORS = {
  'FROM OFFICE': 'var(--color-warning, #f59e0b)',
  'ANNOUNCEMENT': 'var(--color-primary)',
  'REMINDER': 'var(--color-secondary, #16a34a)',
  'URGENT': 'var(--color-error)',
};

export function labelColor(label) {
  return LABEL_COLORS[label] || 'var(--color-primary)';
}

// ── Label presets ──────────────────────────────────────────────────────────────

export const LABEL_PRESETS = ['FROM OFFICE', 'ANNOUNCEMENT', 'REMINDER', 'URGENT'];

// ── Priority mapping (UI ↔ backend) ────────────────────────────────────────────

export const PRIORITY_OPTIONS = [
  { label: 'Low', value: 4 },
  { label: 'Normal', value: 3 },
  { label: 'High', value: 2 },
];

export function priorityLabel(value) {
  return PRIORITY_OPTIONS.find(p => p.value === value)?.label
    || (value === 1 ? 'Urgent' : 'Normal');
}

export function priorityTint(value) {
  if (value <= 1) return { bg: 'var(--color-error-light, #fde8e8)', color: 'var(--color-error)' };
  if (value === 2) return { bg: 'var(--color-warning-light, #fef3c7)', color: 'var(--color-warning, #f59e0b)' };
  if (value === 3) return { bg: 'var(--color-surface, #f1f5f9)', color: 'var(--color-text-soft)' };
  return { bg: 'var(--color-surface, #f1f5f9)', color: 'var(--color-text-faint)' };
}

// ── Classify broadcast status ──────────────────────────────────────────────────

export function classifyBroadcast(broadcast) {
  const now = new Date();

  // Scheduled: startsAt exists and is in the future
  if (broadcast.startsAt) {
    const starts = broadcast.startsAt.toDate
      ? broadcast.startsAt.toDate()
      : new Date(broadcast.startsAt);
    if (starts > now) return 'scheduled';
  }

  // Done: expiresAt exists and is in the past
  if (broadcast.expiresAt) {
    const expires = broadcast.expiresAt.toDate
      ? broadcast.expiresAt.toDate()
      : new Date(broadcast.expiresAt);
    if (expires <= now) return 'done';
  }

  return 'live';
}

// ── Relative expiry display ────────────────────────────────────────────────────

export function relativeExpiry(expiresAt) {
  if (!expiresAt) return '';
  const exp = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
  const now = new Date();
  const diffMs = exp - now;
  const absDiffMs = Math.abs(diffMs);
  const isPast = diffMs < 0;

  const minutes = Math.floor(absDiffMs / 60000);
  const hours = Math.floor(absDiffMs / 3600000);
  const days = Math.floor(absDiffMs / 86400000);

  let text;
  if (days > 6) {
    text = exp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } else if (days >= 2) {
    text = `${days}d`;
  } else if (days === 1) {
    text = `${hours}h`;
  } else if (hours >= 1) {
    text = `${hours}h`;
  } else {
    text = `${minutes}m`;
  }

  return isPast ? `ended ${text} ago` : `ends in ${text}`;
}

// ── Relative startsAt display ──────────────────────────────────────────────────

export function relativeStartsAt(startsAt) {
  if (!startsAt) return '';
  const d = startsAt.toDate ? startsAt.toDate() : new Date(startsAt);
  const now = new Date();
  const diffMs = d - now;

  if (diffMs < 0) return 'now';

  const days = Math.floor(diffMs / 86400000);
  if (days === 0) {
    return `today ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }
  if (days === 1) {
    return `tomorrow ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }
  const dayName = d.toLocaleDateString('en-IN', { weekday: 'short' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dayName} ${time}`;
}

// ── Audience summary ───────────────────────────────────────────────────────────

export function getAudienceSummary(targetClassrooms = [], targetTeachers = [], classrooms = []) {
  const parts = [];
  if (targetClassrooms.length > 0) {
    const names = targetClassrooms.map(id => {
      const c = classrooms.find(cl => cl.id === id);
      return c?.name || id;
    });
    parts.push(names.join(', '));
  }
  if (targetTeachers.length > 0) {
    parts.push(`${targetTeachers.length} teacher${targetTeachers.length > 1 ? 's' : ''}`);
  }
  return parts.length > 0 ? parts.join(' + ') : 'All staff';
}

// ── Compute reach (audience count at publish time) ─────────────────────────────

export function computeReach(targetClassrooms = [], targetTeachers = [], allTeachers = [], classrooms = []) {
  // No targeting → all staff
  if (targetClassrooms.length === 0 && targetTeachers.length === 0) {
    return allTeachers.length;
  }

  const reachSet = new Set();

  // Teachers in targeted classrooms
  if (targetClassrooms.length > 0) {
    for (const classroom of classrooms) {
      if (targetClassrooms.includes(classroom.id)) {
        const teacherIds = classroom.teacherIds || [];
        teacherIds.forEach(id => reachSet.add(id));
      }
    }
  }

  // Directly targeted teachers
  if (targetTeachers.length > 0) {
    targetTeachers.forEach(id => reachSet.add(id));
  }

  return reachSet.size || allTeachers.length;
}

// ── Smart expiry chip defaults ─────────────────────────────────────────────────

export function getExpiryChips() {
  const now = new Date();

  // End of this week: next Friday 6pm (or if past Friday, Saturday 6pm)
  const dayOfWeek = now.getDay(); // 0=Sun, 5=Fri
  let daysToFriday = 5 - dayOfWeek;
  if (daysToFriday <= 0) daysToFriday += 7; // If already Fri/Sat/Sun, go to next Friday
  const friday = new Date(now);
  friday.setDate(friday.getDate() + daysToFriday);
  friday.setHours(18, 0, 0, 0);

  // One week from now
  const oneWeek = new Date(now);
  oneWeek.setDate(oneWeek.getDate() + 7);
  // Round to nearest hour
  oneWeek.setMinutes(0, 0, 0);

  return [
    { label: 'End of this week', value: friday },
    { label: 'One week from now', value: oneWeek },
  ];
}

// ── Timestamp helpers ──────────────────────────────────────────────────────────

export function toDatetimeLocal(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  if (!d || isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── User display name helper ───────────────────────────────────────────────────

export function userDisplayName(u) {
  if (u.displayName) return u.displayName;
  if (u.name) return u.name;
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ');
  if (full) return full;
  if (u.email) {
    const prefix = u.email.split('@')[0].replace(/[._-]/g, ' ');
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }
  return u.id;
}
