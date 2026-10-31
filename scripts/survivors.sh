#!/usr/bin/env bash
# Merge survivor check: v2-only work that a three-way merge must not drop,
# no conflict markers, and wiring no worse than before the 2026-10-25 merges.
# Run from v2/. Exit 1 on any miss.
set -u
cd "$(dirname "$0")/.."
fail=0; n=0; ok=0
hit() { n=$((n+1)); if grep -qF -- "$2" "$1"; then ok=$((ok+1)); else echo "MISS $1: $2"; fail=1; fi; }
hit lib/agent/retrieve.ts 'passagesOf'
hit app/components/Agent.tsx 'partlyWhy'
# Read the version from policy.ts so a bump needs no edit here; a merge must not
# drop it or fall below the v3.5 floor.
pv=$(sed -nE 's/^export const PROMPT_VERSION = "v([0-9]+\.[0-9]+)";.*/\1/p' lib/agent/policy.ts)
n=$((n+1)); if [ -n "$pv" ] && awk -v v="$pv" 'BEGIN{split(v,p,"."); exit !(p[1] > 3 || (p[1] == 3 && p[2] >= 5))}'; then ok=$((ok+1)); else echo "MISS lib/agent/policy.ts: PROMPT_VERSION v3.5 or later (got '${pv:-none}')"; fail=1; fi
hit lib/agent/index.json '"embedModel":"gemini-embedding-2"'
hit app/components/Hero.module.css 'align-content: safe end'
hit app/components/Hero.module.css 'contain: size'
hit lib/agent/policy.ts 'endsInAddress'
hit lib/agent/followups.ts 'profile.repo &&'
hit lib/agent/stream.ts 'stream.after-answer'
hit scripts/judge.ts 'JUDGE_SECOND'
hit lib/agent/evals.ts 'eval-cases.json'
hit app/components/Agent.module.css '.board'
hit lib/agent/ground.ts 'SENTENCE'
echo "survivors $ok/$n"
markers=$(grep -rlE '^(<<<<<<<|>>>>>>>)( |$)' --include='*.ts' --include='*.tsx' --include='*.css' --include='*.json' --include='*.md' --include='*.py' --exclude-dir=node_modules --exclude-dir=.next . | wc -l | tr -d ' ')
echo "conflict markers $markers"; [ "$markers" = 0 ] || fail=1
audit=$(npx tsx scripts/wiring-audit.ts 2>&1)
un=$(echo "$audit" | sed -nE 's/^== unimported \(([0-9]+)\).*/\1/p')
ci=$(echo "$audit" | sed -nE 's/^== classIssues \(([0-9]+)\).*/\1/p')
echo "wiring unimported ${un:-?} (baseline 1), classIssues ${ci:-?}"
[ "${un:-99}" -le 1 ] || fail=1
exit $fail
