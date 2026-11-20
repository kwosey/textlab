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

## Video export

Import [the verification fixture](examples/video-export-check.json). Use **Export → Export video** from either workspace. Confirm frame count and duration, save the result, and open it in a video player. It should contain only the 9:16 reel rendering and no audio. Director's Cut exercises a longer export. Try starting while parked at a different playhead, cancelling, then exporting again. The draft and selected Beat should retain their state.

Playwright uses native Chromium encoder output. It checks MP4/WebM signatures, codec, dimensions, no audio, duration, each presentation timestamp, and decodes frames across Cues and the four handoffs. Those frames are compared with independently rendered reference images. Tests also disable AVC to exercise WebM, inject encoder failure, simulate slow encoding, check cancellation/queue limits, and check the panel at four mobile widths and desktop. An installed Chromium should have at least one functioning WebCodecs video encoder and decoder.

On a physical iPhone open the app over HTTPS. Export Director's Cut, watch progress, save to Files or use Share file, then play the saved file full screen. Verify length, scene timing, and Persist. If it is MP4, try importing it into Instagram. If it is WebM, use another device/browser to re-export MP4. Repeat with 20–30 seconds, cancel partway, then export again. Desktop browser tests do not establish iPhone acceptance.

### iPhone Safari regression for issue #20

On a physical iPhone over HTTPS, export A Quiet Interval (15.00 s), Director's Cut (17.55 s), and the imported 16-second production handoff draft. Record the iPhone model, iOS/Safari versions, selected format and resolution. For each file, use **Preview video**, save it to Files or share it, and play it outside Text Lab. If available, import the MP4 into Instagram. If 1080p fails, copy **Export diagnostics**, then try **Retry at 720p** and record its result separately. If both fail, export the JSON and open it on desktop Chromium. Keep reports free of project text and JSON.

The Playwright regression runs Chromium with an iPhone Safari user agent and a simulated 1080p hardware error. It checks the report and its clipboard output, then encodes the default 15-second demo at 720p and verifies native browser playback, MP4 download and playback-error feedback. Physical iPhone Safari playback, Files and Instagram still require a device check.

PR #21 reports that physical Safari failed at both resolutions with 122 submitted, 122 encoded and 121 muxed frames, shortly after the requested keyframe at zero-based index 120 (4.0 s). The device report does not include the failing chunk's PTS or byte length. Repeat on the bugfix preview and capture diagnostics from both resolutions, including a successful export with corrected timestamps. If it still fails, the report separates duplicate, empty, out-of-range and missing packets and shows the raw and intended PTS, chunk type, bytes, nearby pending PTS, submitted index, most recent requested keyframe and queue sizes.

The Chromium regression injects a millisecond-quantized PTS at frame 121 and verifies all 450 presentation timestamps and 15 seconds of MP4, including decoded frames near the 4-second boundary and at the end. It covers both resolutions and also runs the 720p case with only frame zero explicitly requested as a keyframe. The injected timing shift is a test input. Whether the physical device shifts its PTS, and whether its behavior depends on keyframe requests, still needs device evidence.
