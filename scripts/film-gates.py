"""Every film gate in one command, run side by side (docs/film-gates.md).

    python3 scripts/film-gates.py            fast: 1440 wide, about 1.5 minutes
    python3 scripts/film-gates.py full       920 to 1920 wide, then perf alone

Each gate is its own process against the one dev server on :3002, so a slow
gate no longer holds the others. The page is compiled once before the fan-out.
The probe and perf run last and alone: it times frames, and a busy machine skews it.
Exits 1 if any gate fails. Logs land in .playwright-mcp/film/gates/.
"""

import os
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LOGS = os.path.join(ROOT, "..", ".playwright-mcp", "film", "gates")
URL = "http://localhost:3002/classic?film=debug"
PARALLEL = 5
ANCHORS = ["hero", "T1", "work", "T2", "opensource", "T3", "research", "T4", "approach", "T5",
           "measured", "T6", "running", "T7", "proof", "T8", "education", "T9", "contact", "end"]


def py(script, *args):
    return ["python3", os.path.join(HERE, script), *map(str, args)]


def plan(profile):
    widths = [1440] if profile == "fast" else [920, 1280, 1440, 1920]
    # (name, command, then) where `then` runs after `command` passes, in the same slot.
    # Contrast is the long pole (about 60 s a width), so its 20 stops run as two halves.
    halves = [ANCHORS[:10], ANCHORS[10:]]
    jobs = [(f"contrast {w} {k + 1}/2", py("film-contrast.py", "--width", w, "--only", *h), None) for w in widths for k, h in enumerate(halves)]
    jobs += [(f"black {w}", py("film-black.py", "--width", w), None) for w in widths]
    if profile == "full":
        jobs += [("degrade", py("film-degrade.py"), None), ("birth", py("film-birth.py"), None)]
    # film-compare.py scored the 3D world, which is no longer drawn (D36); the
    # clips' own contract is the scroll probe: 60 fps and no blank frame.
    alone = [("probe", py("film-probe.py"), None)] + ([("seams", py("film-seams.py"), None), ("perf", py("film-perf.py"), None)] if profile == "full" else [])
    return jobs, alone


def run(job):
    name, cmd, then = job
    log = os.path.join(LOGS, name.replace(" ", "-").replace("+", "-").replace("/", "of") + ".log")
    t = time.time()
    with open(log, "w") as out:
        code = subprocess.call(cmd, cwd=ROOT, stdout=out, stderr=subprocess.STDOUT)
        if code == 0 and then:
            code = subprocess.call(then, cwd=ROOT, stdout=out, stderr=subprocess.STDOUT)
    lines = [l.strip() for l in open(log) if l.strip()]
    return name, code, time.time() - t, lines[-1][:110] if lines else ""


def main():
    profile = sys.argv[1] if len(sys.argv) > 1 else "fast"
    os.makedirs(LOGS, exist_ok=True)
    t0 = time.time()
    urllib.request.urlopen(URL, timeout=120).read()  # compile the route once
    jobs, alone = plan(profile)
    with ThreadPoolExecutor(PARALLEL) as pool:
        results = list(pool.map(run, jobs))
    results += [run(j) for j in alone]
    width = max(len(r[0]) for r in results)
    for name, code, secs, last in results:
        print(f"{'PASS' if code == 0 else 'FAIL'}  {name:<{width}}  {secs:5.0f}s  {last}")
    failed = sum(1 for r in results if r[1])
    print(f"{profile}: {len(results) - failed}/{len(results)} passed in {time.time() - t0:.0f}s wall, {sum(r[2] for r in results):.0f}s of gate time")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
