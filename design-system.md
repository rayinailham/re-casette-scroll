# Design System — A24 Disc Carousel

Design-level source of truth for a rebuild: principles, tokens, anatomy, the *behaviour and intent*
of each animation, and the input contract. Every value is verified against the shipped bundle;
confidence markers live in `evidence.md`. This file describes the **reference**; where this build
differs, see `build-notes.md`.

What this file does NOT own — go there for it:

    every number, formula, verbatim source, config key   ->  motion-spec.md
    geometry, materials, lights, environment, renderer   ->  disc-3d-spec.md
    modules, render loop, porting notes, failure modes   ->  implementation.md
    provenance, confidence, unknowns                     ->  evidence.md

Numbers are therefore referred to here by config key (`sceneShare`, `pushBy`, …), never restated.

---

## 1. Design principles

Extracted from the implementation, not invented.

**1. Motion is bound to load progress, not to a timer.**
The intro disc does not tween on a fixed duration. Every one of its transforms is a pure function of
one scalar `P ∈ [0,1]` (loader progress). Change `P` and the disc lands in a new, consistent pose, so
the intro can be scrubbed, reversed or interrupted by a slow connection with no special case.

**2. One easing vocabulary, two named curves.**
Only two hand-authored curves exist, both `CustomEase`, both sharing the control segment
`0.32, 0.72`: `discGlide` for the 3D settle and `energy` for all text transitions
(`motion-spec.md` §1.1). Everything else is GSAP stock or a monomial power curve written inline
(`motion-spec.md` §1.2, §1.3). No `elastic`, no `back`, no `bounce`.

**3. Rest is explicit, not implicit.**
Every spring-ish value has a named damping/return coefficient and a sleep threshold. When the total
absolute state of a disc's impulse system falls below the threshold it is hard-zeroed
(`motion-spec.md` §4.5) — that is what stops the wobble shimmering forever.

**4. Frame-rate independence is mandatory.**
Every integrator takes `dt` explicitly, clamps it once (`motion-spec.md` §2.3) and uses `exp(−k·dt)`
rather than a per-frame multiplier. A 144 Hz display and a throttled 30 Hz tab must move identically.

**5. The cursor never teleports anything.**
Cursor input feeds *velocity impulses* into a physics integrator and never assigns a transform
directly. The one exception is hover tilt, a proportional term added on top.

**6. Reduced motion is a real branch, not a media query.**
`prefers-reduced-motion: reduce` short-circuits the preloader, snaps the gallery to its settled pose
and replaces wheel/touch interaction with direct index setting. Per-path table:
`implementation.md` §11.

---

## 2. Tokens

### 2.1 Colour

| Token | Value | Use |
|---|---|---|
| `--_theme---background` | `#FFFFFF` | page background |
| `--_theme---body-text` | `#000000` | all text, dividers, spinner stroke |
| Scribble ring | `#000000` | hand-drawn hover annotation |

Disc surface colours, the rim/key light colours and the fog colour: `disc-3d-spec.md` §4, §5.1,
§5.3. There is no colour system beyond white-on-black plus the artwork. Do not introduce accent
colours. (This build's page colour is `#F2F2F2`; the live values are in `styles/tokens.css`.)

### 2.2 Typography

Three faces, one display serif, all self-hosted `woff2`:

| Family | File | Weight | Role |
|---|---|---|---|
| `Ppneuemontreal` | `/fonts/PPNeueMontreal-Medium.woff2` | 500 | UI, labels, nav, body |
| `Ppmuseum` | `/fonts/PPMuseum-Regular.woff2` | 400 | reserved (secondary) |
| `Ppeiko` | `/fonts/PPEiko-Regular.woff2` | 400 | film titles, quotes, preloader count |

This build ships open stand-ins (`build-notes.md` §3 item 4).

Global body settings:

    font-family      PP Neue Montreal
    font-size        16px base — every scale below is em-relative to it
    line-height      1.4em
    letter-spacing   -0.025em
    text-transform   uppercase   (every heading/label class sets this)

The size scale is `em`-relative, defined on `body` at three breakpoints (desktop / tablet / mobile).
Desktop values:

    token             em        px @16
    --size--320px     16em      256
    --size--256px     12.75em   204
    --size--192px     9.5em     152
    --size--160px     8em       128
    --size--112px     5.5em     88
    --size--80px      4em       64
    --size--56px      2.75em    44
    --size--40px      2em       32
    --size--24px      1.25em    20
    --size--16px      1em       16
    --size--8px       .5em      8

Display tracking tightens with size: `--heading-xxl` (8em) uses `-0.04em`; paragraph `-0.025em`.

### 2.3 Layout

    --_layout---padding-global--page-padding      2em   (tablet 1.5em, mobile 1rem)
    --_layout---grid--gap                         2em   (tablet 1.5em)
    --_layout---container--container-padding      .5em  (preloader corner inset)

The information panel, the review row and the hairline rule are specified with their CSS in
`motion-spec.md` §6.7: the copy stays a one-fifth column so the disc owns the frame.

### 2.4 Motion tokens

Every motion token is a key of one of three config objects; none is restated here.

| Family | Keys | Where |
|---|---|---|
| Spring / damping, follow smoothing, drag, friction, snap | `pushDamping`, `pushReturn`, `snapFreq`, `snapDamping`, `friction`, `follow*`, `drag*` | `motion-spec.md` §7, applied in §3.3, §3.5, §3.7, §4.5 |
| Hover blend, re-level rate | — (inline `dt × 10`, `dt × 2.5`) | `motion-spec.md` §5.1, §5.4 |
| Loader timing, beats, counter orbit/exit | `minDuration`, `chase`, `riseAfter`, `turnBy`, `beats`, `pushBy`, … | `motion-spec.md` §2.1; `preloadFanDuration` etc. in §7 |
| Text transitions | `settleDelay`, `inDuration`, `inGroupGap`, … | `motion-spec.md` §6 |

---

## 3. Component anatomy

    <html data-preload>                     ← loader gate attribute
      <div class="preloader" data-preloader>   z-index 60, pointer-events none, fixed inset 0
        .preloader__count.heading-l            absolute, centred, tabular-nums, uppercase
          .preloader__cell.--glyph             height 1em, overflow hidden
            .preloader__shell                  height 1em, overflow hidden
              .preloader__glyph                "A"
          .preloader__cell.--drum              same shell
            .preloader__drum                   "0\n1\n2…9\n0\n1…9"  (20 rows, white-space: pre)
        .preloader__side.--left                absolute, top 50%, translate 0 -50%
          .preloader__side-line > .preloader__side-inner   "A24 Films"
        .preloader__side.--right               same, right aligned
          .preloader__years                    4 digit drums: 2012 → current year

      <canvas data-disc-canvas>                position absolute inset 0, pointer-events none

      <main data-barba="container">
        <div data-disc-gallery>                cursor grab; discs render into the canvas above
        .experience_info                       TEXT GROUP 0 — top-left, one-fifth viewport
        .testimonial_wrap                      TEXT GROUP 1 — bottom-centre critic row

      <nav class="nav">                        z-index 100, fixed top
        li.nav-loading-item                    display none until preloader starts
          .nav-loading__spinner                border 1.5px solid, border-right transparent,
                                               border-radius 50%, .65em square,
                                               animation .8s linear infinite spin
          .nav-link__label                     "Projecting"

Markup and CSS contract of both text groups (rows, hairline rules, review slots, stars, aria):
`motion-spec.md` §6.7.

The `.preloader__count` is **not** centred in the layout — the JS re-positions it every frame onto an
orbit around the disc's projected anchor, clamped inside a band that clears the nav
(`motion-spec.md` §2.6).

Every `[data-film-target]` and every `.divider-horizontal` is additionally wrapped at runtime in a
`<div data-disc-mask>` — the outer mask whose `height` collapses a group and which only clips while
animating (`motion-spec.md` §6.2). It is not in the markup; do not author it by hand.

Preloader CSS verbatim: `motion-spec.md` §2.5, §2.8.

---

## 4. Animation behaviour

Stated as *behaviour* and intent. Exact numbers and source: `motion-spec.md`; code:
`implementation.md`.

### 4.1 Loading

**Behaviour.** A two-source progress scalar `P` chases a target and never jumps. The lead disc rides
`P`. A 3-digit odometer counts `A24 → 40–52 → 68–80 → 100` (beats 2 and 3 re-randomised every load);
corner text sits at mid-height left and right; the nav spinner spins while `P < 1`; the right-hand
year drum runs `2012 → current year` with `P`.

**Why the bar is built this way.** The target is the slower of real asset progress and a time ramp,
so a hot cache still gets a beat to breathe and the intro always plays at full length
(`minDuration`). `sceneShare` reserves a slice of the bar for the 3D scene so the counter never sits
at 100 % over an empty canvas **[inferred]**; `sceneCreep` is a fake creep that keeps the bar alive
while the scene builds; the font gate caps real progress at 0.9 so the counter cannot finish before
type is measurable. Formulas and code: `motion-spec.md` §2.3, §2.4.

**The counter leaves on the disc's growth, not on a timer.** This is the single most important thing
to get right. The four counter cells are pushed up by `110 %` in proportion to how far the lead disc
has grown since `setOff`, finishing at `pushBy` of the growth, staggered into a wave from the glyph
to the last digit. So the counter is fully gone a beat before the disc settles, at any frame rate and
for any disc size, without anyone guessing when the disc animation ends — which is why it feels like
part of the same object rather than a DOM element being dismissed. Mechanism and worked numbers:
`motion-spec.md` §2.9.

**The counter orbits the disc.** It is not centred: each beat steps the orbit angle by `45°`, taking
it from directly **below** the disc, to **left**, to **upper-left**, to **above**. The orbit radius
is the disc's own projected screen radius plus the counter's half-width, so it clears the disc at
any size; a clamp band keeps it on screen and clear of the nav. Code and the clamp band:
`motion-spec.md` §2.6.

**Exit.** Corner labels, nav and copy leave and arrive on staggered offsets so the copy never moves
on the same instant as the title; the corner wrapper and its inner text deliberately use different
durations and easings so the label settles instead of sliding rigidly. Timeline and rationale:
`motion-spec.md` §2.7.

### 4.2 Intro — the big disc that shrinks in

**Progress-driven, not timeline-driven.** The lead disc starts edge-on, small and low, then rises,
turns face-on and grows — each on its own exponent, so the three channels desynchronise and read as
a physical object rather than one rigid tween. At `P = 1` it glides to full size while the other
discs fan in from depth, overlapping the tail of the rise instead of queueing behind it.
`discGlide`'s first control point `(0.32, 0.72)` is the site's signature: rises fast, glides the last
third. Pose, exponents, parent-space offset and fan timeline: `motion-spec.md` §2.10.

### 4.3 Carousel — the curved leading line

**The curve is an ellipse in the XZ plane, stepped by index.** Not a spline, not a Bezier. Formulas
and the position table for every Δindex: `motion-spec.md` §3.2, §9. The `x` radius is larger than the
`z` radius, so the "circle" is squashed — a wide, shallow arc that reads as a curve across the frame
without the far discs collapsing.

**Orientation.** The whole gallery group is pre-rotated once per frame (`motion-spec.md` §3.1; why
the tilt: `disc-3d-spec.md` §5.2). The row is a banked ribbon in space before any per-disc rotation;
`rotationY = −θ` rolls each disc onto its tangent; per-disc `rotationX` stays `0` except for hover
tilt.

**Why it reads as a curve and not a line.** The active disc sits at `θ ≈ 0` where `dx/dθ` is maximal
and `dz/dθ` is zero. Successive discs sweep sideways first, then recede in Z, so the row visibly
bends away. And `x` is **non-monotonic past Δindex ≈ +4.49**: it passes the `sin` apex (`θ = π/2`)
and reverses — at `Δindex = +5` the disc is back left while receding further (table:
`motion-spec.md` §9). That reversal is load-bearing: it gives the ribbon a far side. If the ribbon
looks like a straight line, check it first.

**Scroll → index.** Wheel and drag produce a float index, never pixels:

- **Wheel** — quantised to exactly `±1` through an envelope follower (`motion-spec.md` §3.6).
- **Drag** — continuous, a six-disc span across the viewport (`motion-spec.md` §3.7).
- **Release** — friction decay on the drag velocity (`motion-spec.md` §3.5).
- **Snap** — a real damped spring, only once velocity is zero (`motion-spec.md` §3.5).

**Per-disc follow.** Each disc lags its ideal arc position by an exponential smoother whose rate
falls with distance from the lead (`motion-spec.md` §3.3): the leader is crisp, trailing discs smear
— that is the momentum read.

**Inactive scale** is nearly binary — leader, immediate neighbours, everything else
(`motion-spec.md` §3.2, §9).

**Flow lean** — the row banks into a turn. `sqrt` on velocity means a gentle flick produces a
disproportionate lean — the row banks into fast motion and hangs into slow motion. Second-biggest
contributor to the "physical object on a curve" read (`motion-spec.md` §3.2).

**The flow velocity is *kicked* by every discrete move, not just dragged.** A wheel notch, an arrow
key and a click on a distant disc each add an impulse to the flow velocity before the tween starts,
so the ribbon **banks into the turn and settles out of it** even though only the index changed.
Without the kick, stepping one disc reads as a state change; with it, it reads as being flicked.
Per-source values, the clamp and why a flick gets none: `motion-spec.md` §3.9.

**Snap duration scales with distance** (`motion-spec.md` §3.9), and every index change — and only index changes —
dispatches `discgallerychange`, which is what the text engine waits on (§4.6).

### 4.4 Pointer wobble — the unbalanced tilt

Six degrees of freedom per disc: push `x/y/z` (translation) and push `rotX/rotY` (rotation), each
with a velocity channel, all starting at zero. Maths and verbatim source: `motion-spec.md` §4.

- **Wipe** — cursor velocity (normalised to a 60 Hz frame) kicks the disc, only above a speed floor.
  Horizontal motion pushes sideways AND spins about Y; vertical pushes vertically AND spins about X.
  The coupling is why it reads as a physical object resisting a swipe, not a 2D tilt
  (`motion-spec.md` §4.3).
- **Press** — a click kicks Z back and tilts by the **raycast UV of the hit point on the disc's own
  pick circle**, `−1…+1` from the disc centre. Dead centre → pure Z push, zero tilt. Edge → maximum
  tilt. There is no symmetry restoration; the disc reacts *where you touched it*. This is the
  "unbalanced" part (`motion-spec.md` §4.4).
- **Recovery** — one sharp kick, one ease-out glide, no ringing. It is deliberately not a spring
  (`motion-spec.md` §4.5).
- **Hierarchy** — the outer `group` carries position + hover tilt + arc rotation; the inner `spin`
  carries orientation (flip) + push rotation (`disc-3d-spec.md` §1).
- **Touch** — on coarse pointers all six channels are zeroed every frame: tap-to-flip, no sweep.

### 4.5 Hover

- **Detection** — raycast against the disc's invisible pick mesh (`disc-3d-spec.md` §3.4); the hit
  UV is the same UV that drives press tilt.
- **Blend and effect** — first-order lag toward `1` only for the hovered disc while nothing is
  dragging; a proportional, isotropic tilt on the outer group: the disc tips toward the cursor, and
  moving across it rolls it (`motion-spec.md` §5.1).
- **Nothing else changes.** No scale change, no emissive, no colour shift, no speed change. Scale
  stays `1.0`.
- **Cursor** — `grab` over the gallery, `pointer` over a disc, `grabbing` + `user-select: none` while
  dragging (`motion-spec.md` §5.2).
- **Scribble ring** — on the active hovered disc, a hand-drawn charcoal ring regenerated at a low
  frame rate with hysteresis against pick-boundary flicker (`motion-spec.md` §5.5).
- **Click inactive disc → flip** to the iridescent back (`motion-spec.md` §5.3).
- **After a drag → re-level** (`motion-spec.md` §3.7); a disc that stops being active settles back
  face-on slowly (`motion-spec.md` §5.4).

### 4.6 Text transitions

**One engine, two groups, one timeline with one stagger.** The two groups are the **top-left copy**
(group 0, `.experience_info`) and the **bottom-centre critic row** (group 1, `.testimonial_wrap`).
That ordering is the whole point of `inGroupGap`: the reviews begin a beat after the title does, so
on screen the title is always first and the reviews answer it. They are not two features that happen
to coexist.

Everything else — SplitText lines in their own masks, the outer mask, the fade on top of the slide,
exit upward / enter from below, rules growing out of the left edge, the height-tween guard,
reverse-on-interrupt (fast scrolling reads as a flip-through, not a stutter), the settle gate and the `data-disc-flight` hand-off from the preloader —
is specified, with source, in `motion-spec.md` §6.

### 4.7 The bottom-centre critic row

Group 1 is a fixed pool of **slots**, not elements generated per film. A film fills up to as many
slots as it has reviews; leftover slots are marked empty and hidden. Never build the row in JS and
never delete a slot — a half-empty centred row reads as a layout bug, so the count is also published
as an attribute to assert against. Each slot is a stars row, a publication name and a two-line pull
quote. Contract, CSS and the verbatim renderer: `motion-spec.md` §10.

---

### 4.8 The detail page: carry, ink, next disc

Three behaviours the shelf alone never shows. Built here as `src/detail/` (deviations:
`build-notes.md` §4); the numbers are `motion-spec.md` §11–§13.

**The disc travels between pages.** Clicking the active disc does not cut to a new page. The disc is
pressed in, springs, and turns edge-on while it shrinks — and the one WebGL canvas it lives on is
*lifted out of the page* into a fixed layer above everything, so it keeps rendering while the old DOM
is swapped for the new. The new page only becomes visible once the disc has left. Coming back is the
mirror: the disc grows from nothing into its slot on the shelf. Moving between two shelf pages
(`disc-flip`) uses the same vocabulary with a different pose: the lead swells and turns its back.
Three rules make it read as one object: **the text drains before the DOM swaps** (§4.6, the
`out()` / `release()` pair), **the next page is invisible until the disc has handed over**, and
**nothing is fetched on the click** — the target was prefetched when the disc became active
(`motion-spec.md` §11.2).

**The ink is a scroll reveal, not a page transition.** On the detail page the hero is cut away by an
organic, slowly boiling edge as you scroll, uncovering the full-bleed still beneath. The edge is the
iso-contour of an animated noise field, so it never repeats and never looks like a wipe; scroll
speed agitates it, and the pointer bites into it. It is deliberately **not** a mask image: the
section is clipped by a computed path, so the edge is crisp at any size and costs no texture.
The nav theme flips *with the edge*, not with the scroll position (`themeAt`).

**The page ends in a disc.** At the bottom a second disc arrives tilted back and low, settles into
its slot as you scroll, spins with your scroll velocity and idles. Scrolling *past the end* does
not scroll — it fills a push meter (the disc grows, lifts, tilts and spins faster) that drains if
you stop. When it fills, the disc spins away, the copy rises, and the next title loads. A flick that
merely carried you to the bottom never counts; the push has to be a deliberate second gesture
(`pushSettle`, `pushGap`, `pushSurge`). The roulette reel (random-title mode) belongs to the 404 page
of the reference, not to this flow.

## 5. Interaction contract

    input                     result
    wheel (gallery focused)   quantised ±1 index
    pointerdown + move        continuous drag, 6-disc span, inertia
    pointerup                 friction decay, then snap spring to nearest integer
    click inactive disc       flip to back face
    click active disc         navigate to detailUrl
    cursor sweep over disc    wobble impulse (desktop only)
    hover active disc         tilt toward cursor + scribble ring
    click offset from centre  asymmetric press tilt
    prefers-reduced-motion    preloader skipped, settled pose, no wobble (implementation.md §11)

The active disc fires `discactivate`, which the hash router answers by opening `#/<id>`
(§4.8, `build-notes.md` §4). Esc, the Back button and browser Back close it again.

The gallery sets `data-lenis-prevent` **and** `data-lenis-prevent-wheel`, so page scroll never
competes with the carousel while it is on screen (`motion-spec.md` §3.8).
