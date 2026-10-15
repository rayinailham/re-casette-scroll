# Build Notes — this implementation

Status of the build in this repo: what was measured, what was found broken and fixed, what was
changed after comparing against the live reference, and where it deliberately departs from the
spec files. The spec files describe the *reference*; everything specific to *this build* lives here.

Run commands, URL flags and the instrumentation channel: [`README.md`](./README.md). Subsystem →
file → spec map: `README.md` "Where each subsystem lives".

---

## 1. Results

Machine: Intel UHD iGPU, Chromium via ANGLE, 1440×900, dpr 1. Re-run with `npm test` and
`npm run verify`; figures below are from the 2026-10-15 run.

### 1.1 Test suites

- `npm test` — **82/82**, no browser (58 shelf in `tests/motion.test.mjs`, 24 detail in `tests/detail.test.mjs`: route, copy, ink determinism / closed loops / monotonic area / `minBlob` / `progress`, the push-meter reducer, exit-spin and hand-over maths, the silhouette test). The 58: Arc reference table; x non-monotonic past Δindex ≈ +4.49;
  wheel ±1 and `deltaMode` normalisation; snap settle; frame-rate independence of the follow
  smoother and of the wobble integrator; wobble exact zero and the `8e-4` sleep; press sign coupling
  and centre-zero; wipe floor and clamps; intro purity, the 2.4 / 2 / 3 exponent
  desynchronisation and exact reconstruction; loader floor, monotonicity, scene share, font gate and
  beat gating; year drum; flow-kick table, `±12` clamp, additivity, exact-zero decay and
  reduced-motion reset; counter exit growth maths, per-cell wave, collapsed-cell filtering and the
  `0.86` divisor; orbit angle targets and radius tracking; reveal `at` planner, group gap and
  `together` entries; scribble ribbon geometry.
- `npm run verify` — **89 checks** (48 shelf + 41 detail), in a real browser with `?diag`. On the
  2026-10-15 runs on this machine (load average 3–5 from other applications) 88 of 89 passed
  each time and the one failure was a different **shelf** timing check each run — a single 100 ms
  stall: the section-switch cost, the sustained-scroll fps ≥ 55 (p95 was 16.8 ms), the wheel-flow
  peak read two frames late. None involves the detail code and none was loosened. The detail checks
  — open from the shelf, hash and view, parked loop, inert shelf, copy = `shelf.json`, no strings or
  `<img>` in the markup, still absent not broken, ink clip at three scroll positions and cleared on
  close, Esc / browser Back / Forward, unknown hash ignored, prefetch once, arriving flick ignored
  then push → next id, Back after a push lands on the new title, deep link, 20 round trips with
  flat textures / geometries / programs and ≤ 2 canvases, reduced motion — passed on every run.
  The shelf checks:
  - *loader*: never finishes before 2.85 s; `P` monotonic; all 20 covers load.
  - *single scene*: all 20 discs exist from the first frame; a section switch creates no
    geometry and uploads no texture; `scene.children.length` is unchanged across four switches.
  - *data contract*: copy reads from `shelf.json`; no title or cover path is hardcoded in the
    markup; `<title>` is the curator, not a work; the note block shows only what `notes.json` says.
  - *input*: wheel advances the index and settles on an exact integer; arrow keys step one disc;
    scrolling during the intro is ignored; `?shelf=games`, `localStorage` persistence and survival
    across reload; cursor `pointer` over a disc and `grab` away from one; click flips a disc, a
    flipped disc is still hoverable, a second click flips it back; reduced motion skips the
    preloader and still renders discs.
  - *counter*: four orbit steps; each beat advances monotonically toward π/4, π/2, 3π/4, π
    (settled 0.25 → 0.436 → 0.75 → 0.999 π); travels below → left → upper-left → above and never
    goes right of the disc; clearance matches the spec's ellipse to within ~0.06 px across ~150
    frames while the projected radius itself varies; never leaves the viewport; the exit reaches
    −110 % on the disc's growth, every mid-exit frame within 0.02 of the growth-predicted `t`
    (computed in the harness from the radii the page actually read).
  - *copy*: rules grow out of the left edge (`transform-origin: 0px` on 300 px-wide rules) and end
    at `scaleX 1`; text reaches opacity 1 / `visible`; every title line has its own mask; the outer
    mask is `idle` at rest; the engine runs without errors.
  - *flow and press*: a wheel notch moves flow velocity to ≈ 2.22 (= 2.5 × one frame of the 0.89
    friction); the press input is the raycast UV (press 70 px left of the lead → uv ≈ −0.28; press
    at centre → |uv| ≈ 0.06 with the Z-push still firing).
  - *frame rate*: a section switch flips with one hidden swap — one position change, made on a
    frame drawing one disc — and costs no more than the machine's own idle; sustained scrolling
    holds 60 fps with the full disc set; no page errors or failed requests.

### 1.2 Frame rate

| Measurement | Result |
|---|---|
| Sustained scrolling, wheel input both directions (535 frames) | p50 **16.7 ms**, p95 **16.8 ms**, max 100 ms; peak **10 discs drawn**, 57 draw calls, 150 976 triangles |
| Settled / idle | **7 discs drawn**, 28 draw calls, 80 960 triangles, 16 programs, dpr 1 |
| Detail page, ink active, 40 wheel steps (≈ 320 frames) | p50 **16.7 ms**, p95 **16.7–16.8 ms**, max 16.8 ms in the clean runs (116–200 ms in two runs under load) |
| Section switch (films ⇄ games, the flip) | **101 of 101 traced frames ≤ 16.8 ms**, mean JS **1.57 ms/frame**, peak 28 draw calls, no stalls |
| Idle control, same machine, 9 s, no input | max 16.8 ms, p95 16.8 ms |

At 40° FOV and `cameraDistance: 4.4` the camera frames roughly three discs; `renderRadius: 5` culls
the rest, so ~7–10 are drawn at once out of the **20 that always exist in the scene**. The one
100 ms frame in the scrolling run is absent from the idle control. An earlier run on this machine,
with a second Chrome window rendering the same scene on `localhost:4173`, stalled ~250 ms every
~0.5 s even idle; a CPU profile of that window was ~95 % idle, so the stalls were GPU-side, and
they did not reproduce here. **Not measured on a discrete GPU, and this headless context reports
dpr 1, so nothing here is a dpr-2 number.**

---

## 2. Defects found in the first build pass

Three were live defects, not gaps:

1. **The fan-out never grew the disc.** `setProgress(P)` wrote `activeProgress` every frame from the
   intro pose while the fan timeline tweened the same field, and the per-frame write won. The lead
   disc stayed at 0.8 scale forever — and because the counter's exit is measured against disc growth,
   the counter never left either. `setProgress` now only writes while `state.introLive`.
2. **The counter never moved horizontally.** The counter's box is a full-width block
   (`left:0; right:0`), so `getBoundingClientRect().width` was 1440, which collapsed both clamp bands
   and pinned `x` to the lower bound for the whole intro. It now measures the union of its cells.
3. **`clip('idle')` set `'clip'`.** The mask-state toggle took a boolean and was called with a
   string, so the outer masks clipped permanently — clipping descenders. The parameter is now the
   state string itself.

---

## 3. Second pass — matched against the live reference (2026-10-15)

The reference (a24.raviklaassens.com) was reverse-engineered with REA from its shipped bundle and
CSS, plus timed captures (`evidence.md`), and the build was compared against it on four points.
What changed:

1. **Intro.** The preloader had `background: #fff` over the canvas, so the lead disc rose, turned and
   grew *behind an opaque layer* and the counter orbited an invisible disc. The loader is now
   transparent (as on the reference). The counter is set in the serif at `6em`, the side labels are
   back to body size, and counter, side labels and the nav's brand + loading word now roll up out of
   their masks on beat 1 (`yPercent 110/120/105 → 0`). The right-hand year drum never rendered — it
   was handed the first digit instead of its wrapper, so it found zero digits; fixed. At the end the
   loading word rolls out and the collection links roll in (`0.7 s energy`, `0.05` apart); the copy
   is no longer mounted instantly but revealed by the text engine when `data-disc-flight` lifts.
2. **Hover on the active disc** draws the reference's scribble (`src/disc/scribble.js`): two jittered
   ribbon loops in the disc's own plane (24 points, jitter .028, padding .06, width .012, sweep .68),
   drawn on in three frames `[.3,.5,.72]`, re-drawn with fresh jitter at 10 fps while hovered, drawn
   off in three frames, trailing the disc with `1 − exp(−15·dt)`. Also fixed: `pointerleave` reset
   the pointer to NDC (0,0) — exactly where the active disc sits — so the next raycast "hovered" it
   while the cursor was up on the nav.
3. **Films ⇄ Games** is the reference's disc-flip instead of a slide across twenty discs: OUT
   0.5 s (the row folds back into depth, the lead swells to 1.45 and turns edge-on, `power2.in`), one
   swap frame while only the edge-on lead is drawn, IN 1.05 s (new lead from edge-on and 1.45 to
   face-on and 1, its neighbours fan in from 0.294 s). The copy leaves with the discs and the new
   copy is released at 0.945 s into the IN. The nav dot answers the click immediately.
4. **Text layout** follows the reference: copy top-left (`.5em` inset, `20.8333%` wide) — serif title
   over hairline rows with a tracked-caps label left and the value right; the shelf index
   (`FILMS 01 / 10`) bottom-left; one centred nav (brand · Films · Games, active dot); on phones the
   copy spans the top and the nav docks at the bottom. Type scales with the reference's container
   system (`1em = clamp(992px, 100vw, 3840px) / 120` → 12 px at 1440). Page `#F2F2F2` with a 20 %
   grain layer (`assets/noise.png`). Fonts: Inter Tight + Instrument Serif, both SIL OFL 1.1,
   vendored in `/fonts` with their licences (PP Neue Montreal / Eiko / Museum are proprietary and not
   shipped).
5. **Curator's rating + note, bottom centre** — the reference's review block (stars, tracked-caps
   source line, serif uppercase quote balanced over two lines), carrying Rayina's own rating instead
   of a critic's. Data lives in `content/notes.json`, deliberately NOT in `shelf.json`, which
   `tools/fetch-covers.py` regenerates (schema: `content.md`). A null rating hides the whole block
   for that title. The stars are one element masked by a repeating star whose width is the rating
   (`starsWidth`), so 8.5 shows a true half star. The note, its label and the position index all
   start with the title instead of trailing the cascade, and the star meter wipes in from its left
   edge while it fades rather than popping on.
6. **A flipped disc stays interactive.** The invisible pick mesh was single-sided, so once a disc
   showed its back the raycaster could not hit it: no hover, no scribble, no click to flip it back.
   It is double-sided now, and the press UV is mirrored on the back so the tilt stays in screen
   space.
7. **Both shelves run oldest → newest by release year** (`content/shelf.json`, and the same sort in
   `tools/fetch-covers.py` so a regenerate keeps it; same-year titles keep their catalogue order).
8. **Input is ignored until the intro lands.** Scrolling during the loader/fan-out moved the active
   index, and the intro pose (rise + edge-on turn) belongs to the active disc — so the next disc
   inherited it and jumped up-right out of its slot, once per load. The reference blocks input
   during preload too. Regression check in `verify`.
9. **The charcoal hover ring** (the reference's scribble), first listed as not built, is built — see
   item 2.

---

## 4. Deviations from the spec, and why

- **The detail flow is a hash router in one document, not Barba** (`#/<item id>`, unknown id
  ignored). Barba is not vendored, there is no second HTML to fetch and `tools/serve.mjs` has no
  history fallback. `discactivate` is answered by `src/main.js`; the event payload is still
  `{ index, section, item }`. Open pushes one history entry, scroll-next replaces it, so browser
  Back always returns to the shelf; a deep link has no entry to pop, so Back rewrites the URL.
- **The canvas is not carried between documents** (`motion-spec.md` §11.6). The shelf canvas never
  leaves its element: the disc leaves on it and the page fades in over it; the shelf loop parks
  while the page is open and restarts in `enterFromDetail`. `carryZIndex` / `readyTimeout` of
  `zn` are therefore not carried in `DETAIL`.
- **The title wordmark is text** in the display face (the reference asset is `vector.webp`, type).
- **Next title** is the following item in the same section, wrapping.
- **Out of scope, not built:** roulette (`motion-spec.md` §13.6), trailer lightbox, external-link
  buttons, awards / synopsis, touch layout keys, the nav film list, Lenis. No synopsis is invented:
  the copy under the still is the curator's rating and note, omitted without data. A title with
  no `assets/stills/<id>.webp` has no still section and no ink.
- **The ink is driven by `scrollY` through a pure mapping**, not a ScrollTrigger scrub
  (`progress()` in `src/detail/ink.js`); same result (§12.3), no plugin, unit-testable.
- **§12.3 elides terms; they are reconstructed from `R`.** `rest` = `height·(1 − peek)`; the
  "nothing eaten" level and the "fully gone" level `b` sit one noise reach (`wander·height·√2·max(mean,
  1−mean)/spread`) below / above the box; `m` (surge px) = `surge·peek·height`; `center` is a dome
  that eats the middle first. The hero and the still share one pinned (`position: sticky`) stage and
  the runway is `height + m`, so `--dissolve-apron` = `m`, `--dissolve-overlap` = the hero height,
  `--dissolve-bleed` = 10 % of it, `--dissolve-rest` = the rest level. The noise hash, domain warp
  and walker are written from the §12.4 table (the reference's were not transcribed). Unread keys
  of `R`: `reach`, `edge`, `below`, `lifeEdge`, `bleedSafety`, `safety`, `simplify` and every
  cursor key — **cursor drops (`§12.4`) are not built** (`INK.cursor` is 0).
- **Scroll-next draws no rules and no push-fill**; the label is the always-present link. The
  disc's rest size is `min(discVh·vh, discVw·vw)` with its top `discTop` em from the canvas top
  (the reference's use of `discTop` / `canvasTop` is not in §13.3's readable form).
- **The `default` cross-fade's in-duration is `fallbackFade` (0.4 s)**: §11.1 gives `0.4` out and
  starts the enter at `0.4`, and the duration comes from `gsap.defaults` (`durationDefault`),
  which was not extracted.
- **Stills are normalised with `tools/build-stills.py`**: bars removed, 16:9 crop on `focal`,
  Lanczos to 2400×1350. "Never upscales" cannot hold literally for a fixed output size, so a
  source under 1920×1080 after bar removal is written and marked `low-res` instead
  (`kingdom-come-deliverance` is, at 1657×932).
- **Existing verify checks changed:** a click on the active disc now opens its page, so "clicking a
  disc flips it over" clicks a neighbour, and the press-UV check closes the page it opens.
- **The critic row is not built, and nothing is invented to fill it.** Every entry in
  `content/shelf.json` ships `quote: null` because these are real works and a fabricated pull quote
  would be a fabricated attribution (no source code reads `quote` / `quoteSource`). The reference's
  two-card critic row (`motion-spec.md` §10) is therefore absent; its slot, `.testimonial_wrap`,
  carries the curator's own rating + note instead (§3, item 5), which is one `.testimonial` block,
  not a pool of review slots. Every `.testimonial` is flagged `together` (`TOGETHER` in
  `src/text/reveal.js`), so it starts with the title instead of after the 0.06 s group gap; the gap
  logic is real and unit-tested with three synthetic groups (`planReveal`) but unused by the page.
- **The counter clamp is viewport + nav only, not disc-aware.** `motion-spec.md` §2.6's prose claims
  the clamp also stops the counter going "through the disc centre"; the verbatim code it gives only
  knows the nav and the viewport, and the two are not reconcilable while the lead disc is still
  rising and its projected centre is near the bottom edge (measured overlap at P ≈ 0.22–0.26). The
  code follows the reference's code; the harness asserts the property the clamp actually provides —
  the counter never leaves the 1440×900 viewport on any frame.
- **Intermediate orbit beats are cut short.** Each beat's tween uses `overwrite: true`, so a beat
  that has not finished when the next one fires does not reach its target. Measured settled angles
  are 0.25 → 0.436 → 0.75 → 0.999 π rather than a clean 0.25 → 0.5 → 0.75 → 1. This is the
  reference's behaviour, not a shortcut.
- **The position moves on the snap spring, not a proxy tween.** `motion-spec.md` §3.9's `mr()` tweens
  a value with `discGlide`; §3.5 specifies a damped harmonic spring (ω = 9.5, exp(−12·dt)) for the
  same job, and the tests assert the spring. The spring wins. `snapProfile()` still returns the
  specified per-source `duration` and it is locked by tests, but only `kick` is consumed at the call
  site — a second duration-driven driver would fight the spring.
- **Flow-velocity decay reuses `friction` (0.89 per 60 Hz frame).** The reference states `Ce` is
  "already decayed" but never gives the coefficient, and 0.89 is the only friction constant in the
  verified config. Using it keeps a single decay law rather than inventing one.
- **`.info-content_panel` → `.experience_info__field`.** The rule re-sort (`motion-spec.md` §6.1)
  looks up the box a rule belongs to by class. The local markup already names it
  `.experience_info__field`, so the selector follows local naming. Observable behaviour is identical.
- **Lenis is not used.** The carousel is wheel/drag driven and blocks page scroll itself
  (`implementation.md` §1).
- **Config keys the build does not exercise are absent.** The reference's separate coarse-pointer
  "touch layout" keys (`touchFit`, `touchPeek`, `touchGap`, `touchDepth`, `touchActiveScale`, …) are
  not carried as dead config; `src/disc/config.js` also exposes 31 `data-disc-*` overrides against
  the reference's 34.
- **Film covers** were supplied via `assets/covers/incoming/*.jpg` (no TMDB key). Covers are
  third-party artwork — do not publish with them (`content.md`, README "Licence").

---

## 5. One addition that is not in the spec

**A legibility scrim behind the copy column** (`styles/page.css`, `.info-head::before`): a radial
gradient anchored at the column's top-left corner that fades from the page colour (`#F2F2F2`) to
transparent.

The ribbon's left-hand discs reach into the copy column — that is the specified arc, and it is
exactly what makes the curve read as a curve rather than a row running off-screen. So body copy lands
on artwork, and the palette is `#000` on the page colour by design. On the settled frame at index 2
in the first pass, "DRAMA, ROMANCE · 102 MIN" and "CHUNGKING EXPRESS" sat black-on-green artwork: a
WCAG 1.4.3 failure on precisely the frames the carousel exists to produce.

The scrim is **invisible against the page** — it only does anything where a disc is behind the text —
and it touches no geometry, no type size, no motion constant and no DOM. It is the one place this
build departs from "implement the spec numbers exactly", and it departs only to keep text readable.
Delete the rule to get the unmodified look.

---

## 6. Third pass — frames of the live page against frames of this build (2026-10-15)

Method: the same scripted flow (load → click the active disc → scroll → push at the end →
leave) recorded on `a24.raviklaassens.com` and on this build, 1440×900, extracted to 10–20 fps
contact sheets and read side by side; plus a DOM / computed-style dump of the reference's
`[data-scroll-next]` section at rest. Earlier passes had read the bundle; this one had frames.
What the frames showed, and what changed:

1. **Scroll-next was the biggest gap.** The reference's end-of-page is a warm grey slab
   (`rgb(214 211 209)`, 124 vh) of five rows with a hairline through the middle of each; the next
   title is set in 72 px serif **on rules 3 → 5, every line off-centre** (measured −240 px / +282 px
   at 1440); the disc lives in the **lower half** (its own canvas, `canvasTop .5`) and shows only a
   cap. This build had a 160 vh page-coloured section with a 1080 px disc filling the window and a
   plated label over it. Now: `styles/detail.css` `.detail-next*`, markup in `index.html`, one
   masked line per rule built in `src/detail/view.js` (`titleLines` in `copy.js`), rules grow from
   the centre and words rise when a third of the slab is visible, and on exit the words rise out
   and the rules collapse `from: 'end'` (`next.js`, `exitRuleDuration`). The disc is sized from the
   canvas (`discVh` is a share of the canvas, not the window) and its top edge sits half-way down
   it (`discCap`, inferred from a screenshot, not read from source).
2. **Open: no ghost of the disc under the page.** The page used to fade in over a still-visible
   shrinking disc, so the disc showed through a half-opaque layer for ~0.25 s. The reference carries
   the canvas above the page (§11.6, z-index 60). `openDetail` now keeps the canvas above the page
   (`html[data-exiting]`) until the disc has left, and releases the copy *after* the page has
   faded in (`pageReady`, §11.1) instead of with it.
3. **Ink at rest.** On arrival this build's edge surged up to ~60 % of the window and took ~6 s to
   settle; the reference shows a low wide hill of still, ~4–9 % of the height, from the first
   second. `INK.peek` is 0.04 (not R's 0.19, which the live frames contradict) and `evaluate()`
   holds the wander and the dome to 30 % / 40 % at rest, growing to R's full values as the edge
   eats up the page. The scroll behaviour (the big organic edge) is unchanged.
4. **Disc frustum culling is off on the scroll-next disc.** With only a cap in frame, which parts
   were culled — and so how many geometries/textures were uploaded — depended on the tilt of the
   moment (`verify` saw 7/8 and 6/8 across rounds). Deterministic now.
5. The whole slab is the next link (`cursor: pointer`) rather than a plated label; the harness
   clicks the link at its centre.

Verified: `npm test` 83/83 (one new, `titleLines`); `npm run verify` 89/89 on the final run. Two
earlier runs failed one shelf timing check each (arrow-key step, sustained-scroll p95 100 ms)
while a second Chromium was alive — the same load flake §1.1 records.

**Seen on the reference, not built (and why):**

- **Loading word in the nav during every navigation** — "Developing ↻" on open, "Splicing ↻" on
  next/back. This build shows it only during the intro.
- **Detail-page controls** — WATCH ONLINE / GET IN BLU-RAY, trailer, the four `+` corner marks
  animating in sequence, "An experiment by …" credit. Links to someone else's storefront have no
  honest equivalent for a personal shelf; the corner marks exist but are not sequenced.
- **Large floating serif words over the still** ("IT'S" / "CALLED") with parallax — the still's
  quote here is one centred line.
- **Return transition** matched closely in the frames (page fades ~0.4 s → blank → lead disc grows
  from the centre, neighbours fan in, copy lands last); nothing changed.
- Whether the reference's disc really cuts out within ~100 ms on click or the capture is dropping
  frames is not established; this build follows the spec's timeline (press → spring → exit).

### Fourth pass — push ring and the nav on a detail page (2026-10-15)

Two gaps a reader of the live page sees at once, found by the owner:

- **The ink ring on the next disc.** Pushing at the bottom of the live page draws a black, hand-drawn
  ribbon around the next disc (config `fill*`, motion-spec §13.3). Built: `writeFill` in
  `src/disc/scribble.js` (the hover scribble's ribbon, one loop, exactly `meter` of a turn), drawn in
  `src/detail/next.js` into the disc's own plane at `fillFps` 10 with fresh jitter. Measured on the live
  page at 1440 × 900: the stroke is anchored at 150° (lower left) and its tip grows clockwise over the top.
  Test: `the push ring is anchored at 150° …`.
- **Films / Games on a detail page.** The live nav stays on a product page. Ours was hidden there. Now it
  stays (hidden again on phones, where the nav docks at the bottom): a click closes the page, and the
  shelf lands on the section that was asked for (`wantSection` in `src/main.js`).
- **Disc size and tilt in the next slab**, re-measured against frames of the live page in the same push
  state: `discVh` is applied to the window (× .745, fitted at 1440 × 900), `discCap` .52, and the rest
  tilt-Y reads 0 on the live page (the cap is symmetric about the centre; −30 puts it ~90 px right).
  **shortcut:** the .745 and the 0 are fitted to one viewport, not read from the reference's source.
  The pushed chord is still ~10 % narrower than the live page's (806 vs 892 px at row 895).

### Fifth pass — why the page appearing was not smooth (2026-10-15)

Measured on the live page and on this build, same machine (Intel UHD, headless Chromium with
`--use-angle=gl-egl`), click on the centre disc → 3.5 s, with a `long-animation-frame` observer, an rAF
logger on every container/nav/canvas, and a hook on `uniformMatrix4fv` to read the disc's scale per frame.

- **The timelines already agree.** Barba hooks on the live page: `leave` at 44 ms, `afterLeave` at 1122 ms
  (= press .12 + spring .16 + exit .8); page fade .31 s from the hand-over; the canvas rides in
  `div[data-disc-carry]` at z 60 until the disc is ~0. Ours: hand-over ~660 ms, fade .35 s, canvas z 60
  until the exit has played, then `data-covered`. The disc's scale curve matches to ±5 % until ~900 ms.
- **The difference was a main-thread stall.** On this build the scroll-next disc was built as soon as the
  page was visible and its first `render()` linked every program in one task: **1.9 s** in `next.js frame`,
  at the moment the copy starts to rise. The live page has no long task in the 3.5 s after the click — its
  next disc is created in the hidden incoming container and its link cost sits inside the 0.6 s hold
  before the exit (and `idleBoot` 2500 ms).
- **What was changed** (`src/detail/next.js`, `src/disc/config.js`):
  1. `compileAsync` before the first frame, **twice**: once for the canvas, once with a 1 × 1 render
     target bound. The transmission material draws the scene into a *linear* target first, which is a
     second program per material (9 → 18); `compileAsync` builds only the variant of the bound target, so
     the old single call left 6 programs and 6 textures to the first visible frame (721 ms).
  2. The map uploads (`initTexture` on every material map) happen at build, not on the first visible frame.
  3. **`idleBoot` (2500 ms, §13.3)**: the build waits that long after the page appears **and** for 1.2 s
     without scroll/key input, unless the section is actually on screen. With it the first 3.5 s after a
     click have no long frame, and the build does not land in the middle of a scroll (the first try, a
     bare 2.5 s timer, did, and the "ink progress rises with scroll" check read a stalled sample).
  Check added: `the next disc is not built while the page is still arriving`.
- **Still true:** when the build does run (≈ 3.5 s after the click) this iGPU shows ~100–250 ms frames for
  about two seconds. Compiling one mesh at a time with a pause was tried and did not help, so it was
  dropped. It lands while the page is at rest, not in the transition.
- Not built (unchanged): the nav "Developing ↻" word between hand-over and page-ready (the live page
  swaps "Films Television" for it at ~860 ms and back at ~2.2 s).
- **The page "reloaded" visibly on open** (owner, same day). Frames of this build showed the detail page
  fading in WITH its finished copy (rules, `1957 / Drama / 96 min`, the title) around the still-large
  disc, then `view.enter()` — which ran after the fade — hid it and replayed it. The live page fades in a
  container whose copy is already in its start state. Now `view.enter({ hold: true })` primes the lines
  (masked) and rules (unborn) before the fade and `view.play()` runs the reveal when the page is up
  (`src/detail/view.js`, `openDetail` in `src/main.js`). Check: `the page fades in with its copy
  already masked`. Scroll-next swaps already primed and faded in the same tick; unchanged.
