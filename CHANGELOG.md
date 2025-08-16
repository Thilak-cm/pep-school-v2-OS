# Changelog

All notable changes to the Montessori Observation Hub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0] - 2025-08-16

### Added
- major updates to stats page. complete revamp
- **Export Functionality for Teachers**: Teachers can now export student timeline data in clean text format
- **Role-Based Export Experience**: Different export formats for teachers (text) vs admins (JSON/Text)
- **Clean Text Export**: Simplified text format focused on observation content and dates
- **Export Button Visibility**: Export button now visible for all users regardless of role

### Changed
- **Export Button Access**: Export button moved outside admin-only restriction
- **Format Selection**: Teachers automatically get text format without format dropdown
- **Text Export Content**: Removed metadata clutter, focused on readable observation content
- **User Experience**: Teachers get simple one-click export, admins retain full format control

### Fixed
- **Teacher Export Access**: Teachers previously had no way to export their observation data
- **Export Format Clarity**: Text format now shows only essential information for sharing

### Technical
- **Component Updates**: StudentTimeline.jsx export button now visible for all users
- **Format Logic**: Role-based export handling with automatic format selection for teachers
- **Export Utility**: Enhanced export_student_timeline.js with clean text generation
- **UI Consistency**: Export button styling and behavior consistent across user roles

### Result
- Teachers can now export student timeline data for parent communication and record keeping
- Clean text format perfect for sharing observations without technical metadata
- Admin functionality preserved with full JSON export capabilities
- Improved teacher workflow while maintaining administrative oversight

## [2.2.1] - 2025-08-11

### Added
- **Complete StatsPage Revamp**: Multi-level filtering system with classroom, teacher, and student filters
- **Enhanced Analytics Dashboard**: Overview, Classrooms, Teachers, and Students tabs with performance metrics
- **Action Items Panel**: Smart alerts for underperforming areas with priority levels (High: classrooms, Medium: teachers, Low: students)
- **Trend Analysis**: Weekly comparisons, performance targets, and visual indicators with trend arrows
- **Multi-Level Filtering**: Smart cascading filters that work together and affect data display dynamically
- **Filter Management**: Collapsible interface with clear all functionality and filter summary display

### Changed
- **StatsPage Architecture**: Complete rewrite from basic stats to powerful admin analytics dashboard
- **Data Visualization**: Enhanced stat cards with trend indicators, performance bars, and comparison charts
- **Navigation Tabs**: Reorganized into logical sections (Overview, Classrooms, Teachers, Students)
- **Performance Metrics**: Implemented target-based calculations (5 notes/student/week, 20 notes/teacher/week)
- **Mobile Layout**: Optimized for 375px width containers with touch-friendly interactions

### Fixed
- **Firestore Permission Issues**: Fixed collection-level access for users collection listing
- **Variable Scope Errors**: Resolved 'classroomsData is not defined' reference errors
- **Query Optimization**: Simplified teachers query by removing problematic where clause, added client-side filtering
- **Collection Group Queries**: Properly configured for observations with enhanced error handling
- **Error Recovery**: Graceful fallbacks when queries fail with comprehensive debugging logs

### Technical
- **Enhanced Data Queries**: Collection group queries, granular error handling, client-side filtering
- **UI/UX Improvements**: Mobile-first design, MUI components, responsive layouts, color coding
- **Data Processing**: Weekly calculations, performance metrics, smart aggregation
- **Mobile Optimization**: Touch-friendly buttons (44px minimum), responsive patterns, proper spacing
- **Design System**: Consistent MUI integration, proper theme colors, accessibility compliance

### Security
- **Firestore Rules**: Added users collection access while maintaining individual document security
- **Admin Role Verification**: Proper admin role checking for collection-level queries
- **Access Control**: Maintained existing security for individual document access

### Performance
- **Indexing**: Configured collection group indexes for observations queries
- **Query Optimization**: Client-side filtering for better responsiveness
- **Error Handling**: Graceful degradation when Firestore queries fail

### Result
- **Transformed basic stats page** into powerful admin analytics dashboard
- **Fixed critical Firestore permission issues** that were blocking data access
- **Added sophisticated filtering** that gives admins granular control over data views
- **Implemented actionable insights** that help admins identify and address issues
- **Created mobile-optimized UI** that works perfectly on all devices

## [2.2.0] - 2025-08-11

### Added
- **Comprehensive Feedback & Suggestions System**: New dedicated page for users to submit feedback, complaints, and suggestions
- **FeedbackPage Component**: User-facing feedback submission form with large text area and optional category selection
- **FeedbackTimeline Component**: Admin dashboard for viewing and managing all feedback submissions
- **Feedback Collection**: New Firestore `feedback` collection with comprehensive metadata logging
- **Navigation Integration**: Added "Feedback & Suggestions" to sidebar menu and admin dashboard card
- **Role-Based Access Control**: Teachers see their own feedback, admins see all feedback
- **Metadata Logging**: Captures user info, timestamp, app version, user agent, and submission context
- **Category System**: Optional feedback categorization (Bug Report, Feature Request, UI/UX, Performance, General)
- **Status Management**: Feedback status tracking (new → reviewed → implemented/declined)
- **Admin Notes**: Private admin-only notes for internal feedback tracking
- **Search & Filtering**: Comprehensive filtering by user, category, date, status, and content
- **Success Notifications**: User feedback confirmation with "Thank you for your suggestion!" message

### Changed
- **App Navigation**: Updated App.jsx routing to include feedback screens (`/feedback`, `/feedbackTimeline`)
- **AppHeader**: Added feedback menu item to sidebar navigation
- **LandingPage**: Added feedback dashboard card for admin users
- **Data Structure**: Updated DATA_STRUCTURE.md with feedback collection schema and security rules
- **Firestore Rules**: Added comprehensive security rules for feedback collection access control

### Fixed
- **StudentTimeline Back Button**: Updated back button styling to match app-wide navigation pattern
- **Icon Import Issues**: Fixed missing History icon import that was causing React constructor errors
- **UI Consistency**: Back button now uses IconButton with ArrowBack icon instead of Button with text

### Technical
- **Component Architecture**: Created modular feedback system with separate user and admin components
- **Firestore Integration**: Implemented feedback collection with proper security rules and indexing
- **Client-Side Sorting**: Used client-side sorting to avoid Firestore composite index requirements
- **Mobile-First Design**: Ensured feedback system works perfectly on mobile viewport (375×812px)
- **Error Handling**: Comprehensive error handling and user feedback throughout feedback workflow
- **Accessibility**: Proper aria-labels and semantic HTML for all feedback components

### Security
- **Feedback Permissions**: Users can read/create their own feedback, admins can read/update/delete all
- **Field Immutability**: Critical fields (userId, timestamp, appVersion) cannot be modified after creation
- **Role-Based Access**: Teachers restricted to their own feedback, admins have full access
- **Admin Notes Privacy**: Admin notes are private and only visible to admin users

### Result
- Complete feedback loop system for continuous app improvement
- Low barrier to entry for user feedback submission
- Comprehensive admin dashboard for feedback management and analysis
- Proper access control and security throughout the feedback system
- Consistent UI/UX with existing app design patterns

## [2.1.2] - 2025-08-11

### Fixed
- **StudentTimeline Reassignment Dialog**: Updated reassignment interface for consistency and proper access control
- **UI Consistency**: Replaced simple student list with ClassroomStudentPicker component to match add note modal
- **Access Control**: Fixed issue where teachers could see ALL students instead of only their assigned classrooms
- **Unknown Teacher/Student Display**: Resolved "Unknown Teacher" and "Unknown Student" issues in observation detail dialog
- **Runtime Errors**: Fixed getDocs import that was causing blank pages and JavaScript errors

### Improved
- **User Experience**: Added proper validation to prevent reassigning notes to the same student
- **Confirmation Dialog**: Enhanced reassignment confirmation with better user feedback and "From/To" information
- **State Management**: Cleaned up unused imports and state variables for better code maintainability
- **Security**: Teachers now only see students and classrooms they have permission to access
- **Interface Consistency**: Reassignment dialog now uses same UI patterns as add note modal

### Technical
- **Component Integration**: Integrated ClassroomStudentPicker for consistent student selection experience
- **Permission Handling**: Proper role-based filtering for classrooms and students
- **Code Quality**: Removed duplicate logic and improved component architecture
- **Error Prevention**: Added validation and better error handling for reassignment operations

### Result
- Teachers can no longer see students from unassigned classrooms (e.g., "Adolescent" students)
- Consistent UI experience between note creation and note reassignment
- Proper access control maintained throughout the reassignment process
- No more blank pages or runtime errors when viewing student timelines

## [2.1.1] - 2025-08-11

### Fixed
- **StatsPage Schema Migration**: Updated StatsPage to work with new Firestore schema structure
- **Collection Group Queries**: Fixed collection group queries for observations subcollections (`students/{studentId}/observations/{observationId}`)
- **Field References**: Updated from old schema fields (`timestamp` → `observedAt`, `teacherId` → `createdBy`)
- **Student Name Resolution**: Fixed "Unknown Student" display issue by using `displayName` from new schema
- **Observation Type Filtering**: Improved filtering for `tags.type` structure in new schema
- **MUI Grid Warnings**: Fixed MUI Grid v2 migration warnings by removing deprecated `item` and `xs` props

### Improved
- **Error Handling**: Added comprehensive error handling and debugging for collection group queries
- **Client-Side Sorting**: Implemented graceful fallback with client-side sorting when Firestore index is missing
- **Debugging**: Enhanced console logging to troubleshoot schema migration issues
- **Performance**: Better handling of missing Firestore indexes with informative error messages

### Technical
- **Schema Compatibility**: StatsPage now properly queries observations from new subcollection structure
- **Index Management**: Clear instructions for creating missing `COLLECTION_GROUP_DESC` index in Firestore
- **Data Integrity**: Proper handling of both old and new schema structures during transition
- **Query Optimization**: Uses correct Firestore collection group patterns for new data model

### Result
- Statistics page now displays observation counts and student names correctly
- No more "Unknown Student" display issues
- Graceful handling of missing Firestore indexes
- Improved debugging and error reporting for development

## [2.1.0] - 2025-08-11

### Fixed
- **Classroom/Student Picker Issues**: Resolved undefined variable reference by changing 'allClassrooms' to 'classList' in ClassroomStudentPicker
- **Missing State Updates**: Fixed classrooms state not being populated from fetched data, causing empty classroom lists
- **Collection Group Queries**: Added proper collection group rule for observations to handle collectionGroup queries
- **Permission Errors**: Resolved "Missing or insufficient permissions" errors for teachers accessing classrooms and student observations

### UI Improvements
- **Enhanced Classroom Display**: Updated classroom display to show "X/Y selected" format instead of just total student count
- **Browse by Classroom**: Fixed section to properly display all classrooms with correct student grouping
- **Student Grouping**: Students are now correctly grouped under their respective classrooms
- **Selection Feedback**: Improved user experience with real-time selection count updates

### Security Rules
- **Simplified Classroom Access**: Streamlined classroom security rules to resolve permission conflicts
- **Collection Group Support**: Added proper rules for observations collection group queries
- **Teacher Access**: Teachers can now successfully access their assigned classrooms and student observations

### Result
- Classroom/student picker now works correctly for all user roles
- Teachers can see their assigned classrooms and students without permission errors
- Improved user experience with better selection feedback and classroom organization
- No more "Missing or insufficient permissions" errors during normal operation

## [2.0.4] - 2025-08-09

### Added
- Per-student observation subcollections
  - Notes are saved under `students/{sid}/observations/{obsId}` with `observedAt`, `createdBy`, `createdByName`, `createdByEmail`
- Timeline reads via collection group
  - `collectionGroup('observations')` with `where('studentId'...)` and `orderBy('observedAt','desc')`

### Changed
- Timeline update/delete/reassign operate on subcollection paths
- Use `createdBy` for creator checks (kept legacy `teacherId` fallback)

### Fixed
- Permission-denied errors and assertion logs when viewing timelines with no top-level `observations` collection
- Student selection/search showing blank names by using robust fallback: `name || displayName || firstName + lastName`

### Removed
- One-off classroom cleanup script after normalizing to `teacherIds`

## [2.0.3] - 2025-08-09

### Added
- Header search bars on classroom and student list screens
  - Search field sits next to the back button and expands to fill remaining space
  - Real-time client-side filtering
- Multi-select filter chips in Student Timeline
  - Replaced single-select dropdowns with chip-style `ToggleButtonGroup`
  - Supports multiple creators and types simultaneously

### Changed
- Student cards now display names only (cleaner list)
- Robust name fallback used across list and search: `name || displayName || firstName + lastName`

### Fixed
- Blank student list items when `name` was missing by using the new fallback

### Technical
- Updated `FilterPanel.jsx` and `useObservationFilters.js` to use array-based filters (`creators[]`, `types[]`)
- No backend or rules changes in this version

## [2.0.2] - 2025-08-08 

### Added
- Data preprocessing pipeline for educators
  - `scripts/data_preprocessing.py` cleans raw educators XLSX and writes `data/processed/educators_clean.xlsx`
  - Adds `Role` column (default teacher; admin for specified names)
- Teacher import utility
  - `scripts/admin/import-hsr-teachers.js` reads cleaned XLSX → JSON preview and optional Firestore upsert
- `package.json` scripts: `import:teachers`, `import:teachers:push`; add `xlsx` dependency

- Access request flow for unauthorized users
  - Request Access button on `AccessDenied.jsx` (one-tap, no custom message)
  - Callable Cloud Functions in `asia-south1`:
    - `requestAccess`: writes to `access_requests` (optional admin email via SMTP)
    - `logUnauthorizedAccess`: writes to `access_logs`
  - Minimal `logger` utility to suppress console output in production

### Changed
- Removed student handling from data preprocessing script (students handled elsewhere)
- Pinned Functions region to `asia-south1` (Mumbai) for client and server
- Hide `AddNoteFab` on access denied screen; make Sign Out a conspicuous outlined button

### Security
- Moved unauthorized logging to backend callable; no client-side Firestore writes
- `notifyAdminsOnUnauthorized` listener pinned to `asia-south1`

### Removed
- Legacy Speech-to-Text path: removed `transcribeVoiceNote` Storage trigger and `@google-cloud/speech` usage

## [2.0.1] - 2025-08-08

### Changed
- Minor adjustments post-schema rollout: confirmed canonical rules/indexes at repo root and removed duplicates under `montessori-os/`
- Updated security rules and indexes to match new schema

## [2.0.0] - 2025-08-08

### Breaking
- Core Firestore data model restructured to optimize teacher note-taking and admin analytics
- Observations moved to per-student subcollections with collection group queries
- Denormalized `classroomId` on observations for faster rules/queries
- Removed non-essential collections from core (tags, attendance, assessments) for now

### Added
- New `DATA_STRUCTURE.md` outlining Firestore-first schema:
  - `users/{uid}` for roles and identity
  - `classrooms/{classroomId}` with `teacherIds` and server-maintained `studentCount`
  - `students/{studentId}` with `classroomId` and `isActive`
  - `students/{studentId}/observations/{observationId}` fan-out; collection group `observations`
- Query patterns, essential indexes, and security rule hooks documented

### Security
- Simplified access control anchored on `classrooms.teacherIds`
- Admin-only updates/deletes of observations (teachers create only)

### Rationale
- Fan-out + denorm + collection groups greatly simplify read paths and scale analytics without complex joins

## [1.7.3] - 2025-01-08

### Changed
- Version badge now only shows for admin users
- Hide version badge for teachers to provide cleaner interface
- Maintain version badge visibility for unauthenticated users

### Improved
- Add role-based visibility to VersionBadge component
- Pass userRole prop to all VersionBadge instances in App.jsx
- Enhanced UI/UX by removing unnecessary version information for teachers

## [1.7.2] - 2025-01-08

### Fixed
- Teacher classroom filtering in note creation modal now works correctly
- Search functionality now only searches through assigned classrooms/students
- Prevented teachers from seeing students from unassigned classrooms
- Fixed edge case where search could find students from unassigned classrooms

### Improved
- Role-based classroom filtering for teachers in ClassroomStudentPicker component
- Added proper user role and current user props to AddNoteModal
- Updated ClassroomStudentPicker to filter both classrooms and students by teacher assignments
- Enhanced security by ensuring teachers only see their assigned classrooms and students

## [1.7.1] - 2025-01-08

### Fixed
- Teacher stats filtering now shows only teacher's own observations (was showing all school data)
- Added back button to Statistics page for consistent navigation
- Fixed MUI Grid warnings by adding missing `item` prop
- Import missing `where` function from firebase/firestore
- Remove overly restrictive classroom filtering that was breaking stats

### Improved
- Role-based filtering for teacher vs admin statistics
- Teacher stats now display personalized data instead of school-wide data
- Navigation consistency across all pages
- Console warnings eliminated

## [1.7.0] - 2025-01-08

### Added
- Teacher landing page with role-based content using unified LandingPage component
- Home button in AppHeader for quick navigation back to landing page
- Role-based classroom filtering (teachers see assigned classrooms only)
- Student count display in classroom cards
- Welcome message for teachers with personalized greeting

### Changed
- Refactored AdminPanel and TeacherPanel into single LandingPage component
- Updated navigation flow: Login → LandingPage → Classrooms → Students → Timeline
- Moved menu button slightly left and added home button to AppHeader
- Replaced standalone filter icon with "Filters" button in StudentTimeline
- Removed duplicate filter button from FilterPanel component

### Improved
- Code reusability: Single LandingPage component serves both admin and teacher views
- Navigation consistency: Both user types follow same panel-based navigation pattern
- UI/UX: Better filter button with text and icon instead of standalone icon
- Mobile-first design: Responsive classroom cards with hover effects
- Accessibility: Proper aria-labels and semantic HTML

### Technical
- Created `src/components/LandingPage.jsx` with role-based content rendering
- Updated `src/components/ClassroomList.jsx` to filter by teacher assignments
- Enhanced `src/components/AppHeader.jsx` with home button functionality
- Refactored `src/components/StudentTimeline.jsx` filter button implementation
- Cleaned up `src/components/FilterPanel.jsx` by removing duplicate button
- Updated App.jsx navigation system to use unified landing page approach

### Navigation Flow
- Teachers: Login → Teacher Panel → My Classrooms → Students → Timeline
- Admins: Login → Admin Panel → All Classrooms → Students → Timeline
- Home button: Quick return to landing page from anywhere in app
- Back navigation: Always returns to appropriate landing page

### Future-Ready
- LandingPage component easily extensible for additional teacher/admin features
- Filter system ready for curriculum area tags
- Modular architecture supports role-based feature additions

## [1.5.0] - 2025-01-08

### Added
- Statistics menu item in sidebar navigation with BarChart icon
- Complete routing integration for Statistics page (`/stats` route)
- Statistics page navigation with proper back button functionality
- Integration of StatsPage component into main app navigation system
- Comprehensive statistics and analytics system with real-time data visualization
- Interactive pie chart for note type distribution using Recharts library
- Student ranking system with proper name fetching from Firestore database
- Teacher activity analytics with admin-only access control
- Weekly activity progress bars showing note-taking trends over 4 weeks
- Dedicated StatsPage component for analytics and visualizations
- Note reassignment functionality with student selection modal
- "Assigned To" metadata line in observation detail dialog
- Modular filter system with reusable components
- `useObservationFilters` custom hook for filter state management
- `FilterPanel` component for reusable observation filtering UI
- Observation utility functions (`observationUtils.js`)
- Permission utility functions (`observationPermissions.js`)

### Changed
- Migrated statistics and analytics from ProfilePage to dedicated StatsPage component
- Streamlined ProfilePage to focus only on user account information
- Enhanced ProfilePage layout with email under profile photo and simplified role display
- Removed redundant account details card and authentication provider information
- Updated App.jsx to include stats screen state and navigation handling
- Enhanced page title logic to display "Statistics" for stats page
- Refactored StudentTimeline component from 942 to ~800 lines through modularization
- Extracted filter logic into dedicated hook with performance optimizations
- Separated permission checks into utility functions for better reusability
- Improved code organization with single responsibility principle

### Fixed
- "Unknown Student" display issue by properly fetching student names from Firestore
- Student name resolution in statistics by implementing batch student data fetching
- Observation detail dialog button spacing and text cutoff issues
- React console errors from missing Material-UI imports
- Dialog state management conflicts during reassignment

### Improved
- Profile page information hierarchy with email display under profile photo
- Role display simplified from chip to colored text for cleaner appearance
- Statistics visualization with interactive pie charts and progress bars
- Mobile-friendly analytics with responsive design and touch interactions
- Code maintainability through modular architecture and component separation
- Component reusability across different observation views
- Testability with isolated, focused modules
- Loading states and error handling for data fetching operations
- Navigation consistency with proper screen state management

### Technical
- Created `src/components/StatsPage.jsx` with comprehensive analytics functionality
- Implemented Recharts integration for interactive data visualizations
- Added batch student data fetching for proper name resolution in statistics
- Enhanced ProfilePage with simplified layout and better information hierarchy
- Updated App.jsx navigation system to support stats page routing
- Created `src/hooks/useObservationFilters.js` with memoized filter logic
- Added `src/components/FilterPanel.jsx` as standalone filter UI component
- Implemented `src/utils/observationUtils.js` for formatting and display helpers
- Added `src/utils/observationPermissions.js` for centralized access control
- Optimized filter performance with `useMemo` hooks
- Reduced code duplication by ~140+ lines through extraction
- Enhanced separation of concerns in StudentTimeline component

### Security
- Proper student name resolution from Firestore database
- Admin-only access to teacher activity analytics
- Secure data fetching with error handling and loading states

### Planned
- Further modularization: Dialog components extraction
- Data hooks creation (`useObservations`, `useStudentData`)
- Observation card component extraction
- Development toggle (phone/desktop/responsive views)
- Individual component responsiveness improvements
- Tag picker system for curriculum areas

## [1.4.0] - 2025-01-08

### Added
- Creator information displayed in observation detail modal
- Shows "Created by" field with teacher's Google display name
- New observations now store teacher name and email for better UX
- Comprehensive filtering system for student timeline observations
- Filter by date range (from/to dates) with date picker controls
- Filter by creator (teacher) with dropdown of all available creators
- Filter by observation type (voice/text notes)
- Combination filtering supporting multiple simultaneous criteria
- Filter toggle button with active filter indicator chip
- Clear all filters functionality with one-click reset
- Real-time filter results counter showing filtered observation count

### Changed
- Restricted observation editing and deleting to admin users only
- Teachers can no longer edit or delete any observations (admin-only permissions)
- Student timeline now displays filtered results instead of all observations
- Enhanced header with filter controls and result indicators

### Technical
- Added filter state management with date range, creator, and type filters
- Implemented real-time filtering with useEffect dependencies
- Added unique creator extraction from observation data
- Enhanced UI with collapsible filter panel using Material-UI components
- Improved user experience with filter persistence and visual feedback

### Security
- Centralized observation editing and deletion to admin users only
- Enhanced permission system for content moderation and oversight

## [1.3.1] - 2025-01-08

### Fixed
- Production deployment pipeline (GitHub Actions workflows)
- Blank production site due to missing Firebase environment variables
- Duplicate workflow runs from empty staging configuration file
- Firebase configuration not being available during production builds

### Changed
- Improved CI/CD workflow with GitHub secrets management for environment variables
- Updated deployment workflows to use repository secrets for Firebase configuration
- Cleaned up workflow files for single-run efficiency
- Established main branch as production deployment trigger

### Technical
- Added environment variable mapping in GitHub Actions workflows
- Configured VITE_FIREBASE_* secrets in repository settings
- Removed empty firebase-hosting-dev-staging.yml workflow file
- Enhanced deployment pipeline reliability and consistency

### Security
- Moved Firebase configuration from committed files to GitHub repository secrets
- Implemented proper environment variable management for production deployments
- Secured API keys and configuration through GitHub Actions secret store

## [1.3.0] - 2025-07-27

### Added
- Note editing functionality with role-based permissions
- Edit button in observation detail dialog
- Inline text editing with save/cancel actions
- Permission system: admins can edit any note, teachers can edit their own notes
- Real-time dialog updates after saving edits
- Edit metadata tracking (edit count and last edited timestamp)

### Changed
- Voice recording limit reduced from 30 seconds to 15 seconds
- Updated UI text and timer display to reflect new recording limit
- Improved user experience with instant feedback after editing

### Fixed
- Duplicate CircularProgress import error in StudentTimeline component
- Auto-refresh issue where edited content wasn't immediately visible in dialog
- Google Speech-to-Text API sync limit compatibility

### Technical
- Enhanced StudentTimeline component with edit functionality
- Added updateDoc and serverTimestamp imports from firebase/firestore
- Implemented permission checking logic (canEditObservation)
- Added TextField component for inline editing
- Real-time synchronization between Firestore updates and dialog state
- Optimized recording duration for Speech-to-Text API reliability

### Security
- Role-based access control for note editing
- Admin users can edit any observation note
- Teachers can only edit notes they created
- Secure Firestore updates with proper error handling

## [1.2.0] - 2025-07-27

### Added
- Note deletion functionality with role-based permissions
- Delete button in observation detail dialog
- Confirmation dialog for note deletion with preview
- Permission system: admins can delete any note, teachers can delete their own notes
- Visual feedback during deletion process

### Security
- Role-based access control for note deletion
- Admin users can delete any observation note
- Teachers can only delete notes they created
- Secure Firestore deletion with proper error handling

### Technical
- Enhanced StudentTimeline component with delete functionality
- Added deleteDoc import from firebase/firestore
- Implemented permission checking logic (canDeleteObservation)
- Added loading states and error handling for deletion
- Automatic timeline refresh after successful deletion

## [1.1.4] - 2025-07-27

### Fixed
- AddNoteModal centering issues on mobile and desktop
- Modal alignment now properly centered on all screen sizes
- Removed transform positioning that caused right-alignment
- Improved Dialog container styling for consistent centering

### Technical
- Updated Dialog PaperProps to use margin: auto for proper centering
- Added padding: 0 to Dialog container to prevent alignment interference
- Simplified modal positioning approach for better reliability

## [1.1.3] - 2025-07-27

### Fixed
- Sidebar menu popup positioning and backdrop behavior
- Menu overlay now properly covers content without interference
- Added shadow depth to sidebar for better visual separation

### Changed
- Removed User ID from profile page for privacy protection
- Improved sidebar menu z-index hierarchy and positioning

### Security
- User ID no longer publicly displayed in profile (internal use only)

## [1.1.2] - 2025-07-27

### Fixed
- Version management script bug showing incorrect old/new version numbers

### Technical
- Fixed version script logging to display correct version transitions

## [1.1.1] - 2025-07-27

### Added
- User profile page with Google profile photo and account details
- Profile navigation from hamburger menu
- Account verification status display
- Professional user information layout with role indicators

### Technical
- New ProfilePage component with mobile-first design
- Navigation system for menu item routing
- Integrated profile page into main app screen management

## [1.1.0] - 2025-07-27

### Added
- Mobile-first responsive design system
- Sticky header that remains anchored during scrolling
- Proper viewport handling for mobile devices
- Safe area support for devices with notches/home indicators
- Development-friendly positioning for desktop and mobile elements

### Fixed
- FAB button positioning (always visible, proper mobile/desktop behavior)
- Modal scrolling issues on mobile devices
- Version badge collision with FAB button
- AppHeader sticky positioning conflicts
- Desktop element positioning outside container bounds

### Changed
- Replaced hardcoded 375px container with responsive mobile-first layout
- Restructured authenticated app layout for better sticky header support
- Updated FAB to use fixed positioning on mobile, absolute on desktop
- Enhanced modal to be full-screen on mobile with proper scrolling
- Improved z-index hierarchy across all fixed elements

### Technical
- Replaced MUI AppBar with custom Box component for better sticky control
- Removed conflicting overflow properties that broke sticky positioning
- Added responsive breakpoints for mobile vs desktop behavior
- Implemented proper container structure for sticky elements

## [1.0.0] - 2025-07-20

### Added
- Initial release with core functionality
- Google Sign-in authentication
- Voice recording and transcription (≤30 seconds)
- Text note creation
- Firebase integration (Auth, Firestore)
- Basic admin panel structure
- Classroom and student management
- Student timeline view
- Mobile-optimized UI framework

### Features
- User authentication with domain validation (@pepschoolv2.com)
- Role-based access control (admin/teacher)
- Voice note recording with speech-to-text
- Multi-student note targeting
- Real-time data synchronization
- PWA-ready architecture

### Technical
- React + Vite frontend
- Firebase backend services
- Material-UI component system
- Google Speech-to-Text integration
- Responsive design foundation 