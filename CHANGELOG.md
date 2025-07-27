# Changelog

All notable changes to the Montessori Observation Hub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Development toggle (phone/desktop/responsive views)
- Individual component responsiveness improvements
- Tag picker system for curriculum areas
- Student timeline with filtering

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