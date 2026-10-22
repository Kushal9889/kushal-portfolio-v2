"""Build the film's image sequences (ADR-003): one WebP per frame, painted on
the canvas by scroll, the Apple product-page technique.

    python3 scripts/film-frames.py [clip ...] [--remap]

Per clip: the sharpest source (the Real-ESRGAN 4K master for a 720p clip,
the 1080p source otherwise), the same start, direction and corner-mark crop
the old MP4 masters used (recovered by frame correlation, 2026-10-07), trimmed
to the span content/film-clips.json actually scrolls through, 24 fps; phones get every second frame.
Writes public/film/frames/d/<clip>/0001.webp (desktop 1920x1080) and
public/film/frames/p/<clip>/0001.webp (phone: the upright middle, 1080x1920
from 4K, 720x1280 from 1080p).
--remap rewrites the rows' time fractions for the trimmed spans; run it once,
after every clip is built, because it reads the old MP4 durations.
"""

import argparse
import glob
import json
import os
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
V2 = os.path.join(HERE, "..")
ROOT = os.path.join(V2, "..")
SRC = os.path.join(ROOT, "film-sources", "in-use")
K4 = [os.path.join(ROOT, ".playwright-mcp", "film", "clips", d) for d in ("4k2", "4k")]
OUT = os.path.join(V2, "public", "film", "frames")
CLIPS = os.path.join(V2, "content", "film-clips.json")
FPS = 24
# The old masters' cut of each source: start second, played reversed, corner
# mark cropped (x 4-96 percent, y 3-95 percent). Everything else starts at 0,
# forward, uncropped.
START = {"hall-fabric": 1.0}
REVERSE = {"o1-wake", "gap-g6", "gap-g2"}
# A second crop where a source carries a mark the standard crop misses
# (gap-g4: the mark sits at 92 by 87 percent of the cropped frame).
# Taken from the 4K master, so the 1080p frames lose no detail.
EXTRA = {"gap-g4": "crop=iw*0.86:ih*0.86:iw*0.02:0"}
CROP = {"gap-g4", "bridge-b2", "gap-g1", "gap-g5", "v7-tray2", "bridge-b3", "gap-g7", "v5-ring2", "v10-exit", "gap-g3", "w1-work-racks", "gap-g6", "gap-g2"}
# The 1280x720 sources, each with a verified 4K upscale of the same take.
UPSCALED = {"o1-wake", "gap-g4", "hall-fabric", "bridge-b2", "gap-g1", "fabric-corpus", "gap-g5", "bridge-b3", "gap-g6", "gap-g7",
            "gap-g2", "v5-ring2", "v10-exit", "gap-g3", "e1-call", "e2-campus", "ed1-campus-river"}
GRADE = "eq=contrast=1.06:brightness=-0.012:saturation=0.98"
# Only real frames are stored: 24 fps, the source rate. The engine blends the
# two frames either side of the scroll position on the GPU every display
# refresh, so the picture moves at 60, 90 or 120 Hz with no synthetic frame
# (motion interpolation to 60 fps at 4K ran at 3 frames a minute here).
# Temporal-only denoise: upscaler shimmer 1.19 to 1.08 of the source's
# frame-to-frame change, sharpness unchanged (gap-g4, 2026-10-07).
MOTION = "hqdn3d=0:0:4:4"


def dur(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True).stdout)


def source(name):
    # 4K only for the 720p sources; some older 4K files in those folders were
    # upscaled from earlier takes and no longer match the source in use.
    if name in UPSCALED:
        for d in K4:
            p = os.path.join(d, f"{name}.mp4")
            if os.path.exists(p):
                return p
        raise SystemExit(f"{name}: 4K master missing, run film-upscale.py first")
    return next(p for p in glob.glob(os.path.join(SRC, "*.mp4")) if os.path.basename(p)[3:-4].replace("-plays-reversed", "") == name)


def spans():
    """Used span per clip in old-master seconds, plus the old master length."""
    out = {}
    for r in json.load(open(CLIPS))["clips"]:
        # time0: the row's fractions of the old MP4, kept so a rebuild or a
        # second --remap never trims against already-remapped fractions.
        a, b = r.get("time0", r.get("time", [0, 1]))
        s = out.setdefault(r["file"], [1.0, 0.0])
        s[0], s[1] = min(s[0], a), max(s[1], b)
    res = {}
    for f, (a, b) in out.items():
        d = dur(os.path.join(V2, "public", "film", "clips", f"{f}.mp4")) - 0.05
        res[f] = (a * d, b * d, d)
    return res


def build(name, span, k4=False):
    a, b, _ = span
    src = source(name)
    pad = 1 / FPS
    a0, b0 = max(0.0, a - pad), b + pad
    # Cut, direction and trim at source resolution; then each output is scaled
    # straight from the source (the phone's upright middle comes from the 4K
    # frame, not from an enlarged 1080p crop) and interpolated at its own size.
    start = START.get(name, 0)
    length = min(dur(src) - start, span[2] + 0.1)
    if name in REVERSE:
        # Old master time t was input time (length - one frame - t). Cut that
        # span first and reverse only it: reversing the whole input buffered
        # every decoded 4K frame (2 to 3 GB a clip).
        last = length - 1 / 24
        cut = [f"trim=start={max(0.0, last - b0):.4f}:end={last - a0 + 1 / 24:.4f}", "setpts=PTS-STARTPTS", "reverse"]
    else:
        cut = [f"trim=start={a0:.4f}:end={b0:.4f}"]
    chain = (["crop=iw*0.92:ih*0.92:iw*0.04:ih*0.03"] if name in CROP else []) + ([EXTRA[name]] if name in EXTRA else []) + cut + ["setpts=PTS-STARTPTS", "split=2[d0][p0]"]
    # Desktop frames are 1920x1080 even from a 4K master: at 3840x2160 the
    # film was 4.6 MB per second of footage and the picture stalled at scroll
    # speed (pic 0 to 2 fps, 2026-10-07). The 4K master still pays: a 1080p
    # frame downscaled from it is twice as sharp as one from the 720p source.
    dw, dh, pw, ph = (1920, 1080, 1080, 1920) if name in UPSCALED else (1920, 1080, 720, 1280)
    graph = (",".join(chain) + f";[d0]scale={dw}:{dh}:flags=lanczos,{MOTION},{GRADE}[d]"
             f";[p0]crop=ih*9/16:ih,scale={pw}:{ph}:flags=lanczos,{MOTION},select='not(mod(n\\,2))',setpts=N/{FPS // 2}/TB,{GRADE}[pp]")
    if k4:
        # The 4K desktop tier (d4/): only the d branch, at 3840x2160. The
        # engine starts here on large screens and drops to d/ when a clip
        # cannot buffer in time.
        graph = ",".join(chain) + f";[d0]scale=3840:2160:flags=lanczos,{MOTION},{GRADE}[d];[p0]nullsink"
    dirs = {k: os.path.join(OUT, k, name) for k in (("d4",) if k4 else ("d", "p"))}
    for d in dirs.values():
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)
    # The cut reads the old master's first seconds (start + its length) so the
    # reverse sees the same frames the master did. Two decoder threads: the
    # single-threaded WebP encoders are the bottleneck, not the decode.
    cmd = ["ffmpeg", "-v", "error", "-y", "-threads", "2", "-ss", str(start), "-t", f"{length:.3f}", "-i", src, "-filter_complex", graph,
           "-map", "[d]", "-fps_mode", "passthrough", "-c:v", "libwebp", "-quality", "82", "-compression_level", "4", os.path.join(dirs["d4" if k4 else "d"], "%04d.webp")]
    if not k4:
        cmd += ["-map", "[pp]", "-fps_mode", "passthrough", "-c:v", "libwebp", "-quality", "80", "-compression_level", "4", os.path.join(dirs["p"], "%04d.webp")]
    subprocess.run(cmd, check=True)
    out = dirs["d4" if k4 else "d"]
    n = len(os.listdir(out))
    kb = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out)) // 1024
    print(f"{name}: {n} frames, desktop {kb} KB, from {os.path.relpath(src, ROOT)}", flush=True)
    return a0, n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clips", nargs="*")
    ap.add_argument("--remap", action="store_true")
    ap.add_argument("--k4", action="store_true", help="build the 4K desktop tier d4/ for the upscaled clips")
    a = ap.parse_args()
    sp = spans()
    if a.remap:
        # time fraction t of the old master -> fraction of the new sequence,
        # which starts a0 seconds in and holds n frames (engine: index = t * (n - 1)).
        data = json.load(open(CLIPS))
        for r in data["clips"]:
            f = r["file"]
            a0 = max(0.0, sp[f][0] - 1 / FPS)
            n = len(os.listdir(os.path.join(OUT, "d", f)))
            r["time0"] = t0 = r.get("time0", r.get("time", [0, 1]))
            r["time"] = [round(min(1, max(0, (t * sp[f][2] - a0) * FPS / (n - 1))), 4) for t in t0]
        json.dump(data, open(CLIPS, "w"), indent=2)
        open(CLIPS, "a").write("\n")
        # The engine needs each sequence's frame count without a request.
        counts = {k: {f: len(os.listdir(os.path.join(OUT, k, f))) for f in sp} for k in ("d", "p")}
        # Desktop frame width per clip, so the engine decodes to screen size
        # without probing a frame first.
        counts["w"] = {f: 3840 if os.path.isdir(os.path.join(OUT, "d4", f)) else 1920 for f in sp}
        json.dump(counts, open(os.path.join(V2, "content", "film-frames.json"), "w"), indent=2, sort_keys=True)
        print("remapped", len(data["clips"]), "rows")
        return
    # One ffmpeg per clip: libwebp encodes on one thread, so the cores are
    # filled by clips. 4K clips hold far more frames in flight (the split waits
    # on the slow 4K branch), so fewer of them run at once. Do not run
    # film-upscale.py at the same time; together they exhausted 24 GB.
    from concurrent.futures import ThreadPoolExecutor
    names = a.clips or sorted(sp)
    if a.k4:
        with ThreadPoolExecutor(3) as pool:
            list(pool.map(lambda n: build(n, sp[n], True), [n for n in names if n in UPSCALED]))
        return
    for group, workers in (([n for n in names if n not in UPSCALED], 6), ([n for n in names if n in UPSCALED], 3)):
        with ThreadPoolExecutor(workers) as pool:
            list(pool.map(lambda n: build(n, sp[n]), group))


if __name__ == "__main__":
    main()
