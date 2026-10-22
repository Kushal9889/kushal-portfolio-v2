#!/bin/bash
# Whole UI suite, one after another (they share one server and one CPU). Output: /tmp/ui-suite.out
# usage: scripts/ui-suite.sh [--force]
cd "$(dirname "$0")/.."
F="$1"
{
  for s in ui-inventory ui-highlights ui-boxes ui-axe ui-motion; do
    echo "=== $s"
    python3 scripts/$s.py $F 2>&1 | grep -v "Deprecat\|return sum" | cut -c1-175 | head -18
  done
  echo "=== suite done"
} > /tmp/ui-suite.out 2>&1
