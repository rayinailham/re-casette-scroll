# Implementation Guide

How to rebuild this from scratch: dependencies, module architecture, the render loop, porting notes
for the parts that are easy to get wrong, and the mistakes that actually bite.

What this file does NOT own — the numbers and the reasons live elsewhere:

    every constant, verbatim source, worked numbers   ->  motion-spec.md
    behaviour, principles, tokens                     ->  design-system.md
    geometry, materials, lights, renderer             ->  disc-3d-spec.md
    this build's status, deviations, measurements     ->  build-notes.md

The readable ports themselves are the modules under `src/` (file → spec map: `README.md` "Where each
subsystem lives"); this file does not repeat their code. Where a port and `motion-spec.md` differ,
`motion-spec.md` wins and the difference is listed in `build-notes.md` §4.

---

## 1. Dependencies

    library              required?
    three                yes — the whole thing (this build: ^0.180.0, vendored under vendor/three)
    gsap core            yes — preloader fan timeline, digit drums, text transitions, spinner
                         (this build: ^3.13.0, vendored 3.15.0 under vendor/gsap)
    gsap/CustomEase      yes — discGlide and energy are the signature curves
    gsap/SplitText       yes — text reveal depends on line splitting + masks
    gsap/ScrollTrigger   no for the carousel — only other page sections
    lenis                no for the carousel (^1.1 if you add it) — the gallery blocks page scroll anyway

Carousel only: `three` + `gsap` + `CustomEase` (+ `SplitText` for the copy). The preloader is a
separate, self-contained module. Modules resolve through the import map in `index.html`; there is
no build.

`RectAreaLightUniformsLib` must be imported **and initialised** or the strip light silently does
nothing (this build: `vendor/three/RectAreaLightUniformsLib.js`, `.init()` in `lighting.js`).

---

## 2. Module architecture

The original collapses everything into one 264 KB chunk. **Do not.** `preloader` must run *before*
`three` finishes evaluating — a static import of `three` from `gallery` blocks the preloader behind a
600 KB parse. The original uses a `window.threeReady` promise and a `try/catch` guard; a dynamic
`import()` is cleaner, and it is what `src/main.js` does (`await import('./disc/gallery.js')`
after the loader has started). The loader imports no 3D at all, so it cannot compute the disc's
screen-space anchor: the gallery writes one shared anchor object every frame and the loader reads it
(§10.1).

---

## 3. Config with DOM overrides

Ship the whole motion system as data attributes — the single best ergonomic decision in the
codebase; every number is retunable without touching JS. Defaults are the config object in
`motion-spec.md` §7; the attribute → key mapping is the table there. `resolveConfig(el)` in
`src/disc/config.js` copies the defaults and overlays every attribute that parses to a finite
number.

```html
<div data-disc-gallery data-disc-gap="2.3" data-disc-depth="1" data-disc-camera-fov="40">
```

---

## 4. Layout module

The arc is five lines (`src/disc/layout.js`). Keep it pure and separate — it is the thing you will
tune most. `m` is the **float** relative index (`index − scrollPosition`), not the integer index —
the fractional part is what produces smooth continuous motion. Scale and follow rate are pure
functions in the same module.

---

## 5. Impulse (wobble) module

`src/disc/impulse.js`: `createImpulse`, `integrate`, `wipeImpulse`, `pressImpulse`. Copy it exactly;
the two-stage decay (velocity damped exponentially, position pulled home linearly) is the whole
design — a real spring overshoots. Source and why: `motion-spec.md` §4.3–§4.5.

---

## 6. Render loop

One rAF. Fixed order. One `dt`, clamped once, passed everywhere.

1. **Input → scroll position** (wheel envelope, drag, friction, snap spring) — §7, §8.
2. **Flow lean and dip** from the scroll velocity.
3. **Hover raycast**, throttled (§8.2).
4. **Per disc**: integrate the wobble (zero it on coarse pointers); blend hover toward its target;
   compose the target transform — arc position + impulse + `activeDiscY` − dip, `rotY = −θ` + lean
   + hover tilt, `rotZ` = −lean × `flowBank`; follow-smooth every channel with
   `α = min(1, dt·k)` (`k` falls with distance, `α = 1` while dragging); scale; write the inner
   `spin` rotation = `spinX/spinY` + push rotation; set `renderOrder`. Verbatim: `motion-spec.md`
   §3.2, §3.3, §4.6.
5. **Gallery transform**, once, not per disc.
6. **Text reveal** if the active index changed.
7. **Render.**

Order matters: input first (so `scrollPosition` is current), then per-disc transforms, then the
gallery transform, then render. Set the gallery transform after the disc transforms and the discs do
not inherit the tilt that frame — the row visibly shudders on the first frame after a resize.

---

## 7. Snap spring

`stepScroll` in `src/disc/scroll.js`; source and damping analysis `motion-spec.md` §3.5.
`dt * 60` in the friction exponent is what makes `friction` a per-60 Hz-frame constant rather than a
per-second one; without it, inertia decay changes with refresh rate.

---

## 8. Input

### 8.1 Pointer

Normalised pointer and the 60 Hz-normalised velocity (stale samples discarded):
`motion-spec.md` §4.1–§4.2. Register `pointermove` with `passive: true` — you never `preventDefault`
here, and passive listeners keep the compositor thread free.

### 8.2 Raycast — throttle it

Raycasting every frame against the invisible pick meshes is wasted work; 30 Hz is imperceptible for
hover and halves the cost (`src/disc/gallery.js` does this). **But** the UV must come from the same
hit that drives the press (§9) — this build takes the press UV from a fresh raycast at `pointerdown`
rather than from the throttled hover result.

### 8.3 Wheel — quantised, with an envelope

Raw `deltaY` is noisy and refresh-rate dependent; the original runs it through an exponential
follower before thresholding (`motion-spec.md` §3.6). `wheelStep` in `src/disc/scroll.js` is a
simplified faithful port — the full `Tick`/`Flick`/`Sustain` control flow was not traced
(`evidence.md` §4.4). Normalise `deltaMode` (line ×16, page × viewport height) before the follower.

`passive: false` — you must `preventDefault` to stop the page scrolling behind the gallery.

Simpler alternative that still feels good: accumulate `deltaY` and step when `|accumulator| > 60`.
You lose trackpad-vs-mouse discrimination but keep the quantised feel.

### 8.4 Stepping — add the kick before you tween

Every discrete move must **impulse the flow velocity** on top of moving the index, or a one-disc step
is invisible in the ribbon's bank — only the index changed, so only the index animates (spec and
numbers: `design-system.md` §4.3, `motion-spec.md` §3.9; code: `snapProfile` / `kickFlow` in
`src/disc/scroll.js`, `moveTo` in `src/disc/gallery.js`).

- The kick lands on the **flow velocity**, never on the position.
- `flick` and the default get `kick: 0` on purpose — a flick already carries velocity, so a second
  impulse double-counts it.
- On the reduced-motion / immediate path, set the flow velocity to `0` explicitly, or the previous
  move's kick leaks into the next one.
- `onIndexChange` is the single place that dispatches the change event the text engine listens for.

### 8.5 The critic row — never ship what you cannot attribute

Slot pool, stars and the two-line quote solver: `motion-spec.md` §10 (verbatim). **Only ship a review
you can attribute.** If the data has no review, writing `[]` marks every slot empty and the row
collapses to nothing — which is the correct behaviour. Never fabricate a pull quote to fill a slot,
and never leave an empty slot visible. (This build has no slot pool — `build-notes.md` §4.)

---

## 9. The press tilt — do not get this wrong

The asymmetry comes entirely from the **raycast UV**, never the cursor position (why:
`design-system.md` §4.4; source: `motion-spec.md` §4.4; pick mesh: `disc-3d-spec.md` §3.4).
`CircleGeometry` UVs run `0…1`, so `uv * 2 - 1` is the hit position in the disc's local frame,
normalised to its radius.

    wrong (cursor-based)                                  right (UV-based)
    vRotY += pointerN.x * pressTilt                       vRotY += uvHit.x * pressTilt
    press the left edge of a disc that happens to be      press the left edge → tilts the opposite
    right of screen centre → still tilts hard             way from pressing the right edge

The cursor version makes every disc react identically regardless of *where on the disc* you touched.
The UV version makes each disc react about its own centre; only that reads as a physical object.

---

## 10. Intro — driven by progress, not a timeline

Pose, exponents, parent-space offset and fan timeline: `motion-spec.md` §2.10; port:
`src/disc/intro.js` (`introPose`, `riseOffsetIntoLocal`). The pose is a pure function of `P`, so it is
unit-testable with no clock.

### 10.1 Publishing a screen-space anchor — required by §10.2 and by the counter orbit

The gallery must expose the lead disc's projected position and **three** radii once per frame,
before the preloader reads it (`publishAnchor` in `src/disc/gallery.js`; verbatim `motion-spec.md`
§2.6). The live radius is what makes the counter's exit smooth; do not return only one radius.
Sample the offsets along **+X in gallery-local space**: measuring in world space gives an arbitrary
number that happens to be a radius today and stops being one when the gallery rotation changes.

### 10.2 The counter — orbit, then leave on the disc's growth

Two independent mechanics share one anchor (`src/preloader/counter.js`; spec and worked numbers:
`motion-spec.md` §2.6, §2.9). Porting notes that are not in the spec:

- **Keep `anchor.live` a projection, not a scale value.** `live` is measured through the camera
  every frame, so it already accounts for the gallery's rotation, the zoom, the perspective divide
  and the disc's `activeDiscY` lift. Multiplying `state.active` by a constant would be wrong at
  every camera angle.
- **Reset on every new load.** `exitFrom = null`, `exitDone = false`, orbit `θ = 0`
  (`counter.reset()`).

### 10.3 Two text groups, one timeline

The copy and the critic row are a single transition engine over a **group-indexed** target list
(`src/text/reveal.js`; spec and source: `motion-spec.md` §6). Expose the promise pair
(`out()` / `release()`, §6.6) so a route change can drain the copy before swapping DOM — do not kill
a running timeline from outside, or you tear text mid-slide.

---

## 11. Reduced motion

A real branch, not a media query that shortens durations. The original returns early from the
preloader *before* building any DOM:

```js
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
if (!galleryEl || reduced || isEditorMode || typeof gsap === 'undefined') {
  document.documentElement.removeAttribute('data-preload')
  return                          // no preloader at all
}
```

And in the gallery:

```js
if (reduced) {
  state.active = 1
  state.others = 1
  lead.spinY = 0
  gallery.reveal()
  return
}
```

Per interaction:

    path                  normal    reduced
    flip duration         0.75      0.15
    re-level after drag   1.2       0.15
    wipe impulse          fires     skipped
    press impulse         fires     skipped
    flow lean / bank      active    0
    snap spring           active    direct integer set
    detail open / close   disc press, spring, exit spin; page fades 0.35 s     0.15 s fade, no disc motion
    detail → detail       cross-fade 0.4 s out, 0.4 s in                       0.15 s fade
    ink dissolve          clip-path boils with scroll                          off: the hero is a plain section
    still parallax        ±10 %                                                off
    scroll-next disc      own WebGL scene, push meter                          no scene, no meter: a plain link
    prefetch              still after 450 ms; next still + cover when idle     same

Reduced motion still **allows** a `0.15 s` flip and a press. It removes sustained motion and
physics, not all feedback — removing the flip would break the affordance.

---

## 12. Performance

### 12.1 The real cost is transmission

`MeshPhysicalMaterial.transmission` renders the scene to a separate target once per transmissive
mesh. Two transmissive materials per disc × 11 discs = 22 extra passes.
`transmissionResolutionScale = 0.5` is the single biggest win (`disc-3d-spec.md` §5.5).

Still over budget: drop the clamp ring's `transmission` (`hubFrostedEdge: 0`) and keep only the hub —
one frosted ring lost, transmission cost halved.

### 12.2 Compile before first render

`await renderer.compileAsync(scene, camera)` during the preloader — `disc-3d-spec.md` §5.6.

### 12.3 Cull aggressively

Only update discs within `|index − scrollPosition| < renderRadius + 1`. With 12 discs this saves
little; it is the difference between 12 and 400 on a real catalogue.

### 12.4 Avoid per-frame allocation

Allocate a few `Vector3`/`Quaternion` once at module scope and reuse them:

```js
const tmpVec = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()
// …inside the loop: tmpVec.set(...), never `new THREE.Vector3()`
```

### 12.5 Instancing is not applicable

Each disc has a unique texture, impulse state and transform. `InstancedMesh` would save draw calls
but not material switches and would make per-disc impulse code much harder. With ~7 visible discs
draw-call count is not the bottleneck.

---

## 13. Failure modes to expect

    symptom                          cause                                              fix
    Discs drift over time            dt not clamped, or per-frame constants instead     clamp dt, use exponential damping
                                     of exp(−k·dt)
    Wobble never settles             sleep threshold missing or set too low             Σ|state| below the sleep threshold, then hard-zero
    Intro jumps on slow connection   loader progress capped by assets, not the floor    Math.min(realProgress, elapsed / minDuration)
    Row shudders on resize           gallery transform applied after disc transforms    apply gallery transform before render, same frame
    Counter flickers                 odometer without tabular-nums                      font-variant-numeric: tabular-nums
    Spinner and GSAP drift           native CSS animation and a GSAP tween both running el.style.animation = 'none' then tween
    Wheel scrolls the page           data-lenis-prevent-wheel missing / Lenis not init  set the attributes on the gallery
    ScrollTrigger scrub jitters      Lenis on its own rAF                               gsap.ticker.add(t => lenis.raf(t * 1000)) +
                                                                                        gsap.ticker.lagSmoothing(0)
    RectAreaLight has no effect      RectAreaLightUniformsLib not imported/initialised  import and init it
    Hover flickers at disc edge      raycast oscillating across the pick mesh           hysteresis (the reference's `scribbleLag`, `motion-spec.md` §5.5),
                                                                                        or a slightly smaller pick radius
    Discs visible through each other transmission sorts after opaque                    per-frame renderOrder (`motion-spec.md` §4.6)

---

## 14. Build order

What a step must show before you move on:

    step   subject                          done when
    1      arc layout                       the curve looks right with nothing moving
    2      scroll + snap                    you can flick and it settles on an integer
    3      follow smoothing                 the row lags and smears — "carousel" has become "object"
    4      one disc, materials              one disc is lit correctly — a bad material makes motion look bad
    5      environment                      the four softbox bands read as separate streaks
    6–8    hover, wipe, press               hover tips toward the cursor; wipe kicks; press tilts about the hit point
    9–10   fan-in, flow lean + kick         discs emerge from depth; the row banks into fast motion
    11–12  loader + intro pose              loader reports P and drives the lead disc's pose
    13     copy transitions                 run independently of the 3D (any time after step 4)
    14     section switcher                 switching sections slides the ribbon, no rebuild
                                            (this build flips instead — build-notes.md §3 item 3)

---

## 15. Verification

Invariants that break silently. Each has a unit test in `tests/motion.test.mjs` (`npm test`); the
browser-level assertions are `tools/verify.mjs` (`npm run verify`), listed in `build-notes.md` §1.1.

| Invariant | Test |
|---|---|
| The arc wraps past its apex: `x` is lower and `z` higher at Δindex +5 than at +4.5 | `x is NON-MONOTONIC past Δindex ≈ +4.49 — the ribbon turns away` |
| Impulse converges to rest and then sleeps — exact zero, not approximate | `the impulse integrator reaches EXACT zero within 10 simulated seconds`, `the integrator sleeps at 8e-4 rather than shimmering forever` |
| Press impulse is asymmetric about the disc's own centre; a horizontal press leaves the vertical axis untouched | `a press is asymmetric about the disc’s OWN centre` |
| Loader progress is monotonic for a deliberately non-monotonic target sequence | `P is monotonic for a non-decreasing target`, `realAssetProgress is non-decreasing across every source change` |
| Follow smoothing is frame-rate independent | `the follow smoother is frame-rate independent` |
| The ink path is deterministic, never NaN, every loop closed, kept area monotonic in level | `tests/detail.test.mjs`: `the ink path is deterministic…`, `the field never produces NaN…`, `every loop is closed…`, `the kept area grows monotonically…` |
| Small loops are dropped; V is clamped | `minBlob drops small loops…`, `progress clamps to [0, 1]…` |
| A flick that arrives at the end never fills the push meter; a second gesture does; it drains; it leaves once | `the arriving flick never counts`, `a second gesture…`, `the meter drains…`, `filling the meter exits exactly once…` |
| The exit spin lands edge-on at or past `spinY + exitSpin` | `exit spin lands edge-on…` |
| The next title wraps within its section | `nextId steps through the section and wraps…`, `nextId never crosses a section boundary…` |
| A detail page leaves the scene untouched and parks the shelf loop | `tools/verify.mjs`: `opening a page creates no scene child…`, `the shelf render loop pauses…`, `20 open/close round trips…` |
| Counter exit is a function of disc growth, not time | `the counter exit finishes at ≈70 % of the disc growth, not on a timer`, `the counter exit is growth-coupled, so it CANNOT finish before the disc` |

The follow-smoother test is the most valuable: run the same smoother for one simulated second at
144 Hz and at 60 Hz and require the same result. It catches the most common bug in this class of
code — a smoother written as `v += (target − v) * 0.1` instead of
`v += (target − v) * min(1, dt * rate)`.
