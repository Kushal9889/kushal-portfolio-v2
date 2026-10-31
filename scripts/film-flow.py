"""Optical flow between neighbouring film frames (ADR-003), so the shader can
slide both stored frames toward the in-between position instead of
cross-fading them; a cross-fade of frames 1/24 s apart doubled every edge on
a fast camera move.

    ~/.cache/film-upscale/bin/python scripts/film-flow.py [clip ...]

Per clip and tier (d, p): DIS flow from frame i to i+1 at quarter size,
averaged down to a 64x36 grid (36x64 on the upright phone set), packed 8 pairs
to a row into one PNG atlas at public/film/flow/<tier>/<clip>.png. R and G hold
x and y in frame widths and heights, 128 = still, 1 step = 1/1024, so the
range is +-1/8 of the frame per step. The 4K tier reuses the d atlas: the
units do not depend on resolution.
"""

import os
import sys
from concurrent.futures import ProcessPoolExecutor

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES = os.path.join(HERE, "..", "public", "film", "frames")
OUT = os.path.join(HERE, "..", "public", "film", "flow")
COLS = 8


def build(job):
    tier, clip = job
    src = os.path.join(FRAMES, tier, clip)
    names = sorted(os.listdir(src))
    gw, gh = (64, 36) if tier == "d" else (36, 64)
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    prev = None
    cells = []
    for n in names:
        img = cv2.imread(os.path.join(src, n), cv2.IMREAD_GRAYSCALE)
        h, w = img.shape
        small = cv2.resize(img, (w // 4, h // 4), interpolation=cv2.INTER_AREA)
        if prev is not None:
            f = dis.calc(prev, small, None)
            f[..., 0] /= small.shape[1]
            f[..., 1] /= small.shape[0]
            g = cv2.resize(f, (gw, gh), interpolation=cv2.INTER_AREA)
            q = np.clip(np.round(128 + g * 1024), 0, 255).astype(np.uint8)
            cells.append(np.dstack([q[..., 0], q[..., 1], np.zeros_like(q[..., 0])]))
        prev = small
    rows = (len(cells) + COLS - 1) // COLS
    atlas = np.full((rows * gh, COLS * gw, 3), 128, np.uint8)
    atlas[..., 2] = 0
    for k, c in enumerate(cells):
        r, col = divmod(k, COLS)
        atlas[r * gh:(r + 1) * gh, col * gw:(col + 1) * gw] = c
    os.makedirs(os.path.join(OUT, tier), exist_ok=True)
    # OpenCV writes BGR: put x in R and y in G.
    cv2.imwrite(os.path.join(OUT, tier, f"{clip}.png"), atlas[..., ::-1], [cv2.IMWRITE_PNG_COMPRESSION, 9])
    return tier, clip, len(cells)


def main():
    clips = sys.argv[1:] or sorted(os.listdir(os.path.join(FRAMES, "d")))
    jobs = [(t, c) for c in clips for t in ("d", "p")]
    with ProcessPoolExecutor(4) as pool:
        for tier, clip, n in pool.map(build, jobs):
            print(f"{tier}/{clip}: {n} pairs", flush=True)


if __name__ == "__main__":
    main()
