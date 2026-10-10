#!/bin/sh
# ADR-002 option B (Kushal approved 2026-10-03): new delivery tiers built beside
# the originals, which are never touched.
#
#   sh scripts/film-recode.sh [clip names...]     default: every clip
#
#   d/   desktop: the 1080p60 master re-encoded at CRF 23, same GOP 4 and
#        2 B-frames so a scrub seek costs the same (e1-call: -15.5%, SSIM 0.993).
#   p2/  upright phone: the p/ crop (middle 608x1080 at 540x960, 30 fps) at
#        CRF 22 instead of 26, which blocked in dark gradients at 2x density.
#
# Each d/ clip is kept only if SSIM against its master is >= 0.98 and it is
# smaller; the script prints keep/drop per clip.
set -e
cd "$(dirname "$0")/../public/film/clips"
mkdir -p d p2
names=${*:-$(ls *.mp4 | sed 's/\.mp4$//')}
X264="aq-mode=3:keyint=4:min-keyint=1"
jobs=$(( $(sysctl -n hw.ncpu 2>/dev/null || nproc) / 2 ))
for n in $names; do
  echo "$n d null crf=23"
  echo "$n p2 crop=608:1080:(iw-608)/2:0,scale=540:960:flags=lanczos,fps=30 crf=22"
done | xargs -P "$jobs" -L 1 sh -c '
  vf=$2; [ "$vf" = null ] && vf="null"
  crf=${3#crf=}; crf=${crf%%:*}
  ffmpeg -v error -y -i "$0.mp4" -vf "$vf" -c:v libx264 -preset slow -crf "$crf" -bf 2 -x264-params '"$X264"' -pix_fmt yuv420p -an -movflags +faststart "$1/$0.mp4" && echo "done $1/$0"'
# Keep a d/ clip only when it is both close enough and smaller.
for n in $names; do
  s=$(ffmpeg -i "d/$n.mp4" -i "$n.mp4" -lavfi ssim -f null - 2>&1 | grep -o 'All:[0-9.]*' | cut -d: -f2)
  a=$(stat -f %z "$n.mp4"); b=$(stat -f %z "d/$n.mp4")
  if awk -v s="$s" -v a="$a" -v b="$b" 'BEGIN{exit !(s>=0.98 && b<a)}'; then echo "keep d/$n $s $a $b"; else rm "d/$n.mp4"; echo "drop d/$n $s $a $b"; fi
done
du -sh . d p p2 2>/dev/null
