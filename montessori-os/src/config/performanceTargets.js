/**
 * Performance Targets Configuration
 * 
 * This file centralizes all performance targets used throughout the application
 * for consistency and easy maintenance.
 */

export const PERFORMANCE_TARGETS = {
  // Student Performance
  STUDENT: {
    NOTES_PER_WEEK: 2,
    STRUGGLING_THRESHOLD: 0, // Students with fewer than this many notes need support
  },
  
  // Teacher Performance  
  TEACHER: {
    NOTES_PER_WEEK: 20,
  },
  
  // Classroom Performance
  CLASSROOM: {
    NOTES_PER_STUDENT_PER_WEEK: 2,
  },
  
  // Time Periods for Analytics
  TIME_PERIODS: {
    ONE_DAY: '1D',
    ONE_WEEK: '1W', 
    ONE_MONTH: '1M',
    THREE_MONTHS: '3M',
    SIX_MONTHS: '6M',
    ONE_YEAR: '1Y',
  },
  
  // Performance Thresholds
  THRESHOLDS: {
    HIGH_PERFORMANCE: 80, // 80% and above
    MEDIUM_PERFORMANCE: 60, // 60-79%
    LOW_PERFORMANCE: 0, // Below 60%
  }
};

// Helper functions for common calculations
export const calculateStudentPerformance = (notesThisWeek) => {
  const target = PERFORMANCE_TARGETS.STUDENT.NOTES_PER_WEEK;
  return Math.min((notesThisWeek / target) * 100, 100);
};

export const calculateTeacherPerformance = (notesThisWeek) => {
  const target = PERFORMANCE_TARGETS.TEACHER.NOTES_PER_WEEK;
  return (notesThisWeek / target) * 100;
};

export const calculateClassroomPerformance = (notesThisWeek, studentCount) => {
  const target = PERFORMANCE_TARGETS.CLASSROOM.NOTES_PER_STUDENT_PER_WEEK;
  return studentCount > 0 ? (notesThisWeek / (studentCount * target) * 100) : 0;
};

export const isHighPerformer = (performance) => performance >= PERFORMANCE_TARGETS.THRESHOLDS.HIGH_PERFORMANCE;
export const isMediumPerformer = (performance) => 
  performance >= PERFORMANCE_TARGETS.THRESHOLDS.MEDIUM_PERFORMANCE && 
  performance < PERFORMANCE_TARGETS.THRESHOLDS.HIGH_PERFORMANCE;
export const isLowPerformer = (performance) => performance < PERFORMANCE_TARGETS.THRESHOLDS.MEDIUM_PERFORMANCE;

export default PERFORMANCE_TARGETS;
