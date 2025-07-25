# Montessori Observation Hub - Development Todo List

## 🎯 **IMMEDIATE PRIORITY - Complete User Flows**

### Focus: Build Complete Teacher & Admin Flows (Weeks 1-3)
- [ ] **1. Teacher Flow Implementation** - Complete end-to-end teacher experience
  - [x] Google sign-in (already implemented)
  - [x] Classroom list view
  - [x] Student list view (filtered by classroom)
  - [x] Student timeline view (reverse chronological)
  - [x] Add note functionality (voice ≤5 min OR text input)
  - [x] Tag picker component (curriculum areas)
  - [x] Save observation to Firestore

- [ ] **2. Admin Flow Implementation** - Complete end-to-end admin experience
  - [x] Admin panel access (role-based routing)
  - [ ] Bulk upload interface (Google Sheets integration)
  - [ ] Report generation (date range → Google Doc)
  - [ ] Search & filter notes across school (tag/date/teacher)

- [ ] **3. Core Infrastructure** - Foundation for both flows
  - [x] Set up basic React + Firebase project
  - [x] Implement voice recording (30s limit)
  - [x] Integrate Google Speech-to-Text API (complete and tested)
  - [x] Store observations in Firestore with proper structure
  - [x] Implement role-based authentication (teacher vs admin)
  - [x] Add sample data for testing flows

---

## 🏗️ **Phase 1: Foundation & Setup** (Weeks 1-2)

### Infrastructure Setup
- [x] Initialize React + Vite PWA project
- [x] Set up Firebase project (Auth, Firestore, Cloud Functions)
- [x] Configure Google SSO authentication
- [x] Set up project repository with proper structure
- [x] Configure environment variables and secrets
- [x] Set up development and production environments

### Core Data Models
- [x] Design and implement Firestore data structure:
  - [x] `classrooms` collection
  - [x] `students` collection  
  - [x] `observations` collection
  - [x] `attendance` collection
  - [x] `assessments` collection
  - [x] `tags` collection
- [x] Implement Firestore security rules for access control
- [x] Create sample/seed data for development

### Basic CRUD Operations
- [ ] CRUD operations for Classrooms
- [ ] CRUD operations for Students
- [ ] Test data persistence and retrieval

---

## 👩‍🏫 **Phase 2: Core Teacher Features** (Weeks 3-5)

### Voice & Text Capture
- [x] Implement voice recording functionality (≤ 5 min)
- [x] Integrate Google Speech-to-Text API
- [x] Create text input alternative for observations
- [x] Build 30s audio capture POC
- [x] Test transcription accuracy and store in Firestore

### Tagging System
- [ ] Create tag picker component (curriculum areas)
- [ ] Implement tag management UI
- [ ] Add Practical Life, Language, and other curriculum tags
- [ ] Enable multi-tag selection per observation

### Student Selection & Grouping
- [ ] Build student picker component
- [ ] Implement quick group selection (multi-child tagging)
- [ ] Create classroom roster view
- [ ] Add search/filter functionality for students

### Timeline & Viewing
- [x] Create student timeline view (reverse chronological)
- [ ] Implement filter by tag functionality
- [ ] Implement filter by date range
- [ ] Add observation editing (within 24h window)
- [ ] Add observation deletion (within 24h window)
- [x] Render timeline with transcribed observations

---

## 👨‍💼 **Phase 3: Admin Features** (Weeks 6-7)

### Roster Management
- [ ] Build bulk upload interface for Google Sheets
- [ ] Implement CSV parsing for student roster
- [ ] Add attendance upload functionality
- [ ] Create error handling for bulk uploads
- [ ] Add data validation for uploads

### Dashboard & Analytics
- [ ] Create live dashboard for observation volume
- [ ] Build curriculum coverage analytics
- [ ] Add teacher activity tracking
- [ ] Implement tag usage heatmap
- [ ] Create observation count visualizations

### Reporting System
- [ ] Integrate Google Docs API
- [ ] Build report generation (select date range)
- [ ] Group observations by curriculum tags
- [ ] Auto-generate Google Doc reports
- [ ] Optimize report generation time (≤ 2 min target)

### Student Portfolio
- [ ] Create child portfolio view
- [ ] Implement spider chart for curriculum note distribution
- [ ] Add Chart.js or Canvas integration
- [ ] Display curriculum coverage per student

---

## ✨ **Phase 4: Enhanced Features (v1.5)** (Weeks 9-12)

### Teacher Enhancements
- [ ] Add "Magic Moments" starring functionality
- [ ] Build auto-draft email to parents for starred moments
- [ ] Implement AI-powered "Next Step" suggestions
- [ ] Create classroom activity badge system (note count/week)
- [ ] Add silent push notifications for inactive teachers (10 days)

### Admin Enhancements
- [ ] Enhanced tag usage analytics
- [ ] CSV export functionality for filtered notes
- [ ] Improved error messages for bulk uploads
- [ ] Advanced filtering and search capabilities

---

## 🧪 **Phase 5: Testing & Polish** (Week 8 + ongoing)

### Testing
- [ ] Conduct 2-class pilot test (Week 8)
- [ ] Gather feedback from pilot teachers
- [ ] Fix critical bugs identified in pilot
- [ ] Performance testing for voice capture
- [ ] Test report generation at scale

### Success Metrics Validation
- [ ] Track pilot teacher adoption (≥ 80% target)
- [ ] Measure report generation time
- [ ] Monitor data quality and tag usage
- [ ] Validate 90% adoption rate for v1.5

---

## 🎨 **Design & UX Tasks**

### User Flow Implementation
- [ ] **Teacher Flow**: Google sign-in → Classroom list → Student list → Student timeline → Add note (voice/text) → Pick tags → Save
- [ ] **Admin Flow**: Google sign-in → Admin panel → Bulk upload (Google Sheets) → Generate report (date range → Google Doc) → Search & filter notes
- [ ] **Mobile-First Design**: Ensure all flows work perfectly on iPhone 13 mini (375×812px)
- [ ] **Navigation**: Intuitive flow between screens with proper loading states
- [ ] **Error Handling**: User-friendly error messages and recovery flows

---

## 📋 **Open Items & Dependencies**

### Stakeholder Deliverables (Rahul)
- [ ] **PENDING**: Get final curriculum tag list (CSV or Google Sheet)
- [ ] **PENDING**: Receive sample report template (Google Doc format)
- [ ] **PENDING**: Determine hosting/STT budget ceiling

### Technical Dependencies
- [ ] Set up Google Cloud billing for Speech-to-Text API
- [ ] Configure Google Docs API permissions
- [ ] Set up Firebase hosting and functions deployment
- [ ] Plan data backup and recovery strategy

---

## 🚀 **Deployment & Launch**

### v1.0 Launch (Week 8)
- [ ] Deploy to staging environment
- [ ] Conduct user acceptance testing
- [ ] Deploy to production
- [ ] Monitor system performance
- [ ] Provide user training/onboarding

### v1.5 Launch (Week 12)
- [ ] Full school rollout preparation
- [ ] Enhanced feature testing
- [ ] Performance optimization
- [ ] Monitor adoption metrics
- [ ] Collect feedback for future iterations

---

## 📊 **Success Criteria Checklist**

### v1.0 Success Metrics
- [ ] ≥ 80% of pilot teachers log ≥ 2 notes in Week 2
- [ ] Report generation takes ≤ 2 minutes

### v1.5 Success Metrics  
- [ ] ≥ 90% of teachers log ≥ 2 notes/week by Week 4
- [ ] <10% unused tags (data hygiene target)

---

**Total Estimated Hours**: 96h cap across 12 weeks
**Priority Focus**: Get v1.0 pilot-ready by Week 8, then enhance for full rollout 