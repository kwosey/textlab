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

## Word styling and Anchor links

Open Style words on a phone and tap a word, then use Phrase to select across punctuation. Apply Cool, Bold, Marker, and Italic. Verify that the sticky frame updates immediately during Reveal, Focus, and Transform. Reset the style and check that the role remains. Check keyboard arrow navigation between words and edit before or inside the styled phrase.

In The Returning Tide, confirm the linked `tide` card at zero overlap. Remove the link, confirm the suggested pair, then edit an Anchor and check that a broken link is shown. Try choosing both passages manually. On a physical iPhone, repeat selection and linking by touch, toggle between Edit text and Style words with the Safari keyboard up, and check the sticky frame and scroll behavior.

## Visual Scenes

Open the [meta demo](examples/visual-scenes-meta-demo.json) in Compose. Scrub into each Beat and then watch the whole 24.7 seconds. Check the title framing, timed Reveal, circle expansion, lower slide, and final headline as one story.

In Beat Lab, open Scene, select each animated background, change Intensity and Speed before lifting your finger, add an expanding Circle, and switch Type motion to Punch or Oversized. Confirm that the wide preview stays visible while scrolling. Switch to Word Styling and enter text with the software keyboard. Repeat at 320, 375, 390, and 428 CSS px, and check desktop. On a physical iPhone, check Safari frame pacing, touch response and interaction while the keyboard is open. Chromium tests use emulated touch and reduced visual viewport height.

Automated checks sample both canvases, validate and round-trip the meta demo, check marker and Anchor compatibility, compare PNG against Compose pixels, and ensure scene-only drags do not remeasure text. Verify the three older demos with Scene off.

## Reading rhythm and Persist

Import [the timing example](examples/reading-rhythm.json). Restart in Beat Lab and Compose, check that all text is visible at 1.5 seconds, and wait through the three-second Hold. Change Reveal duration while paused, and check Words, Lines and Phrases. Reload or export and reimport to verify timing.

Import [the gaze example](examples/persist-gaze.json). Tap Transition from the first Beat and tap again to replay. The cyan italic word travels down and hands off to the warm bold version. It stays visible when the incoming Reveal starts. Repeat with zero overlap and with a one-second overlap. Compare The Returning Tide and check the disabled Transition button on the final Beat.

Automated tests sample actual pixels through the gaze handoff at 60 Hz and use a controlled clock for real-time Reveal. On a physical iPhone, view both proof compositions in Safari and check pacing, perceived continuity, slider response and keyboard behavior.

## Kinetic Direction

Open Director's Cut and inspect the opening title crop, expanding circle, flash to the line, quiet Beat, and returning circle. In Direction, change a cue, tap **Preview cue**, and compare **9:16** against Compose at the same time. Scrub backward and compare the same frame. Check all visual handoffs with a linked Anchor.

The tests cover schema rejection, ordered cues, frame determinism, exact 9:16 proofing, JSON round-trip, and copy/error feedback with a real Chromium clipboard. On a physical iPhone, confirm clipboard behavior under HTTPS, the keyboard and sticky preview while editing Cues, crop alignment, and visual pacing.
