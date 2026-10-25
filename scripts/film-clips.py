"""Encode a source clip for the film: 1920 by 1080, a keyframe every 8 frames
at CRF 27, so scrolling seeks to any frame fast while the page stays light
(D39).

    python3 scripts/film-clips.py <video.mp4> <name> --interp [--start 0] [--seconds 10]

--interp motion-interpolates to 60 fps (D41), so a slow scroll never steps
between frames; every shipped clip uses it. The finish is a lanczos scale,
a little contrast, shadows pulled toward the page ground and fine grain.
Writes public/film/clips/<name>.mp4 and prints its size.
"""

import argparse
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "film", "clips")
SCALE = "scale={w}:{h}:flags=lanczos"
# Interpolated at the output size (4x faster than at 4K), before the grain, so
# the grain stays per-frame instead of being smeared by motion estimation.
MOTION = "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
GRADE = "eq=contrast=1.06:brightness=-0.012:saturation=0.98,noise=alls=2:allf=t,format=yuv420p"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("name")
    ap.add_argument("--start", type=float, default=0)
    ap.add_argument("--seconds", type=float, default=10)
    ap.add_argument("--interp", action="store_true", help="motion-interpolate to 60 fps (D41); every shipped clip is 60 fps")
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--crf", type=int, default=21)
    ap.add_argument("--keyint", type=int, default=4, help="frames per keyframe; small values keep scroll seeks instant")
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    dst = os.path.join(a.out, f"{a.name}.mp4")
    vf = ",".join([SCALE.format(w=a.height * 16 // 9, h=a.height)] + ([MOTION] if a.interp else []) + [GRADE])
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-ss", str(a.start), "-t", str(a.seconds), "-i", a.video,
         "-an", "-vf", vf,
         "-r", "60" if a.interp else "24", "-c:v", "libx264", "-preset", "slow", "-crf", str(a.crf),
         "-x264-params", f"keyint={a.keyint}:min-keyint={a.keyint}:scenecut=0", "-movflags", "+faststart", dst],
        check=True,
    )
    print(f"{a.name}: {os.path.getsize(dst) // 1024} KB")


if __name__ == "__main__":
    main()
