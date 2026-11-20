# Architecture

| File | Responsibility |
| --- | --- |
| `src/model.ts` | Versioned document, validation, emphasis range edits, explicit anchor links, mutation |
| `src/layout.ts` | Canvas text measurement, styled runs, line wrapping, grapheme-aware splitting, fit |
| `src/motion.ts` | Seeded analytic Scatter, Echo, and Wave |
| `src/timeline.ts` | Beat duration math and timestamp lookup |
| `src/render.ts` | Fixed canvas frame, mode rendering and transitions |
| `src/persistence.ts` | Drafts, individual collection entries and file downloads |
| `src/App.tsx` | Editor, transport, bounded document history and file actions |

React renders controls and drives the clock via requestAnimationFrame. Playback derives elapsed time from the clock origin. The renderer receives only the Canvas context, document and timestamp. PNG captures the same canvas shown in preview. Canvas makes motion and export share the exact layout; browser font measurement gives the document fast local typography without a vector engine.

Anchors participate in a transition only when their explicit references resolve to matching passages in adjacent beats, and both runs occupy one line. Otherwise the renderer uses Replace. Layout is cached by immutable beat identity. Browser font fallback, font synthesis, and glyph metrics can vary by OS.

The interface draws on [Hequ Motion Lab](https://github.com/kwosey/hequ/tree/hequ-v0.7-motion-lab) for live visual controls and [Tiny Kit Form Lab](https://github.com/kwosey/tinykit) for a separable deterministic renderer and transport.
