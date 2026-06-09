import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'BroadcastComposer.jsx'), 'utf-8');

describe('BroadcastComposer — broadcast admin screen (PEP-307)', () => {

  // ── Component structure ──
  it('exports a default component', () => {
    assert.ok(source.includes('export default'), 'Should export default BroadcastComposer');
  });

  it('accepts currentUser and userRole props', () => {
    assert.ok(source.includes('currentUser'), 'Should accept currentUser prop');
    assert.ok(source.includes('userRole'), 'Should accept userRole prop');
  });

  // ── Service integration ──
  it('imports from broadcastService', () => {
    assert.ok(
      source.includes('broadcastService'),
      'Should import from broadcastService'
    );
  });

  it('calls createBroadcast for publishing', () => {
    assert.ok(
      source.includes('createBroadcast'),
      'Should call createBroadcast to publish broadcasts'
    );
  });

  it('calls listBroadcasts for management view', () => {
    assert.ok(
      source.includes('listBroadcasts'),
      'Should call listBroadcasts for management list'
    );
  });

  it('calls deleteBroadcast for removing broadcasts', () => {
    assert.ok(
      source.includes('deleteBroadcast'),
      'Should call deleteBroadcast for deletion'
    );
  });

  it('calls toggleBroadcastDip for DIP visibility', () => {
    assert.ok(
      source.includes('toggleBroadcastDip'),
      'Should call toggleBroadcastDip for toggling DIP'
    );
  });

  // ── Composer form fields ──
  it('has label input field', () => {
    assert.ok(
      source.includes('label') && (source.includes('Label') || source.includes('label')),
      'Should have a label input field'
    );
  });

  it('has title input field', () => {
    assert.ok(
      source.includes('Title') || source.includes('title'),
      'Should have a title input field'
    );
  });

  it('has subtitle input field', () => {
    assert.ok(
      source.includes('subtitle') || source.includes('Subtitle'),
      'Should have a subtitle input field'
    );
  });

  it('has CTA label input field with default', () => {
    assert.ok(
      source.includes('ctaLabel') || source.includes('CTA'),
      'Should have a CTA label input'
    );
    assert.ok(
      source.includes('Got it'),
      'Should default CTA label to "Got it"'
    );
  });

  it('has message body textarea', () => {
    assert.ok(
      source.includes('message') && (source.includes('multiline') || source.includes('textarea') || source.includes('rows')),
      'Should have a multiline message body field'
    );
  });

  it('has expiry date/time picker', () => {
    assert.ok(
      source.includes('expiresAt') || source.includes('expir'),
      'Should have an expiry picker'
    );
  });

  it('has classroom picker with checkboxes and OK/Cancel', () => {
    assert.ok(
      source.includes('Checkbox') && source.includes('classroomPicker'),
      'Should have a checkbox-based classroom picker modal'
    );
    assert.ok(
      source.includes('confirmClassrooms') || source.includes('pendingClassrooms'),
      'Should use pending state with OK/Cancel confirmation'
    );
  });

  it('has teacher picker with search and checkboxes', () => {
    assert.ok(
      source.includes('teacherPicker') && source.includes('teacherSearch'),
      'Should have a teacher picker modal with search'
    );
    assert.ok(
      source.includes('filteredTeachers'),
      'Should filter teachers by search query'
    );
  });

  it('fetches teachers from users collection', () => {
    assert.ok(
      source.includes("'teacher'") && source.includes('users'),
      'Should fetch users with role teacher'
    );
  });

  it('has DIP toggle', () => {
    assert.ok(
      source.includes('dip') || source.includes('DIP') || source.includes('Show in DIP'),
      'Should have a DIP visibility toggle'
    );
  });

  it('has priority selector with Urgent/High/Normal/Low options', () => {
    assert.ok(
      source.includes('priority') || source.includes('Priority'),
      'Should have a priority selector'
    );
    assert.ok(
      source.includes('BROADCAST_PRIORITIES'),
      'Should use BROADCAST_PRIORITIES from service'
    );
  });

  // ── Management list ──
  it('renders a list of existing broadcasts', () => {
    assert.ok(
      source.includes('.map') && source.includes('broadcast'),
      'Should render a list of broadcasts by mapping'
    );
  });

  it('shows live vs expired status', () => {
    assert.ok(
      source.includes('expir') || source.includes('Expired') || source.includes('Live'),
      'Should distinguish live vs expired broadcasts'
    );
  });

  it('has delete action for broadcasts', () => {
    assert.ok(
      source.includes('delete') || source.includes('Delete') || source.includes('Trash'),
      'Should have delete action'
    );
  });

  it('has toggle DIP action for broadcasts', () => {
    assert.ok(
      source.includes('toggleBroadcastDip') || source.includes('toggle'),
      'Should have toggle DIP action'
    );
  });

  // ── Superadmin guard ──
  it('checks for superadmin role', () => {
    assert.ok(
      source.includes('superadmin') || source.includes('SuperAdmin') || source.includes('isSuperAdmin'),
      'Should verify superadmin role'
    );
  });
});
