#!/usr/bin/env bash
# Save this session's work on top of the agent-card session's latest work.
# 1) bring in wip/agent-card-2026-10-26 (merge, never rebase), 2) push the
# working tree to wip/elite-pass-2026-10-26. On a merge conflict it stops:
# ask Kushal which side wins. Usage: bash handoff/checkpoint-elite.sh "note"
set -eu
cd "$(dirname "$0")/.."
git fetch -q origin wip/agent-card-2026-10-26
git stash -q --include-untracked || true
git merge --no-edit -q FETCH_HEAD || { echo "CONFLICT with the agent-card session: ask Kushal"; exit 2; }
git stash pop -q || { echo "CONFLICT re-applying local edits: ask Kushal"; exit 2; }
idx=$(mktemp -u)
GIT_INDEX_FILE=$idx git read-tree HEAD
GIT_INDEX_FILE=$idx git add -A -- . ':!public'
tree=$(GIT_INDEX_FILE=$idx git write-tree); rm -f "$idx"
c=$(git commit-tree "$tree" -p HEAD -m "WIP checkpoint (elite pass): ${1:-no note}")
git push -f origin "$c:refs/heads/wip/elite-pass-2026-10-26"
echo "checkpoint $c"
