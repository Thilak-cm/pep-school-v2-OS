import test from 'node:test';
import assert from 'node:assert/strict';
import { isFunctionTimeout, friendlyFunctionError } from './cloudFunctionErrors.js';

// ── isFunctionTimeout ──────────────────────────────────────────────

test('isFunctionTimeout returns true for "functions/deadline-exceeded"', () => {
  assert.equal(isFunctionTimeout({ code: 'functions/deadline-exceeded' }), true);
});

test('isFunctionTimeout returns true for "deadline-exceeded"', () => {
  assert.equal(isFunctionTimeout({ code: 'deadline-exceeded' }), true);
});

test('isFunctionTimeout returns false for other error codes', () => {
  assert.equal(isFunctionTimeout({ code: 'functions/internal' }), false);
  assert.equal(isFunctionTimeout({ code: 'permission-denied' }), false);
});

test('isFunctionTimeout returns false for null/undefined error', () => {
  assert.equal(isFunctionTimeout(null), false);
  assert.equal(isFunctionTimeout(undefined), false);
  assert.equal(isFunctionTimeout({}), false);
});

// ── friendlyFunctionError ──────────────────────────────────────────

test('friendlyFunctionError returns timeout message for deadline-exceeded', () => {
  const msg = friendlyFunctionError({ code: 'functions/deadline-exceeded' });
  assert.ok(msg.toLowerCase().includes('taking longer'));
  assert.ok(msg.toLowerCase().includes('try again'));
});

test('friendlyFunctionError returns generic message for other errors', () => {
  const msg = friendlyFunctionError({ code: 'functions/internal', message: 'server error' });
  assert.ok(msg.toLowerCase().includes('something went wrong'));
  assert.ok(msg.toLowerCase().includes('try again'));
});

test('friendlyFunctionError returns generic message for null error', () => {
  const msg = friendlyFunctionError(null);
  assert.ok(msg.toLowerCase().includes('something went wrong'));
});
