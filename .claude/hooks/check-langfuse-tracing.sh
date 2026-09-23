#!/bin/bash
# PostToolUse hook: after editing LLM-calling files in functions/, remind about Langfuse.
# This is a soft gate - injects a reminder (stdout) rather than blocking (exit 2).

TOOL=$(jq -r '.tool_name // empty')
FILE_PATH=$(jq -r '.tool_input.file_path // empty')

if [ "$TOOL" != "Edit" ] && [ "$TOOL" != "Write" ]; then
  exit 0
fi

# Only check files in LLM-heavy function directories
if ! echo "$FILE_PATH" | grep -qE '/functions/(ai|digest|reports|chat|monthlyPlan|coach|alerts|writingAnalysis|baseballCard)/'; then
  exit 0
fi

# Check if file calls LLM functions
if [ -f "$FILE_PATH" ] && grep -qE '(runLLM|agentLoop|openrouterStream|openrouter|generateContent|callLLM)' "$FILE_PATH"; then
  # Check if Langfuse is already imported/used
  if ! grep -qE '(langfuse|createLangfuse|initLangfuse|trace)' "$FILE_PATH"; then
    echo "REMINDER: This file calls an LLM but has no Langfuse tracing."
    echo "Every LLM call must include Langfuse tracing."
    echo "See existing patterns in functions/shared/langfuse.js."
  fi
fi

exit 0
