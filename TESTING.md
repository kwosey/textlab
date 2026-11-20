# Testing

```sh
npm ci
npx playwright install chromium
npm run build
npm test
```

When using an installed Chromium, run `CHROMIUM_PATH=/usr/bin/chromium npm test`. Playwright starts a dedicated local Vite server on port 4173.

The tests cover Unicode range validation and edits, beat ordering and history, mutation protection, draft and collection restoration, invalid input recovery, JSON and PNG downloads, deterministic playback frames, looping, and horizontal overflow at 375 px.

For visual review, open all three demos at desktop and phone widths. Inspect the Russian reveal at several positions and scrub the end of the first beat of The Returning Tide to see the anchor carry into the second beat. In the editor, try a one-word beat, several emphasis marks, and a paragraph with unbroken words, explicit newlines, and combining characters. Judge the pacing, legibility, and emphasis separately from the automated assertions.

## iPhone editing

Open Edit at 320, 375, 390, and 428 CSS px. Paste several paragraphs in Russian, select a word, and scroll both the field and the page. Open Preview, scrub, then return to Edit. Check that the draft, selection and scroll positions survive and that the selected Beat follows deliberate beat navigation. Returning to Edit pauses playback at the current time.

The automated mobile tests exercise a reduced viewport and touch input in Chromium. On a physical iPhone, repeat the round trip with Safari’s software keyboard, including text selection handles, keyboard dismissal and the home-indicator safe area.
