# Decisions

- Share Canvas 2D drawing across a wide Lab proof and the reel used by Compose and PNG. Use system font stacks to support Cyrillic and Latin without network requests or bundling font files.
- Keep a single sequence of up to five beats. Document history covers edits and changes of composition. Transport and selection are session state.
- Use elapsed time for preview playback and pure timestamp-based motion for rendering. A user-driven mutation creates a new editable snapshot.
- Require explicit Anchor pair selection to carry a passage. Fall back to Replace when an explicit link is invalid.
- Keep original text separately for external drafting. The editor accepts a fully structured JSON document without contacting an AI service.
- Defer audio, video encoding, cloud sync, per-field locks, and a multi-track timeline. Fonts and ligatures can vary across platforms; the initial scope is horizontal Russian and English text.
- Keep the v1 schema and local storage keys. Compose adds optional placement and safe-area preferences. Overlap schedules neighboring Beats, while Persist carries a linked anchor.
- Keep visual styles separate from semantic roles. Suggest exact Anchor matches and wait for confirmation before storing a link.

- Store visual Scenes directly on Beats as optional v1 data. Keep shapes behind lettering and crossfade both scene layers during an existing Beat handoff.
- Use theme-relative colors and bounded opacity for contrast. Oversized permits edge cropping for brief headlines and uses a fitted scale for longer copy. Large type motion damps background, shape, and per-word motion.
