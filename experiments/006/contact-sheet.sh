#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
mkdir -p stills
names=(start occlusion reveal)
frames=(0 60 141)
labels=('START / f000' 'OCCLUSION / f060' 'REVEAL / f141')
inputs=()
filters=''
for i in 0 1 2; do
  file="stills/${names[i]}.png"
  ffmpeg -v error -y -i motion-proof.mp4 -vf "select=eq(n\\,${frames[i]})" -frames:v 1 -update 1 "$file"
  inputs+=(-i "$file")
  filters+="[${i}:v]scale=360:640,pad=376:680:8:8:color=0x141a23,drawtext=text='${labels[i]}':fontcolor=white:fontsize=18:x=12:y=651[p${i}];"
done
ffmpeg -v error -y "${inputs[@]}" -filter_complex_threads 1 \
  -filter_complex "${filters}[p0][p1][p2]hstack=inputs=3" -frames:v 1 -update 1 contact-sheet.png
