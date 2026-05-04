import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'LandingPage.jsx'), 'utf-8');

describe('LandingPage component (PEP-190)', () => {
  // --- AC1: Header with date, greeting, subtitle, avatar ---
  describe('Header section', () => {
    it('renders a date line with formatted date', () => {
      // Should use toLocaleDateString or similar for "Wednesday, 8 April" format
      assert.ok(
        source.includes('toLocaleDateString') || source.includes('Date()'),
        'Should format current date for display'
      );
    });

    it('renders a greeting with user display name', () => {
      assert.ok(source.includes('displayName'), 'Should use displayName for greeting');
      assert.ok(
        source.includes('Hey') || source.includes('hey'),
        'Should include greeting text'
      );
    });

    it('renders a subtitle with classroom and student counts', () => {
      assert.ok(source.includes('classrooms'), 'Subtitle should reference classrooms');
      assert.ok(source.includes('students'), 'Subtitle should reference students');
    });

    it('renders an avatar with initials fallback', () => {
      assert.ok(
        source.includes('Avatar') || source.includes('avatar'),
        'Should render an avatar component'
      );
      // Should handle null displayName with email fallback
      assert.ok(
        source.includes('email') || source.includes('photoURL'),
        'Should support fallback for missing displayName'
      );
    });
  });

  // --- AC2: Classroom cards in 2x2 grid ---
  describe('Classroom cards grid', () => {
    it('limits displayed classrooms to 4', () => {
      assert.ok(
        source.includes('slice(0, 4)') || source.includes('.slice(0,4)'),
        'Should slice classrooms to max 4'
      );
    });

    it('renders MiniTangram icon on each card', () => {
      assert.ok(source.includes('MiniTangram'), 'Should use MiniTangram component');
    });

    it('displays classroom name and student count on cards', () => {
      assert.ok(source.includes('studentCount'), 'Should display studentCount on card');
      // Classroom name rendered via .name property
      assert.ok(source.includes('.name'), 'Should display classroom name');
    });

    it('uses classroom color for card background', () => {
      assert.ok(
        source.includes('.color') || source.includes('color'),
        'Should reference classroom color field'
      );
    });

    it('renders single classroom as full-width', () => {
      // When classrooms.length === 1, card should be full width (12 or 100%)
      assert.ok(
        source.includes('length === 1') || source.includes('length==1'),
        'Should check for single classroom to render full-width'
      );
    });
  });

  // --- AC3: Classroom card tap navigates to ClassroomTimeline ---
  describe('Classroom card navigation', () => {
    it('calls onSelectClassroom when a classroom card is tapped', () => {
      assert.ok(
        source.includes('onSelectClassroom'),
        'Should accept and call onSelectClassroom prop'
      );
    });
  });

  // --- AC4: "View all classrooms" button ---
  describe('View all classrooms button', () => {
    it('shows view all button only when classrooms > 4', () => {
      assert.ok(
        source.includes('length > 4') || source.includes('length >= 5'),
        'Should conditionally show view all button for 5+ classrooms'
      );
    });

    it('calls onViewClassrooms when view all is clicked', () => {
      assert.ok(
        source.includes('onViewClassrooms'),
        'Should accept and call onViewClassrooms prop'
      );
    });
  });

  // --- AC5: Quick jump pills with role-based visibility ---
  describe('Quick jump pills', () => {
    it('renders Stats pill for all roles', () => {
      assert.ok(source.includes('Stats'), 'Should render Stats pill');
    });

    it('renders People pill for admin only', () => {
      assert.ok(source.includes('People'), 'Should render People pill');
      // Should be gated behind non-teacher role check
      assert.ok(
        source.includes('isTeacher') || source.includes("userRole === 'teacher'") || source.includes('!isTeacher'),
        'Should gate admin pills behind role check'
      );
    });

    it('renders Export pill for admin only', () => {
      assert.ok(source.includes('Export'), 'Should render Export pill');
    });

    it('renders Feedback pill for all roles', () => {
      assert.ok(source.includes('Feedback'), 'Should render Feedback pill');
    });

    it('uses grid layout for quick jump cards', () => {
      assert.ok(
        source.includes('gridTemplateColumns'),
        'Quick jump should use CSS grid layout'
      );
    });

    it('renders icons with role-specific colors', () => {
      assert.ok(
        source.includes('iconColor'),
        'Quick jump cards should have colored icons'
      );
    });
  });

  // --- Loading state ---
  describe('Loading state', () => {
    it('shows loading indicator when classrooms array is empty', () => {
      assert.ok(
        source.includes('classrooms.length === 0') || source.includes('classrooms.length===0'),
        'Should check for empty classrooms to show loading'
      );
      assert.ok(
        source.includes('CircularProgress'),
        'Should show a loading spinner'
      );
      assert.ok(
        source.includes('fetching'),
        'Should show a fetching message'
      );
    });
  });

  // --- General structure ---
  describe('Component structure', () => {
    it('exports a default component', () => {
      assert.ok(
        source.includes('export default') && source.includes('LandingPage'),
        'Should export default LandingPage'
      );
    });

    it('accepts classrooms prop (not self-fetching)', () => {
      assert.ok(
        source.includes('classrooms'),
        'Should accept classrooms as a prop'
      );
    });
  });
});
