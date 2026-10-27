"""One benchmark for the film, diffable run to run (docs/bench/<iso>.json).

    python3 scripts/bench-film.py [--repeats 5]        (npm run bench:film)

Runs film-lag (desk-slow, desk-fast, phone) N times, film-link once and
film-contrast at 1440 and 390 and the axe-core name gate (ui-axe.py), against the build on :3002. Each lag metric is
reported as mean, stdev and coefficient of variation, so a noisy machine shows
up as a noisy number instead of a fake regression.

The gate compares with the previous bench file. A metric regresses only when
all three hold: it got worse, Welch's t-test says the difference is real
(p < 0.05), and the change crosses its budget. A single noisy run therefore
cannot fail the gate, and a real slowdown cannot hide inside the noise. The
absolute gates fail on their own: contrast under the bar its run is held to
(7:1 body copy, 4.5:1 large type and labels), film-link failing, or
any scenario dropping more than 0.5 percent of frames on average.
Exit 1 on any failure.
"""

import argparse
import datetime
import glob
import json
import os
import re
import statistics
import subprocess
import sys

from scipy import stats

HERE = os.path.dirname(os.path.abspath(__file__))
V2 = os.path.join(HERE, "..")
OUT = os.path.join(V2, "docs", "bench")
LAG_JSON = os.path.join(V2, "docs", "lag-report.json")
SCENARIOS = ["desk-slow", "desk-fast", "phone"]
# metric: (budget for a significant increase, absolute ceiling or None)
BUDGET = {"dropped_pct": (0.25, 0.5), "held_pct": (5.0, None), "worst_freeze_ms": (200.0, None)}
ALPHA = 0.05


def run(cmd):
    result = subprocess.run(cmd, cwd=V2, capture_output=True, text=True, timeout=600)
    if result.returncode:
        raise RuntimeError(f"Gate failed ({result.returncode}): {cmd}\n{result.stdout}\n{result.stderr}")
    return result


def summary(xs):
    mean = statistics.fmean(xs)
    sd = statistics.stdev(xs) if len(xs) > 1 else 0.0
    return {"runs": xs, "mean": round(mean, 3), "stdev": round(sd, 3), "cv": round(sd / mean, 3) if mean else 0.0}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repeats", type=int, default=5)
    a = ap.parse_args()
    if a.repeats < 2:
        ap.error("--repeats must be at least 2")
    load = os.getloadavg()[0]
    samples = {s: {m: [] for m in BUDGET} for s in SCENARIOS}
    for i in range(a.repeats):
        if os.path.exists(LAG_JSON):
            os.unlink(LAG_JSON)
        r = run([sys.executable, "scripts/film-lag.py", "--only", ",".join(SCENARIOS)])
        rep = json.load(open(LAG_JSON))
        for s in SCENARIOS:
            for m in BUDGET:
                samples[s][m].append(rep[s][m])
        print(f"repeat {i + 1}/{a.repeats}: " + "  ".join(f"{s} {rep[s]['dropped_pct']}%" for s in SCENARIOS), flush=True)
    link = run([sys.executable, "scripts/film-link.py"])
    contrast = run([sys.executable, "scripts/film-contrast.py", "--width", "1440", "390"])
    axe = run([sys.executable, "scripts/ui-axe.py", "--force"])
    motion = run([sys.executable, "scripts/ui-motion.py", "--force"])
    # Each width's worst run is printed with the bar that run is held to (7:1 for
    # body copy, 4.5:1 for large type and labels), so the gate reads both.
    found = re.findall(r"== (\d+)px: .*?worst ([\d.]+):1 \(needs ([\d.]+)\)", contrast.stdout)
    worst = {w: float(r) for w, r, _ in found}
    need = {w: float(n) for w, _, n in found}
    result = {
        "at": datetime.datetime.now().isoformat(timespec="seconds"),
        "load1": round(load, 2),
        "repeats": a.repeats,
        "lag": {s: {m: summary(v) for m, v in samples[s].items()} for s in SCENARIOS},
        "link_pass": link.stdout.strip().endswith("PASS"),
        "contrast_worst": worst,
        "axe_pass": "PASS" in axe.stdout.splitlines()[-1:] or any(l.startswith("PASS") for l in axe.stdout.splitlines()),
    }

    fails = []
    for s in SCENARIOS:
        if result["lag"][s]["dropped_pct"]["mean"] > BUDGET["dropped_pct"][1]:
            fails.append(f"{s} drops {result['lag'][s]['dropped_pct']['mean']}% on average (budget 0.5%)")
    if not result["link_pass"]:
        fails.append("film-link failed (slow-link handover or backoff): " + " | ".join((link.stdout + link.stderr).strip().splitlines()[-4:])[:400])
    for w, ratio in worst.items():
        if ratio < need[w]:
            fails.append(f"contrast {ratio}:1 at {w}px (needs {need[w]}:1)")
    if len(worst) < 2:
        fails.append("film-contrast did not report both widths")
    if not result["axe_pass"]:
        fails.append("axe names/contrast: " + (next((l.strip() for l in axe.stdout.splitlines()[::-1] if l.strip().startswith("w")), "see docs/ui-axe.json")))
    # Layout-shift budget (R5): only [shift] and [layout] fail the bench. [frames]
    # is the open longest-frame row (U14) and [idle] is reported by ui-motion.py.
    motion_fails = [f for f in json.load(open("docs/ui-motion.json")).get("fails", []) if "[shift]" in f or "[layout]" in f]
    result["motion_fails"] = motion_fails
    fails.extend("motion: " + f for f in motion_fails)

    prev = sorted(glob.glob(os.path.join(OUT, "*.json")))
    compared = []
    if prev:
        old = json.load(open(prev[-1]))
        for s in SCENARIOS:
            for m, (step, _) in BUDGET.items():
                a1, b1 = old["lag"][s][m]["runs"], samples[s][m]
                if len(a1) < 2 or len(b1) < 2:
                    continue
                delta = statistics.fmean(b1) - statistics.fmean(a1)
                # Identical samples have no variance: no evidence of change.
                p = 1.0 if statistics.pstdev(a1 + b1) == 0 else float(stats.ttest_ind(b1, a1, equal_var=False).pvalue)
                compared.append(f"{s}.{m}: {statistics.fmean(a1):.2f} -> {statistics.fmean(b1):.2f} (p={p:.3f})")
                if delta > step and p < ALPHA:
                    fails.append(f"{s} {m} regressed {delta:+.2f} (budget {step}, p={p:.3f})")
        result["compared_to"] = os.path.basename(prev[-1])
    result["fails"] = fails

    os.makedirs(OUT, exist_ok=True)
    name = os.path.join(OUT, result["at"].replace(":", "") + ".json")
    json.dump(result, open(name, "w"), indent=1)
    noisy = [f"{s}.{m}" for s in SCENARIOS for m in BUDGET if result["lag"][s][m]["cv"] > 0.5 and result["lag"][s][m]["mean"] > 1]
    print(f"\nbench {os.path.relpath(name, V2)}  load {load:.1f}" + (f"  noisy: {', '.join(noisy)}" if noisy else ""))
    for s in SCENARIOS:
        L = result["lag"][s]
        print(f"  {s:<10} dropped {L['dropped_pct']['mean']:.2f}% (cv {L['dropped_pct']['cv']})  held {L['held_pct']['mean']:.1f}%  freeze {L['worst_freeze_ms']['mean']:.0f} ms")
    print(f"  link {'PASS' if result['link_pass'] else 'FAIL'}  contrast {worst}  axe {'PASS' if result['axe_pass'] else 'FAIL'}")
    for c in compared:
        print("  vs prev", c)
    print("FAIL\n  " + "\n  ".join(fails) if fails else "PASS")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
