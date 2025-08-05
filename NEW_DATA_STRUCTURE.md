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
  uid: string;                    // Firebase Auth UID
  email: string;                  // user@pepschoolv2.com
  displayName: string;            // "John Smith"
  photoURL?: string;              // Google profile photo
  
  // Role & permissions
  role: 'admin' | 'teacher';
  status: 'active' | 'inactive' | 'suspended';
  
  // Admin-specific
  adminLevel?: 'super' | 'regular';
  permissions?: string[];         // ["manage_users", "view_reports"]
  
  // Teacher-specific
  // Teachers are assigned to classrooms via classroom.teacherIds array
  // No need for assignedClassrooms field in user document
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt: Timestamp;
  
  // Preferences
  preferences: {
    language: 'en' | 'es';
    timezone: string;             // "America/New_York"
    notifications: boolean;
    theme: 'light' | 'dark' | 'auto';
  };
}
```

### **2. Classrooms** (`/classrooms/{classroomId}`)
```typescript
interface Classroom {
  // Core info
  cid: string;                    // Auto-generated classroom ID
  name: string;                   // "Room 3" or "Power"
  description?: string;
  
  // Age group
  ageGroup: 'toddler' | 'primary' | 'elementary';
  
  // Status
  status: 'active' | 'inactive' | 'archived';
  
  // Teacher assignments
  teacherIds: string[];           // Array of user UIDs
  
  // Student count (calculated dynamically)
  studentCount: number;           // Number of active students
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;              // User UID
}
```

### **3. Students** (`/students/{studentId}`)
```typescript
interface Student {
  // Core identity
  sid: string;                    // Auto-generated student ID
  studentId: string;              // "2025-A2-016" (unique identifier)
  name: string;                   // "Ayaansh Narain"
  firstName: string;              // "Ayaansh"
  lastName: string;               // "Narain"
  
  // Classroom assignment
  classroomId: string;            // Reference to classroom cid
  
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
  createdBy: string;              // User UID
}
```

### **4. Observations** (`/observations/{observationId}`)
```typescript
interface Observation {
  // Core data
  oid: string;                    // Auto-generated observation ID
  studentId: string;              // Reference to student sid
  teacherId: string;              // User UID who created
  classroomId: string;            // Reference to classroom cid
  
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
  
  // Flags
  isStarred: boolean;             // "Magic Moment" flag
  isPrivate: boolean;             // Private observation
  isDraft: boolean;               // Draft status
  
  // Edit tracking
  editedAt?: Timestamp;
  editedBy?: string;              // User UID who last edited
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
  tid: string;                    // Auto-generated tag ID
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
  createdBy: string;              // User UID
  updatedAt: Timestamp;
}
```

### **6. Attendance** (`/attendance/{date}_{studentId}`)
```typescript
interface Attendance {
  // Composite key
  aid: string;                    // "2024-01-15_2025-A2-016"
  date: string;                   // "2024-01-15" (YYYY-MM-DD)
  studentId: string;              // Reference to student sid
  classroomId: string;            // Reference to classroom cid
  
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
  recordedBy: string;             // User UID who recorded
  recordedAt: Timestamp;
  updatedAt: Timestamp;
}
```

### **7. Assessments** (`/assessments/{assessmentId}`)
```typescript
interface Assessment {
  // Core info
  asid: string;                   // Auto-generated assessment ID
  studentId: string;              // Reference to student sid
  teacherId: string;              // User UID who conducted
  
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

## 🔗 **Reference Strategy**

### **Consistent Reference Format**
```typescript
// ALWAYS use document IDs, never full paths
classroomId: "classroom-1"        // ✅ Correct
classroomId: "/classrooms/classroom-1"  // ❌ Wrong

// In queries, convert to DocumentReference when needed
const classroomRef = doc(db, 'classrooms', classroomId);
```

### **Composite Indexes**
Composite indexes optimize queries that filter on multiple fields. They're essential for performance with larger datasets.

```json
{
  "indexes": [
    {
      "collectionGroup": "observations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "studentId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "observations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "classroomId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "students",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "classroomId", "order": "ASCENDING" },
        { "fieldPath": "name", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "attendance",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "date", "order": "ASCENDING" },
        { "fieldPath": "classroomId", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "observations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "teacherId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    }
  ]
}
```

**Why Composite Indexes Matter:**
- **Without them**: Queries with multiple filters are slow or fail
- **With them**: Fast queries for common operations like "get all observations for a student, ordered by date"
- **Example**: `where('studentId', '==', 'sid-1')` + `orderBy('timestamp', 'desc')` needs a composite index

---

## 🚀 **Migration Plan**

### **Phase 1: Schema Setup (Week 1)**
1. **Create new collections** with proper structure
2. **Set up composite indexes** for performance
3. **Update Firestore rules** for new schema
4. **Create migration scripts** for existing data

### **Phase 2: Data Migration (Week 2)**
1. **Migrate existing users** to new format
2. **Migrate classrooms** with proper teacher assignments
3. **Migrate students** with consistent references
4. **Migrate observations** with new field names
5. **Create initial tags** for curriculum areas

### **Phase 3: Code Updates (Week 3)**
1. **Update all components** to use new field names
2. **Implement proper error handling** for missing data
3. **Add data validation** on write operations
4. **Update queries** to use new indexes

### **Phase 4: New Features (Week 4+)**
1. **Implement tags system** with UI
2. **Add attendance tracking**
3. **Build assessment system**
4. **Add reporting features**

---

## 🎯 **Benefits**

✅ **No More Parsing Issues**: Consistent document ID references  
✅ **Scalable**: Supports 1000+ students efficiently  
✅ **Queryable**: Optimized indexes for common operations  
✅ **Extensible**: Easy to add new features  
✅ **Type-Safe**: Clear TypeScript interfaces  
✅ **Future-Proof**: Supports advanced features like parent communication  

This new structure will eliminate all the current issues and provide a rock-solid foundation for the Montessori OS! 🚀 