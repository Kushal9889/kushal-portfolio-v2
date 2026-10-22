"""Ripped-frame scan (D44): decodes every shipped clip small and flags frames
that disagree with both neighbours (far from their average while the
neighbours agree), which is what a torn interpolated frame or a glitch looks
like; smooth motion and cuts inside the footage do not trip it.

    python3 scripts/film-rips.py [names...]
"""

import glob
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CLIPS = os.path.join(HERE, "..", "public", "film", "clips")
W, H = 160, 90


def frames(path):
    raw = subprocess.check_output(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", path, "-vf", f"scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "gray", "-"])
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)


def scan(path):
    f = frames(path)
    out = []
    for n in range(1, len(f) - 1):
        mid = (f[n - 1] + f[n + 1]) / 2
        odd = np.abs(f[n] - mid).mean()          # how far this frame is from its neighbours' average
        base = np.abs(f[n + 1] - f[n - 1]).mean() / 2 + 0.5  # how much the neighbours themselves differ
        if odd > 3 and odd > 1.6 * base:
            out.append((n, round(float(odd), 1), round(float(base), 1)))
    return len(f), out


def main():
    names = sys.argv[1:] or sorted(os.path.basename(p)[:-4] for p in glob.glob(os.path.join(CLIPS, "*.mp4")))
    total = 0
    for name in names:
        n, bad = scan(os.path.join(CLIPS, f"{name}.mp4"))
        total += len(bad)
        print(f"{name:18s} {n:4d} frames, {len(bad):3d} rips" + (": " + " ".join(f"{i}({o}/{b})" for i, o, b in bad[:12]) if bad else ""))
    print(f"{total} ripped frames")


if __name__ == "__main__":
    main()
