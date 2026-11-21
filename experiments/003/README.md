# Experiment 003 · Gate A

Изолированный проект Remotion для [Issue #24](https://github.com/kwosey/textlab/issues/24). Вход — исходный [JSON Experiment 002](../002/composition.json). Используйте Node.js и установленный Chromium.

```sh
cd experiments/003
npm ci
npm test
CHROMIUM_PATH=/usr/bin/chromium npm run gate:a
ffprobe -v error -count_frames -show_streams gate-a/preview.mp4
ffmpeg -v error -xerror -i gate-a/preview.mp4 -f null -
```

`gate:a` собирает Remotion-бандл, считывает метаданные композиции и пишет только три PNG и один отрывок 540 × 960 в `gate-a/`. Отрывок использует кадры 153–374 включительно. См. [результаты просмотра и границы адаптера](review.md).

Использованы стандартные `bundle`, `selectComposition`, `renderStill` и `renderMedia` из Remotion 4.0.545. React и Remotion установлены только в этом подпроекте. [Документация Renderer в репозитории Remotion](https://github.com/remotion-dev/remotion/tree/main/packages/docs/docs/renderer)
