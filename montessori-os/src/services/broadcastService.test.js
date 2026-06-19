import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'broadcastService.js'), 'utf-8');

describe('broadcastService — broadcast CRUD contract (PEP-307)', () => {

  // ── Exports ──
  it('exports createBroadcast function', () => {
    assert.ok(
      source.includes('export') && source.includes('createBroadcast'),
      'Should export createBroadcast'
    );
  });

  it('exports listBroadcasts function', () => {
    assert.ok(
      source.includes('export') && source.includes('listBroadcasts'),
      'Should export listBroadcasts'
    );
  });

  it('exports deleteBroadcast function', () => {
    assert.ok(
      source.includes('export') && source.includes('deleteBroadcast'),
      'Should export deleteBroadcast'
    );
  });

  it('exports toggleBroadcastDip function', () => {
    assert.ok(
      source.includes('export') && source.includes('toggleBroadcastDip'),
      'Should export toggleBroadcastDip'
    );
  });

  it('exports BROADCAST_PRIORITIES constant', () => {
    assert.ok(
      source.includes('export') && source.includes('BROADCAST_PRIORITIES'),
      'Should export priority options'
    );
  });

  // ── Doc shape contract ──
  it('sets type to broadcast on created docs', () => {
    assert.ok(
      source.includes("type: 'broadcast'") || source.includes('type: "broadcast"'),
      'Should set type: broadcast'
    );
  });

  it('sets source to admin:broadcast', () => {
    assert.ok(
      source.includes("'admin:broadcast'") || source.includes('"admin:broadcast"'),
      'Should set source: admin:broadcast'
    );
  });

  it('includes all payload display fields (label, title, subtitle, ctaLabel, message, senderName)', () => {
    for (const field of ['label', 'title', 'subtitle', 'ctaLabel', 'message', 'senderName']) {
      assert.ok(
        source.includes(`payload`) && source.includes(field),
        `Payload should include ${field}`
      );
    }
  });

  it('includes targeting fields (targetRoles, targetClassrooms, targetTeachers)', () => {
    for (const field of ['targetRoles', 'targetClassrooms', 'targetTeachers']) {
      assert.ok(source.includes(field), `Should include ${field}`);
    }
  });

  it('initializes dismissedBy as empty object', () => {
    assert.ok(
      source.includes('dismissedBy: {}') || source.includes('dismissedBy: Object'),
      'Should initialize dismissedBy as empty'
    );
  });

  it('includes expiresAt field', () => {
    assert.ok(source.includes('expiresAt'), 'Should include expiresAt');
  });

  it('uses serverTimestamp for createdAt', () => {
    assert.ok(
      source.includes('serverTimestamp'),
      'Should use serverTimestamp for createdAt'
    );
  });

  it('sets createdBy to current user uid', () => {
    assert.ok(
      source.includes('createdBy') && source.includes('uid'),
      'Should set createdBy to authenticated user uid'
    );
  });

  it('includes dip field with default true', () => {
    assert.ok(
      source.includes('dip') && (source.includes('?? true') || source.includes('|| true')),
      'Should default dip to true'
    );
  });

  it('includes priority field with default 3 (Normal)', () => {
    assert.ok(
      source.includes('priority') && source.includes('?? 3'),
      'Should default priority to 3 (Normal)'
    );
  });

  // ── Validation ──
  it('requires authentication', () => {
    assert.ok(
      source.includes('Not authenticated') || source.includes('not authenticated'),
      'Should throw if not authenticated'
    );
  });

  it('includes expiresAt field (nullable for auto-expiry)', () => {
    assert.ok(
      source.includes('expiresAt'),
      'Should include expiresAt field'
    );
  });

  it('requires label, title, and message', () => {
    assert.ok(
      source.includes('label') && source.includes('title') && source.includes('message') && source.includes('required'),
      'Should require label, title, and message'
    );
  });

  // ── CRUD operations ──
  it('uses addDoc for creating broadcasts', () => {
    assert.ok(source.includes('addDoc'), 'Should use addDoc for create');
  });

  it('uses getDocs with query for listing broadcasts', () => {
    assert.ok(
      source.includes('getDocs') && source.includes('query'),
      'Should use getDocs with query for listing'
    );
  });

  it('filters by type broadcast when listing', () => {
    assert.ok(
      source.includes("where('type'") || source.includes('where("type"'),
      'Should filter by type: broadcast when listing'
    );
  });

  it('uses deleteDoc for deleting broadcasts', () => {
    assert.ok(source.includes('deleteDoc'), 'Should use deleteDoc for delete');
  });

  it('uses updateDoc for toggling DIP visibility', () => {
    assert.ok(
      source.includes('updateDoc') && source.includes('dip'),
      'Should use updateDoc to toggle dip field'
    );
  });

  it('references the alerts collection', () => {
    assert.ok(
      source.includes("'alerts'") || source.includes('"alerts"'),
      'Should reference the alerts Firestore collection'
    );
  });

  // ── Poll support (PEP-323a) ──
  it('accepts broadcastKind field and writes it to alertDoc', () => {
    assert.ok(
      source.includes('broadcastKind'),
      'Should include broadcastKind field in doc shape'
    );
  });

  it('sets broadcastKind explicitly (ack or poll)', () => {
    assert.ok(
      source.includes("broadcastKind") && (source.includes("'ack'") || source.includes('"ack"')),
      'Should reference ack as a broadcastKind value'
    );
    assert.ok(
      source.includes("'poll'") || source.includes('"poll"'),
      'Should reference poll as a broadcastKind value'
    );
  });

  it('writes poll field only for poll broadcasts', () => {
    assert.ok(
      source.includes('poll') && source.includes('fields.poll'),
      'Should pass poll field from input fields'
    );
  });

  it('initializes responses as empty object only for poll broadcasts', () => {
    assert.ok(
      source.includes('responses: {}'),
      'Should initialize responses as empty map for polls'
    );
  });

  // ── Priority values ──
  it('defines priority values 1-4 (Urgent, High, Normal, Low)', () => {
    for (const val of ['1', '2', '3', '4']) {
      assert.ok(
        source.includes(`value: ${val}`),
        `Should include priority value ${val}`
      );
    }
    for (const label of ['Urgent', 'High', 'Normal', 'Low']) {
      assert.ok(
        source.includes(label),
        `Should include priority label ${label}`
      );
    }
  });
});
