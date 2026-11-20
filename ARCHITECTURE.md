# Architecture

| File | Responsibility |
| --- | --- |
| `src/model.ts` | Versioned document, styling and emphasis range edits, explicit anchor links, mutation |
| `src/layout.ts` | Canvas text measurement, styled runs, line wrapping, grapheme-aware splitting, fit |
| `src/motion.ts` | Seeded analytic Scatter, Echo, and Wave |
| `src/timeline.ts` | Beat duration, bounded overlap, and timestamp lookup |
| `src/render.ts` | Shared drawing for the wide Live Preview and the fixed reel, including transitions |
| `src/persistence.ts` | Drafts, individual collection entries and file downloads |
| `src/LivePreview.tsx` | Independent UI loop that samples the shared renderer |
| `src/App.tsx` | Editor, transport, bounded document history and file actions |

React controls one document. Beat Lab and Compose each have a session playhead. The Lab maps its short loop onto the selected Beat or a window around its outgoing transition. Both surfaces share motion, emphasis, and transition drawing. The Lab wraps text to a broad proofing area. Compose applies the actual layout at 1080 × 1920. PNG captures the Compose canvas. The optional guides sit over it in CSS.

Anchors participate in a transition when explicit references resolve to matching passages in adjacent beats. Styled or wrapped anchors carry measured runs through the transition. Broken links fall back to Replace and remain visible in the editor as broken. Layout is cached by surface and immutable beat identity. A positive overlap starts the incoming Beat early. Overlapping paragraphs fade out and in with staggered opacity while a valid Persist anchor stays visible. Browser font fallback, font synthesis, and glyph metrics can vary by OS.

The interface draws on [Hequ Motion Lab](https://github.com/kwosey/hequ/tree/hequ-v0.7-motion-lab) for live visual controls and [Tiny Kit Form Lab](https://github.com/kwosey/tinykit) for a separable deterministic renderer and transport.

The word picker uses word segmentation and the model validates grapheme boundaries. Styling and emphasis have separate, nonoverlapping range lists. Layout measures styled runs before wrapping. Markers paint behind lettering while sharing the run’s Reveal, Focus, or Transform timing.
