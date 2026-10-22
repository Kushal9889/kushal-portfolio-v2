#!/bin/sh
# Phone sets of the film clips, built from the 1080p60 masters in parallel.
#
#   sh scripts/film-phone-tiers.sh [clip names...]     default: every clip
#
#   m/  landscape 960x540, 30 fps: a phone held sideways.
#   p/  the middle 608x1080 of the master at 540x960, 30 fps: a phone held
#       upright only ever shows the middle of a 16:9 frame, so this set spends
#       its pixels there (twice the detail of m/ where the phone looks).
#
# Both use a keyframe every 4 frames so a scroll-scrub seek lands fast, and
# aq-mode 3 so dark gradients are not starved of bits (they blocked at CRF 29).
# One ffmpeg per clip and set, as many at once as the machine has cores; x264's
# own threads barely fill the cores at these small frame sizes.
set -e
cd "$(dirname "$0")/../public/film/clips"
mkdir -p m p
names=${*:-$(ls *.mp4 | sed 's/\.mp4$//')}
X264="aq-mode=3:keyint=4:min-keyint=1"
for n in $names; do
  echo "$n m scale=960:540:flags=lanczos,fps=30"
  echo "$n p crop=608:1080:(iw-608)/2:0,scale=540:960:flags=lanczos,fps=30"
done | xargs -P "$(sysctl -n hw.ncpu 2>/dev/null || nproc)" -L 1 sh -c '
  ffmpeg -v error -y -i "$0.mp4" -vf "$2" -c:v libx264 -preset slow -crf 26 -x264-params '"$X264"' -pix_fmt yuv420p -an -movflags +faststart "$1/$0.mp4" && echo "done $1/$0"'
du -sh m p
