/**
 * InterviewsPage helpers — mock data and pure filter functions.
 * Will be replaced with real Firestore data when PEP-122 (scheduling) lands.
 */

// --- Mock interview data (scaffold only) ---

export const MOCK_INTERVIEWS = [
  {
    id: 'mock-1',
    studentId: '2025-ADO-001',
    studentName: 'Aarav Deshmukh',
    classroomName: 'Periwinkle',
    status: 'upcoming',
    lastInterviewedAt: '2026-04-14T10:30:00+05:30',
    teacherName: 'Ms. Priya',
    exchangeCount: 0,
    hasAlert: true,
  },
  {
    id: 'mock-2',
    studentId: '2025-ADO-002',
    studentName: 'Meera Kulkarni',
    classroomName: 'Periwinkle',
    status: 'upcoming',
    lastInterviewedAt: '2026-04-07T09:15:00+05:30',
    teacherName: 'Ms. Priya',
    exchangeCount: 0,
    hasAlert: false,
  },
  {
    id: 'mock-3',
    studentId: '2025-ADO-003',
    studentName: 'Rohan Iyer',
    classroomName: 'Allstars',
    status: 'upcoming',
    lastInterviewedAt: null,
    teacherName: 'Mr. Karthik',
    exchangeCount: 0,
    hasAlert: false,
  },
  {
    id: 'mock-4',
    studentId: '2025-ADO-004',
    studentName: 'Ananya Bhat',
    classroomName: 'Periwinkle',
    status: 'completed',
    lastInterviewedAt: '2026-04-17T11:00:00+05:30',
    teacherName: 'Ms. Priya',
    exchangeCount: 7,
    hasAlert: false,
  },
  {
    id: 'mock-5',
    studentId: '2025-ADO-005',
    studentName: 'Kabir Nair',
    classroomName: 'Allstars',
    status: 'completed',
    lastInterviewedAt: '2026-04-16T14:20:00+05:30',
    teacherName: 'Mr. Karthik',
    exchangeCount: 9,
    hasAlert: true,
  },
  {
    id: 'mock-6',
    studentId: '2025-ADO-006',
    studentName: 'Diya Menon',
    classroomName: 'Allstars',
    status: 'upcoming',
    lastInterviewedAt: '2026-04-10T08:45:00+05:30',
    teacherName: 'Mr. Karthik',
    exchangeCount: 0,
    hasAlert: false,
  },
];

// Required fields for every interview entry
export const REQUIRED_FIELDS = ['id', 'studentId', 'studentName', 'classroomName', 'status', 'teacherName'];
export const VALID_STATUSES = ['upcoming', 'completed'];

// --- Filter functions ---

/**
 * Partition interviews into upcoming and completed lists.
 * @param {Array} interviews
 * @returns {{ upcoming: Array, completed: Array }}
 */
export function partitionInterviews(interviews) {
  const upcoming = [];
  const completed = [];
  for (const item of interviews) {
    if (item.status === 'completed') {
      completed.push(item);
    } else {
      upcoming.push(item);
    }
  }
  return { upcoming, completed };
}

/**
 * Get interviews that have an active alert flag.
 * @param {Array} interviews
 * @returns {Array}
 */
export function getAlertInterviews(interviews) {
  return interviews.filter((i) => i.hasAlert === true);
}

/**
 * Format "last interviewed" as a relative day string.
 * @param {string|null} isoDate
 * @returns {string}
 */
export function formatLastInterviewed(isoDate) {
  if (!isoDate) return 'Never interviewed';
  const then = new Date(isoDate);
  const now = new Date();
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}
