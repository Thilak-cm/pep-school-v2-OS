export const LESSON_PROGRAM_DIMENSIONS = {
  toddler: [
    'Focused during lesson',
    'Focused when repeating',
    'Grasped work'
  ],
  primary: [
    'Focused during lesson',
    'Focused when repeating',
    'Grasped work'
  ],
  elementary: [
    'Showed prerequisite recall',
    'Attentive',
    'Participative',
    'Excited for follow-up'
  ],
  adolescent: [
    'Prepared',
    'Showed prerequisite recall',
    'Attentive',
    'Participative',
    'Showed understanding'
  ]
};

/**
 * Placeholder practice note dimensions per program level.
 * Swap with Rahul's real labels when delivered (Takeaway R2, #227).
 * Same yes|partial|no|na rating scale as lesson dimensions.
 */
export const PRACTICE_PROGRAM_DIMENSIONS = {
  toddler: [
    'Dimension 1',
    'Dimension 2',
    'Dimension 3',
  ],
  primary: [
    'Dimension 1',
    'Dimension 2',
    'Dimension 3',
  ],
  elementary: [
    'Dimension 1',
    'Dimension 2',
    'Dimension 3',
  ],
  adolescent: [
    'Dimension 1',
    'Dimension 2',
    'Dimension 3',
  ],
};

// Hex literals intentional — downstream code concatenates hex-alpha suffixes (e.g. `${color}22`)
export const LESSON_RATING_OPTIONS = [
  { value: 'yes', label: 'Yes', color: '#0f766e' },
  { value: 'partial', label: 'Partially', color: '#ca8a04' },
  { value: 'no', label: 'No', color: '#dc2626' },
  { value: 'na', label: 'N/A', color: '#475569' }
];

export const LESSON_RATING_LABELS = {
  yes: 'Yes',
  partial: 'Partially',
  no: 'No',
  na: 'N/A'
};

// Hex literals intentional — downstream code concatenates hex-alpha suffixes (e.g. `${color}22`)
export const LESSON_RATING_COLORS = {
  yes: '#0f766e',
  partial: '#ca8a04',
  no: '#dc2626',
  na: '#475569'
};

export const deriveDimensionKeyFromProgram = (programId = 'primary') => {
  if (!programId) return 'primary';
  const normalized = String(programId).toLowerCase();
  if (normalized.includes('toddler')) return 'toddler';
  if (normalized.includes('elementary')) return 'elementary';
  if (normalized.includes('adolescent')) return 'adolescent';
  return 'primary';
};

export const normalizeClassroomId = (input) => {
  if (!input) return null;
  if (typeof input === 'string') {
    return input.includes('/') ? input.split('/').pop() : input;
  }
  if (typeof input === 'object') {
    if (input.id) return input.id;
    if (input.path) {
      const segments = String(input.path).split('/');
      return segments[segments.length - 1];
    }
  }
  return null;
};

export const getLessonDimensions = (observation = {}) => {
  const ratings = observation.ratings || observation.dimensionRatings || {};
  const order = Array.isArray(observation.dimensionOrder) && observation.dimensionOrder.length
    ? observation.dimensionOrder
    : Object.keys(ratings);
  return order.map((name) => ({
    name,
    value: ratings[name] || 'na'
  }));
};
