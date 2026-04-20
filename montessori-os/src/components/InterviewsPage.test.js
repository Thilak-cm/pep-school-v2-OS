import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MOCK_INTERVIEWS,
  REQUIRED_FIELDS,
  VALID_STATUSES,
  partitionInterviews,
  getAlertInterviews,
  formatLastInterviewed,
} from './InterviewsPage.helpers.js';

// --- Mock data shape validation ---

test('MOCK_INTERVIEWS is a non-empty array', () => {
  assert.ok(Array.isArray(MOCK_INTERVIEWS));
  assert.ok(MOCK_INTERVIEWS.length > 0);
});

test('every mock interview has all required fields', () => {
  for (const entry of MOCK_INTERVIEWS) {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(
        field in entry,
        `Entry ${entry.id} is missing required field "${field}"`
      );
    }
  }
});

test('every mock interview has a valid status', () => {
  for (const entry of MOCK_INTERVIEWS) {
    assert.ok(
      VALID_STATUSES.includes(entry.status),
      `Entry ${entry.id} has invalid status "${entry.status}"`
    );
  }
});

test('every mock interview has a boolean hasAlert field', () => {
  for (const entry of MOCK_INTERVIEWS) {
    assert.equal(typeof entry.hasAlert, 'boolean', `Entry ${entry.id} hasAlert is not boolean`);
  }
});

test('mock data contains both upcoming and completed entries', () => {
  const statuses = new Set(MOCK_INTERVIEWS.map((i) => i.status));
  assert.ok(statuses.has('upcoming'), 'No upcoming entries in mock data');
  assert.ok(statuses.has('completed'), 'No completed entries in mock data');
});

// --- partitionInterviews ---

test('partitionInterviews splits into upcoming and completed', () => {
  const { upcoming, completed } = partitionInterviews(MOCK_INTERVIEWS);
  assert.ok(upcoming.length > 0);
  assert.ok(completed.length > 0);
  assert.equal(upcoming.length + completed.length, MOCK_INTERVIEWS.length);
  assert.ok(upcoming.every((i) => i.status === 'upcoming'));
  assert.ok(completed.every((i) => i.status === 'completed'));
});

test('partitionInterviews returns empty arrays for empty input', () => {
  const { upcoming, completed } = partitionInterviews([]);
  assert.deepEqual(upcoming, []);
  assert.deepEqual(completed, []);
});

test('partitionInterviews handles all-upcoming list', () => {
  const all = [{ status: 'upcoming' }, { status: 'upcoming' }];
  const { upcoming, completed } = partitionInterviews(all);
  assert.equal(upcoming.length, 2);
  assert.equal(completed.length, 0);
});

test('partitionInterviews handles all-completed list', () => {
  const all = [{ status: 'completed' }, { status: 'completed' }];
  const { upcoming, completed } = partitionInterviews(all);
  assert.equal(upcoming.length, 0);
  assert.equal(completed.length, 2);
});

test('partitionInterviews buckets scheduled into upcoming', () => {
  const items = [{ status: 'scheduled' }, { status: 'completed' }];
  const { upcoming, completed } = partitionInterviews(items);
  assert.equal(upcoming.length, 1);
  assert.equal(completed.length, 1);
});

// --- getAlertInterviews ---

test('getAlertInterviews returns only entries with hasAlert true', () => {
  const alerts = getAlertInterviews(MOCK_INTERVIEWS);
  assert.ok(alerts.length > 0);
  assert.ok(alerts.every((i) => i.hasAlert === true));
});

test('getAlertInterviews returns empty array when no alerts', () => {
  const noAlerts = [{ hasAlert: false }, { hasAlert: false }];
  assert.deepEqual(getAlertInterviews(noAlerts), []);
});

// --- formatLastInterviewed ---

test('formatLastInterviewed returns "Never interviewed" for null', () => {
  assert.equal(formatLastInterviewed(null), 'Never interviewed');
});

test('formatLastInterviewed returns "Today" for today\'s date', () => {
  const now = new Date().toISOString();
  assert.equal(formatLastInterviewed(now), 'Today');
});

test('formatLastInterviewed returns "1 day ago" for yesterday', () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  assert.equal(formatLastInterviewed(yesterday), '1 day ago');
});

test('formatLastInterviewed returns "X days ago" for older dates', () => {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(formatLastInterviewed(fiveDaysAgo), '5 days ago');
});

test('formatLastInterviewed returns "Upcoming" for future dates', () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  assert.equal(formatLastInterviewed(tomorrow), 'Upcoming');
});

test('formatLastInterviewed returns "Never interviewed" for invalid date strings', () => {
  assert.equal(formatLastInterviewed('not-a-date'), 'Never interviewed');
});
