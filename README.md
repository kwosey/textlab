# Text Lab

Text Lab is a visual reading playground. Arrange a passage into beats, direct the reader’s attention with emphasis and motion, and preview the composition on a 9:16 canvas. Five demos open directly in the editor, including the 24.7-second [Visual Scenes meta demo](examples/visual-scenes-meta-demo.json).

## Run locally

Use Node.js 22.12+ or Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Run `npm run build` to type-check and generate the static site in `dist/`. For hosting on Vercel, use the Vite preset and the `dist` output directory. The app needs no backend, credentials, or external font requests.

## Beat Lab and Compose

- In Beat Lab, paste text into the selected beat. The separate Original text field preserves the source passage. Move, delete, add, or split beats at the text cursor.
- Use **Style words** to tap a word or select two endpoints with Phrase. Apply a theme color, weight, italic, or Marker and inspect it live. Roles still work independently of appearance. Under Persist, confirm a suggested match or pick the same passage directly in both Beats.
- In Reveal, choose **Set seconds** to finish lettering by an explicit time and show the derived Hold. Beat Lab plays explicit Reveal at real speed. Click **Transition** once to loop the end of the current Beat and the start of the next. [Timing example](examples/reading-rhythm.json) · [Mixed-style Persist example](examples/persist-gaze.json)
- The wide Live Preview loops the selected Beat, or the outgoing and incoming beats in Transition mode. Selecting Scatter, Echo, or Wave restarts the loop. Intensity redraws the current frame while you drag. Mutate varies alignment, type size, and motion intensity.
- In Beat Lab, open **Scene** to pick a background, add up to three shapes behind the text, or direct the whole text block with Punch, Slide, or Oversized. The same Scene accompanies the Beat into Compose and PNG. Use **Reset scene** to restore the original treatment.
- In Compose, choose a Beat and adjust its vertical position, scale, alignment, width, and duration on the 9:16 canvas. Overlap starts the next Beat early and shortens the total duration. Persist can carry a linked anchor with overlap set to zero. Reels safe-area guides stay on screen only.
- In Compose, play, pause, restart, loop, or scrub. The previous and next controls jump to beat boundaries. The canvas shrinks oversized type to fit and warns when even the minimum size overflows.
- Keep saves an independent browser-local snapshot. The working draft autosaves separately. Use Export for portable JSON or a 1080 × 1920 PNG of the current Compose frame.

## Kinetic Direction

Open **Direction** in Beat Lab to frame type and edit the ordered Cue list. **Preview cue** pauses at its exact start. The **9:16** button uses Compose’s renderer and timestamps for checking intentional crops. The visual handoff in the Transition controls can cut, flash, or punch in while a linked Anchor continues moving.

**Export → Copy prompt** copies a self-contained Russian brief with links to the Editorial Protocol and the active contract. **Ошибка восприятия — Director's Cut** is available in Demos or as [complete importable JSON](examples/perception-directors-cut.json).

## Video export

Choose **Export → Export video** to render the entire composition locally at 1080 × 1920 and 30 fps with no audio. Progress counts encoded and muxed frames. Use **Cancel** to stop the job. Once ready, tap **Download video**. On iPhone, look in Downloads in Files, or tap **Share file → Save to Files** when the browser offers file sharing. Open the saved file in the system player. The editor cannot write directly to Photos.

The browser checks H.264/MP4 first, then VP8 or VP9/WebM. Both are actual encoded files with matching MIME and extension. Instagram may require MP4. If the browser has no qualified encoder, export JSON and reopen it in a current Safari or Chromium browser on a device with encoder support. Export needs HTTPS or localhost for WebCodecs and runs without uploading the document. Rendering can take several seconds or longer on mobile.

See the [video verification fixture](examples/video-export-check.json) for a short composition that combines Cues, intentional crop, Reveal/Hold, backgrounds, shapes, all three impact treatments and a styled Persist Anchor with overlap.

See [Architecture](ARCHITECTURE.md), [Data contracts](DATA_CONTRACTS.md), [Testing](TESTING.md), and [Decisions](DECISIONS.md).
