"""Deterministic skill pass for every loop tick (Kushal, 2026-10-02).

    python3 scripts/loop-skills.py begin            start a tick, print the order
    python3 scripts/loop-skills.py log SKILL "verdict, one line"
    python3 scripts/loop-skills.py check            exit 1 unless all five are logged this tick

A tick is not reportable until `check` passes. The five passes run in this
order and each one writes its one-line verdict to docs/skill-log.md:

  1 elite-thinking      anthropic-skills:elite-thinking
  2 brutalist           design-taste:industrial-brutalist-ui
  3 design-taste        design-taste:design-taste-frontend (anti-AI list, section 9 and 14)
  4 ui-ux-pro-max       ui-ux-pro-max:ui-ux-pro-max (one search.py query, or "no match")
  5 impeccable          impeccable:impeccable (one sub-command named in the verdict)
  6 stitch              design-taste:stitch-design-taste
  7 img2threejs         img2threejs:img2threejs (the film is a 3D render)

Kushal 2026-10-07: all seven, on every subtask.

The script cannot call a skill; the Skill tool does that. What the script owns
is the order, the log, and the refusal to pass without all seven.
"""

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / "docs" / "skill-log.md"
TICK = ROOT / "docs" / ".tick"
ORDER = [
    ("elite-thinking", "anthropic-skills:elite-thinking"),
    ("brutalist", "design-taste:industrial-brutalist-ui"),
    ("design-taste", "design-taste:design-taste-frontend"),
    ("ui-ux-pro-max", "ui-ux-pro-max:ui-ux-pro-max"),
    ("impeccable", "impeccable:impeccable"),
    ("stitch", "design-taste:stitch-design-taste"),
    ("img2threejs", "img2threejs:img2threejs"),
]
# Not every tick, but every failed check (Kushal 2026-10-07): root cause first,
# then the fix; its verdict goes in the same tick block.
ON_FAIL = ("investigate", "gstack:investigate")
# Every tick closes by writing the next tick's prompt (Kushal 2026-10-07):
# elite-thinking decides what it builds, prompt-engineer writes it.
CLOSE = [
    ("next-elite", "anthropic-skills:elite-thinking"),
    ("prompt-engineer", "fullstack-dev-skills:prompt-engineer"),
]


def tick():
    return TICK.read_text().strip() if TICK.exists() else ""


def begin():
    t = time.strftime("%Y-%m-%d %H:%M")
    TICK.write_text(t)
    LOG.parent.mkdir(exist_ok=True)
    with LOG.open("a") as f:
        f.write(f"\n## tick {t}\n")
    print(f"tick {t}. Invoke with the Skill tool, in this order, then log each verdict:")
    for n, (short, full) in enumerate(ORDER, 1):
        print(f"  {n}. {full}   -> python3 scripts/loop-skills.py log {short} \"verdict\"")
    for short, full in CLOSE:
        print(f"  close (next-tick prompt): {full}   -> python3 scripts/loop-skills.py log {short} \"verdict\"")
    print(f"  on any failed check: {ON_FAIL[1]}   -> python3 scripts/loop-skills.py log {ON_FAIL[0]} \"root cause + fix\"")


def log(short, verdict):
    known = dict(ORDER) | dict(CLOSE) | dict([ON_FAIL])
    if short not in known:
        sys.exit(f"unknown skill {short!r}; one of {', '.join(known)}")
    if not tick():
        sys.exit("no tick: run `begin` first")
    if len(verdict.strip()) < 12:
        sys.exit("verdict too short: say what the skill decided")
    with LOG.open("a") as f:
        f.write(f"- {short}: {verdict.strip()}\n")
    print(f"logged {short}")


def check():
    t = tick()
    if not t or not LOG.exists():
        sys.exit("FAIL no tick started")
    block = LOG.read_text().split(f"## tick {t}\n")[-1].split("\n## tick ")[0]
    missing = [s for s, _ in ORDER + CLOSE if f"- {s}: " not in block]
    if missing:
        print("FAIL skills not run this tick: " + ", ".join(missing))
        sys.exit(1)
    print(f"PASS all {len(ORDER) + len(CLOSE)} skill passes logged for tick {t}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "begin":
        begin()
    elif cmd == "log" and len(sys.argv) >= 4:
        log(sys.argv[2], " ".join(sys.argv[3:]))
    elif cmd == "check":
        check()
    else:
        print(__doc__)
        sys.exit(2)
