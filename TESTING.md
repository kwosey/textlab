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
