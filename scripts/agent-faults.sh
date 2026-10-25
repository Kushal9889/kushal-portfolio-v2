#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for fault in outage 429 timeout chat embed rerank neon; do
  echo "== AGENT_FAULT=$fault"
  AGENT_FAULT="$fault" node_modules/.bin/tsx scripts/agent-scenarios.ts --split test --gate
done
