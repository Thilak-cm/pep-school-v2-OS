# Montessori OS - New Data Structure Design

## 🎯 **Design Principles**

1. **Consistent References**: Always use document IDs, never full paths
2. **Scalable**: Support 50+ teachers, 1000+ students efficiently
3. **Queryable**: Optimized indexes for common operations
4. **Extensible**: Easy to add new features without breaking changes
5. **Type-Safe**: Clear interfaces for all data structures

---

## 📊 **Core Collections**

### **1. Users** (`/users/{uid}`)
```typescript
interface User {
  // Core identity
  userID: string;                 // Firebase Auth UID
  email: string;                  // user@pepschoolv2.com
  firstName: string;
  lastName: string;
  // displayName computed as: firstName + " " + lastName
  
  // Role & permissions
  role: 'admin' | 'teacher';
  status: 'active' | 'inactive' | 'suspended';
  
  // Admin-specific (optional)
  adminLevel?: 'super' | 'regular';
  permissions?: string[];         // ["manage_users", "view_reports"]
  
  // Teacher-specific
  // Teachers are assigned to classrooms via classroom collection.userIDs array
  // No need for assignedClassrooms field in this user collection definition
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt: Timestamp;
}
```

### **2. Classrooms** (`/classrooms/{classroomId}`)
```typescript
interface Classroom {
  // Core info
  classroomID: string;                    // Auto-generated classroom ID
  name: string;                   // "Room 3" or "Power"
  description: string;             // "Primary (3-6 years)" or "Elementary (grade 1 - 5)"
  
  // Educational level
  ageGroup: 'toddlers' | 'primary' | 'elementary' | 'adolescence';  // Age group classification
  
  // Age group
  ageGroup: 'toddler' | 'primary' | 'elementary';
  
  // Status
  status: 'active' | 'inactive' | 'archived';
  
  // Teacher assignments
  teacherIDs: string[];           // Array of userIDs
  
  // Student count (calculated dynamically)
  studentCount: number;           // Number of active students
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;              // userID
}
```

### **3. Students** (`/students/{studentId}`)
```typescript
interface Student {
  // Core identity
  studentID: string;              // "2025-A2-016" (unique identifier)
  firstName: string;              // "Ayaansh"
  lastName: string;               // "Narain"
  // name computed as: firstName + " " + lastName
  
  // Classroom assignment
  classroomID: string;            // Reference to classroom ID
  
  // Personal info
  dateOfBirth: Timestamp;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  enrollmentDate: Timestamp;
  
  // Status
  status: 'active' | 'inactive' | 'graduated' | 'transferred' | 'withdrawn';
  
  // Contact info (for future parent features)
  parentEmail?: string;
  parentPhone?: string;
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  
  // Academic info
  grade?: string;                 // "K", "1st", "2nd"
  academicYear?: string;          // "2024-2025"
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;              // userID
}
```

### **4. Observations** (`/observations/{observationId}`)
```typescript
interface Observation {
  // Core data
  observationID: string;              // Auto-generated observationID
  studentID: string;              // Reference to studentID
  userID: string;                 // userID who created
  classroomID: string;            // Reference to classroom ID
  
  // Content
  type: 'voice' | 'text' | 'image' | 'video';
  text: string;                   // Transcribed text or manual input
  audioUrl?: string;              // Firebase Storage URL
  imageUrl?: string;              // Firebase Storage URL
  videoUrl?: string;              // Firebase Storage URL
  
  // Metadata
  timestamp: Timestamp;           // When observation was made
  duration?: number;              // Audio/video duration in seconds
  sttConfidence?: number;         // Speech-to-text confidence (0-1)
  
  // Categorization
  tags: string[];                 // Array of tag IDs (curriculum areas, behaviors, etc.)
  
  // Edit tracking
  editedAt?: Timestamp;
  editedBy?: string;              // userID who last edited
  editCount: number;              // Number of times edited
  
  // System fields
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### **5. Tags** (`/tags/{tagId}`)
```typescript
interface Tag {
  // Core info
  tagID: string;                    // Auto-generated tag ID
  name: string;                   // "Practical Life"
  description?: string;           // "Activities for daily living"
  
  // Categorization
  category: 'curriculum' | 'behavior' | 'milestone' | 'custom';
  subcategory?: string;          // "fine-motor", "social-skills"
  
  // UI properties
  color: string;                  // Hex color "#4f46e5"
  icon?: string;                  // Material icon name
  
  // Usage tracking
  usageCount: number;             // How many times used
  lastUsedAt?: Timestamp;
  
  // Status
  isActive: boolean;              // Can be disabled
  isSystem: boolean;              // System-created vs user-created
  
  // Metadata
  createdAt: Timestamp;
  createdBy: string;              // userID
  updatedAt: Timestamp;
}
```

### **6. Attendance** (`/attendance/{date}_{studentId}`)
```typescript
interface Attendance {
  // Composite key
  attendanceID: string;                    // "2024-01-15_2025-A2-016"
  date: string;                   // "2024-01-15" (YYYY-MM-DD)
  studentID: string;              // Reference to studentID
  classroomID: string;            // Reference to classroomID
  
  // Status
  status: 'present' | 'absent' | 'late' | 'excused' | 'partial';
  
  // Time tracking
  checkInTime?: Timestamp;        // When they arrived
  checkOutTime?: Timestamp;       // When they left
  totalHours?: number;            // Hours present
  
  // Notes
  notes?: string;                 // Teacher notes about attendance
  reason?: string;                // Reason for absence/late
  
  // Metadata
  recordedBy: string;             // userID who recorded
  recordedAt: Timestamp;
  updatedAt: Timestamp;
}
```

### **7. Assessments** (`/assessments/{assessmentId}`)
```typescript
interface Assessment {
  // Core info
  assessmentID: string;           // Auto-generated assessment ID
  studentID: string;              // Reference to studentID
  userID: string;                 // userID who conducted
  
  // Assessment details
  type: 'milestone' | 'academic' | 'behavioral' | 'social' | 'physical';
  title: string;                  // "Language Development Check"
  description?: string;           // Assessment description
  
  // Results
  score?: number;                 // Numeric score (0-100)
  level?: 'beginning' | 'developing' | 'proficient' | 'mastered';
  grade?: string;                 // "A", "B", "C", "D", "F"
  
  // Detailed results
  criteria: {
    name: string;                 // "Vocabulary"
    score: number;                // 0-100
    level: string;                // "proficient"
    notes?: string;               // Teacher notes
  }[];
  
  // Comments
  comments?: string;              // Overall teacher comments
  recommendations?: string[];     // ["Continue reading practice", "Focus on math"]
  
  // Metadata
  conductedAt: Timestamp;         // When assessment was done
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---
