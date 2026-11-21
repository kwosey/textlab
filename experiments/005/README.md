# Experiment 005 · Motion Playground · Gate A

Пакет для [Issue #26](https://github.com/kwosey/textlab/issues/26) на основе [методологии Experiment 004](../004/production-playbook.md). Для первого просмотра откройте [контактный лист](contact-sheet.png) и [четырёхсекундный MP4](motion-proof.mp4).

Изолированный Remotion 4.0.545, React, локальный Chromium и FFmpeg с фильтрами drawtext/xstack. Исходники в [src](src/). Команды из папки эксперимента:

```sh
cd experiments/005
npm ci
CHROMIUM_PATH=/usr/bin/chromium npm run stills
bash contact-sheet.sh
CHROMIUM_PATH=/usr/bin/chromium npm run motion
ffprobe -v error -count_frames -show_streams motion-proof.mp4
ffmpeg -v error -xerror -i motion-proof.mp4 -f null -
```

`npm run gate:a` выполняет оба прохода Remotion в одном бандле. Лист собирается отдельно из девяти PNG. Все зарегистрированные композиции имеют 540 × 960. Единственная движущаяся композиция — `MotionProof`, 120 кадров при 30 fps.

[Арт-библии и отбор](directions.md) · [Ревью](review.md) · [Журнал](pipeline-log.md)
