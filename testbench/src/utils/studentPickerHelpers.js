/**
 * PEP-223: Pure logic for StudentPicker scope resolution.
 */

/**
 * Determine initial state from scope + defaults props.
 */
export function resolveInitialState({ scope, defaults }) {
  switch (scope) {
    case "hardcoded":
      return { students: defaults || [], canLoadMore: false, shouldFetchAll: false };
    case "school-wide":
      return { students: [], canLoadMore: false, shouldFetchAll: true };
    case "program":
    default:
      return { students: defaults || [], canLoadMore: true, shouldFetchAll: false };
  }
}
