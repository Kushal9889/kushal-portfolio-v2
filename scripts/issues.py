"""Running tracker of issues hit while solving something (Kushal, 2026-10-03).

    python3 scripts/issues.py add "what broke, where"      log an issue the moment it appears
    python3 scripts/issues.py close 4 "root cause and fix"  close it with evidence
    python3 scripts/issues.py list                          open issues only
    python3 scripts/issues.py all                           everything

One file, docs/issues.md, one line per issue, so a later session reads the
open list instead of the transcript.
"""

import re
import sys
import time
from pathlib import Path

FILE = Path(__file__).resolve().parent.parent / "docs" / "issues.md"
HEAD = "# Issues hit while solving (scripts/issues.py)\n\n| # | Opened | Status | Issue | Resolution |\n|---|---|---|---|---|\n"
ROW = re.compile(r"^\| (\d+) \| ([^|]*) \| (open|closed) \| ([^|]*) \| ([^|]*) \|$")


def rows():
    if not FILE.exists():
        return []
    return [m.groups() for m in map(ROW.match, FILE.read_text().splitlines()) if m]


def save(rs):
    FILE.write_text(HEAD + "".join(f"| {n} | {d} | {s} | {i} | {r} |\n" for n, d, s, i, r in rs))


def clean(t):
    return t.replace("|", "/").replace("\n", " ").strip()


def main():
    cmd, args = (sys.argv[1] if len(sys.argv) > 1 else "list"), sys.argv[2:]
    rs = rows()
    if cmd == "add" and args:
        n = str(max((int(r[0]) for r in rs), default=0) + 1)
        rs.append((n, time.strftime("%Y-%m-%d %H:%M"), "open", clean(" ".join(args)), ""))
        save(rs)
        print(f"opened #{n}")
    elif cmd == "close" and len(args) >= 2:
        hit = [r for r in rs if r[0] == args[0]]
        if not hit:
            sys.exit(f"no issue #{args[0]}")
        rs = [(n, d, "closed", i, clean(" ".join(args[1:]))) if n == args[0] else (n, d, s, i, r) for n, d, s, i, r in rs]
        save(rs)
        print(f"closed #{args[0]}")
    elif cmd in ("list", "all"):
        for n, d, s, i, r in rs:
            if cmd == "all" or s == "open":
                print(f"#{n} [{s}] {i}" + (f" -> {r}" if r else ""))
        print(f"{sum(r[2] == 'open' for r in rs)} open")
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main()
