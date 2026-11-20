# Text Lab

Text Lab is a visual reading playground. Arrange a passage into beats, direct the reader’s attention with emphasis and motion, and preview the composition on a 9:16 canvas. Three original compositions open directly in the editor.

## Run locally

Use Node.js 22.12+ or Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Run `npm run build` to type-check and generate the static site in `dist/`. For hosting on Vercel, use the Vite preset and the `dist` output directory. The app needs no backend, credentials, or external font requests.

## Work with a composition

- Paste text into the selected beat. The separate Original text field preserves the source passage. Move, delete, add, or split beats at the text cursor.
- Select text and apply Strong, Subtle, or Anchor. For Persist, mark the same passage as Anchor in adjacent beats and explicitly pair the ranges in Timing.
- Switch between Reading, Focus, Reveal, and Transform. Use the font, palette, spacing, and motion controls to adjust the composition. Mutate varies alignment, size, and motion intensity on the selected beat. Use Undo to return to an earlier version.
- Play, pause, restart, loop, or scrub. The previous and next controls jump to beat boundaries. The canvas shrinks oversized type to fit and warns when even the minimum size overflows.
- Keep saves an independent browser-local snapshot. The working draft autosaves separately. Use Export for portable JSON or a 1080 × 1920 PNG of the current frame.

## Video export

A future exporter can sample the current Canvas renderer at fixed timestamps such as `frameIndex / 30` and feed the resulting frames to WebCodecs with a container muxer, or to a local FFmpeg workflow. Use the same font files and renderer for the entire export to avoid platform-dependent text layout. This release exports PNG and JSON.

See [Architecture](ARCHITECTURE.md), [Data contracts](DATA_CONTRACTS.md), [Testing](TESTING.md), and [Decisions](DECISIONS.md).
