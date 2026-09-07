#!/bin/bash
# Block PR creation that doesn't target alt-dev from the alt-pepos worktree.
# Exit 2 = block the tool call.

COMMAND=$(jq -r '.tool_input.command // empty')

# Only check gh pr create commands
if ! echo "$COMMAND" | grep -qE 'gh\s+pr\s+create'; then
  exit 0
fi

# If --base is specified but not alt-dev, block
if echo "$COMMAND" | grep -qE '\-\-base\s+' && ! echo "$COMMAND" | grep -qE '\-\-base\s+alt-dev'; then
  echo "BLOCKED: PRs from alt-pepos must target alt-dev, not another branch." >&2
  echo "Use: --base alt-dev" >&2
  exit 2
fi

# If --base is not specified at all, block (gh defaults to the repo default branch)
if ! echo "$COMMAND" | grep -qE '\-\-base'; then
  echo "BLOCKED: PRs from alt-pepos must explicitly target alt-dev." >&2
  echo "Add: --base alt-dev" >&2
  exit 2
fi

exit 0
