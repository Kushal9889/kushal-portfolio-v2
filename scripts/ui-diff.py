"""Picture diff between the two newest screenshot folders (R6). Report only.

    python3 scripts/ui-diff.py

Compares docs/shots/<build>/ folders by modification time. For every
<name>-<width>.jpg present in both, a 64-bit difference hash (grayscale, 9x8,
bit = left pixel brighter than its right neighbour) is taken; a Hamming
distance above 10 counts as changed. Writes docs/ui-diff.json. Never exits 1:
a change is usually the intent of the build, so a person decides.
"""

import json
import os
import sys

from PIL import Image

V2 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SHOTS = os.path.join(V2, "docs", "shots")
LIMIT = 10


def dhash(path):
    px = list(Image.open(path).convert("L").resize((9, 8), Image.LANCZOS).tobytes())
    bits = 0
    for y in range(8):
        for x in range(8):
            bits = (bits << 1) | (px[y * 9 + x] > px[y * 9 + x + 1])
    return bits


def main():
    dirs = sorted(
        (d for d in os.listdir(SHOTS) if os.path.isdir(os.path.join(SHOTS, d))),
        key=lambda d: os.path.getmtime(os.path.join(SHOTS, d)),
    )
    if len(dirs) < 2:
        print("need two screenshot folders in docs/shots")
        return
    old, new = dirs[-2], dirs[-1]
    names = sorted(
        f for f in os.listdir(os.path.join(SHOTS, new))
        if f.endswith(".jpg") and not f.startswith("sheet-") and os.path.exists(os.path.join(SHOTS, old, f))
    )
    dist = {f[:-4]: bin(dhash(os.path.join(SHOTS, old, f)) ^ dhash(os.path.join(SHOTS, new, f))).count("1") for f in names}
    changed = [n for n, d in dist.items() if d > LIMIT]
    print("changed: " + (", ".join(f"{n} ({dist[n]})" for n in changed) or "none"))
    print(f"unchanged: {len(dist) - len(changed)}")
    with open(os.path.join(V2, "docs", "ui-diff.json"), "w") as f:
        json.dump({"old": old, "new": new, "limit": LIMIT, "distance": dist, "changed": changed}, f, indent=1)


if __name__ == "__main__":
    sys.exit(main())
