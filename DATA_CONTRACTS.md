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
| `wordStyles` | Optional ordered, nonoverlapping visual ranges. See below |
| `emphasis` | Up to 100 ordered, nonoverlapping ranges |
| `placement` | Optional object with `position`, `scale`, and `overlap` |
| `timing` | Optional Reveal timing object described below |
| `scene` | Optional Visual Scene object described below |
| `transition` | Object with `type` and optional paired `from` and `to` |

Typography requires `font` (`Serif`, `Sans`, `Mono`), `size` (36–170 canvas pixels), `weight` (400–900), `leading` (1–1.8), `width` (45–92 percent), `align` (`Left`, `Center`, `Right`), and boolean `bionic`.

Each emphasis range is `{"id":"focus-1","start":0,"end":4,"role":"Strong"}`. IDs are unique within a beat and 1–100 UTF-16 units long. Offsets follow JavaScript string slicing. Use an inclusive start and exclusive end at extended grapheme boundaries. `String.slice(start, end)` should return the intended phrase. For emoji and combining characters, verify boundaries with `Intl.Segmenter`. Arrange ranges by ascending start. Text edits preserve unaffected ranges and discard intersected ranges.

`transition.type` is `Replace`, `Persist`, or `Transform`. Set both link fields or omit both. For Persist, `from` is an Anchor ID in the current beat and `to` is an Anchor ID in the next beat. The slices must match exactly, including case, punctuation, and whitespace. There is no Unicode normalization. Missing or broken links fall back to Replace. If previous references become invalid, the editor removes them and stores `{ "type": "Persist", "broken": true }` until the link is resolved or the transition is changed. A timed phrase reveal groups passages at line breaks and ending punctuation.

Imports validate all required fields before changing the working draft. Unknown additional fields are tolerated. New optional fields should preserve v1 behavior. Incompatible changes require a new version and explicit migration.

## Compose extension

Existing v1 documents and browser storage keys are read directly. Each optional `placement` field defaults independently. `position` is −100 to 100 (top to bottom, default 0), `scale` is 50 to 150 percent (default 100), and `overlap` is 0 to 2 seconds (default 0). Compose uses the existing typography width and alignment fields.

Effective overlap is capped at 45 percent of either adjacent duration, rounded down to a tenth of a second. It advances the next Beat start and subtracts from total time. The last Beat has zero effective overlap. Setting overlap to zero preserves the original transition window, including Persist. A document such as `{"placement":{"position":-80,"scale":120,"overlap":0.6}}` stores that object on the outgoing Beat.

## Word styling

An item contains `start`, `end`, and `style`. Offsets use the same inclusive/exclusive UTF-16 grapheme boundaries as emphasis. Visual ranges may overlap emphasis. Inside `wordStyles` itself, ranges must be sorted and disjoint, with up to 5,000 ranges per Beat.

The style object has at least one of `color` (`Ink`, `Accent`, `Cool`), `weight` (`Light`, `Bold`), `marker: true`, or `italic: true`. Omitted properties inherit the default. Color and weight override the role’s ink and weight. Modes and roles continue to control emphasis and opacity, and marker visibility follows the same animation. Text edits shift intact ranges and discard affected ones. Applying a property edits just that property across the selection.

The document version and storage keys are unchanged. Legacy documents omit the additional fields. See the [styled v1 example](examples/word-styling.json).

## Visual Scenes

Import [the complete five-Beat meta demo](examples/visual-scenes-meta-demo.json) through **Export → Import JSON** in the editor, or open it in the Demos list. Scenes use the existing `documentVersion: 1`. Omitting `scene` preserves the original Beat rendering.

The optional `scene` object accepts only `background`, `shapes`, and `typeMotion`. Unknown fields inside it and its children are rejected. All numbers must be finite. Defaults apply at render time and are not written back during import.

| Object | Field | Accepted values | Default |
| --- | --- | --- | --- |
| `background` | `kind` | `Off`, `Gradient Drift`, `Flow`, `Grain` | `Off` when the object is omitted; otherwise required |
| | `intensity` | 0–100 percent | 55 |
| | `speed` | 0–2 multiplier, 0 freezes motion | 1 |
| | `scale` | 50–150 percent | 100 |
| `shapes[]` | `kind` | `Circle`, `Line`, `Rectangle` | Required for each shape |
| | `motion` | `Hold`, `Expand`, `Drift` | `Hold` |
| | `tone` | `Accent`, `Cool`, `Ink` | `Accent` |
| | `x` | 0–100 percent of width, left to right | 50 |
| | `y` | 0–100 percent of text area height, top to bottom | 48 |
| | `size` | 8–90 percent of width, adapted in the wide Lab | 43 |
| | `energy` | 0–100 percent | 60 |
| `typeMotion` | `kind` | `Off`, `Punch`, `Slide`, `Oversized` | `Off` when the object is omitted; otherwise required |
| | `amount` | 0–100 percent | 60 |

Omitted `shapes` is equivalent to an empty array; at most three entries are allowed. Shapes render in array order behind lettering. Size refers to the diameter of a circle or the width of a line or rectangle. Tone refers to the current theme. Punch scales and settles, Slide enters from a bounded offset, and Oversized expands a static block. Headline cropping is allowed only for blocks of up to four words, two measured lines, and 27 UTF-16 units; longer blocks use a scale capped at 1.16 and fitted to the available area.

Background and shape layers crossfade over the existing handoff window. The same document seed and timestamps determine motion on both surfaces. Persist carries the matching Anchor between typographic positions; shapes and backgrounds end with their own Beat. Overlap, Word Styling, and the PNG contract are unchanged.

## Reveal timing

`"timing": {"revealDuration": 1.5}` is optional on a Beat. `revealDuration` is the only accepted key. It must be a finite number in seconds from 0.1 through the Beat's own `duration`, inclusive. The value is used in Reveal mode and retained when modes are switched. Import rejects invalid values. Shortening a Beat in Compose reduces a stored duration to the new Beat duration if necessary.

Without timing, Reveal uses the existing reading estimate and entrance schedule. With timing, entrances run from local time zero and use the existing smoothstep opacity curve. A single group fades over the full window. Multiple groups have evenly spaced starts from zero to `revealDuration - entrance`, with `entrance = min(0.24, revealDuration / groupCount)`. At the deadline every group has full Reveal opacity. Beat Lab loops the whole Beat in real seconds for explicit Reveal. Legacy Beat preview still compresses long Beats for editing.

Overlap advances the local clock of the incoming Beat, while the outgoing fade starts at the outgoing duration minus the transition span. These composition fades are independent of Reveal opacity. The displayed solo Hold is the time between the later of the Reveal deadline and the incoming overlap end, and the start of the outgoing transition. It is zero when those intervals intersect. To see the whole phrase at full contrast before a handoff, set Reveal to finish before the outgoing transition. A carried Anchor in an incoming Reveal is visible from the handoff onward. The single-Beat Lab view shows the Beat in isolation. Use Transition to inspect the carry from its preceding Beat.

A complete [4.5-second timing document](examples/reading-rhythm.json) has a 1.5-second Reveal and a 3-second Hold. The [Persist example](examples/persist-gaze.json) uses different layouts, fonts, colors, weights and scene treatments for the same linked word.
