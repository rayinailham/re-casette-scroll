# Rayina Ilham — Shelf

A WebGL disc carousel for a personal media shelf: ten films and ten games on one curved ribbon of
twenty discs, curated by Rayina Ilham. Films and games sit side by side behind a switcher, sharing
one carousel, one arc function and one wobble integrator. The motion system is studied from
**https://a24.raviklaassens.com/** (Ravi Klaassens' A24 disc gallery) and rebuilt with own artwork,
type and content.

Stack: `three` + `gsap` (CustomEase, SplitText), vanilla ES modules, import map, no build. Both
libraries are vendored under `vendor/`. Lenis is not used; the `data-lenis-prevent*` attributes on
the gallery element are the reference's markup and are inert here.

## Running it

```bash
npm run serve                             # http://localhost:4173
node tools/serve.mjs 4173 --live          # …with live reload (injects an SSE client into HTML only)
npm test                                  # unit tests, no browser
npm run verify                            # browser checks; asks the OS for a free port, so it is
                                          # safe to run while a preview server is open
```

`npm run verify -- --gl=sw` runs it on SwiftShader instead of the iGPU. Current pass counts and
measurements: [`build-notes.md`](./build-notes.md) §1.

URL flags: `#/<item id>` deep-links a detail page (the shelf boots on that item, the page opens once the loader lifts). `?diag` turns on the instrumentation (below). `?shelf=films` / `?shelf=games` deep-links
a collection; the last-viewed collection is persisted in `localStorage` (`shelf:section`).
`?diag&autoswitch` switches collection on its own once the intro has landed, so the harness can
measure a switch with zero CDP input traffic in the window — a Playwright click injects enough
main-thread work to look like a dropped frame.

## Naming correction (read first)

The original request called the reference a **cassette**. It is not. The 3D object is an **optical disc**
(DVD / Blu-ray / CD):

1. The geometry is `RingGeometry` + four `LatheGeometry` lathes (front face, back face, edge bevel,
   centre hub, matrix ring, frosted clamp ring, centre hole). No shell, no window, no twin spool, no
   tape path.
2. The literal strings `cassette`, `tape`, `reel`, `spoke` occur nowhere in the gallery bundle
   (zero-hit searches: `evidence.md` §5).
3. The shipped render maps film posters onto the disc face.

"Cassette" survives only in the *loader* vocabulary — the word beside the `Projecting ↻` spinner
cycles `Rewinding / Spooling / Threading / Splicing`, which is projector language, not cassette-deck
language. Everything here calls it a **disc**. For a cassette-shaped prop the motion system transfers
unchanged; only `disc-3d-spec.md` changes (its §6).

## Reference stack (fingerprint-verified)

| Concern | Library | Evidence |
|---|---|---|
| Build | Astro (output from Webflow export) | `/_astro/*` asset paths, `data-barba="container"` page transitions |
| Tweening | **GSAP** + ScrollTrigger + CustomEase + SplitText | imports in the app chunk |
| Smooth scroll | **Lenis** | `new Lenis({...})` |
| 3D | **THREE.js** `MeshPhysicalMaterial`, PMREM | `RingGeometry`, `LatheGeometry`, `PMREMGenerator` |
| Text | PP Neue Montreal (sans) + **PP Eiko** (serif display) | `@font-face` in stylesheet |

There is **no ScrollTrigger scrub** driving the carousel: the gallery intercepts wheel and pointer
drag and blocks document scroll with `data-lenis-prevent-wheel`. Scroll is an index, not a pixel
offset (`motion-spec.md` §3). What this build uses instead of the reference's stack:
`implementation.md` §1.

## Documents

| File | Owns |
|---|---|
| [`design-system.md`](./design-system.md) | Principles, tokens, component anatomy, the *behaviour and intent* of each animation, the interaction contract. |
| [`motion-spec.md`](./motion-spec.md) | **Every number and verbatim snippet**: easing curves, damping coefficients, timelines, the config object, the DOM/CSS contract of the text engine. |
| [`disc-3d-spec.md`](./disc-3d-spec.md) | Disc construction: hierarchy, lathes, material stack, lighting rig, camera, procedural environment, renderer. |
| [`implementation.md`](./implementation.md) | Dependencies, module architecture, render-loop order, input and porting notes, reduced motion, performance, failure modes, build order, verification. |
| [`evidence.md`](./evidence.md) | Provenance, per-claim verification, corrections, unknowns, negative results, how to re-run the extraction, legal note. |
| [`build-notes.md`](./build-notes.md) | This build only: results, defects found and fixed, changes after comparing with the live reference, deviations from the spec. |
| [`content.md`](./content.md) | `shelf.json` / `notes.json` schema and the cover-artwork pipeline. |
| [`PROMPT.md`](./PROMPT.md) | Build brief for the detail flow (router, disc exit, ink dissolve, scroll-next) — built; see the next row of the subsystem table. |
| [`PROMPT-AGY.md`](./PROMPT-AGY.md) | Brief for the Antigravity agent that finds the 20 detail stills (`content.md` §3). |

Conventions: **each fact has one owner.** A number or verbatim source lives in `motion-spec.md` (or
`disc-3d-spec.md` for geometry/material/light); every other file refers to it by config key or §
number instead of restating it. Source comments cite these files by § number, so section numbers
are stable — add, don't renumber.

## Where each subsystem lives

| Subsystem | File | Spec |
|---|---|---|
| Boot, data → copy fields, curator's note block, section switcher | `src/main.js` | `build-notes.md` §3, `content.md` §1 |
| Loader `P`, beats, odometer, year drum, spinner | `src/disc/progress.js`, `src/preloader/index.js`, `src/preloader/counter.js` | `motion-spec.md` §2.1–§2.5, §2.8 |
| Screen-space anchor, three radii | `src/disc/gallery.js` (`publishAnchor`) | `motion-spec.md` §2.6 |
| Counter orbit, π/4 per beat | `src/preloader/counter.js` (`orbitTo`, `place`) | `motion-spec.md` §2.6 |
| Growth-coupled counter exit | `src/preloader/counter.js` (`armExit`, `driveExit`, `exitCells`) | `motion-spec.md` §2.9 |
| Intro pose (exponents 2.4 / 2 / 3, rise via inverse gallery quat) | `src/disc/intro.js` | `motion-spec.md` §1.2, §2.10 |
| Arc, follow smoother, lean, fan-in stagger | `src/disc/layout.js` | `motion-spec.md` §3.2–§3.4 |
| Wheel / drag / snap spring | `src/disc/scroll.js` | `motion-spec.md` §3.5–§3.7 |
| Flow kick on every discrete step | `src/disc/scroll.js` (`snapProfile`, `kickFlow`), `src/disc/gallery.js` (`moveTo`) | `motion-spec.md` §3.9 |
| Wobble: wipe, press (pick-mesh UV), integrator | `src/disc/impulse.js` | `motion-spec.md` §4 |
| Hover, flip, re-level, section flip | `src/disc/gallery.js` | `motion-spec.md` §5, `build-notes.md` §3 item 3 |
| Hover scribble | `src/disc/scribble.js` | `motion-spec.md` §5.5 |
| Geometry / materials / env / lights | `src/disc/geometry.js`, `materials.js`, `environment.js`, `lighting.js` | `disc-3d-spec.md` §2–§5 |
| Two-group text engine, masks, `autoAlpha`, cumulative stagger | `src/text/reveal.js` | `motion-spec.md` §6 |
| Config + `data-disc-*` overrides | `src/disc/config.js` | `motion-spec.md` §7 |
| Detail router (`#/<id>`), open / close / swap, prefetch, history | `src/main.js`, `src/detail/route.js`, `src/detail/copy.js` | `motion-spec.md` §11, `build-notes.md` §4 |
| Disc exit / enter, loop parking, deep-link start | `src/disc/gallery.js` (`exitToDetail`, `enterFromDetail`, `holdForDetail`, `poseHidden`, `focusItem`), `src/disc/transition.js` | `motion-spec.md` §11.7 |
| Detail page DOM, copy reveal | `index.html` `[data-detail]`, `src/detail/view.js`, `styles/detail.css` | `design-system.md` §4.8, `motion-spec.md` §6 |
| Ink dissolve | `src/detail/ink.js` (pure field + contour + scroll mapping), `src/detail/dissolve.js` (ticker, `clip-path`, parallax) | `motion-spec.md` §12 |
| Scroll-next disc, push meter | `src/detail/next.js` (own scene, disposed on close), `src/detail/push.js` (pure reducer) | `motion-spec.md` §13 |
| Still normaliser | `tools/build-stills.py` | `content.md` §3 |
| Eases (`discGlide`, `energy`) | `src/anim/eases.js` | `motion-spec.md` §1.1 |
| Instrumentation | `src/disc/diag.js` | below |
| Tokens, layout, preloader CSS | `styles/tokens.css`, `styles/page.css`, `styles/preloader.css` | `design-system.md` §2–§3, `motion-spec.md` §2.5, §6.7 |
| Cover fetch + `shelf.json` generator | `tools/fetch-covers.py` | `content.md` |
| Static server (+ live reload) | `tools/serve.mjs` | — |
| Browser verification harness | `tools/verify.mjs` | `implementation.md` §15 |
| Unit tests | `tests/motion.test.mjs`, `tests/detail.test.mjs` | `implementation.md` §15 |

Other directories: `vendor/three`, `vendor/gsap` (vendored, resolved by the import map in
`index.html`); `fonts/` (Inter Tight + Instrument Serif, both SIL OFL 1.1, with licences);
`assets/noise.png` (grain tile); `showcase-story/` (the showcase-video workspace — recorded takes in
`takes.json`, composition `comp.html` + `motion.js`, 1080×1920 30 fps `draft.mp4`; not part of the
page).

## Instrumentation

Load any URL with `?diag` and `[data-shelf-diag]` carries a compact JSON snapshot a few times a
second. It is the only channel out of the page — no globals ship — and it is inert without the flag.
The anchor, the orbit and the exit each publish a per-frame trace, which is what
`tools/verify.mjs` asserts against.

| Key | Why it is there |
|---|---|
| `p`, `pViolations`, `progressDoneAt` | loader monotonicity and the 2.85 s floor, measured |
| `frames`, `fpsSinceBoot`, `fps`, `frameMsP50/P95/Max` | frame budget |
| `orbit[]` | one frame of the counter: `b` beat, `th` θ, `p` loader progress, `cx/cy` where it landed, `dx/dy` offset from the disc centre, `dx0/dy0` the disc anchor, `dist`, `r/live/rest` the three anchor radii it read, `from/fRest` the `armExit` snapshot, `t` exit progress, `y[]` per-cell `yPercent`, `cl` whether the viewport clamp bound, `bw/bh` the measured box |
| `anchor` | the three projected radii as published, plus `x`, `y`, `ready` |
| `flow` | the flow velocity, so a wheel notch's bank is observable |
| `position`, `target`, `activeGlobal`, `activeLocal`, `section`, `switching` | scroll and section state |
| `pressUV`, `hoverIndex`, `flipped` | the raycast UV the last press fed to the impulse; hover; flipped discs |
| `activeProgress`, `others`, `introLive`, `inbound` | the intro and fan scalars and gates |
| `sceneChildren`, `discNodes`, `visibleDiscs`, `coversLoaded`, `geometries`, `textures`, `programs`, `drawCalls`, `triangles` | the single-scene claim and render cost |
| `reduced`, `coarse`, `dpr`, `size`, `enterMiss` | environment and input mode |
| `view` (`shelf` \| `detail`), `route` | which view owns the screen, and the item id it shows |
| `detailState`, `parked` | the gallery's detail state (`null` \| `exiting` \| `open` \| `entering`) and whether its render loop is parked |
| `ink` `{ progress, level, clip }` | the ink: scroll progress V, contour level in px, length of the written `clip-path` (0 when off) |
| `next` `{ progress, push, leaving, built, mem }` | the scroll-next disc: section progress, push meter, whether it is leaving, whether its scene exists, and its renderer's geometry / texture counts |
| `transition` `{ running, last }` | a route change in flight, and the last one `{ kind: open\|close\|swap, id, ms }` |
| `detailFrames`, `detailFrameMsP50/P95/Max` | the detail page's own frame clock (the shelf's stops when it parks) |
| `samples[]` | switch trace and one-shot notes |

## Licence / attribution

Reverse-engineered for study and reimplementation. The reference site is Ravi Klaassens' A24
fan/award concept built with A24's brand assets. **The A24 name, logo, film posters, PP Neue Montreal
and PP Eiko typefaces, and all film metadata are third-party property and are NOT redistributed
here.** The covers in `assets/covers/` are third-party artwork belonging to the respective studios
and publishers, fetched for personal, non-commercial use. Do not publish this repository with the
images in it — use `assets/covers/incoming/` with your own files, or strip the artwork before
publishing. Vendored code and fonts keep their own licences (`vendor/three/LICENSE`, GSAP's
"no charge" licence in `vendor/gsap/package.json`, `fonts/LICENSE-*.txt`).

Keep the technique; replace the content. If you ship an homage, state plainly that the motion system
was studied from `a24.raviklaassens.com` by Ravi Klaassens — do not present it as your own design,
and do not use A24's assets. Legal reasoning: `evidence.md` §7.
