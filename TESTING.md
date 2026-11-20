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

## Mobile review

At 320, 375, 390, and 428 CSS px, open Beat Lab and paste Russian text. Scroll to Transform and select Wave. With the canvas still visible, drag Intensity from 20 to 90 and verify movement before lifting your finger. Switch to Echo, edit a word, assign an emphasis, and press Mutate. Use Transition to watch Replace, Persist, and Transform. In The Returning Tide, verify that the linked word stays visible between beats.

In Compose, move a text block and adjust its scale, alignment, width, duration, and overlap. Check that total time changes, the two paragraphs trade places clearly, and PNG excludes guides. Scrub and return to Beat Lab, then reopen Compose and check its playhead. Verify both workspaces on desktop.

Playwright checks pixels, pointer movement before release, document compatibility, exports, scroll and selection restoration, and the reduced viewport in Chromium. Repeat with Safari’s software keyboard and selection handles on a physical iPhone.
