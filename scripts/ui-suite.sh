#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p docs
for script in ui-inventory ui-highlights ui-boxes ui-axe ui-motion; do
  echo "=== $script"
  python3 "scripts/$script.py" "$@"
done
echo "=== suite passed"
