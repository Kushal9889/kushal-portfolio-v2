#!/usr/bin/env bash
# Push the working tree (minus public/, which the sparse cloud checkout lacks) plus
# handoff/ as one commit on top of HEAD to wip/agent-card-2026-10-26. HEAD and the
# current branch are not touched. Usage: bash handoff/checkpoint.sh "what changed"
set -eu
cd "$(dirname "$0")/.."
idx=$(mktemp -u)
GIT_INDEX_FILE=$idx git read-tree HEAD
GIT_INDEX_FILE=$idx git add -A -- . ':!public'
tree=$(GIT_INDEX_FILE=$idx git write-tree); rm -f "$idx"
c=$(git commit-tree "$tree" -p HEAD -m "WIP checkpoint: ${1:-no note}")
git push -f origin "$c:refs/heads/wip/agent-card-2026-10-26"
echo "checkpoint $c"
