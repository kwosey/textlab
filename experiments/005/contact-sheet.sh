#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
names=(type aperture depth)
labels=('TYPE' 'APERTURE' 'DEPTH')
states=('SETUP' 'TURN' 'RESOLVE')
inputs=()
filters=''
stack=''
n=0
for row in 0 1 2; do
  for col in 0 1 2; do
    inputs+=(-i "stills/${names[row]}-$((col+1)).png")
    caption="${labels[row]} 0$((col+1)) / ${states[col]}"
    filters+="[${n}:v]scale=270:480,pad=286:520:8:8:color=0x161c25,drawtext=text='${caption}':fontcolor=white:fontsize=15:x=13:y=495[p${n}];"
    stack+="[p${n}]"
    n=$((n+1))
  done
done
ffmpeg -v error -y "${inputs[@]}" -filter_complex_threads 1 \
  -filter_complex "${filters}${stack}xstack=inputs=9:grid=3x3" -frames:v 1 -update 1 contact-sheet.png
