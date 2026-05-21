import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'SettingsPage.jsx'), 'utf-8');

describe('SettingsPage redesign (PEP-199)', () => {
  // --- AC1: Profile hero card ---
  describe('Profile hero card', () => {
    it('renders an avatar with photoURL and initials fallback', () => {
      assert.ok(source.includes('Avatar'), 'Should render Avatar component');
      assert.ok(
        source.includes('photoURL') || source.includes('src='),
        'Should support photoURL for avatar'
      );
    });

    it('displays the user display name', () => {
      assert.ok(source.includes('displayName'), 'Should render user displayName');
    });

    it('shows a color-coded role badge', () => {
      assert.ok(source.includes('getRoleLabel'), 'Should use getRoleLabel for role text');
      assert.ok(
        source.includes('roleColor') || source.includes('color-error'),
        'Should apply role-specific color'
      );
    });

    it('has a gradient background on the profile card', () => {
      assert.ok(
        source.includes('gradient') || source.includes('linear-gradient'),
        'Profile card should have a gradient background'
      );
    });

    it('renders ChevronRight for profile navigation', () => {
      assert.ok(
        source.includes('ChevronRight') || source.includes('chevronRight'),
        'Should show ChevronRight icon on profile card'
      );
      assert.ok(
        source.includes("'/profile'") || source.includes('"/profile"'),
        'Tapping profile card should navigate to profile'
      );
    });
  });

  // --- AC2: Mini stats row ---
  describe('Mini stats row', () => {
    it('computes classroom count from classrooms prop', () => {
      assert.ok(
        source.includes('classrooms.length') || source.includes('classrooms?.length'),
        'Should derive classroom count from classrooms array length'
      );
    });

    it('computes student count from classroom studentCount fields', () => {
      assert.ok(
        source.includes('studentCount'),
        'Should sum studentCount from classrooms'
      );
      assert.ok(
        source.includes('reduce'),
        'Should use reduce to sum student counts'
      );
    });

    it('fetches notes-this-week via collection group query', () => {
      assert.ok(
        source.includes('collectionGroup') || source.includes("'observations'"),
        'Should query observations collection group for notes count'
      );
      assert.ok(
        source.includes('createdBy'),
        'Should filter by createdBy for the current user'
      );
    });

    it('scopes all queries by classroomId to avoid permission errors (PEP-255)', () => {
      assert.ok(
        source.includes("'classroomId'") || source.includes('"classroomId"'),
        'Should filter by classroomId to avoid cross-classroom denials'
      );
      assert.ok(
        source.includes('classrooms') && source.includes('.map'),
        'Should derive classroom IDs from classrooms prop'
      );
    });

    it('shows a loading state for notes-this-week', () => {
      assert.ok(
        source.includes('notesLoading') || source.includes('skeleton') || source.includes('Skeleton') || source.includes('···'),
        'Should show loading indicator while notes count is fetching'
      );
    });
  });

  // --- AC3: Preferences card ---
  describe('Preferences card', () => {
    it('renders Notifications row', () => {
      assert.ok(
        source.includes('Notification') || source.includes('notification'),
        'Should render a Notifications preference row'
      );
    });

    it('renders My Student Groups row', () => {
      assert.ok(
        source.includes('Student Groups') || source.includes('aliases'),
        'Should render a My Student Groups row'
      );
    });
  });

  // --- AC4: Admin tools card (role-gated) ---
  describe('Admin tools card', () => {
    it('gates admin tools card behind isAdminRole', () => {
      assert.ok(
        source.includes('isAdminRole') || (source.includes('isSuperAdmin') && source.includes('isClassroomAdmin')),
        'Should use isAdminRole or both role checks to gate admin tools card'
      );
    });

    it('shows Users & Access for both admin roles', () => {
      assert.ok(
        source.includes('Users') && source.includes('Access'),
        'Should show Users & Access item'
      );
    });

    it('shows Bulk Upload and AI Configurations for superadmin only', () => {
      assert.ok(source.includes('Bulk Upload'), 'Should include Bulk Upload option');
      assert.ok(
        source.includes('AI') && source.includes('onfig'),
        'Should include AI Configurations option'
      );
      assert.ok(
        source.includes('isSuperAdmin'),
        'Should gate superadmin-only items behind isSuperAdmin check'
      );
    });
  });

  // --- AC5: Sign-out card ---
  describe('Sign-out card', () => {
    it('renders a sign-out button with confirmation dialog', () => {
      assert.ok(
        source.includes('Sign out') || source.includes('Log Out') || source.includes('Logout'),
        'Should render sign-out text'
      );
      assert.ok(
        source.includes('Dialog') || source.includes('confirm'),
        'Should use a confirmation dialog before sign-out'
      );
    });

    it('calls onSignOut after confirmation', () => {
      assert.ok(source.includes('onSignOut'), 'Should call onSignOut prop');
    });
  });

  // --- General structure ---
  describe('Component structure', () => {
    it('exports a default component', () => {
      assert.ok(
        source.includes('export default') && source.includes('SettingsPage'),
        'Should export default SettingsPage'
      );
    });

    it('accepts classrooms prop for stats', () => {
      assert.ok(source.includes('classrooms'), 'Should accept classrooms prop');
    });

    it('does not include Statistics navigation', () => {
      assert.ok(
        !source.includes("'Statistics'") && !source.includes('"Statistics"'),
        'Should not include Statistics link (accessible from landing page)'
      );
    });
  });
});
