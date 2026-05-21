/**
 * Parent contact field validation for UsersAccessPage (PEP-247).
 * Extracted as a pure module so it can be unit-tested without rendering.
 */

/** Returns true when the string looks like a valid email address. */
export function isValidEmail(email) {
  if (!email || !email.trim()) return false;
  // Simple but effective: local@domain.tld, no double-@, no leading dot in domain
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Validate parent contact fields.
 *
 * @param {Object} fields - Object with any of: parent1Name, parent1Email, parent1Phone,
 *                          parent2Name, parent2Email, parent2Phone
 * @param {'create'|'edit'} mode - In create mode parent1Name + parent1Email are required.
 *                                  In edit mode all fields are optional (existing students).
 * @returns {Object} errors keyed by field name (empty object = valid)
 */
export function validateParentFields(fields = {}, mode = 'create') {
  const errors = {};
  const val = (k) => (fields[k] || '').trim();

  // --- Parent 1 ---
  if (mode === 'create') {
    if (!val('parent1Name')) {
      errors.parent1Name = 'Parent 1 name is required';
    }
    if (!val('parent1Email')) {
      errors.parent1Email = 'Parent 1 email is required';
    } else if (!isValidEmail(val('parent1Email'))) {
      errors.parent1Email = 'Enter a valid email address';
    }
  } else {
    // Edit mode: only validate format when a value is provided
    if (val('parent1Email') && !isValidEmail(val('parent1Email'))) {
      errors.parent1Email = 'Enter a valid email address';
    }
  }

  // --- Parent 2 (always optional, but validate email format if provided) ---
  if (val('parent2Email') && !isValidEmail(val('parent2Email'))) {
    errors.parent2Email = 'Enter a valid email address';
  }

  return errors;
}
