# Text Lab v1 document

Use the [complete working document](examples/a-quiet-interval.json) as a template. JSON is UTF-8. The import limit is 1 MB.

| Document field | Valid values |
| --- | --- |
| `documentVersion` | Integer `1` |
| `title` | 1–100 UTF-16 units |
| `originalText` | Source text, up to 25,000 UTF-16 units, independent of beat edits |
| `theme` | `Paper`, `Night`, `Moss`, `Lilac` |
| `seed` | Unsigned 32-bit integer |
| `safeArea` | Optional boolean. Defaults to false and affects only on-screen Compose guides |
| `beats` | 1–5 ordered beat objects with distinct IDs |

| Beat field | Valid values |
| --- | --- |
| `id` | 1–100 UTF-16 units, unique within the document |
| `text` | 0–5,000 UTF-16 units, preserve punctuation and line breaks |
| `duration` | Seconds, 0.5–120 inclusive |
| `mode` | `Reading`, `Focus`, `Reveal`, `Transform` |
| `effect` | `Scatter`, `Echo`, `Wave` |
| `reveal` | `Words`, `Lines`, `Phrases` |
| `intensity` | 0–100 |
| `typography` | See fields below |
| `emphasis` | Up to 100 ordered, nonoverlapping ranges |
| `placement` | Optional object with `position`, `scale`, and `overlap` |
| `transition` | Object with `type` and optional paired `from` and `to` |

Typography requires `font` (`Serif`, `Sans`, `Mono`), `size` (36–170 canvas pixels), `weight` (400–900), `leading` (1–1.8), `width` (45–92 percent), `align` (`Left`, `Center`, `Right`), and boolean `bionic`.

Each emphasis range is `{"id":"focus-1","start":0,"end":4,"role":"Strong"}`. IDs are unique within a beat and 1–100 UTF-16 units long. Offsets follow JavaScript string slicing. Use an inclusive start and exclusive end at extended grapheme boundaries. `String.slice(start, end)` should return the intended phrase. For emoji and combining characters, verify boundaries with `Intl.Segmenter`. Arrange ranges by ascending start. Text edits preserve unaffected ranges and discard intersected ranges.

`transition.type` is `Replace`, `Persist`, or `Transform`. Set both link fields or omit both. For Persist, `from` is an Anchor ID in the current beat and `to` is an Anchor ID in the next beat. The slices must match exactly. Missing or broken links fall back to Replace. A timed phrase reveal groups passages at line breaks and ending punctuation.

Imports validate all required fields before changing the working draft. Unknown additional fields are tolerated. New optional fields should preserve v1 behavior. Incompatible changes require a new version and explicit migration.

## Compose extension

Existing v1 documents and browser storage keys are read directly. Each optional `placement` field defaults independently. `position` is −100 to 100 (top to bottom, default 0), `scale` is 50 to 150 percent (default 100), and `overlap` is 0 to 2 seconds (default 0). Compose uses the existing typography width and alignment fields.

Effective overlap is capped at 45 percent of either adjacent duration, rounded down to a tenth of a second. It advances the next Beat start and subtracts from total time. The last Beat has zero effective overlap. Setting overlap to zero preserves the original transition window, including Persist. A document such as `{"placement":{"position":-80,"scale":120,"overlap":0.6}}` stores that object on the outgoing Beat.
