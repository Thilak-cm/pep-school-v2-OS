#!/bin/bash
# Block any git push targeting master/main without explicit human approval.
# Fires on PreToolUse for Bash commands matching git push.
# Exit 2 = block the tool call.

COMMAND=$(jq -r '.tool_input.command // empty')

# Match: git push to master or main (with or without remote name)
# Covers: git push origin master, git push master, git push --force origin master, etc.
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*\b(master|main)\b'; then
  echo "BLOCKED: push to master/main requires explicit human approval. Ask the user first." >&2
  exit 2
fi

exit 0
