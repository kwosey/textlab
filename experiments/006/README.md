# Experiment 006 · «Просвет» · Gate A

Пять секунд непрерывного проезда камеры из-за стены. [Видео](motion-proof.mp4) · [Контактный лист](contact-sheet.png) · [Замысел и таймлайн](motion-intent.md) · [Ревью](review.md) · [Затраты](pipeline-log.md).

Воспроизведение с Node.js, установленным Chromium и FFmpeg с фильтрами drawtext/hstack.

```sh
cd experiments/006
npm ci
npm test
CHROMIUM_PATH=/usr/bin/chromium npm run gate:a
bash contact-sheet.sh
ffprobe -v error -count_frames -show_streams motion-proof.mp4
ffmpeg -v error -xerror -i motion-proof.mp4 -f null -
```

Remotion 4.0.545 рисует кадр из одной камеры и неподвижных SVG-плоскостей. `gate:a` ограничен композицией 540 × 960, 30 fps, 150 кадров. Три PNG и лист извлекаются из готового MP4. [Исходники](src/)
