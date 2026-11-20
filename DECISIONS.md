# Decisions

- Share Canvas 2D drawing across a wide Lab proof and the reel used by Compose and PNG. Use system font stacks to support Cyrillic and Latin without network requests or bundling font files.
- Keep a single sequence of up to five beats. Document history covers edits and changes of composition. Transport and selection are session state.
- Use elapsed time for preview playback and pure timestamp-based motion for rendering. A user-driven mutation creates a new editable snapshot.
- Require explicit Anchor pair selection to carry a passage. Fall back to Replace when an explicit link is invalid.
- Keep original text separately for external drafting. The editor accepts a fully structured JSON document without contacting an AI service.
- Defer audio, cloud sync, per-field locks, and a multi-track timeline. Fonts and ligatures can vary across platforms; the initial scope is horizontal Russian and English text.
- Keep the v1 schema and local storage keys. Compose adds optional placement and safe-area preferences. Overlap schedules neighboring Beats, while Persist carries a linked anchor.
- Keep visual styles separate from semantic roles. Suggest exact Anchor matches and wait for confirmation before storing a link.

- Store visual Scenes directly on Beats as optional v1 data. Keep shapes behind lettering and crossfade both scene layers during an existing Beat handoff.
- Use theme-relative colors and bounded opacity for contrast. Oversized permits edge cropping for brief headlines and uses a fitted scale for longer copy. Large type motion damps background, shape, and per-word motion.

- Keep optional Reveal timing in v1. Let Hold derive from the existing duration and transition schedule. Preserve the legacy render path when timing is absent.
- Preserve native text metrics at Persist endpoints. Use complementary horizontal clips for a mixed-font or mixed-style handoff. A valid carried Anchor starts visible in an incoming Reveal.

## Video compatibility

| Browser capability | Output | Status |
| --- | --- | --- |
| WebCodecs accepts AVC at 1080 × 1920, 30 fps | H.264 in MP4 | Preferred. Chromium output was decoded and inspected. |
| AVC unavailable or fails, VP8 or VP9 accepts the configuration | VP8 or VP9 in WebM | Verified in Chromium with AVC disabled. This container may need conversion or an MP4 re-export for Instagram. |
| No available qualifying WebCodecs encoder | No file | The UI explains the limitation and suggests another browser or device. |
| Physical iPhone Safari over HTTPS | Candidate AVC support is checked at runtime | Physical Files playback, file sharing and Instagram ingest require manual acceptance. |

Use native timestamped encoding instead of a capture stream. MediaRecorder would tie the result to real-time scheduling and could duplicate or drop frames under load. No WASM codec or server is installed. Apple hardware, OS/browser version and hardware resources determine the available runtime configurations. Main-thread batches keep the UI responsive without moving font layout into a different execution context. The trade-off is export time that depends on the device, plus memory for the compressed file. The MP4 writer appends metadata at completion to avoid retaining a separate fast-start queue of encoded media.

HTML Downloads and browser file sharing preserve user activation. The UI waits for an explicit save/share gesture after encoding and does not promise direct Photos access. Within one browser, Compose and export share font metrics. System fallback fonts may differ across operating systems and video compression changes pixel values.
