#!/usr/bin/env bash
set -euo pipefail

: "${MEMORY_AGENT_ID:?MEMORY_AGENT_ID is required}"
: "${MEMORY_SPACE_ID:?MEMORY_SPACE_ID is required}"
: "${CLAUDE_CONFIG_DIR:?CLAUDE_CONFIG_DIR is required}"

node /opt/memory-lab/tools/render-settings.mjs \
  --target docker \
  --template /opt/memory-lab/settings.template.json \
  --config-dir "$CLAUDE_CONFIG_DIR" \
  --agent-bundle-file "/home/claude/.memory/agent-bundle.json" \
  --space-id "$MEMORY_SPACE_ID"

if [[ "${1:-}" == "--interactive" ]]; then
  shift
fi

exec claude "$@"
