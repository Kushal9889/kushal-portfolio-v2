#!/usr/bin/env bash
# Save this session's work on its own branch. Kushal chose stand-alone on
# 2026-10-26: no merge of wip/agent-card-2026-10-26, he merges both later.
# Pushes the working tree to wip/elite-pass-2026-10-26.
# Usage: bash handoff/checkpoint-elite.sh "note"
set -eu
cd "$(dirname "$0")/.."
idx=$(mktemp -u)
GIT_INDEX_FILE=$idx git read-tree HEAD
GIT_INDEX_FILE=$idx git add -A -- . ':!public'
tree=$(GIT_INDEX_FILE=$idx git write-tree); rm -f "$idx"
c=$(git commit-tree "$tree" -p HEAD -m "WIP checkpoint (elite pass): ${1:-no note}")
git push -f origin "$c:refs/heads/wip/elite-pass-2026-10-26"
echo "checkpoint $c"
