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

  // ── Superadmin guard ──
  it('checks for superadmin role', () => {
    assert.ok(source.includes('isSuperAdmin'), 'Should verify superadmin role');
  });
});
