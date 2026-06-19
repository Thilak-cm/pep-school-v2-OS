import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'BroadcastComposer.jsx'), 'utf-8');

// Read sub-components for comprehensive checks
const composeSource = readFileSync(join(__dirname, 'broadcasts', 'BroadcastCompose.jsx'), 'utf-8');
const deskSource = readFileSync(join(__dirname, 'broadcasts', 'BroadcastDesk.jsx'), 'utf-8');
const detailSource = readFileSync(join(__dirname, 'broadcasts', 'BroadcastDetail.jsx'), 'utf-8');
const cardSource = readFileSync(join(__dirname, 'broadcasts', 'BroadcastCard.jsx'), 'utf-8');
const utilsSource = readFileSync(join(__dirname, 'broadcasts', 'broadcastUtils.js'), 'utf-8');

describe('BroadcastComposer — broadcast admin screen (PEP-307 redesign)', () => {

  // ── Wrapper structure ──
  it('exports a default component', () => {
    assert.ok(source.includes('export default'), 'Should export default BroadcastComposer');
  });

  it('accepts currentUser and userRole props', () => {
    assert.ok(source.includes('currentUser'), 'Should accept currentUser prop');
    assert.ok(source.includes('userRole'), 'Should accept userRole prop');
  });

  it('renders BroadcastDesk, BroadcastCompose, and BroadcastDetail', () => {
    assert.ok(source.includes('BroadcastDesk'), 'Should render BroadcastDesk');
    assert.ok(source.includes('BroadcastCompose'), 'Should render BroadcastCompose');
    assert.ok(source.includes('BroadcastDetail'), 'Should render BroadcastDetail');
  });

  // ── Service integration ──
  it('imports from broadcastService', () => {
    assert.ok(source.includes('broadcastService'), 'Wrapper should import from broadcastService');
  });

  it('compose calls createBroadcast for publishing', () => {
    assert.ok(composeSource.includes('createBroadcast'), 'Compose should call createBroadcast');
  });

  it('compose calls updateBroadcast for editing', () => {
    assert.ok(composeSource.includes('updateBroadcast'), 'Compose should call updateBroadcast');
  });

  it('detail calls deleteBroadcast for removing broadcasts', () => {
    assert.ok(detailSource.includes('deleteBroadcast'), 'Detail should call deleteBroadcast');
  });

  // ── Compose form fields ──
  it('compose has title and message body inputs', () => {
    assert.ok(composeSource.includes('Title') || composeSource.includes('title'), 'Should have title input');
    assert.ok(composeSource.includes('multiline'), 'Should have multiline message body');
  });

  it('compose has CTA label with default "Mark as read"', () => {
    assert.ok(composeSource.includes('Mark as read'), 'Should default CTA to "Mark as read"');
  });

  it('compose has audience picker', () => {
    assert.ok(composeSource.includes('BroadcastAudiencePicker'), 'Should have audience picker');
  });

  it('compose has priority segmented control', () => {
    assert.ok(composeSource.includes('PRIORITY_OPTIONS'), 'Should use priority options');
  });

  it('compose has expiry chips', () => {
    assert.ok(composeSource.includes('getExpiryChips'), 'Should use expiry chip helpers');
  });

  it('compose has scheduling (startsAt) support', () => {
    assert.ok(composeSource.includes('startsAt'), 'Should support startsAt scheduling');
    assert.ok(composeSource.includes('immediately'), 'Should have "Immediately" option');
  });

  it('compose has Quick Alerts toggle (renamed from DIP)', () => {
    assert.ok(composeSource.includes('Quick Alerts'), 'Should use "Quick Alerts" label');
  });

  it('compose has high-priority confirm dialog', () => {
    assert.ok(composeSource.includes('confirmPublish'), 'Should have publish confirmation');
    assert.ok(composeSource.includes('High Priority') || composeSource.includes('High priority'), 'Should mention high priority');
  });

  // ── Desk page ──
  it('desk has status tabs (Live, Scheduled, Done)', () => {
    assert.ok(deskSource.includes('live') && deskSource.includes('scheduled') && deskSource.includes('done'), 'Should have 3 tab states');
  });

  it('desk has + New button', () => {
    assert.ok(deskSource.includes('New'), 'Should have New button');
  });

  // ── Card component ──
  it('card shows ack progress bar', () => {
    assert.ok(cardSource.includes('ackFraction') || cardSource.includes('ackCount'), 'Should compute ack metrics');
    assert.ok(cardSource.includes('read'), 'Should show read count');
  });

  // ── Detail/receipts view ──
  it('detail shows read and unread lists', () => {
    assert.ok(detailSource.includes('readList'), 'Should have read list');
    assert.ok(detailSource.includes('unreadList'), 'Should have unread list');
    assert.ok(detailSource.includes('NOT YET READ'), 'Should show "NOT YET READ" section');
  });

  it('detail has edit and end actions', () => {
    assert.ok(detailSource.includes('onEdit'), 'Should have edit action');
    assert.ok(detailSource.includes('End'), 'Should have end broadcast action');
  });

  // ── Utils ──
  it('utils has classifyBroadcast with startsAt support', () => {
    assert.ok(utilsSource.includes('classifyBroadcast'), 'Should export classifyBroadcast');
    assert.ok(utilsSource.includes('startsAt'), 'classifyBroadcast should handle startsAt');
  });

  it('utils has computeReach', () => {
    assert.ok(utilsSource.includes('computeReach'), 'Should export computeReach');
  });

  // ── Poll composer (PEP-323a) ──
  it('compose has poll toggle or poll section', () => {
    assert.ok(
      composeSource.includes('poll') || composeSource.includes('Poll'),
      'Compose should have poll section or toggle'
    );
  });

  it('compose has poll question input', () => {
    assert.ok(
      composeSource.includes('question') || composeSource.includes('Question'),
      'Compose should have poll question field'
    );
  });

  it('compose has poll options management (add/remove)', () => {
    assert.ok(
      composeSource.includes('addOption') || composeSource.includes('removeOption') || composeSource.includes('options'),
      'Compose should support adding/removing poll options'
    );
  });

  it('compose has multi-select toggle for polls', () => {
    assert.ok(
      composeSource.includes('multiSelect') || composeSource.includes('Multi'),
      'Compose should have multi-select toggle'
    );
  });

  it('compose has Other free-text toggle for polls', () => {
    assert.ok(
      composeSource.includes('allowOther') || composeSource.includes('Other'),
      'Compose should have Other free-text toggle'
    );
  });

  it('compose sets broadcastKind to poll when poll enabled', () => {
    assert.ok(
      composeSource.includes('broadcastKind') && (composeSource.includes("'poll'") || composeSource.includes('"poll"')),
      'Compose should set broadcastKind to poll'
    );
  });

  it('compose sets broadcastKind to ack when poll disabled', () => {
    assert.ok(
      composeSource.includes("'ack'") || composeSource.includes('"ack"'),
      'Compose should set broadcastKind to ack for non-poll broadcasts'
    );
  });

  // ── Poll results in detail (PEP-323b) ──
  it('detail shows poll results section for poll broadcasts', () => {
    assert.ok(
      detailSource.includes('Poll Results') || detailSource.includes('poll'),
      'Detail should show poll results for poll broadcasts'
    );
  });

  it('detail shows vote counts and percentage per option', () => {
    assert.ok(
      detailSource.includes('pct') || detailSource.includes('%'),
      'Detail should show vote percentage per option'
    );
  });

  it('detail shows voter names per option', () => {
    assert.ok(
      detailSource.includes('voters') && detailSource.includes('join'),
      'Detail should list voter names per option'
    );
  });

  it('detail shows Other free-text responses', () => {
    assert.ok(
      detailSource.includes('otherVotes') || detailSource.includes('OTHER'),
      'Detail should show Other free-text responses'
    );
  });

  // ── Superadmin guard ──
  it('checks for superadmin role', () => {
    assert.ok(source.includes('isSuperAdmin'), 'Should verify superadmin role');
  });
});

// ── Behavioral tests for broadcastUtils pure functions ──

import {
  classifyBroadcast, computeReach, relativeExpiry, getAudienceSummary,
} from './broadcasts/broadcastUtils.js';

describe('classifyBroadcast', () => {
  const makeTs = (date) => ({ toDate: () => date });
  const now = new Date();
  const future = new Date(now.getTime() + 86400000);
  const past = new Date(now.getTime() - 86400000);

  it('returns "live" for broadcast with no startsAt and future expiresAt', () => {
    assert.equal(classifyBroadcast({ expiresAt: makeTs(future) }), 'live');
  });

  it('returns "scheduled" for broadcast with future startsAt', () => {
    assert.equal(classifyBroadcast({ startsAt: makeTs(future), expiresAt: makeTs(future) }), 'scheduled');
  });

  it('returns "done" for broadcast with past expiresAt', () => {
    assert.equal(classifyBroadcast({ expiresAt: makeTs(past) }), 'done');
  });

  it('returns "live" for broadcast with no expiresAt', () => {
    assert.equal(classifyBroadcast({}), 'live');
  });

  it('returns "live" for broadcast with past startsAt and future expiresAt', () => {
    assert.equal(classifyBroadcast({ startsAt: makeTs(past), expiresAt: makeTs(future) }), 'live');
  });
});

describe('computeReach', () => {
  const classrooms = [
    { id: 'c1', teacherIds: ['t1', 't2'] },
    { id: 'c2', teacherIds: ['t3'] },
  ];
  const allTeachers = [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }];

  it('returns all teachers when no targeting', () => {
    assert.equal(computeReach([], [], allTeachers, classrooms), 4);
  });

  it('returns teachers in targeted classroom', () => {
    assert.equal(computeReach(['c1'], [], allTeachers, classrooms), 2);
  });

  it('returns directly targeted teachers', () => {
    assert.equal(computeReach([], ['t1', 't3'], allTeachers, classrooms), 2);
  });

  it('returns union of classroom + direct targeting', () => {
    assert.equal(computeReach(['c1'], ['t3'], allTeachers, classrooms), 3);
  });

  it('returns 0 when classroom has no teacherIds', () => {
    assert.equal(computeReach(['c1'], [], allTeachers, [{ id: 'c1', teacherIds: [] }]), 0);
  });
});

describe('relativeExpiry', () => {
  const makeTs = (offsetMs) => ({ toDate: () => new Date(Date.now() + offsetMs) });

  it('shows minutes for sub-hour expiry', () => {
    const result = relativeExpiry(makeTs(30 * 60000));
    assert.ok(result.includes('m'), `Expected minutes, got: ${result}`);
  });

  it('shows hours for same-day expiry', () => {
    const result = relativeExpiry(makeTs(5 * 3600000));
    assert.ok(result.includes('h'), `Expected hours, got: ${result}`);
  });

  it('shows days for 1-day expiry', () => {
    const result = relativeExpiry(makeTs(1.5 * 86400000));
    assert.ok(result.includes('1d'), `Expected 1d, got: ${result}`);
  });

  it('shows days for multi-day expiry', () => {
    const result = relativeExpiry(makeTs(3 * 86400000));
    assert.ok(result.includes('3d'), `Expected 3d, got: ${result}`);
  });

  it('shows "ended" for past expiry', () => {
    const result = relativeExpiry(makeTs(-2 * 86400000));
    assert.ok(result.startsWith('ended'), `Expected "ended", got: ${result}`);
  });
});

describe('getAudienceSummary', () => {
  const classrooms = [{ id: 'c1', name: 'Elementary' }, { id: 'c2', name: 'Casa' }];

  it('returns "All staff" when no targeting', () => {
    assert.equal(getAudienceSummary([], [], classrooms), 'All staff');
  });

  it('returns classroom names when targeted', () => {
    assert.equal(getAudienceSummary(['c1'], [], classrooms), 'Elementary');
  });

  it('returns teacher count when targeted', () => {
    assert.equal(getAudienceSummary([], ['t1', 't2'], classrooms), '2 teachers');
  });

  it('returns combined summary', () => {
    assert.equal(getAudienceSummary(['c1'], ['t1'], classrooms), 'Elementary + 1 teacher');
  });
});
