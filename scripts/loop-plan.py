"""The plan hook (Kushal, 2026-10-02): every loop writes its plan once, at the
start, as THREE major tasks of THREE to FOUR subtasks each, and cannot end until
every subtask is done with evidence. When fewer than three major tasks exist,
one basic task (two to four subtasks) is written as a concrete task instead.

    loop-plan.py plan "A: sub|sub|sub" "B: sub|sub|sub|sub" "C: sub|sub|sub"
    loop-plan.py plan --basic "task: sub|sub"
    loop-plan.py done 2.3 "evidence: a number, a file, a command"
    loop-plan.py skip 2.3 "why it cannot be done"
    loop-plan.py report "up to four short lines for Kushal"
    loop-plan.py check          exit 1 while anything is pending
    loop-plan.py stop-hook      the Claude Code Stop hook entry

Ids are task.subtask (1.1 to 3.4). It also keeps the loop cheap: subtasks are at
most 12 words, evidence is one short line, the report to Kushal is four lines at
most and never a list of what was done. A subtask that will not pass is not
retried blind: run the `investigate` skill (root cause first), or skip it with a
reason. Nothing here talks to a remote; the plan lives in docs/plan.json.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / "docs" / "plan.json"
REPORT = ROOT / "docs" / "report.txt"
MAX_SUBS, MAX_WORDS, MAX_EVIDENCE = 8, 12, 120
REPORT_LINES, REPORT_CHARS = 4, 480
DASH = re.compile("[—–]")


def load():
    return json.loads(PLAN.read_text()) if PLAN.exists() else None


def save(p):
    PLAN.parent.mkdir(exist_ok=True)
    PLAN.write_text(json.dumps(p, indent=1))


def die(msg):
    print(msg)
    sys.exit(1)


def subs_of(p):
    for ti, t in enumerate(p["tasks"], 1):
        for si, s in enumerate(t["subs"], 1):
            yield f"{ti}.{si}", t, s


def pending(p):
    return [(i, s["t"]) for i, _, s in subs_of(p) if s["st"] == "todo"]


def parse_task(spec):
    if ":" not in spec:
        die(f"FAIL write each task as 'name: sub|sub|sub', got: {spec[:50]}")
    name, rest = spec.split(":", 1)
    subs = [x.strip() for x in rest.split("|") if x.strip()]
    for x in subs + [name]:
        if len(x.split()) > MAX_WORDS:
            die(f"FAIL over {MAX_WORDS} words, split it: {x[:60]}")
        if DASH.search(x):
            die("FAIL no em or en dashes")
    return {"t": name.strip(), "subs": [{"t": x, "st": "todo", "ev": ""} for x in subs]}


def plan(specs, basic):
    old = load()
    if old and pending(old):
        die(f"FAIL previous plan has {len(pending(old))} subtasks pending: finish, skip, or investigate them first")
    tasks = [parse_task(x) for x in specs]
    if basic:
        if len(tasks) != 1 or not 2 <= len(tasks[0]["subs"]) <= 4:
            die("FAIL a basic plan is one task of 2 to 4 subtasks")
    else:
        if len(tasks) != 3:
            die(f"FAIL a plan is exactly 3 major tasks, got {len(tasks)}; use --basic when fewer exist")
        for t in tasks:
            if not 3 <= len(t["subs"]) <= 4:
                die(f"FAIL each major task has 3 or 4 subtasks: {t['t'][:40]} has {len(t['subs'])}")
    save({"basic": basic, "tasks": tasks})
    print(f"plan: {len(tasks)} task(s), {sum(len(t['subs']) for t in tasks)} subtasks")


def find(p, ident):
    for i, _, s in subs_of(p):
        if i == ident:
            return s
    die(f"FAIL no subtask {ident}")


def done(ident, ev):
    p = load() or die("FAIL no plan")
    s = find(p, ident)
    if not 4 <= len(ev) <= MAX_EVIDENCE:
        die(f"FAIL evidence is one line, 4 to {MAX_EVIDENCE} chars")
    if not re.search(r"\d|\.py|\.tsx?|\.css|\.md|PASS|http|:", ev):
        die("FAIL evidence must name a number, a file, a command or a result")
    s.update(st="done", ev=ev)
    save(p)
    print(f"ok {ident}")


def skip(ident, why):
    p = load() or die("FAIL no plan")
    if len(why) < 8:
        die("FAIL say why it is skipped")
    find(p, ident).update(st="skipped", ev=why[:MAX_EVIDENCE])
    save(p)
    print(f"skipped {ident}")


def report(text):
    lines = [l for l in text.strip().splitlines() if l.strip()]
    if len(lines) > REPORT_LINES or len(text) > REPORT_CHARS:
        die(f"FAIL report is {REPORT_LINES} lines and {REPORT_CHARS} chars at most; say only what he must know or do")
    if DASH.search(text):
        die("FAIL no em or en dashes")
    if sum(1 for l in lines if re.match(r"\s*([-*]|\d+\.)\s", l)) > 2:
        die("FAIL a report is not a list of what was done")
    REPORT.write_text(text.strip() + "\n")
    print("report saved")


def check():
    p = load()
    if not p:
        print("PASS no plan")
        return 0
    todo = pending(p)
    if todo:
        for i, t in todo:
            print(f"PENDING {i}: {t}")
        print("Run the investigate skill on the first failing subtask (root cause, then fix), or skip it with a reason.")
        return 1
    size = sum(len(t["t"]) + sum(len(s["t"]) + len(s["ev"]) for s in t["subs"]) for t in p["tasks"])
    if size > 3200:
        print(f"FAIL plan and evidence are {size} chars, tighten to 3200")
        return 1
    if REPORT.exists():
        text = REPORT.read_text()
        if len(text.splitlines()) > REPORT_LINES or len(text) > REPORT_CHARS:
            print("FAIL report over its limit")
            return 1
    every = [s for _, _, s in subs_of(p)]
    n = sum(1 for s in every if s["st"] == "done")
    print(f"PASS {n} of {len(every)} done, {len(every) - n} skipped, {size} chars")
    return 0


def stop_hook():
    try:
        data = json.load(sys.stdin)
    except Exception:
        data = {}
    if data.get("stop_hook_active"):
        return 0
    p = load()
    if not p or not pending(p):
        return 0
    todo = pending(p)
    sys.stderr.write(
        "Plan not finished: " + "; ".join(f"{i} {t}" for i, t in todo[:4])
        + ". Finish each (loop-plan.py done ID evidence), skip with a reason, or run the investigate skill on the one that fails.\n"
    )
    return 2


if __name__ == "__main__":
    a = sys.argv[1:]
    cmd = a[0] if a else ""
    if cmd == "plan" and len(a) >= 2:
        basic = a[1] == "--basic"
        plan(a[2:] if basic else a[1:], basic)
    elif cmd == "done" and len(a) >= 3:
        done(a[1], " ".join(a[2:]))
    elif cmd == "skip" and len(a) >= 3:
        skip(a[1], " ".join(a[2:]))
    elif cmd == "report" and len(a) >= 2:
        report(" ".join(a[1:]))
    elif cmd == "check":
        sys.exit(check())
    elif cmd == "stop-hook":
        sys.exit(stop_hook())
    else:
        print(__doc__)
        sys.exit(2)
