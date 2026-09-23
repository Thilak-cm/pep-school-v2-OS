#!/bin/bash
# Block ops scripts run with --yes unless a dry-run was done first.
# Hooks can't track session state, so we block --yes entirely and
# inject a reminder to dry-run first. The agent must present dry-run
# output before the user approves --yes.
# Exit 2 = block the tool call.

COMMAND=$(jq -r '.tool_input.command // empty')

# Match: node scripts/ops/*.mjs with --yes flag
if echo "$COMMAND" | grep -qE 'node\s+scripts/ops/\S+\.mjs' && echo "$COMMAND" | grep -qE '\-\-yes'; then
  echo "BLOCKED: Ops scripts with --yes require a dry-run first." >&2
  echo "Run the same script without --yes (dry-run mode), inspect the output," >&2
  echo "then get user approval before re-running with --yes." >&2
  echo "If you have already completed the dry-run in this session, tell the user" >&2
  echo "and ask them to approve the --yes run manually." >&2
  exit 2
fi

exit 0
