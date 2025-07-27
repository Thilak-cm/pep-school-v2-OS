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