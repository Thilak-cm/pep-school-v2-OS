import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'UsersAccessPage.jsx'), 'utf-8');

// ---------------------------------------------------------------------------
// Exported validation helpers — defined in UsersAccessPage.validation.js
// ---------------------------------------------------------------------------
let isValidEmail, validateParentFields;
try {
  const mod = await import('./UsersAccessPage.validation.js');
  isValidEmail = mod.isValidEmail;
  validateParentFields = mod.validateParentFields;
} catch { /* import failed */ }

// ===========================================================================
// AC3: Email validation — isValidEmail()
// ===========================================================================
describe('isValidEmail()', () => {
  it('accepts standard email addresses', () => {
    assert.ok(isValidEmail('user@domain.com'));
    assert.ok(isValidEmail('first.last@example.org'));
    assert.ok(isValidEmail('user+tag@sub.domain.co'));
  });

  it('rejects plain text (no @ sign)', () => {
    assert.equal(isValidEmail('not-an-email'), false);
    assert.equal(isValidEmail('justtext'), false);
  });

  it('rejects missing domain', () => {
    assert.equal(isValidEmail('user@'), false);
    assert.equal(isValidEmail('user@.com'), false);
  });

  it('rejects missing local part', () => {
    assert.equal(isValidEmail('@domain.com'), false);
  });

  it('rejects whitespace-only or empty string', () => {
    assert.equal(isValidEmail(''), false);
    assert.equal(isValidEmail('   '), false);
  });

  it('rejects double @ sign', () => {
    assert.equal(isValidEmail('a@@b.com'), false);
  });
});

// ===========================================================================
// AC1+2: validateParentFields() — creation mode (requireParent1 = true)
// ===========================================================================
describe('validateParentFields() — creation mode', () => {
  const mode = 'create';

  it('returns errors when parent1Name is missing', () => {
    const errors = validateParentFields({ parent1Name: '', parent1Email: 'a@b.com' }, mode);
    assert.ok(errors.parent1Name);
  });

  it('returns errors when parent1Email is missing', () => {
    const errors = validateParentFields({ parent1Name: 'Jane', parent1Email: '' }, mode);
    assert.ok(errors.parent1Email);
  });

  it('returns email format error for invalid parent1Email', () => {
    const errors = validateParentFields({ parent1Name: 'Jane', parent1Email: 'notanemail' }, mode);
    assert.ok(errors.parent1Email);
    assert.ok(errors.parent1Email.toLowerCase().includes('valid'));
  });

  it('returns no errors when required fields are valid', () => {
    const errors = validateParentFields({ parent1Name: 'Jane', parent1Email: 'jane@example.com' }, mode);
    assert.equal(Object.keys(errors).length, 0);
  });

  it('returns no errors when parent2 fields are all empty', () => {
    const errors = validateParentFields({
      parent1Name: 'Jane', parent1Email: 'jane@example.com',
      parent2Name: '', parent2Email: '', parent2Phone: ''
    }, mode);
    assert.equal(Object.keys(errors).length, 0);
  });

  it('returns email format error for invalid parent2Email when provided', () => {
    const errors = validateParentFields({
      parent1Name: 'Jane', parent1Email: 'jane@example.com',
      parent2Email: 'bad-email'
    }, mode);
    assert.ok(errors.parent2Email);
  });

  it('accepts valid parent2Email', () => {
    const errors = validateParentFields({
      parent1Name: 'Jane', parent1Email: 'jane@example.com',
      parent2Email: 'john@example.com'
    }, mode);
    assert.ok(!errors.parent2Email);
  });

  it('treats whitespace-only parent1Name as missing', () => {
    const errors = validateParentFields({ parent1Name: '   ', parent1Email: 'a@b.com' }, mode);
    assert.ok(errors.parent1Name);
  });
});

// ===========================================================================
// AC5+6: validateParentFields() — edit mode (parent1 not required)
// ===========================================================================
describe('validateParentFields() — edit mode', () => {
  const mode = 'edit';

  it('returns no errors when all parent fields are empty (existing student)', () => {
    const errors = validateParentFields({}, mode);
    assert.equal(Object.keys(errors).length, 0);
  });

  it('returns email format error if parent1Email is provided but invalid', () => {
    const errors = validateParentFields({ parent1Email: 'bad' }, mode);
    assert.ok(errors.parent1Email);
  });

  it('returns no errors when parent1Email is valid', () => {
    const errors = validateParentFields({ parent1Email: 'a@b.com' }, mode);
    assert.ok(!errors.parent1Email);
  });

  it('validates parent2Email format when provided', () => {
    const errors = validateParentFields({ parent2Email: 'bad' }, mode);
    assert.ok(errors.parent2Email);
  });
});

// ===========================================================================
// AC7: Guardian fields removed from form state
// ===========================================================================
describe('Guardian fields removed (AC7)', () => {
  it('studentForm initial state has no guardianName key', () => {
    assert.ok(!source.includes("guardianName"), 'guardianName should be removed from source');
  });

  it('studentForm initial state has no guardianRelationship key', () => {
    assert.ok(!source.includes("guardianRelationship"), 'guardianRelationship should be removed');
  });

  it('studentForm initial state has no guardianPhone key', () => {
    assert.ok(!source.includes("guardianPhone"), 'guardianPhone should be removed from source');
  });

  it('studentForm initial state includes parent1Name key', () => {
    assert.ok(source.includes('parent1Name'), 'Should have parent1Name in form state');
  });

  it('studentForm initial state includes parent1Email key', () => {
    assert.ok(source.includes('parent1Email'), 'Should have parent1Email in form state');
  });

  it('creation form has parent1Name as required', () => {
    assert.ok(source.includes('required') && source.includes('parent1Name'),
      'parent1Name should be required in the creation form');
  });
});
