import test from 'node:test';
import assert from 'node:assert/strict';

import {
  partitionInterviews,
  getAlertInterviews,
  formatLastInterviewed,
} from './InterviewsPage.helpers.js';

// --- partitionInterviews ---

test('partitionInterviews splits into upcoming and completed', () => {
  const items = [{ status: 'upcoming' }, { status: 'completed' }, { status: 'upcoming' }];
  const { upcoming, completed } = partitionInterviews(items);
  assert.equal(upcoming.length, 2);
  assert.equal(completed.length, 1);
});

test('partitionInterviews returns empty arrays for empty input', () => {
  const { upcoming, completed } = partitionInterviews([]);
  assert.deepEqual(upcoming, []);
  assert.deepEqual(completed, []);
});

test('partitionInterviews buckets scheduled into upcoming', () => {
  const items = [{ status: 'scheduled' }, { status: 'completed' }];
  const { upcoming, completed } = partitionInterviews(items);
  assert.equal(upcoming.length, 1);
  assert.equal(completed.length, 1);
});

// --- getAlertInterviews ---

test('getAlertInterviews returns only entries with hasAlert true', () => {
  const items = [{ hasAlert: true }, { hasAlert: false }, { hasAlert: true }];
  assert.equal(getAlertInterviews(items).length, 2);
});

test('getAlertInterviews returns empty array when no alerts', () => {
  assert.deepEqual(getAlertInterviews([{ hasAlert: false }]), []);
});

// --- formatLastInterviewed ---

test('formatLastInterviewed returns "Never interviewed" for null', () => {
  assert.equal(formatLastInterviewed(null), 'Never interviewed');
});

test('formatLastInterviewed returns "Today" for today\'s date', () => {
  assert.equal(formatLastInterviewed(new Date().toISOString()), 'Today');
});

test('formatLastInterviewed returns "1 day ago" for yesterday', () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  assert.equal(formatLastInterviewed(yesterday), '1 day ago');
});

test('formatLastInterviewed returns "Upcoming" for future dates', () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  assert.equal(formatLastInterviewed(tomorrow), 'Upcoming');
});

test('formatLastInterviewed returns "Never interviewed" for invalid strings', () => {
  assert.equal(formatLastInterviewed('not-a-date'), 'Never interviewed');
});
