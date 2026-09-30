"""Pace the film by scroll distance (D40): each run of beats plays its clips back
to back, spread over the beats' measured heights so footage moves at an even
rate. Transit windows (full-screen film, little text) weigh more, so the
picture visibly changes; reading sections weigh less, so it drifts while text is
read. Rewrites content/film-clips.json and prints seconds of footage per screen.

    python3 scripts/film-pace.py [--dry]

Needs the dev server on :3002. Edit RUNS when a clip arrives: (beats, clips),
each clip (file, start, end) as fractions of its length.
"""

import json
import os
import subprocess
import sys

import numpy as np

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CLIPS = os.path.join(ROOT, "content", "film-clips.json")
WEIGHT = {"transit": 1.4, "section": 0.7, "hero": 1.0}
RUNS = [
    # Bridges (D51) are generated between the exact exit and entry frames of the
    # clips either side, so a join that changed rooms is one camera move.
    (["hero", "T1", "work"], [("v1-now-hall", 0, 1), ("bridge-b1", 0, 1), ("hall-fabric", 0, 1), ("bridge-b2", 0, 1), ("fabric-corpus", 0, 1)]),
    (["T2", "opensource"], [("v7-tray2", 0, 1), ("bridge-b3", 0, 1)]),
    # V9 opens by backing out into the aisle, which V8 has just left; entering
    # at 30 percent lands on the rack sliding open, where V8 ends.
    (["T3"], [("v8-door", 0, 1), ("v9-board", 0.3, 1)]),
    (["research", "T4"], [("v3-prefill", 0, 1)]),
    # Two KV takes chained: the 8 s one opens on the memory tower V3 ends on
    # and ends on the slot wall; the 10 s one picks up on that wall, filling.
    (["approach", "T5", "measured", "T6"], [("v4-kv8", 0, 1), ("v4-kv10", 0.45, 1)]),
    (["running", "T7", "proof"], [("v5-ring2", 0, 1)]),
    (["T8"], [("v6-tiers2", 0, 1)]),
    # V10 (D48): generated from V6's last frame, ends in the exit aisle V11
    # opens on. V12 left the cut: the lone engineer at a wall is V2a's shot.
    (["education"], [("v10-exit", 0, 1)]),
    (["T9"], [("v11-cooling", 0, 1)]),
    # The ending keeps the team reveal whole and enters the lone shot late,
    # so the last screen does not race.
    # The retake starts on V2a's last frame; its first 2 s pull back before the
    # engineer turns to camera (faces are never shown), then the wide team shot.
    (["contact"], [("v2a-future-alone", 0.6, 1), ("v2b-retake", 0, 1), ("v2b-future-team", 0.3, 1)]),
]
# A clip after a hard beat change fades in; one continuing a chain does not.
FADE_IN = set()  # every join is a dissolve now (D43)
# Screen heights each join dissolves over: both clips on screen, both moving.
DISSOLVE_VH = 0.35


def seconds(name):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                   os.path.join(ROOT, "public", "film", "clips", f"{name}.mp4")])
    return float(out)


def newest(*dirs):
    """Latest change to the page's layout sources, leaving out the clip map this
    script writes and the film's renderer files, which never move the page."""
    return max(os.path.getmtime(os.path.join(d, f)) for top in dirs for d, _, fs in os.walk(os.path.join(ROOT, top)) for f in fs if f != "film-clips.json" and not (d.endswith(os.path.join("components", "film")) and f.endswith(".ts")))


def heights():
    """Section heights in screens, from the live page; cached until anything in
    app/ or content/ changes (a browser launch per run was most of the rest)."""
    key = os.path.join(CACHE, "heights.json")
    if "--fresh" not in sys.argv and os.path.exists(key) and os.path.getmtime(key) > newest("app", "content"):
        return json.load(open(key))
    h = measure_heights()
    os.makedirs(CACHE, exist_ok=True)
    json.dump(h, open(key, "w"))
    return h


def measure_heights():
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])
        page = b.new_page(viewport={"width": 1440, "height": 900}, color_scheme="dark")
        page.goto("http://localhost:3002/classic?film=debug")
        page.wait_for_function("document.documentElement.dataset.film === 'live'", timeout=60000)
        h = page.evaluate("""() => {
          const o = { hero: document.querySelector('body > header').getBoundingClientRect().height / innerHeight };
          document.querySelectorAll('[data-transit]').forEach(e => o[e.dataset.transit] = e.getBoundingClientRect().height / innerHeight);
          document.querySelectorAll('main > section[id]').forEach(e => o[e.id] = e.getBoundingClientRect().height / innerHeight);
          return o;
        }""")
        b.close()
    return h


def kind(beat):
    return "hero" if beat == "hero" else "transit" if beat[0] == "T" and beat[1:].isdigit() else "section"


def pace(runs, vh, dur):
    """Rows for film-clips.json: each beat's span and each clip's time window
    where they overlap on the run's weighted axis."""
    rows, report = [], []
    for beats, clips in runs:
        w = [vh[b] * WEIGHT[kind(b)] for b in beats]
        total_w = sum(w)
        secs = [dur[f] * (e - s) for f, s, e in clips]
        total_s = sum(secs)
        # Both axes normalised to 0..1 along the run.
        b_edges, c_edges = [0.0], [0.0]
        for x in w:
            b_edges.append(b_edges[-1] + x / total_w)
        for x in secs:
            c_edges.append(c_edges[-1] + x / total_s)
        for i, beat in enumerate(beats):
            b0, b1 = b_edges[i], b_edges[i + 1]
            for j, (f, s, e) in enumerate(clips):
                c0, c1 = c_edges[j], c_edges[j + 1]
                lo, hi = max(b0, c0), min(b1, c1)
                if hi - lo < 1e-4:
                    continue
                span = [round((lo - b0) / (b1 - b0), 3), round((hi - b0) / (b1 - b0), 3)]
                t = [round(s + (e - s) * (lo - c0) / (c1 - c0), 3), round(s + (e - s) * (hi - c0) / (c1 - c0), 3)]
                rows.append({"beat": beat, "file": f, "span": span, "time": t,
                             "fadeIn": f in FADE_IN and t[0] == s})
            report.append((beat, vh[beat], total_s * (b1 - b0) / vh[beat]))
    return rows, report


def dissolve(rows, vh):
    """Every change of clip becomes an overlap the engine cross-dissolves:
    inside a beat the incoming row starts DISSOLVE_VH earlier, its clock run
    back to match; across beats it pre-rolls at the end of the outgoing beat."""
    out = []
    for i, r in enumerate(rows):
        out.append(r)
        nxt = rows[i + 1] if i + 1 < len(rows) else None
        if not nxt or nxt["file"] == r["file"]:
            continue
        rate = (nxt["time"][1] - nxt["time"][0]) / max(1e-3, nxt["span"][1] - nxt["span"][0])  # clip fraction per beat fraction
        back = DISSOLVE_VH / vh[nxt["beat"]] * rate
        if nxt["beat"] == r["beat"]:
            d = DISSOLVE_VH / vh[r["beat"]]
            nxt["span"][0] = round(max(0, nxt["span"][0] - d), 3)
            nxt["time"][0] = round(max(0, nxt["time"][0] - back), 3)
        else:
            d = DISSOLVE_VH / vh[r["beat"]]
            t0 = nxt["time"][0]
            # A clip entering at its first frame plays its opening through the
            # dissolve and the next beat carries on from there, so it never
            # holds still while the outgoing one moves.
            if t0 - back < 0:
                pre, nxt["time"][0] = [t0, round(t0 + back, 3)], round(t0 + back, 3)
            else:
                pre = [round(t0 - back, 3), t0]
            out.append({"beat": r["beat"], "file": nxt["file"], "span": [round(r["span"][1] - d, 3), r["span"][1]],
                        "time": pre, "fadeIn": False})
    return out


CACHE = os.path.join(ROOT, "..", ".playwright-mcp", "film", "cache")


def small(name):
    """Every frame of a shipped clip at 64 by 36, RGB 0 to 1, cached per file
    version (decoding all clips took most of a run)."""
    src = os.path.join(ROOT, "public", "film", "clips", f"{name}.mp4")
    key = os.path.join(CACHE, f"{name}-{int(os.path.getmtime(src))}.npy")
    if os.path.exists(key):
        return np.load(key)
    raw = subprocess.check_output(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", os.path.join(ROOT, "public", "film", "clips", f"{name}.mp4"),
                                   "-vf", "scale=64:36", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
    f = np.frombuffer(raw, np.uint8).reshape(-1, 36, 64, 3).astype(np.float32) / 255
    os.makedirs(CACHE, exist_ok=True)
    np.save(key, f)
    return f


def exposure(frames):
    """Per clip gain toward the film's median brightness (D44), half strength,
    so a join never jumps in exposure but a dark shot stays darker."""
    luma = {n: float((f @ [0.2126, 0.7152, 0.0722]).mean()) for n, f in frames.items()}
    target = float(np.median(list(luma.values())))
    return {n: round(float(np.clip((target / max(l, 1e-3)) ** 0.5, 0.85, 1.2)), 3) for n, l in luma.items()}


def match_cuts(runs, frames, gain):
    """Match cut every join (D44): the outgoing clip may end up to 30 percent
    early and the incoming start up to 30 percent late, at the pair of frames
    that look most alike (exposure matched), so the dissolve blends two views
    of one move and the camera never appears to jump back. Trimming costs a
    little, so footage is kept unless the match is clearly better."""
    seq = [c for _, clips in runs for c in clips]
    for i in range(len(seq) - 1):
        (fa, sa, ea), (fb, sb, eb) = seq[i], seq[i + 1]
        if fa == fb:
            continue
        A, B = frames[fa] * gain[fa], frames[fb] * gain[fb]
        na, nb = len(A) - 1, len(B) - 1
        best = None
        for ia in range(int((ea - 0.3 * (ea - sa)) * na), int(ea * na) + 1, 2):
            for ib in range(int(sb * nb), int((sb + 0.3 * (eb - sb)) * nb) + 1, 2):
                cost = float(np.abs(A[ia] - B[ib]).mean()) + 0.08 * ((ea - ia / na) + (ib / nb - sb))
                if best is None or cost < best[0]:
                    best = (cost, ia / na, ib / nb)
        seq[i] = (fa, sa, round(best[1], 3))
        seq[i + 1] = (fb, round(best[2], 3), eb)
        print(f"match {fa} ends {best[1]:.2f} -> {fb} enters {best[2]:.2f} (difference {best[0]:.3f})")
    out, k = [], 0
    for beats, clips in runs:
        out.append((beats, seq[k:k + len(clips)]))
        k += len(clips)
    return out


def main():
    names = {f for _, clips in RUNS for f, _, _ in clips}
    dur = {n: seconds(n) for n in names}
    vh = heights()
    frames = {n: small(n) for n in names}
    gain = exposure(frames)
    runs = match_cuts(RUNS, frames, gain)
    rows, report = pace(runs, vh, dur)
    rows = dissolve(rows, vh)
    for r in rows:
        r["gain"] = gain[r["file"]]
    for beat, h, rate in report:
        print(f"{beat:12}{h:6.2f} vh  {rate:5.2f} s/vh")
    if "--dry" in sys.argv:
        return
    data = json.load(open(CLIPS))
    data["clips"] = rows
    data["note"] = "Written by scripts/film-pace.py (D40): clips spread over each run of beats by weighted scroll distance. Edit RUNS there, not this file."
    with open(CLIPS, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"{len(rows)} rows written")


if __name__ == "__main__":
    main()
