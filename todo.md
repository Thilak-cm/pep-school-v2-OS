# Montessori Observation Hub - Development Todo List

## 🎯 **IMMEDIATE PRIORITY - Next 3 Tasks**

### Intern Focus (Weeks 1-3)
- [ ] **1. Wireframes** - Mock 7 core screens in Figma & review
  - [ ] Login/Dashboard screen
  - [ ] Observation capture screen (voice + text)
  - [ ] Student timeline screen
  - [ ] Tag picker screen
  - [ ] Admin dashboard screen
  - [ ] Report generation screen
  - [ ] Student portfolio screen

- [ ] **2. Proof-of-concept** - Capture 30s audio, transcribe to Firestore, render in timeline
  - [x] Set up basic React + Firebase project
  - [x] Implement voice recording (30s limit)
  - [x] Integrate Google Speech-to-Text API (complete and tested)
  - [ ] Store transcription in Firestore (next step)
  - [ ] Render audio transcription in timeline view (next step)

- [ ] **3. Implement** - Classrooms + Students CRUD with sample data
  - [x] Design Firestore data structure for classrooms & students
  - [x] Build Firestore collections and add sample/seed data for all core collections
  - [ ] Build CRUD operations for Classrooms
  - [ ] Test data persistence and retrieval

---

## 🏗️ **Phase 1: Foundation & Setup** (Weeks 1-2)

### Infrastructure Setup
- [x] Initialize React + Vite PWA project
- [x] Set up Firebase project (Auth, Firestore, Cloud Functions)
- [x] Configure Google SSO authentication
- [x] Set up project repository with proper structure
- [ ] Configure environment variables and secrets
- [x] Set up development and production environments

### Core Data Models
- [x] Design and implement Firestore data structure:
  - [x] `classrooms` collection
  - [x] `students` collection  
  - [x] `observations` collection
  - [x] `attendance` collection
  - [x] `assessments` collection
  - [x] `tags` collection
- [ ] Implement Firestore security rules for access control
- [x] Create sample/seed data for development

### Basic CRUD Operations
- [ ] CRUD operations for Classrooms
- [ ] CRUD operations for Students
- [ ] Test data persistence and retrieval

---

## 👩‍🏫 **Phase 2: Core Teacher Features** (Weeks 3-5)

### Voice & Text Capture
- [ ] Implement voice recording functionality (≤ 5 min)
- [ ] Integrate Google Speech-to-Text API
- [ ] Create text input alternative for observations
- [ ] Build 30s audio capture POC
- [ ] Test transcription accuracy and store in Firestore

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
- [ ] Create student timeline view (reverse chronological)
- [ ] Implement filter by tag functionality
- [ ] Implement filter by date range
- [ ] Add observation editing (within 24h window)
- [ ] Add observation deletion (within 24h window)
- [ ] Render timeline with transcribed observations

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

### Mockups & Design
- [ ] Create 7 core screen mockups in Figma:
  - [ ] Login/Dashboard screen
  - [ ] Observation capture screen
  - [ ] Student timeline screen
  - [ ] Tag picker screen
  - [ ] Admin dashboard screen
  - [ ] Report generation screen
  - [ ] Student portfolio screen

### Mobile-First Design
- [ ] Ensure responsive design for mobile devices
- [ ] Optimize voice capture UX for mobile
- [ ] Design intuitive navigation flow
- [ ] Create loading states and error handling

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