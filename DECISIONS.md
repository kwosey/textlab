# Decisions

- Use Canvas 2D for one shared preview and PNG surface. Use system font stacks to support Cyrillic and Latin without network requests or bundling font files.
- Keep a single sequence of up to five beats. Document history covers edits and changes of composition. Transport and selection are session state.
- Use elapsed time for preview playback and pure timestamp-based motion for rendering. A user-driven mutation creates a new editable snapshot.
- Require explicit Anchor pair selection to carry a passage. Fall back to Replace when a link cannot be drawn on one line.
- Keep original text separately for external drafting. The editor accepts a fully structured JSON document without contacting an AI service.
- Defer audio, video encoding, cloud sync, per-field locks, and a multi-track timeline. Fonts and ligatures can vary across platforms; the initial scope is horizontal Russian and English text.
