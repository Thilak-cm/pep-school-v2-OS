#!/bin/bash
# PostToolUse hook: after an Edit to functions/, check for testbench imports.
# Production Cloud Functions must never import from testbench - copy helpers instead.
# Exit 2 = block (revert the edit).

TOOL=$(jq -r '.tool_name // empty')
FILE_PATH=$(jq -r '.tool_input.file_path // empty')

# Only check Edit operations on files in functions/ but not in functions/testbench/
if [ "$TOOL" != "Edit" ] && [ "$TOOL" != "Write" ]; then
  exit 0
fi

# Skip if not in functions/ or if in functions/testbench/
if ! echo "$FILE_PATH" | grep -qE '/functions/'; then
  exit 0
fi
if echo "$FILE_PATH" | grep -qE '/functions/testbench/'; then
  exit 0
fi

# Check the file for testbench imports
if [ -f "$FILE_PATH" ] && grep -qE "(from|require).*['\"].*testbench" "$FILE_PATH"; then
  echo "BLOCKED: Production functions must not import from testbench." >&2
  echo "Copy the needed helpers into your module instead." >&2
  echo "See: functions/testbench/report.js for the pattern." >&2
  exit 2
fi

exit 0
