# Changelog

All notable changes to the Montessori Observation Hub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.2] - 2025-01-09

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

## [1.7.1] - 2025-01-09

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

## [1.7.0] - 2025-01-09

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

## [1.5.0] - 2025-01-09

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

## [1.4.0] - 2025-01-09

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