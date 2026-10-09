# Detailed CD-case integration

The collection renderer is `collection-scene.js`; `case-model.js` adapts the supplied model to it. The existing 85 measured slots, order, metadata, hover/scroll behavior, pickup/return motion, page styling and Spotify UI are retained.

## Source

- Copied directly from `/Users/fondahu/cd-case-study/models/floral-cd-case.glb` to `assets/mixtapes/floral-cd-case.glb`.
- SHA-256: `72d071b76e560171641609933ed879e7ba735b61cabc1d3bd4443dfdfd6606f2`.
- Reference: `/Users/fondahu/cd-case-study/main.js` and `README.md`.
- Editable source remains `/Users/fondahu/cd-case-study/models/floral-cd-case.blend`.
- No asset from the source project's validation directory is used.

## Coordinates, materials and reuse

The GLB is face-up along +Y after Blender's glTF conversion. Its `Album_Orientation` already places the spine at -Z and the lid opens toward -Z. The reference viewer's assembly X rotation faces its front camera; it is not needed for this Y-up scene. No extra album-orientation rotation is applied. A uniform scale makes the full closed width 1.25 scene units. The collection places the actual spine anchor at each existing measured center, preserving each measured width and angle. The former model's nonuniform thickness correction is no longer applied.

One cached GLTF load supplies all geometries and the embedded floral texture. Every slot owns a scene hierarchy, animation mixer, materials, and two independent tape textures. Empty tape maps use smaller canvases. The same hierarchy is retained through pickup and return. Closed blank bodies are batched by material with full-detail geometry and instance culling; their original tape meshes remain attached to their own anchors. Picking reveals the original articulated meshes. No source geometry is simplified.

The two broad `Clear thin cover` panels use the reference's 0.018-alpha, no-depth-write treatment. The remaining plastic keeps transmission, volume, IOR and its original roughness. Studio reflection cards are converted into the scene's Y-up coordinates. Reflection strengths are adjusted for the existing cream background so highlights do not erase hinge/latch details.

## Writing, animation and playback

`Cover_Tape` remains under `Cover_Anchor` / `Lid_Pivot`; `Spine_Tape` stays under `Spine_Anchor` / `Case_Base`. Maps follow the reference's original UVs, sRGB and `flipY=false`. Writing uses the site's existing Selectric Mono font and available title/date fields. Missing values remain blank. Photo covers stay attached to the lid. The existing track list sits on the disc without covering its clear hub or polished rim.

Each case samples its own embedded two-second **Open case** clip through `setOpenProgress(0…1)`. Closing samples the same clip backward. Playback is enabled only at fully open, and stops when closing/returning. Dragging and background taps do not toggle the lid. The frame helper fits the actual shell bounds above the existing controls throughout opening; song zoom and spine inspection remain available.

## Local preview and checks

From the project root:

```sh
python -m http.server 4177 --bind 127.0.0.1
```

Open <http://127.0.0.1:4177/>. In a separate terminal, with Python Playwright installed:

```sh
python tests/floral_case_check.py --output /tmp/floral-case-check
```

The check uses installed Google Chrome by default; `--chrome PATH` and `--url URL` override it. It checks all 85 slots, geometry/texture reuse, independent writing and mixers, exact measured placement, multiple pickups, animation reversal, desktop/mobile lid framing, pointer/keyboard/touch behavior and browser errors. Spotify iframe responses are stubbed to validate URL selection and playback gating deterministically; it does not assert third-party audio playback or authentication. Screenshots and `report.json` are saved outside the public site.

## White handwritten photo trial — October 6, 2026

Anvitha's provided photo now replaces the floral print on her disc. The original cover photo remains on the moving lid. Other slots retain their own artwork. A cloned print UV attribute aligns the photo with the case; the GLB, physical disc, reflective rim, clear hub, and tape UVs remain unchanged. White song names are a separate transparent ink layer above the artwork, with a narrow dark stroke and shadow. A mild edge-darkening treatment protects contrast while keeping the face visible above the hub. Long titles wrap with extra leading and a smaller size when necessary.

Font selection used the Use & Modify skill and a successful full metadata refresh (191 entries, 183 public, 8 withheld; October 6, 2026). The brief was handwritten, personal, white ink over a photo; explored catalog tags were `script`, `monolinear`, and `wonky`. These are direction clues, not readability guarantees. The actual song names were compared at large and small sizes:

- **Borel Regular — selected for song names:** catalog tags `sans serif`, `script`, `paleographic`. Its more substantial strokes stayed distinct in the white-on-photo specimen. [Author/source](https://github.com/RosaWagner/Borel), [catalog](https://usemodify.com/fonts/borel/).
- **Pecita:** `large character map`, `script`, `cyrillic`. Looser handwriting, but smaller joins were less clear in this trial. [Author/source](https://pecita.eu/), [catalog](https://usemodify.com/fonts/pecita/).
- **Orchard Linear:** `wonky`, `sans serif`, `script`. Expressive shapes competed with the photo at the intended sizes. [Author/source](https://github.com/nervousattack/Orchard), [catalog](https://usemodify.com/fonts/orchard-linear/).

Borel's original font was obtained from the official Google Fonts distribution (`ofl/borel/Borel-Regular.ttf`) and packaged locally as WOFF2 without changing its outlines. Its SIL OFL 1.1 notice is retained in `assets/fonts/borel/OFL.txt`. All characters in the current song names were checked. The existing Selectric Mono remains on metadata, tape labels and controls; no additional family is needed for those roles. Canvas drawing waits for Borel to load. The full-case mobile view is an overview; individual-song zoom remains the more readable view for small text.

## Play when a selected case opens — October 6, 2026

A filled, embeddable mixtape now opens automatically after pickup. `mixtapes.js`
prepares its Spotify controller during the lift, then requests playlist playback
only when the embedded lid animation reaches 100%. Blank cases remain silent.
`spotify-player.js` uses Spotify's documented Embed API `ready`, `play`,
`pause`, `destroy`, and playback events. Closing mid-animation or returning the
case destroys the session; late callbacks cannot start the previous selection.
Changing tracks creates a new guarded session. The native player remains
available when autoplay is blocked or the controller cannot initialize.

The model, photo, handwritten labels, measured array, dragging and zoom remain
unchanged. Playback is not reported as successful until Spotify sends a playback
event. Browser/account restrictions still apply:
https://developer.spotify.com/documentation/embeds/references/iframe-api

Validation: `tests/floral_case_check.py` covers the full scene, single-click
opening, play requests at openProgress=1, mobile/reduced motion, and existing
interactions. `tests/spotify_player_check.py` checks the actual adapter with
simulated Spotify responses, including delayed callbacks, cancellation, blocked
autoplay, and API failures. These deterministic tests do not verify streamed
Spotify audio. Real-network observations are saved outside the deployed project
in `/Users/fondahu/mixed-by-anvitha/checks/open-play/live-spotify.json`.

The real-network follow-up also received `ready`, `playback_started`, and
continuing `playback_update` events for the requested playlist after a trusted
CD click in Chrome. This verifies Spotify accepted playback in that fresh
session; it does not establish full-length playback for every account/browser.
The first cold attempt timed out into the manual fallback; the follow-up passed.

## Clear Anvitha lid and Figma spacing draft — October 6, 2026

Anvitha's metadata now sets `showCoverPhoto: false`. `case-model.js` omits only
`Torn_Photo_Cover` for that item; the photo on `Printed_floral_face`, white Borel
track names, tape labels and transparent case remain. Other albums keep the
existing lid-photo default unless they explicitly disable it.

The open-player desktop (1440×1000) and mobile (390×844) layouts were imported
into the existing Figma file:
https://www.figma.com/design/c3ff6RsDKLsPgIkwx6bLcx?node-id=8-2

Source/artifacts: `/Users/fondahu/mixed-by-anvitha/figma-open-player/`.
The board contains a discrete rendered CD asset in each screen plus native HTML
text/shapes/groups for the controls and a visual Spotify stand-in. Its captured
frames are intended for spacing edits, not live Spotify playback or 3D editing.
The original overlapping player/controls positions are retained as the baseline.
The capture service confirmed import. Figma's Starter MCP quota blocked native
read-back, screenshot QA, component refinement and click-through wiring; do not
represent those as verified. The local source was visually checked, and the full
website browser regression passed with explicit clear-lid/disc-photo assertions.

## Container removed and Vidya draft — October 8, 2026

Removed the cardboard floor and walls while preserving all 85 measured case
positions, tilts, hover interactions and pickup/return behavior. Anvitha remains
in slot 5; the formerly blank slot 6 now carries independent cover and spine tape
labels reading `For Vidya`.

Vidya is an explicit `draft: true` metadata entry with no playlist URL, tracks,
photo or date yet. Draft cases remain selectable and manually openable, but do
not create a Spotify player, expose a stale outgoing link, or enable playback.
To connect the finished playlist, supply its Spotify URL and tracks, set `embed`
to true and clear `draft`. Missing dates stay blank.

Validation: `tests/floral_case_check.py` passed desktop and mobile checks for
container removal, both independent labels, opening, existing Anvitha playback
requests, and absent playback/link state for the Vidya draft. Spotify responses
in this test are simulated; it does not verify streamed audio. Screenshots are
in `/Users/fondahu/mixed-by-anvitha/checks/vidya/`.

## Vidya playlist and supplied photo — October 9, 2026

Connected Vidya's case to the supplied Spotify playlist `0XRiCc89XG90yQUJduIrte`
(New songs for fonda, by vidya). Its seven public-embed tracks are retained in
source order with retrieval metadata. The case now reads `Mixed by Vidya` on
both tape surfaces, matching Anvitha's naming convention. Date remains blank.

Converted `/Users/fondahu/Downloads/IMG_6831.HEIC` to the web asset
`assets/mixtapes/cover-vidya-6831.jpg`. The original is unchanged. Existing disc
photo cropping and white Borel track lettering apply; the transparent lid remains
clear. The draft flag is cleared and the existing opening-triggered Spotify
player now handles this playlist and its individual songs.

Browser regression coverage now checks both populated cases, unique artwork and
labels, Vidya playlist and individual track selection, cleanup when returning,
and desktop/mobile interactions. Spotify API responses in that check are
simulated; streamed audio is not verified by it.
