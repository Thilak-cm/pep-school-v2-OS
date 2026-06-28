// alertTransforms.js — Display transforms for DIP alerts (PEP-296)
// The DIP display contract lives here, NOT in Firestore. This means
// display changes are a frontend deploy — no data migration needed.

// ── Color map per alert type ─────────────────────────────────────────────────

const ALERT_COLORS = {
  redFlag: { label: 'var(--color-error)', cta: 'var(--color-error)', ctaBg: 'var(--color-error)', dot: 'var(--color-error)' },
  interview: { label: 'var(--color-secondary)', cta: 'var(--color-secondary)', ctaBg: 'var(--color-secondary)', dot: 'var(--color-secondary)' },
  broadcast: { label: 'var(--color-primary)', cta: 'var(--color-primary)', ctaBg: 'var(--color-primary)', dot: 'var(--color-primary)' },
  system: { label: 'var(--color-warning, #f59e0b)', cta: 'var(--color-warning, #f59e0b)', ctaBg: 'var(--color-warning, #f59e0b)', dot: 'var(--color-warning, #f59e0b)' },
  agent: { label: 'var(--color-secondary)', cta: 'var(--color-secondary)', ctaBg: 'var(--color-secondary)', dot: 'var(--color-secondary)' },
};

// ── Transform Firestore alert doc → DIP display shape ────────────────────────

export function transformForDisplay(alert) {
  const { type, payload = {} } = alert;

  switch (type) {
    case 'redFlag':
      return {
        label: 'RED FLAG',
        labelDetail: payload.flaggedBy ? `flagged by ${payload.flaggedBy}` : null,
        title: payload.studentName || 'Student',
        subtitle: payload.reason || 'Flagged this week',
        ctaLabel: 'Read note',
        ctaIcon: 'Flag',
        colorKey: 'redFlag',
        color: ALERT_COLORS.redFlag,
        ctaRoute: 'studentDashboard',
        ctaParams: { studentId: payload.studentId, studentName: payload.studentName, classroomId: payload.classroomId, flagOpen: true },
      };

    case 'interview':
      return {
        label: 'INTERVIEW',
        labelDetail: payload.interviewTime || null,
        title: payload.studentName || 'Student',
        subtitle: [payload.classroomName, payload.prepStatus].filter(Boolean).join(' · ') || '',
        ctaLabel: 'Open prep',
        ctaIcon: 'Calendar',
        colorKey: 'interview',
        color: ALERT_COLORS.interview,
        ctaRoute: 'interviews',
        ctaParams: { studentId: payload.studentId },
      };

    case 'broadcast': {
      const isPoll = alert.broadcastKind === 'poll';
      return {
        label: payload.label || 'BROADCAST',
        labelDetail: payload.senderName || null,
        title: payload.title || payload.message || '',
        subtitle: payload.subtitle || payload.audience || 'All staff',
        ctaLabel: isPoll ? 'Respond' : payload.ctaLabel,
        ctaIcon: 'ShieldCheck',
        colorKey: 'broadcast',
        color: ALERT_COLORS.broadcast,
        message: payload.message || '',
        broadcastKind: alert.broadcastKind || 'ack',
        poll: alert.poll || null,
      };
    }

    case 'system':
      return {
        label: 'SYSTEM',
        labelDetail: payload.severity || null,
        title: payload.message || 'System alert',
        subtitle: payload.detail || '',
        ctaLabel: 'View',
        ctaIcon: null,
        colorKey: 'system',
        color: ALERT_COLORS.system,
        ctaRoute: 'alerts',
        ctaParams: { alertId: alert.id },
      };

    case 'agent':
      return {
        label: 'AI INSIGHT',
        labelDetail: null,
        title: payload.message || 'Agent alert',
        subtitle: payload.detail || '',
        ctaLabel: 'View',
        ctaIcon: null,
        colorKey: 'agent',
        color: ALERT_COLORS.agent,
        ctaRoute: 'alerts',
        ctaParams: { alertId: alert.id },
      };

    default:
      return {
        label: (type || 'ALERT').toUpperCase(),
        labelDetail: null,
        title: payload.message || 'Alert',
        subtitle: '',
        ctaLabel: 'View',
        ctaIcon: null,
        colorKey: 'system',
        color: ALERT_COLORS.system,
        ctaRoute: 'alerts',
        ctaParams: { alertId: alert.id },
      };
  }
}

// ── Transform weekly_snapshot red flag → DIP display shape ───────────────────
// Used by useAlertBus for Source 1 (weekly_snapshot red flags)

/**
 * Transform a weekly_snapshot red flag into DIP display shape.
 * Only 'high' severity red flags are surfaced in DIP by design —
 * medium/low severity flags are filtered out here (returns null).
 */
export function transformRedFlag(signal, studentInfo) {
  const student = studentInfo[signal.studentId] || {};
  const severity = signal.redFlag?.severity;
  if (severity !== 'high') return null;

  return {
    label: 'RED FLAG',
    labelDetail: null,
    title: student.name || signal.studentId,
    subtitle: signal.redFlag?.reason || 'Flagged this week',
    ctaLabel: 'Read note',
    ctaIcon: 'Flag',
    colorKey: 'redFlag',
    color: ALERT_COLORS.redFlag,
    ctaRoute: 'studentDashboard',
    ctaParams: { studentId: signal.studentId, studentName: student.name, classroomId: student.classroomId, flagOpen: true },
    // Sort metadata
    priority: 0,
    createdAt: signal.generatedAt || null,
    _source: 'weekly_snapshot',
  };
}

export { ALERT_COLORS };
