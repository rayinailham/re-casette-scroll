# PROMPT — build the detail flow

Brief for a coding agent working in this repository. Self-contained apart from the documents it tells
you to read. Status: **not built.** When you finish, say so at the top of this file with the date.

## 1. Mission

The shelf is complete (20 discs, loader, carousel, copy engine). It stops at a click: the active disc
fires `discactivate` and nothing listens. Build what the reference does after that click — studied
and recorded in `motion-spec.md` §11–§13 — using this project's own content:

1. **Open**: clicking the active disc presses it, turns it edge-on and shrinks it away while the
   shelf copy drains, then reveals a **detail page** for that title.
2. **Ink**: on the detail page the hero is eaten from below by an organic, boiling `clip-path` edge as
   you scroll, uncovering a full-bleed **still** of the work.
3. **Next disc**: the page ends in a second disc that arrives, spins with scroll velocity, and, when
   you push past the end, spins away and loads the next title.
4. **Close**: back (button, `Esc`, browser Back) returns to the shelf — the disc grows back into its
   slot and the copy lands with it.

Behaviour and intent: `design-system.md` §4.8. Numbers and sources: `motion-spec.md` §11–§13.

## 2. Read first, in this order

1. `README.md` — run commands, subsystem map, `?diag`.
2. `design-system.md` §4.8, §5 — what the three behaviours are *for*.
3. `motion-spec.md` §11, §12, §13 — every number. Also §3.5/§4.4/§5.3 for the shelf pieces you reuse,
   §6.6 for the `out()` / `release()` pair you must call.
4. `implementation.md` §11 (reduced motion), §13 (failure modes), §15 (verification).
5. `build-notes.md` §1 (budgets you must not regress), §4 (deviations — you will remove one).
6. `content.md` §1–§3 (data files, stills).
7. The code you will touch: `src/main.js`, `src/disc/gallery.js` (`activate`, `switchSection`,
   `fanOut`), `src/disc/config.js`, `src/text/reveal.js`, `styles/page.css`, `tools/verify.mjs`.

Do not read the reference bundle; `motion-spec.md` already carries what you need. If a number you
need is not there, stop and report it instead of guessing.

## 3. Constraints

- Vanilla ES modules, import map, **no build step, no new dependency**. `three` and `gsap` are
  vendored (`vendor/gsap/ScrollTrigger.js` exists but is not in the import map — you may add it, you
  do not have to).
- No git or GitHub operation of any kind. No commits, branches or staging.
- Do not hand-edit `content/shelf.json` (generated) or anything under `vendor/`.
- Smallest patch that fully solves each work package. Reuse existing modules (`layout.js`, `scroll.js`,
  `impulse.js`, `materials.js`, `reveal.js`, `eases.js`) before writing new ones.
- Code comments cite spec sections by number (`motion-spec.md §12.3`), like the existing code. Add,
  never renumber, a section.
- **The shelf scene is never rebuilt.** No new geometry/texture/program on the shelf renderer when
  opening or closing a detail page (`verify` already asserts this for section switches).
- Every new non-trivial branch gets a unit test or a `verify` check. Pure maths goes in modules that
  import nothing from `three`, so `npm test` covers it.
- Never claim success without running `npm test` and `npm run verify` and quoting the result.

## 4. Decisions already made — do not re-litigate

| Question | Decision | Why |
|---|---|---|
| Barba or own router? | **Own, hash-based**: `#/<item id>`; unknown id → ignored. One document, two views. | Barba is not vendored, the page has no second HTML to fetch, and `tools/serve.mjs` has no history fallback. |
| Move the canvas between DOMs (`motion-spec.md` §11.6)? | **No.** The shelf canvas never leaves its element. The "carry" exists in the reference only because it swaps documents. | Single document. The disc leaves on the same canvas and the detail view fades in over it. |
| Title wordmark image (`vector.webp`)? | **Render the title as text** with the existing display face. | The reference asset is just type. |
| Next title | The following item **in the same section**, wrapping. | Shelf order is the oldest → newest year order; wrap keeps the page endless. |
| Roulette (`motion-spec.md` §13.6) | **Out of scope.** | Reference uses it only in random mode on its 404 page. |
| Trailer lightbox, "watch online" / "get on Blu-ray" buttons, awards | **Out of scope.** | Not in this project's data; nothing is invented. |
| Ink driver | Direct `scrollY` → progress mapping (a pure function), **not** ScrollTrigger scrub. | Same result (`motion-spec.md` §12.3), testable without a browser, no plugin. |
| Copy under the hero still | Curator rating + note from `content/notes.json` (all 20 have one). An optional synopsis is **not** invented; the section is omitted without data. | `build-notes.md` §4: no fabricated attribution. |
| Still images | `assets/stills/<id>.webp` by convention (`content.md` §3). Missing file → no still section, no placeholder. | `PROMPT-AGY.md` produces them separately; the code must work before they arrive. |

## 5. Work packages

Each ends with "done when". Do them in order; run `npm test` after each.

### WP0 — still normaliser (`tools/build-stills.py`, new)

Reads `assets/stills/incoming/<id>.*` and `assets/stills/manifest.json`, writes
`assets/stills/<id>.webp` (2400×1350, RGB, WebP q≈82): remove solid black letterbox bars, then a
16:9 crop centred on `focal` (clamped), resized with Lanczos. Never upscales: a source whose bar-free
16:9 crop is below 1920×1080 is written anyway and its manifest `status` set to `low-res`. Updates
the manifest in place (`file` → the `.webp`, `source_size` untouched). Flags: `--only <id>`,
`--check` (verify outputs exist and are 2400×1350, fetch nothing). Pillow only — it is already a
dependency of `tools/fetch-covers.py`.

Done when: `python3 tools/build-stills.py --check` exits 0 on a synthetic fixture directory you create
under the scratch area (not in `assets/`), a 2.39:1 bar-padded fixture is cropped correctly, and
`python3 -m py_compile tools/build-stills.py` passes. The real stills are supplied later; do not
create placeholder images.

### WP1 — route + view shell

- `src/detail/route.js` (new, pure): `parseHash(hash, ids) → id | null`, `hashFor(id)`,
  `nextId(items, id)` (same section, wraps). No DOM.
- `src/main.js`: on `discactivate` call `open(item)`; on `hashchange` / `popstate` reconcile the view
  with the hash. A transition in flight queues only the **last** requested route.
- Deep link `#/<id>`: the loader and intro run as today (the section is chosen from the item, without
  overwriting the persisted `shelf:section` unless the user later switches); once `gallery.ready`
  resolves the detail view opens **without** the disc exit animation.
- Shelf `main`/`aside` get `inert` + `aria-hidden` while the detail is open; `document.title` becomes
  `<title> — Rayina Ilham` and is restored on close.

Done when: unit tests cover `parseHash`/`hashFor`/`nextId` (wrap, section boundary, unknown id), and
a `verify` check opens `#/<id>` directly and reads `data-view="detail"`.

### WP2 — disc exit/enter on the shelf (`src/disc/gallery.js`)

Add `exitToDetail(opts) → Promise` and `enterFromDetail(opts) → Promise` to the object
`createGallery` returns, following `motion-spec.md` §11.7 (`_r` / `vr`) with the §11.4 `zn` numbers
as new `DETAIL` config keys in `src/disc/config.js` (copy, do not retune): snap to the active index,
press `.94` → spring `1.015` while the others fade, then `active → .001` with `spinY` to the next
`π/2 + kπ`; `onHandOver` fires at `min(m + pressTime + outDuration, h + exitDuration)`. Enter: pose
the lead at `.001`, upload textures before the first visible frame, wait `artTimeout`, then grow with
`discGlide`, others from `inDuration · .1`, release the copy at `inDuration · .9`. Reduced motion:
the immediate branches in §11.7. While the detail is open the shelf render loop **pauses** (no
`renderer.render`), and resumes in `enterFromDetail`.

`main.js` order on open: `discTransitionsFlow.out()` ∥ `exitToDetail({ onHandOver })`; at hand-over
show the detail view and fade it in over `detailFade` (`0.35`). On close: fade the detail out
(`0.35`), `scrollTo(0, 0)`, `enterFromDetail`, then `reveal.release()`.

Done when: unit tests assert the exit-spin target formula (`π/2 + kπ`, ≥ `spinY + exitSpin`), and
`verify` shows, over one open/close, `scene.children.length`, `geometries`, `textures` unchanged and
shelf `frames` not advancing while the detail is open.

### WP3 — detail view DOM, CSS, copy (`src/detail/view.js`, `styles/detail.css`, both new)

Built from `shelf.json` + `notes.json` (reuse `fields()` / `noteOf()` from `main.js` — move them to
a shared module only if you need to; keep their behaviour and `verify`'s copy checks intact):

    section 1  hero   [data-dissolve-track] > [data-dissolve]     title (h1, centred), rule, credit rows
                                                                  (Directed by / Studio, Starring / Edition),
                                                                  metadata rows (Year, Genre, Runtime),
                                                                  four corner "+" marks
    section 2  still  [data-dissolve-bleed], an <img> parallaxed  ±10 %; the curator quote centred over it
                                                                  when the note exists
    section 3  note   rating stars + note (omitted if both absent)
    section 4  next   [data-scroll-next] (WP5)

The page uses the shelf's tokens and fonts (`styles/tokens.css`), not new ones. Copy reveals on
enter reuse the mask/line approach and the `energy` ease from `src/text/reveal.js`; do not fork the
shelf engine — if its `createReveal` is too tied to `.experience_info`, expose the smallest helper
and test it. All text lands via `textContent` (titles come from JSON). A **Back** button
(`data-detail-back`) and `Esc` close the view; focus moves to the `<h1>` on open and to the gallery
on close.

Done when: `verify` asserts the detail copy equals the item's fields in `shelf.json`, no title or
rating string appears in the static markup, and the still `<img>` is absent (not broken) for an id
with no `assets/stills/<id>.webp`.

### WP4 — ink dissolve (`src/detail/ink.js` pure, `src/detail/dissolve.js` DOM)

Implement `motion-spec.md` §12 with the `R` values as `INK` config:

- `ink.js` (no DOM): the seeded two-layer value-noise field, `φ`-blended; the phase blend `n0·cos φ + n1·sin φ + slope` (`Ze`);
  marching squares on the 16 px grid with `margin`; link segments into closed loops; drop loops under
  `minBlob`; emit one `evenodd` SVG path. Deterministic for a given `seed`, `φ`, level and box.
- `progress({ scrollY, top, height, vh, finish })`: the §12.3 mapping of document scroll to `V ∈ [0,1]`.
- `dissolve.js`: runs a `gsap.ticker` callback only while the section is within range (§12.3), writes
  `style.clipPath = path(evenodd, "…")` and `data-dissolve-ready`, skips a frame when the §12.3
  deltas are below threshold, adds the scroll-velocity agitation, and writes the four CSS variables
  to the track. Cursor drops: implement §12.4 *only if* WP4 is otherwise done and within budget —
  otherwise leave `cursor: 0` and say so in the report.
- Gates (§12.1): no effect under reduced motion or when `CSS.supports('clip-path', 'path("M 0 0 L 1 0 Z")')`
  is false; the hero is then simply a normal section above the still.
- Clear `clipPath` and tear the ticker down on close.

Done when: unit tests show determinism (same inputs → identical path), no `NaN`, every loop closed,
the kept area monotonic in level over a sweep, `minBlob` filtering, and `progress` clamping; `verify`
reads `clip-path` at three scroll positions on a detail page and requires it to be non-empty and to
differ between them, and `''` after close.

### WP5 — scroll-next disc (`src/detail/next.js`)

Implement `motion-spec.md` §13.1 (next mode only), §13.4, §13.5 with the `Y` values as `NEXT`
config. Its own small scene and canvas inside `[data-scroll-next-canvas]`, built with the existing
`buildDiscGeometries` / `buildMaterials` / `buildEnvironment` / `buildLighting` and the next item's
cover texture (`item.cover`). One disc, no shelf discs. Built lazily when the section is within
`bootMargin` of the viewport, **disposed** (geometry, materials, textures, renderer) on close or
route change.

- Pose per §13.4 from the section's scroll progress; spin from scroll velocity; idle spin.
- Push meter per §13.5: wheel / touch / `ArrowDown` / `PageDown` / `Space`, only at the end of the
  page, only after `pushSettle` and `pushGap` or a surge, drain after `pushHold`; the arriving flick
  never counts.
- At `De ≥ 1`: the exit timeline (§13.5), and at `exitGo` navigate to `hashFor(nextId)` — the detail
  view cross-fades to the next title (`0.4` out, in from `0.4`, as §11.1 `default`), `scrollTo(0, 0)`,
  ink and next disc rebuilt for the new item.
- A visible, focusable link (`[data-scroll-next-link]`, `href="#/<next id>"`, `aria-label`
  "Next film: …" / "Next game: …") always exists — it is the reduced-motion path.
- Click on the disc silhouette (the 48-point polygon test in §13.5) triggers the same exit.

Done when: unit tests cover the push meter as a pure reducer (arriving flick ignored, second gesture
counts, drain, fill → exit once, no re-entry while leaving) and `nextId` wrapping; `verify` scrolls
to the end, sends wheel pushes, and observes the hash change to the next id.

### WP6 — prefetch, reduced motion, accessibility, diagnostics

- Prefetch: 450 ms after the active disc settles, `new Image()` the still of the active item
  (once per id); on a detail page, idle-prefetch the next item's still and cover (§11.2).
- Reduced motion (`implementation.md` §11 style table, add rows): transitions become a 0.15 s fade,
  no ink, no parallax, no push meter, no second WebGL context; next is a plain link.
- `?diag` gains, in the one JSON snapshot: `view` (`shelf`|`detail`), `route`, `ink`
  (`{ progress, level, clip }`), `next` (`{ progress, push, leaving, built }`), `transition`
  (`{ running, last }`). Document them in the `README.md` instrumentation table.

Done when: a reduced-motion `verify` run opens and closes a detail with no `clip-path`, no second
canvas, and the link works.

### WP7 — verification, budgets, docs

- New `tests/detail.test.mjs` for all pure modules above; `npm test` stays green.
- New `tools/verify.mjs` checks (same `check(name, pass, detail)` style): open from the shelf; hash
  and view state; shelf frames pause; ink clip changes with scroll and clears on close; push →
  next id; back restores the section, active disc and copy; **20 open/close round trips leave
  `textures`, `geometries`, `programs` and the number of `<canvas>` elements bounded** (no GPU leak
  from the scroll-next scene); deep link; reduced-motion branch; console clean.
- No regression of the budgets in `build-notes.md` §1: scroll fps check, switch frame times, draw
  calls. Add one new measurement — frame ms p50/p95/max while scrolling a detail page with the ink
  active — and report it. If the iGPU cannot hold the same p95 as the shelf scroll check, **report
  the measured numbers**; do not loosen an existing threshold.
- Docs, in the same change: `README.md` (subsystem table row → real files, documents table, `?diag`
  keys), `build-notes.md` (§1 numbers, §4: remove the "No detail routes" bullet, add the decisions in
  §4 above as deviations), `implementation.md` (§11 reduced-motion rows, §15 invariants → test names),
  `content.md` §3 (only if the stills handling changed). `motion-spec.md` is edited only if a number
  in §11–§13 proved wrong — then fix it there and say which.

## 6. Out of scope

Roulette/random mode; trailer lightbox; external-link buttons; awards/synopsis authoring; touch
layout keys (`touch*`); the nav dropdown film list; Lenis; any change to the shelf's motion.

## 7. Report

Finish with the repository's usual format — `Changed:` (file → summary), `Verified:` (command →
result, including `npm test` pass count, `npm run verify` pass count and the new frame-time numbers),
`Notes:` (every acceptance line above you did not meet, every choice you made that this file left
open, anything that needs a human: e.g. the stills not yet present).
