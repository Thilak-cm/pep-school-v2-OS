/**
 * PEP-223: Pure logic for StudentPicker scope resolution.
 */

/**
 * Determine initial behavior from scope prop.
 * - hardcoded: use provided defaults, no fetch
 * - program: fetch all students in the program on mount
 * - school-wide: fetch all students on mount
 */
export function resolveInitialState({ scope, defaults }) {
  switch (scope) {
    case "hardcoded":
      return { students: defaults || [], shouldFetch: false };
    case "school-wide":
      return { students: [], shouldFetch: true };
    case "program":
    default:
      return { students: [], shouldFetch: true };
  }
}
