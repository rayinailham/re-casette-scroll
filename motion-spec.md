# Motion Spec — exact values and source

Owner of every number and every verbatim snippet. Snippets are copied from the production bundle,
lightly reformatted; minified identifiers are preserved so you can grep them in your own copy.

What this file does NOT own:

    why the motion is shaped this way, behaviour, tokens   ->  design-system.md
    geometry, materials, lights, environment, renderer     ->  disc-3d-spec.md
    readable ports, render loop, failure modes, tests      ->  implementation.md

---

## 0. Where things live

Source files are the app chunk `_astro/main.qdXy8l6N.js` and the stylesheet
`_astro/ExportPage.DV5vD961.css`, as shipped by `a24.raviklaassens.com`. Sizes, sha256 digests and the
earlier `011.js` name of the same chunk: `evidence.md` §3.

The chunk name is content-hashed by Astro and **changes per deploy**. Always re-derive the name from
the page's `modulepreload` links and verify the sha256 before quoting anything below.

    concern                           symbol                              how to find
    disc gallery + all 3D + physics   br(), config `c`                    grep discGlide, w.pushDamping
    preloader + progress              lt(), config `J`                    grep minDuration, sitePreloader
    intro pose                        $e() / tt() / et() / it()           grep preloadSpin, riseFrom
    counter arc orbit + exit          O() / te() / ce() / j()            grep discGap, pushBy
    text transitions (SplitText)      De(), config `I`                    grep disc-line-mask, energy
    critic review cards               ir(), ve(), ye()                    grep review-stars, review-line
    wheel quantiser + snap            Lr() / mr() / pr()                 grep wheelStepThreshold
    Lenis + ScrollTrigger wiring      $r()                                grep new Lenis
    Barba init + disc transitions     Hn, Rn, zn / An, Vn, _r / vr        grep disc-detail-open, data-disc-carry
    ink dissolve                      Ae(), config `R`                    grep data-dissolve, cursorDrops
    scroll-next disc + push meter     zt(), config `Y`                    grep data-scroll-next, pushWheel

---

## 1. Easing curves

### 1.1 The two `CustomEase` definitions — the whole vocabulary

```js
// 3D settle — cubic-bezier form
CustomEase.create('discGlide', '0.32, 0.72, 0, 1')

// Text transitions — SVG path form
var F = 'energy', xe = 'M0,0 C0.32,0.72 0,1 1,1'
CustomEase.create(F, xe)
```

Both share the control point `(0.32, 0.72)`. The signature is **"rise fast, then glide"**: the first
~32 % of the timeline covers ~72 % of the distance.

`discGlide` has a graceful fallback:

```js
let D = (() => {
  try {
    if (window.CustomEase) return window.CustomEase.create('discGlide', '0.32, 0.72, 0, 1'), 'discGlide'
  } catch {}
  return 'power3.out'
})()
```

`energy` likewise falls back to `power2.out`. **Build both with a fallback** — they register lazily
and the preloader can run before GSAP's plugin bundle finishes.

### 1.2 Inline monomial power curves

Three anonymous helpers, used only by the preloader pose:

```js
var ot = e => e < .5 ? 2*e*e : 1 - (-2*e+2)**2 / 2   // easeInOutQuad — year interpolation
var st = e => 1 - (1-e)**2.4                          // TURN  (disc edge-on → face-on)
var ct = e => 1 - (1-e)**3                            // RISE  (disc travelling into place)
```

`1-(1-e)^n` is the "exponentially decelerating" family; higher `n` = slower start, slower finish. The
channels use `2.4`, `3` and a plain `1-(1-t)²` for growth — deliberately **non-harmonious**, which is
what stops the intro reading as one rigid tween. Growth is inline, not a named helper:

```js
let n = 1 - (1-t) * (1-t)     // growth
G.active = Math.max(.001, w.preloadBoost * n)
```

### 1.3 GSAP stock eases actually used

    ease          where
    power4.out    preloader drum open (delay 0.3, duration 0.38)
    power3.out    digit drum rolls, year rolls (yearRoll 0.4), disc re-level after drag (1.2)
    power3.inOut  disc flip on click (0.75)
    power3.in     corner label exit (0.5, stagger 0.04)
    power2.out    corner wrapper lift (0.7), both CustomEase fallbacks
    power2.inOut  counter arc orbit (travel per beat)
    none          G.others fan timeline; all scrollTrigger.scrub tweens

---

## 2. Loading

Behaviour and intent: `design-system.md` §4.1.

### 2.1 Preloader config — verbatim

```js
var J = {
  minDuration: 2.85, sceneShare: .18, sceneCreep: .6, chase: 8,
  riseAfter: .03, turnBy: .8,
  beats: [
    { value: 'A24',     at: .05, after: .8,   roll: .7,  travel: .85 },
    { value: null, range: [40,52], at: .5,  after: 1.9, roll: .55, travel: .75 },
    { value: null, range: [68,80], at: .75, after: 2.35, roll: .55, travel: .75 },
    { value: '100',     at: 1,    after: 2.8, roll: .6,  travel: .8  }
  ],
  roll: .6, rollStagger: .05, letter: .6, travel: .7, arcEnd: 1,
  navGap: .35, discGap: .35, logoAtBeat: 1, logoDelay: 0,
  lift: .3, pushBy: .7, pushStagger: .14,
  left: ['A24 {page}'],
  right: { from: 2012, to: new Date().getFullYear() },
  yearRoll: .4,
  openAt: .3, open: .38, setOff: .45, exit: .5,
  navAfter: .15, copyAfter: .3, apiTimeout: 9e3
}
```

Reading the beats: a beat fires only when **both** `P >= at` **and** `elapsed >= after` hold. `roll` is
the digit-drum duration (`power3.out`); `travel` is the counter's arc-orbit duration (`power2.inOut`,
§2.6). Beats 2 and 3 draw a random value from `range` on every load, so the counter tells a slightly
different story each time. The right-hand label runs `right.from → right.to` (the current year).

### 2.2 The `dt` clamp helper

```js
var at = (e, t, n) => Math.min(n, Math.max(t, e))   // clamp
```

### 2.3 Progress loop — verbatim

```js
function Te(e) {                       // rAF frame handler
  if (ye) return
  L = requestAnimationFrame(Te)
  let t  = at((e - I) / 1e3, 0, .1)              // dt, CAPPED at 100 ms
  let I_prev = e
  let r  = (e - he) / 1e3                        // seconds since preloader opened
  let i  = at(r / J.minDuration, 0, 1)           // time ramp
  let a  = Math.min(Ce(e), i)                    // real target, gated by min duration
  P += (a - P) * (1 - Math.exp(-J.chase * t))    // chase, chase = 8
  a >= 1 && P > .995 && (P = 1)                  // snap the last 0.5%

  let o = J.riseAfter                                        // 0.03
  let s = at((P - o) / (1 - o), 0, 1)                        // rise input
  let c = at((P - o) / (J.turnBy - o), 0, 1)                 // turn input, turnBy = 0.8

  M?.pose({ turn: st(c), rise: ct(s) })                     // drive the 3D
  // ... between here and the beat check: re-read the disc anchor from
  // getBoundingClientRect(), push it to D.x / D.y / D.r, redraw the arc counter,
  // and interpolate the right-hand year drum from P.
  let l = J.beats[ve]
  l && P >= l.at && r >= l.after && ( /* advance beat: roll the drums,
                                       orbit the counter over `travel` */ )
}
```

Three things worth copying verbatim:

1. **`Math.min(realProgress, timeRamp)`** — the bar can never outrun `2.85 s`. A hot cache still gets
   a beat to breathe and the intro always plays at full length.
2. **`P` is monotonic.** The chase is a lerp toward a non-decreasing target; beats require
   `P >= at`, so a beat can never replay.
3. **The dt cap at `0.1 s`.** A backgrounded tab resuming after 4 s must not teleport the disc.

The chase corrects `1 − exp(−8/60) ≈ 13 %` of the remaining gap per frame at 60 fps — responsive but
weighted.

### 2.4 Asset progress — verbatim

```js
// font gate
function Ce(e) { return Se ? we(e) : Math.min(we(e), .9) }   // Se = document.fonts.ready resolved

function we(e) {
  if (!M) {                                                  // scene still booting
    let t = at((e - he) / (J.sceneCreep * 1e3), 0, 1)        // sceneCreep = 0.6 s
    return J.sceneShare * t                                  // sceneShare = 0.18
  }
  return N.length
    ? J.sceneShare + (1 - J.sceneShare) * (ge / N.length)   // covers loaded / total
    : 1
}
```

### 2.5 Odometer geometry

```js
var nt = `0
1
2
3
4
5
6
7
8
9
0
1
2
3
4
5
6
7
8
9`                                        // 20 rows, rendered with white-space: pre
```

```js
gsap.to(p[2].inner, { yPercent: 0, duration: J.open, ease: 'power4.out', delay: J.openAt })
// openAt = 0.3, open = 0.38

gsap.to(e.inner, { yPercent: -a * 5, duration: r, ease: 'power3.out', delay: n })
//        ↑ 5 % per digit, 20-row column → max shift −45 % (one and a half cycles)
```

The `-5` is not magic: the drum is `1em` tall with `line-height: 1`, so one row = 5 % of the 20-row
column; `−5·d` for `d ∈ 0…9` gives `0…−45 %`. The overshoot into the second `0-9` block keeps
neighbouring digits valid and lets `9 → 0` roll continuously instead of snapping back.

**Year drum.** Four digit drums, `right.from → right.to`. Target year
`from + floor(easeInOutQuad(P) · (to − from))` (`ot`, §1.2); each digit rolls `yearRoll` on
`power3.out`.

CSS, verbatim from the stylesheet:

```css
.preloader__cell   { flex: none; height: 1em; display: block; overflow: hidden }
.preloader__shell  { will-change: transform; height: 1em; display: block; overflow: hidden }
.preloader__drum   { white-space: pre; will-change: transform; line-height: 1; display: block }
.preloader__glyph  { will-change: transform; line-height: 1; display: block }
.preloader__count  {
  left: 0; right: 0;
  top: var(--_layout---container--container-padding, .5em);
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  will-change: transform;
  line-height: 1; display: flex; justify-content: center; align-items: flex-start;
  position: absolute
}
.preloader__side {
  white-space: nowrap; will-change: transform;
  flex-direction: column; display: flex;
  position: absolute; top: 50%; translate: 0 -50%
}
.preloader__side--left  { left:  var(--_layout---container--container-padding, .5em); text-align: left;  align-items: flex-start }
.preloader__side--right { right: var(--_layout---container--container-padding, .5em); text-align: right; align-items: flex-end }
```

`tabular-nums` is mandatory — a proportional odometer jitters on every digit change.

### 2.6 Counter arc orbit

The counter is **not** statically centred. Every frame it is placed on an ellipse centred on the
disc's *projected* screen position. Verbatim:

```js
// orbit radii, in px. D.r = projected disc radius, v = counter width, b = counter height
function O(){ return { x: D.r + v/2 + b*J.discGap,      // discGap = 0.35
                       y: D.r + b/2 + b*J.discGap } }

let T = { theta: 0 }                                     // orbit angle, radians
let D = { x: innerWidth/2, y: innerHeight*2, r: 0 }      // live disc anchor (canvas-relative)

function te(){                                            // called once per frame
  let e = O(), t = Math.sin(T.theta), n = Math.cos(T.theta)
  let r = x + v/2,            i = innerWidth - x - v/2   // horizontal clamp band
  let a = S + b/2,            o = C - b/2               // vertical clamp band
  let s = clamp(D.x - t*e.x, r, i)                       // X = discX − sin(θ)·orbitRx
  let c = clamp(D.y + n*e.y, a, o)                       // Y = discY + cos(θ)·orbitRy
  gsap.set(u, { x: s - innerWidth/2, y: c - x - b/2 })  // back to the fixed container's coords
}

function ce(beatIndex){                                    // called once per beat
  let t = (beatIndex + 1) / J.beats.length
  gsap.to(T, { theta: Math.PI * J.arcEnd * t,            // arcEnd = 1
               duration: J.beats[beatIndex]?.travel ?? J.travel,
               ease: 'power2.inOut', overwrite: true })
}
```

So `θ` steps by `π/4` per beat: `π/4, π/2, 3π/4, π`. Position:

    θ        counter sits at
    0        directly BELOW the disc  (Y = discY + orbitRy)
    π/2      directly LEFT           (X = discX − orbitRx)
    3π/4     up-left
    π        directly ABOVE          (Y = discY − orbitRy)

The clamp band matters: `x`/`S` are the counter's own offsets and `C` is
`innerHeight − S`, both pushed clear of the nav (`J.navGap = 0.35 × counter height`) and the disc
(`J.discGap = 0.35 × counter height`). The counter can never be pushed under the nav or through the
disc centre, however large the disc grows.

`D` is refreshed every frame from the disc, so the DOM counter stays welded to the moving 3D disc:

```js
if (M) {
  let e = M.anchor(),                                   // screen-space {x, y, r, live, rest}
      t = (n.querySelector('[data-disc-canvas]') || n).getBoundingClientRect()
  D.x = t.left + e.x; D.y = t.top + e.y; D.r = e.r
  E.live = e.live ?? e.r;  E.rest = e.rest ?? e.r
}
```

`M.anchor()` projects three points through the live camera and reports **three different radii**:

```js
anchor(){
  let n = it(q.active ? q.rise : 1)                       // rise offset, gallery-local
      v = new Vector3(n.x, w.activeDiscY + n.y, n.z)
      r = coarse ? Math.max(.5, w.touchActiveScale) : 1   // 1
      a = w.preloadBoost * r                              // 0.8   → radius at 80 % scale
      o = Math.max(w.preloadBoost, G.active) * r          // live  → radius at current active scale
  let c = zt.localToWorld(v.clone())                      // centre
      l = zt.localToWorld(v.clone().add(new Vector3(a,0,0)))   // centre + 0.8 right
      u = zt.localToWorld(v.clone().add(new Vector3(o,0,0)))   // centre + live right
      d = zt.localToWorld(v.clone().add(new Vector3(r,0,0)))   // centre + 1.0 right
  // project each, then
  return { x, y,
           r:    hypot(g - h),      // 0.8·R   — the ORBIT radius
           live: hypot(_ - h),      // live·R  — how big it is RIGHT NOW
           rest: hypot(v - h) }     // 1.0·R   — how big it WILL BE
}
```

Because the sample points are offset along **+X in gallery-local space** and the gallery is rotated
`(−30°, −30°)`, the measured "radius" is the disc's apparent horizontal half-width on screen — exactly
the number the counter must clear. `live` and `rest` are the inputs to the exit in §2.9.

Observed on the live page, 1440 × 900, first load (`Backrooms` as the lead disc):
`A23` below the edge-on sliver → `41` left of the disc → `73` upper-left → gone.
Frame-by-frame record: `evidence.md` §2.

### 2.7 Exit choreography

Timeline, relative to the instant `De()` fires (`P = 1` and every beat spent):

    t       target                  change                             duration   ease
    +0.45   counter cells           arm growth-driven exit, −110 %     §2.9       none (per-frame set)
    +0.45   lead disc               fan-out begins (§2.10)             1.15       discGlide
    +0.45   year drum               → final year                       yearRoll   power3.out
    +0.45   corner side inners      yPercent −120                      0.50       power3.in, stagger 0.04
    +0.45   corner side wrappers    y −0.18em                          0.70       power2.out
    +0.60   nav                     reveal, remove data-preload        —          —
    +0.75   copy panel              reveal, remove data-disc-flight    —          —

```js
function De(){                                    // fires once, when P = 1 AND all beats are spent
  let t = Math.max(0, J.setOff)                  // 0.45
  let n = [glyph.shell, ...drums.map(d => d.shell)]

  gsap.delayedCall(t, () => {                     // ── 0.45: hand off to the disc, arm the counter exit
    gsap.killTweensOf(n)
    k = n                                         // the four cells the growth-driven exit drives
    re = ne(k.map(c => c.cell))                   // per-cell stagger offsets  (§2.9)
    E.from = E.live                               // remember the disc's radius RIGHT NOW
    Promise.resolve(M.fan()).catch(() => {}).then(() => {
      F = true
      if (!A) { k.forEach(c => gsap.set(c, { yPercent: -110 })); A = true }   // fallback only
      Ee()                                        // done
    })
  })

  gsap.delayedCall(t, () => { if (J.right) pe(J.right.to) })          // year drum → final year

  let r = [...left.inners, ...right.inners]
  r.length && (
    gsap.to(r, { yPercent: -120, duration: J.exit, ease: 'power3.in',
                 delay: t, stagger: .04, overwrite: true }),           // 0.50 s, inner text
    gsap.to([left.side, right.side],
            { y: `-${J.lift * .6}em`, duration: J.exit + .2,
              ease: 'power2.out', delay: t })                          // 0.70 s, outer wrapper
  )

  gsap.delayedCall(t + J.navAfter, () => {                             // 0.45 + 0.15 = 0.60
    window.siteNavLoadingApi?.revealAll()
    e.removeAttribute('data-preload')                                  // nav + copy become visible
  })
  gsap.delayedCall(t + J.copyAfter, () => {                            // 0.45 + 0.30 = 0.75
    M.revealCopy?.()                                                   // drop data-disc-flight
  })
}
```

Three things to copy exactly:

1. **`E.from = E.live` is captured at `setOff`, not at the end.** The counter's exit is measured
   against the disc's radius *from that instant* — §2.9.
2. **The two corner wrappers use different durations** (inner `0.5 s` `power3.in`, outer `0.7 s`
   `power2.out`). `-0.18em` is `lift (0.3) × 0.6`. Different durations + different easings = the label
   settles rather than sliding as one rigid block.
3. **`navAfter 0.15` and `copyAfter 0.30` are offsets from `setOff`, not from each other.** The nav
   appears 0.15 s after the corner text starts leaving; the copy panel 0.30 s after. The title must
   never move on the same frame as the nav.

`M.revealCopy()` only removes `data-disc-flight`:

```js
revealCopy(){ if (!N) e.removeAttribute('data-disc-flight') }
```

That attribute is the copy's CSS gate, and it is also the flag the text-transition engine polls
(§6). The preloader does not animate the copy — it *unblocks* it, and the transition engine decides
when. This is why the copy arrives on a `discgallerychange`-independent settle timer rather than on a
preloader timeline.

### 2.8 Spinner

```js
var B = ['Projecting','Developing','Splicing','Rewinding','Spooling','Threading','Screening','Printing']

e.style.animation = 'none'
gsap.set(e, { rotation: 0 })
z.spinnerTween = gsap.to(e, { rotation: 360, duration: 0.8, ease: 'none', repeat: -1 })
```

```css
.nav-loading__spinner {
  border: 1.5px solid; border-right-color: #0000; border-radius: 50%;
  flex: none; width: .65em; height: .65em;
  animation: .8s linear infinite nav-loading-spin
}
```

The native CSS animation is **killed and replaced by a GSAP tween** so the spinner stays in lockstep
with the GSAP ticker. Doing it the other way round is the usual mistake — two clocks drift.

### 2.9 The growth-coupled counter exit — why "100" leaves smoothly

This is the single most important mechanic in the intro and the one most easily rebuilt wrong.

**The counter's exit has no timer.** It is driven by how much the disc has *grown*, sampled every
frame, with a per-cell stagger. Verbatim:

```js
// per-cell stagger, computed once at setOff
function ne(cells){
  let t = cells.filter(c => c.getBoundingClientRect().width > .5)   // only VISIBLE cells
  let n = Math.max(1, t.length - 1)
  let r = clamp(J.pushStagger, 0, .8)                             // 0.14
  return cells.map(c => { let i = t.indexOf(c); return i < 0 ? 0 : r * i / n })
}

// the driver — runs every frame from setOff onward
function j(){
  if (A) return
  let e   = E.rest - E.from                                       // total radius growth left
  let t   = clamp((e > .5 ? clamp((E.live - E.from) / e, 0, 1) : 1)
                  / clamp(J.pushBy, .05, 1),                     // pushBy = 0.7
                  0, 1)
  let n   = 1 - Math.max(0, ...re)                                // 1 - 0.14 = 0.86
  k.forEach((cell, r) => {
    let a = clamp((t - re[r]) / Math.max(.05, n), 0, 1)
    gsap.set(cell, { yPercent: -110 * a })
  })
  if (t >= 1) { A = true; F && Ee() }
}
```

Worked out. `E.from` is captured at `setOff` when `G.active = preloadBoost = 0.8`, so
`E.from ≈ 0.8·R`. `E.rest = 1.0·R`. During `M.fan()` (`preloadFanDuration = 1.15 s`) `G.active` runs
`0.8 → 1` on `discGlide`, so `E.live` runs `0.8·R → R`:

    fan progress    G.active    E.live        growth ratio   t = ratio/0.7   counter
    0 %             0.80        0.800·R       0.00           0.00            sits, unmoved
    25 %            0.85        0.850·R       0.25           0.36            glyph starts
    50 %            0.90        0.900·R       0.50           0.71            most of it gone
    70 %            0.94        0.940·R       0.70           1.00            fully pushed out
    100 %           1.00        1.000·R       1.00           1.00            (already done)

`pushBy = 0.7` means the counter finishes leaving after **70 %** of the disc's growth — it is gone a
beat before the disc settles, which is what stops it reading as "waiting for the animation".

`re` spreads the four cells so the exit is a **wave, not a block**: with `pushStagger = 0.14` and 4
visible cells, offsets are `0, 0.0467, 0.0933, 0.14` and the divisor is `1 − 0.14 = 0.86`. Cell *r*
completes when `t = re[r] + 0.86`, so the glyph (leftmost) leaves first and the last digit leaves last.
If a beat's drums have collapsed to `width: 0` (e.g. `A24`, a single glyph) they are filtered out of
the stagger and the remaining cells re-space to `0 … 0.14`. **Never hard-code four cells.**

Why this reads as "smooth": the counter and the disc are the same clock. Any tween on the counter
would have to guess when the disc finishes; sampling the disc's actual projected radius cannot drift
from it, at any frame rate, on any disc size, with any `preloadFanDuration`.

### 2.10 Intro pose and fan-out

Behaviour and intent: `design-system.md` §4.2. **Every transform is a pure function of `P`.** The
inputs `riseInput` / `turnInput` are `s` / `c` in §2.3; the helper curves `ct` / `st` and the inline
growth are §1.2.

Start pose (lead disc only, set when the preloader starts):

    spinY      = −π/2           edge-on, −90°
    spinX      = 0
    spinZ      = preloadSpin = 1.1 rad = 63°, released quadratically
    position   = (0, −3.0, −0.7) in gallery-local space      preloadRiseFrom, preloadRiseDepth
    G.others   = 0              every other disc hidden
    G.inbound  = true           compressed inbound stagger (§3.4)
    G.active   = 0.001 → 0.8    grows during the first 50 % of the rise (preloadGrowBy)

Per frame, from `P`:

    growInput = rise / preloadGrowBy (0.5)
    grow      = 1 − (1 − growInput)²
    G.active  = max(0.001, preloadBoost (0.8) × grow)

    turnT  = 1 − turn                    // 1 at start, 0 at end
    riseT  = 1 − rise
    spinY  = −(π/2) · turnT
    spinZ  = preloadSpin · turnT²        // quadratic release — the wobble settles late
    offset = (0, −3.0·riseT, −0.7·riseT)
    scale  = max(0.001, 0.8 · grow)      // "big → small"

**The position offset is transformed into parent space**, so it survives the gallery's own
`rotation.x = −30°`, `rotation.y = −30°`, `scale = 1.08` (§3.1):

    offset = (0, −3.0·t, −0.7·t)  rotated by inverse(gallery.quaternion)  ÷ 1.08

A naive world-space `(0, −3, −0.7)` would slide diagonally instead of rising vertically on screen.

Three different exponents on three different channels — that is the entire trick:

- **Turn `2.4`** — fastest; the disc faces you while still small.
- **Grow `2`** — medium.
- **Rise `3`** — slowest; the disc is already facing camera and near full size while still travelling.

The desynchronisation is what reads as physical rather than one rigid tween.

**Fan-out.** At `P = 1`, a `preloadFanDuration` (1.15 s) timeline:

    t.to(G, { active: 1, duration: 1.15,        ease: 'discGlide' }, 0)
    t.to(G, { others: 1, duration: 1.15 * 0.85, ease: 'none'      }, 1.15 * 0.1)

`others` starts at `0.115 s`, so the lead disc lands while the others are already 10 % in — the fan
overlaps the tail of the rise instead of queueing behind it.

---

## 3. Carousel

Behaviour and intent: `design-system.md` §4.3.

### 3.1 The gallery transform — set once per frame

```js
zt.rotation.x = THREE.MathUtils.degToRad(w.galleryRotX)   // -30
zt.rotation.y = THREE.MathUtils.degToRad(w.galleryRotY)   // -30
zt.scale.setScalar(w.galleryScale)                        // 1.08
```

Why `−30° / −30°`: `disc-3d-spec.md` §5.2.

### 3.2 The arc layout — verbatim

```js
function yr() { return Math.round(clamp(L, 0, m.length - 1)) }   // active index
let n = yr()

let r = !y && !dt                              // r = can-flow (not reduced-motion, not touch)
let a = r ? clamp(Math.sign(Ce) * Math.sqrt(Math.abs(Ce)) * w.flowLean,
                  -w.flowLeanMax, w.flowLeanMax) : 0
let o = r ? Math.min(w.flowDipMax, Math.abs(Ce) * w.flowDip) : 0

Dn.forEach((r, p) => {                          // r = disc record, p = disc index
  let m = p - L                                 // relative float index
  let h = Math.abs(m)
  let g = p === n                               // is this the active disc
  let _ = m * 0.35                              // θ  ← THE CURVE PARAMETER
  let v = Math.max(Qt * 3, 0.12, w.depthGap)    // v = max(0.03, 0.12, 1.0) = 1.0
  let b = Math.sin(_) * w.hGap * 2.4           // X = sin(θ) · 5.52
  let x = (g ? w.activeDiscY : 0) - o * (g ? 0.7 : 1)
  let S = -Math.cos(_) * v * 2.4 + v * 2.4      // Z = (1 − cos(θ)) · 2.4

  let C = 0                                     // rotX
  let T = -_ + a * (g ? 1 : 1.12)               // rotY = −θ (tangent) + lean
  let E = -a * w.flowBank * (g ? 0.7 : 1)      // rotZ = bank

  let D = g ? l : Math.max(u, 1 - h * (1 - u) * (c ? 1 : .6))   // scale
  // D  = target scale   (u = inactiveScale = .8, c = coarse pointer)
  // O  = scale after the inbound-stagger multiplier is applied
  // ee = visibility: true once the stagger passes flightPopScale

  // ── inbound stagger (non-active discs only) → verbatim in §3.4 ──────
  // leader: O = D * G.active ; others: O = D * s, S -= (1 - min(1, s)) * flightRecede

  r.group.visible = ee

  // ── hover ───────────────────────────────────────────────────────────
  let te = +(R === p && He < 0)               // target: hovered and nothing dragging
  r.hover += (te - r.hover) * Math.min(1, e * 10)
  r.hover > .001 && (C += r.hover * w.hoverTiltStrength * Ue,
                     T += r.hover * w.hoverTiltStrength * U)

  // ── follow smoothing → verbatim in §3.3 ─────────────────────────────

  // ── wobble impulse (or hard reset on coarse pointers) ───────────────
  if (dt) {
    r.pushX = r.pushY = r.pushZ = 0
    r.pushVX = r.pushVY = r.pushVZ = 0
    r.pushRotX = r.pushRotY = r.pushRotVX = r.pushRotVY = 0
  } else {
    /* …see §4.5 for the integrator… */
  }
  // (continues below with the eased application of b, x, S, O, C, T, E)
})
```

The `s` used in the follow-rate `k` is the coarse-pointer flag resolved earlier, not the local
`let s` inside the stagger block — the two shadow in the minified source. Read the coarse branch as
"touch uses a flat layout with no stagger".

Inactive scale is `max(inactiveScale, 1 − |Δ|·(1 − inactiveScale)·0.6)` on desktop. The `0.6` is `1.0`
on coarse pointers, where far discs shrink harder to suggest depth **[inferred]**
(`evidence.md` §4.3). The active disc is `1.0`.

Position table (`hGap = 2.3`, `depthGap = 1.0` → `Rx = 5.52`, `Rz = 2.4`; step **20.054° per disc**):
§9. Non-monotonic `x` past Δindex ≈ +4.49 and why it matters: `design-system.md` §4.3.

`rotY = −θ` is the tangent of a *circle* of that angle, while the position follows an *ellipse*
(radii `5.52` vs `2.4` — squashed 2.3× along Z). The site uses the cheap circular tangent and it reads correctly because the
Z squash is shallow. Substitute the exact ellipse tangent `atan2(Rx·cos θ, Rz·sin θ)` if you want a
mathematically tangent layout.

### 3.3 Follow smoothing — verbatim

```js
let s = Ie ? w.followTight : w.followBase       // 15 or 11
let k = clamp(s - h * w.followFalloff, w.followMin, w.followTight)   // 6.5 … 15
let A = (t || y || dt) ? 1 : Math.min(1, e * k)                        // dt * k

r.group.position.x += (b - r.group.position.x) * A
r.group.position.y += (x - r.group.position.y) * A
r.group.position.z += (S - r.group.position.z) * A
let e2 = r.group.scale.x + (O - r.group.scale.x) * A
r.group.scale.setScalar(e2)
r.group.rotation.x += (C - r.group.rotation.x) * A
r.group.rotation.y += (T - r.group.rotation.y) * A
r.group.rotation.z += (E - r.group.rotation.z) * A
```

`α = min(1, dt·k)` is a frame-rate-independent exponential smoother. At 60 fps with `k = 11`,
`α ≈ 0.183` (≈ 90 ms time constant); distant discs drop to `k = 6.5` → `α ≈ 0.108` and trail
further. `Ie` (dragging) switches the base rate from `11` to `15` for a tighter follow.

### 3.4 Inbound stagger — verbatim

```js
let e = clamp(G.others, 0, 2)
let t = G.inbound
let n = clamp(t ? w.flightStaggerIn : w.flightStagger, 0, .9)   // 0.28 or 0.45
let r = Math.max(1, Math.round(w.flightStaggerMax))            // 4
let i = (Math.min(h, r) / r) * n
let a = Math.max(.1, 1 - n)
let o = clamp((Math.min(1, e) - i) / a, 0, 1)
let s = (t ? K(o) : o * (2 - o)) + Math.max(0, e - 1)           // K = parsed discGlide

let ee = s > clamp(t ? w.flightPopScaleIn : w.flightPopScale, 0, .9)   // 0.02 or 0.35
let O = D * s
let c = 1 - Math.min(1, s)
c > 1e-4 && (S -= c * w.flightRecede)                           // flightRecede = 2.2
```

Per-disc delay with `flightStaggerIn = 0.28`, `flightStaggerMax = 4`:

    distance h   delay i
    0            0.000
    1            0.070
    2            0.140
    3            0.210
    4+           0.280 (capped)

Discs beyond index 4 share the same delay — the cap keeps a 12-disc row from taking 3 s to assemble.
`flightRecede = 2.2` pushes not-yet-arrived discs back in Z so they emerge *from depth* instead of
popping in at their final position. `flightPopScale` / `flightPopScaleIn` are the visibility
thresholds: `0.35` normally, `0.02` during the intro (where `G.others` starts at 0 and would otherwise
hide everything).

### 3.5 Snap spring — verbatim

```js
// friction on release
Se *= w.friction ** dt60                       // friction = 0.89

// only when drag velocity has decayed to 0
if (Se === 0) {
  let delta = Math.round(L) - L
  Te += delta * (w.snapFreq ** 2) * n          // snapFreq = 9.5 → 90.25
  Te *= Math.exp(-w.snapDamping * n)           // snapDamping = 12
  L  += Te * n
  if (Math.abs(delta) < 8e-4 && Math.abs(Te) < 0.004) { L = Math.round(L); Te = 0 }
}
```

`ω = 9.5 rad/s`, `ω² = 90.25`; the `exp(−12·dt)` term is the damping, `≈ 0.819` per frame at
`dt = 1/60`. Critical damping for `ω = 9.5` would need `c = 19`; at `12` the system is **underdamped
and overshoots very slightly** — one small bounce into the detent, which reads as magnetic.

### 3.6 Wheel quantiser — config only

```js
wheelNoiseFloor: .3, wheelStepThreshold: 6, wheelEventCap: 24,
wheelEnvelopeTau: 550, wheelRiseFactor: 1.2,
wheelTickGap: 34, wheelTickRatio: 1, wheelPauseGap: 130, wheelIdleReset: 150,
wheelMinStepTick: 90, wheelMinStepFlick: 190,
wheelSustainDelay: 480, wheelSustainRatio: .8
```

The envelope follower (τ `550 ms`, floor `0.3`, rise `1.2`) turns noisy wheel deltas into a smooth
accumulator; crossing `wheelStepThreshold = 6` advances exactly one index. The `Tick` / `Flick` /
`Sustain` family tells a mouse-wheel notch from a trackpad flick from a sustained scroll, each with
its own minimum interval. Readable port: `implementation.md` §8.3.

### 3.7 Drag

```js
// target index from horizontal drag
let s = -(deltaX / rect.width) * (6 * w.dragSensitivity)   // dragSensitivity = 0.95

// velocity smoothing
Se += (target - Se) * w.dragVelocitySmoothing             // 0.32
Se  = clamp(Se, -w.dragMaxVelocity, w.dragMaxVelocity)     // ±0.5
```

`dragStartDistance: 5` px before a `pointerdown` is promoted to a drag (so a click still registers as
a click). `maxSpinAngle: 180` degrees caps the manual spin accumulated during the drag (§4.7).

Disc re-level after drag:

```js
o.to(t, { spinX: 0, spinY: 0, duration: y ? .15 : w.resetDuration, ease: 'power3.out', overwrite: true })
```

### 3.8 Lenis — verbatim

```js
function $r() {
  if (Q.lenis || !Q.hasLenis) return
  let e = matchMedia('(pointer: coarse)').matches
  Q.lenis = new Lenis({
    lerp:              e ? 1 : 0.165,
    wheelMultiplier:   e ? 1 : 1.25,
    touchMultiplier:   1,
    allowNestedScroll: true
  })
  Q.hasScrollTrigger && Q.lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add(e => { Q.lenis.raf(e * 1e3) })
  gsap.ticker.lagSmoothing(0)
}
```

- **`gsap.ticker.add(e => Q.lenis.raf(e * 1000))`** — Lenis must be driven by GSAP's ticker, not its
  own rAF, or the two clocks drift and ScrollTrigger's scrub jitters.
- **`gsap.ticker.lagSmoothing(0)`** — default lag smoothing freezes time after a long frame, which
  desynchronises Lenis. Disable it.

The gallery then opts out of page scroll entirely:

```js
e.setAttribute('data-lenis-prevent', '')
e.setAttribute('data-lenis-prevent-wheel', '')
```

### 3.9 Snap and the flow kick

One index change is never a raw position write. `mr()` tweens a proxy and adds a **kick** to the
row's flow velocity so the whole ribbon banks into the turn. Verbatim:

```js
function pr(source, distance){                              // distance = |targetIndex - L|
  let n = w.snapDuration                                    // 0.46
  switch (source) {
    case 'wheel': return { duration: n + .05,               ease: D, kick: 2.5 }
    case 'key':   return { duration: Math.min(.6, n - .04 + distance * .05), ease: D, kick: 4 }
    case 'click': return { duration: clamp(.45 + distance * .11, n, 1.05),
                          ease: D, kick: Math.min(5, distance * 1.4) }
    case 'flick': return { duration: n + .1,                ease: D, kick: 0 }
    default:      return { duration: n, ease: 'power3.out', kick: 0 }
  }
}

async function mr(e, t = {}){
  let n = clamp(e, 0, m.length - 1), r = ++Ge, i = Math.abs(n - L)
  let a = pr(t.source || 'snap', i)
  Dt = n; Ke = n; qe = n; Se = 0; Te = 0
  gsap.killTweensOf(dr)
  if (!reduced && a.kick) {                                 // ← THE FLOW KICK
    let sign = Math.sign(n - L)
    sign && (Ce = clamp(Ce + sign * a.kick, -12, 12))
  }
  $()
  if (i > w.renderRadius) { await Xn(n, Math.min(3, w.renderRadius)); if (N || r !== Ge) return }
  else Xn(n, w.renderRadius + 1)

  if (dr.value === L || reduced || t.immediate) { L = n; dr.value = n; we = n; Ce = 0; er(); ur(n); $(3); return }

  gsap.to(dr, { value: n, duration: t.duration ?? a.duration, ease: t.ease ?? a.ease,
                overwrite: true,
                onUpdate: () => { L = dr.value },
                onComplete: () => { L = n; ur(n) } })
  $(3)
}
```

Three separate ideas, all needed:

1. **`kick` is added to `Ce`, the flow velocity, not to the position.** `Ce` is already decayed and
   consumed every frame by the arc: it produces `flowLean` (a sqrt curve, so a small kick banks
   disproportionately), `flowDip` and `flowBank`. A wheel notch therefore banks the *whole row* left
   then right, which is what sells "the ribbon is being flicked" rather than "an index changed".
   Clamp is `±12`, so a frantic scroll cannot wind up a permanent lean.
2. **Duration scales with distance**, capped: `click` ranges `0.46 → 1.05 s` for `distance` `0 → ≥5.5`.
   A one-step flick is crisp; a six-disc jump is a deliberate sweep. `key` is capped at `0.6 s` so
   held arrow keys never build a sluggish ramp.
3. **Only `flick` and the default get `kick: 0`.** A flick is already physical — it arrived with
   velocity — so adding a second impulse would double-count. `Ce = 0` is reset explicitly on the
   immediate/reduced path so a stale kick cannot leak into the next move.

`ur()` is what fires the text transitions (§6):

```js
e.dispatchEvent(new CustomEvent('discgallerychange',
          { bubbles: true, detail: { index: W, film: i } }))
```

`discgallerychange` fires **on index change**, not on wheel event, and not on settle — which is
exactly why §6 needs its own settle timer.

---

## 4. Pointer wobble

Behaviour and intent: `design-system.md` §4.4.

### 4.1 Normalised pointer

```js
function Cr(e) {
  let t = X.domElement.getBoundingClientRect()
  let n = e.clientX - t.left
  let r = e.clientY - t.top
  return Sr.x =  (n / t.width)  * 2 - 1,
         Sr.y = -((r / t.height) * 2 - 1),
       { x: n, y: r, rect: t }
}
```

### 4.2 Normalised velocity

```js
let t = performance.now(), n = t - Me;  Me = t
if (n < 120) {                                    // discard stale samples
  let t = 16.7 / Math.max(8, n)
  ke = (e.clientX - z) * t
  Ae = (e.clientY - je) * t
}
z = e.clientX; je = e.clientY
```

`16.7 / dtMs` extrapolates the per-frame delta to a 60 Hz frame, so a 240 Hz mouse produces the same
impulse as a 60 Hz one.

### 4.3 Wipe impulse — verbatim

```js
function Er(e) {                                   // e = disc index under cursor
  if (y) return                                   // reduced motion → skip
  let t = Dn.get(e); if (!t) return
  if (Math.hypot(ke, Ae) < w.wipeMinSpeed) return  // 9 px/frame floor
  let n = w.wipePushMax                           // 0.5
  let r = w.wipeSpinMax                           // 0.4
  t.pushVX    += clamp(ke * w.wipePush, -n, n)    // 0.012
  t.pushVY    -= clamp(Ae * w.wipePush, -n, n)
  t.pushRotVY += clamp(ke * w.wipeSpin, -n && r, r)  // 0.009 — note: clamped to ±0.4
  t.pushRotVX += clamp(Ae * w.wipeSpin, -r, r)
  $()                                             // mark dirty
}
```

The `-n && r` is transcribed as found; the intended bound is `±wipeSpinMax` (`±0.4`), as in the next
line and as the config key `wipeSpinMax` states. The ceilings are hard: a fast flick adds at most `0.5` units of
velocity, so worst-case displacement is bounded however violently the cursor moves.

### 4.4 Press impulse — verbatim

```js
function Dr(e) {
  if (y) return
  let t = Dn.get(e)
  t && (t.pushVZ    -= w.pressDepth,                            // 0.55
       t.pushRotVY += wr.x * w.pressTilt,                      // 1.5
       t.pushRotVX -= wr.y * w.pressTilt,
       $())
}
```

`wr` is populated by the raycast:

```js
function Tr() {
  if (!jn.length) return -1
  xr.setFromCamera(Sr, Rt)
  let e = xr.intersectObjects(jn, !false)[0]
  return e ? ( e.uv ? (wr.x = e.uv.x * 2 - 1, wr.y = e.uv.y * 2 - 1)
                   : (wr.x = 0, wr.y = 0),
              e.object.userData.index ?? -1 )
           : -1
}
```

The pick mesh is a `CircleGeometry(1, 24)`, `visible: false, depthWrite: false`, one per disc, so
`wr` is **the hit position in the disc's own local space, −1 … +1**.

Worked cases: press far right (`wr.x = 1, wr.y = 0`) → `pushRotVY = 1.5`, `pushRotVX = 0`; click 30 %
right of centre (`wr.x = 0.3`) → `pushRotVY = +0.45`, `pushRotVX = 0`; press top (`wr.x = 0, wr.y = 1`) →
`pushRotVY = 0`, `pushRotVX = −1.5`; top-left → both fire, independent signs; dead centre → pure Z
push, zero tilt. No normalising, no symmetry restoration, no `lerp` toward neutral.

### 4.5 Integration — verbatim

```js
let t = Math.abs(pushX) + Math.abs(pushY) + Math.abs(pushZ)
      + Math.abs(pushVX) + Math.abs(pushVY) + Math.abs(pushVZ)
      + Math.abs(pushRotX) + Math.abs(pushRotY)
      + Math.abs(pushRotVX) + Math.abs(pushRotVY)

if (t > 8e-4) {
  let n = Math.exp(-w.pushDamping * e)      // 4.5
  let i = Math.min(1, e * w.pushReturn)     // 3.4

  pushX    += pushVX    * e ; pushVX    *= n
  pushY    += pushVY    * e ; pushVY    *= n
  pushZ    += pushVZ    * e ; pushVZ    *= n
  pushRotX += pushRotVX * e ; pushRotVX *= n
  pushRotY += pushRotVY * e ; pushRotVY *= n

  pushX    -= pushX    * i
  pushY    -= pushY    * i
  pushZ    -= pushZ    * i
  pushRotX -= pushRotX * i
  pushRotY -= pushRotY * i

  b += pushX;  x += pushY;  S += pushZ
} else {
  pushX = pushY = pushZ = pushVX = pushVY = pushVZ = pushRotX = pushRotY = pushRotVX = pushRotVY = 0
}
```

**Why not a real spring.** `pushV *= exp(−4.5·dt)` is velocity damping; `push −= push·min(1, dt·3.4)`
is a *linear* pull to zero. A harmonic spring stores energy in position and overshoots; this one
cannot — once velocity decays, position walks home monotonically. One sharp kick, one ease-out
recovery, ~0.5 s, no ringing.

**Recovery estimate.** At 60 fps the velocity term dies in ~`1/4.5 ≈ 0.22 s` (to 1/e); the position
pull to 5 % takes ~`−ln(0.05)/3.4 ≈ 0.88 s` of pure pull after velocity is gone, but the two overlap
so the visible total is ~0.5 s. Sleep at `8e-4` is what makes the end exact.

### 4.6 Application — verbatim

```js
r.spin.rotation.x = r.spinX + r.pushRotX
r.spin.rotation.y = r.spinY + r.pushRotY
r.group.renderOrder = Math.round(500 + r.group.position.z * 10 - p * .01)
```

Position impulses land on `group`; rotation impulses on the inner `spin`. The `group` → `spin`
hierarchy lets the disc wobble rotationally without fighting the arc's `rotY = −θ`
(`disc-3d-spec.md` §1).

### 4.7 Spin-accumulation resistance — verbatim

```js
function Or(e, t) {
  let n = THREE.MathUtils.degToRad(w.maxSpinAngle)     // 180°
  let r = Math.max(0, Math.abs(e) - n * 0.8) / n
  let a = 1 / (1 + r * r * 14)
  return e + t * (Math.sign(t) === Math.sign(e) || e === 0 ? a : 1)
}
```

Full authority below 144° (`0.8 × 180`), then a `1/(1+14r²)` rolloff. Dragging the same disc one way
gets progressively harder; dragging back is unimpeded — you cannot spin a disc forever.

---

## 5. Hover

Behaviour and intent: `design-system.md` §4.5.

### 5.1 Blend + tilt — verbatim

```js
let te = +(R === p && He < 0)                     // target = 1 if hovered and nothing dragging
r.hover += (te - r.hover) * Math.min(1, e * 10)   // e = dt
r.hover > .001 && (C += r.hover * w.hoverTiltStrength * Ue,
                   T += r.hover * w.hoverTiltStrength * U)
```

`hoverTiltStrength = 0.21`; `C` is `rotX`, `T` is `rotY`, `Ue` pointer Y, `U` pointer X. Identical
coefficients → isotropic: cursor right rolls about Y, cursor down pitches about X by the same
magnitude per unit. Blend time constant `1/10 = 0.1 s`, same rate in and out — no asymmetric hover.

### 5.2 Cursor states

```css
[data-disc-gallery]                          { cursor: grab }
[data-disc-gallery][data-disc-dragging=true] { cursor: grabbing; user-select: none }
```

```js
e.style.cursor = R >= 0 ? 'pointer' : 'grab'
```

### 5.3 Click → flip — verbatim

```js
function kr(e) {
  let t = Dn.get(e); if (!t) return
  t.resetTween?.kill()
  let n = Math.abs(t.spinY) > Math.PI / 2          // face-on? → flip to back
  t.resetTween = o.to(t, {
    spinY: n ? 0 : Math.PI,
    spinX: 0,
    duration: y ? .15 : .75,
    ease: 'power3.inOut',
    overwrite: true,
    onUpdate: $, onComplete: () => { t.resetTween = null }
  })
  $()
}
```

### 5.4 Auto re-level on index change — verbatim

```js
He !== p && !r.resetTween && (r.spinX += (0 - r.spinX) * Math.min(1, e * 2.5))
```

Rate `2.5` (time constant `0.4 s`) — deliberately slower than the hover blend (`10`). A disc that
becomes inactive slowly returns face-on, reading as "settling back into the rack".

### 5.5 Scribble ring config

```js
scribbleEnabled: 1, scribbleColor: '#000000',
scribbleFps: 10, scribblePoints: 24, scribbleJitter: .028,
scribbleLoops: 2, scribbleLoopGap: .045, scribblePadding: .06,
scribbleWidth: .012, scribbleSweep: .68, scribbleSweepJitter: .4,
scribbleIn: [.3, .5, .72], scribbleOut: [.72, .5, .3], scribbleLag: 15
```

Regenerated at 10 fps (not 60) to sell the hand-drawn quality: two concentric loops of 24 points,
each jittered by `0.028`. `scribbleIn` / `scribbleOut` are the staggered alpha/weight triples on the
way in and (reversed) out. `scribbleLag: 15` frames of hysteresis stops flicker when the raycast
oscillates on the pick-mesh boundary.

---

## 6. Text transitions

**One engine drives two groups.** Behaviour and intent: `design-system.md` §4.6.

```js
var F = 'energy', xe = 'M0,0 C0.32,0.72 0,1 1,1'
var I = {
  settleDelay: 100, dragRevealCap: 500,
  outDuration: .4, outLineStagger: .016, outItemStagger: .016, outShift: -120,
  inDuration:  .7, inLineStagger:  .05,  inItemStagger:  .035, inGroupGap: .06,
  inShift: 120, heightDuration: .5,
  readyTimeout: 4e3, reverseSpeed: 1.6, pollInterval: 40
}
var L  = ['.experience_info', '.testimonial_wrap']      // ← TWO groups, index = group number
var Se = '.divider-horizontal'
var Ce = '.info-content_panel'
var we = '[data-film-target], ' + Se + ', [data-disc-reveal]'
```

`L` is not a filter, it is the **group index**. Group 0 is the top-left copy; group 1 is the
bottom-centre critic row. The `inGroupGap` offset (§6.2) is what separates them on screen.

### 6.1 Collection — nested targets are hoisted, rules are re-sorted

```js
let u = []
L.forEach((selector, groupIndex) => {
  e.querySelectorAll(selector).forEach(scope => {
    let targets = Array.from(scope.querySelectorAll(we))
    // drop any target that is already inside another target in this list
    targets.filter(el => !targets.some(other => other !== el && other.contains(el)))
           .map(el => ({ element: el, group: groupIndex,
                         kind: el.matches(Se) ? 'rule' : 'text',
                         mask: null, split: null, lines: [], restHeight: 0, naturalHeight: 0 }))
           .forEach(entry => {
             if (entry.kind !== 'rule') { u.push(entry); return }
             // A rule that lives INSIDE a panel is spliced in immediately before
             // that panel's text entry, so the rule always animates with its own row.
             let panel = entry.element.closest(Ce)          // .info-content_panel
             if (!panel) { u.push(entry); return }
             let i = u.findIndex(candidate => panel.contains(candidate.element))
             i < 0 ? u.push(entry) : u.splice(i, 0, entry)
           })
  })
})
```

Two things to copy:

- **Hoist.** If `[data-film-target]` ever nested inside another, only the outermost is animated.
- **Re-sort rules.** `.divider-horizontal` is absolutely positioned on top of its `.info-content_panel`,
  so DOM order would put every rule before every text entry. The splice pulls each rule up to sit
  immediately before its own panel's text, which is what makes the stagger read as
  *title → rule → year → rule → credit* rather than *rule, rule, rule, title, year, credit*.

If `u` is empty the engine removes `data-disc-panel-defer` and bails — a page with no copy targets
still works.

### 6.2 Two masks, not one

There is an **outer** mask per target and an **inner** mask per line. They do different jobs.

```css
[data-disc-mask]         { min-width: 0; display: block; position: relative }
[data-disc-mask='clip']  { overflow: hidden }      /* ← the clip is a STATE, toggled by JS */
[data-disc-line-mask]    { display: block; overflow: hidden }
.disc-line               { will-change: transform; display: block }
```

```js
// outer mask: created once, wrapping the whole target element
function f(entry){
  let el = entry.element, parent = el.parentElement
  if (parent?.hasAttribute('data-disc-mask')) { entry.mask = parent; return }
  let m = document.createElement('div')
  m.setAttribute('data-disc-mask', 'idle')
  parent.insertBefore(m, el); m.appendChild(el); entry.mask = m
}
function m(clip){                       // one toggle for every outer mask at once
  u.forEach(entry => entry.mask?.setAttribute('data-disc-mask', clip ? 'clip' : 'idle'))
}
// inner masks: SplitText lines
let split = new SplitText(el, { type: 'lines', linesClass: 'disc-line' })
split.lines.forEach(line => {
  let t = document.createElement('div')
  t.setAttribute('data-disc-line-mask', '')
  line.parentNode.insertBefore(t, line); t.appendChild(line)
})
```

`data-disc-mask='idle'` is `overflow: visible`; `'clip'` is `overflow: hidden`. The engine clips only
while it is animating, so the copy is not permanently masked (which would clip a descender or a focus
ring). **The outer mask animates `height`** so a group collapsing to zero does not leave a gap; the
inner masks never animate height — the lines simply slide inside them.

Height measurement is three helpers, not one tween:

```js
h()  // remember resting height of every outer mask   → restHeight = mask.offsetHeight
g()  // pin every outer mask to its resting height     → mask.style.height = `${n}px`
_()  // measure natural height                          → temporarily height:auto, record, restore
```

and the reveal **skips the height tween when it is a no-op**:

```js
let t = parseFloat(mask.style.height)
if (Number.isFinite(t)) {
  if (Math.abs(t - entry.naturalHeight) < .5) { mask.style.height = ``; return }   // already right
  timeline.to(mask, { height: entry.naturalHeight, duration: I.heightDuration,
                      ease: n, overwrite: 'auto' }, 0)
}
```

The `< .5` guard is what stops a `height` tween from being scheduled on every single disc change —
most films have the same number of rows, so most of the time there is nothing to collapse.

### 6.3 The reveal — `ge()`, and where `inGroupGap` is spent

```js
function ge(){                                   // start the IN transition
  he()                                           // kill a pending reveal
  g(); l()                                       // pin heights; ask the panel to write new text
  if (reduced) { pe(); M(); return }             // reduced: snap, no tween
  C = 'revealing'
  b(u)                                           // (re)SplitText every text entry
  u.forEach(entry => {
    if (entry.kind === 'rule') { gsap.set(entry.element, { scaleX: 0,
                                    transformOrigin: 'left center' }); return }
    gsap.set(entry.element, { clearProps: 'transform' })
    x(entry)                                     // re-split into lines
    gsap.set(entry.lines, { yPercent: I.inShift })      // 120 — enter from BELOW
    gsap.set(entry.element, { autoAlpha: 1 })            // ← the fade
  })
  _()                                            // record natural heights

  T = gsap.timeline({ onComplete: N })
  /* …height tweens at position 0, see §6.2… */

  let at = 0, group = u[0].group
  u.forEach(entry => {
    if (entry.group !== group) { group = entry.group; at += I.inGroupGap }   // ← 0.06 s
    entry.kind === 'rule'
      ? T.to(entry.element, { scaleX: 1, duration: I.inDuration, ease: n, overwrite: 'auto' }, at)
      : T.to(entry.lines,   { yPercent: 0, duration: I.inDuration, ease: n,
                              stagger: I.inLineStagger, overwrite: 'auto' }, at)
    at += I.inItemStagger                                                  // ← 0.035 s
  })
}
```

The stagger is **cumulative across kinds**, so the full order on screen for the top-left copy is:

    entry                          group  start (s)   runs to (s)
    title lines                    0      0.000        0.700   (line stagger 0.05 inside)
    meta lines                     0      0.035        0.735
    rule 1                         0      0.070        0.770
    year lines                     0      0.105        0.805
    rule 2                         0      0.140        0.840
    credit lines                   0      0.175        0.875
    …
    first review card              1      0.060+       0.760   (group gap applied on group change)
    second review card             1      0.095+       0.795

**Two behaviours that are easy to get wrong — both verified against the bundle** (how round 1 got
them wrong: `evidence.md` §4.2b):

1. **`transformOrigin` is `left center`, not `right center`.** The OUT tween writes
   `transformOrigin: 'right center'`, but its end state is `scaleX: 0`, where the origin is
   unobservable. The state you actually see is the one `ge()` sets before the IN tween:
   `scaleX: 0` at `left center`. So **rules retract toward, and grow out of, the LEFT edge.**
   Confirmed at runtime: the settled `.divider-horizontal` carries `transform-origin: 0% 50%`. If you
   only write the OUT tween you ship rules that collapse the wrong way on the way back in.
2. **Text entries also fade via `autoAlpha`, they do not only slide.** `autoAlpha: 0` is the hidden
   state and `autoAlpha: 1` is set at reveal start; the `yPercent` slide rides on top. A pure slide
   with no fade reads as a mechanical shutter; the fade is what lets it read as ink appearing.

`at` advances by `inItemStagger` for rules **and** text (advancing only for text stacks every rule at
`t = 0`), and `inGroupGap` is added on group *change*, not per numeric group index — `u[0].group`
seeds `at = 0`, so group 0 always starts at 0 and every later group gets exactly one gap.

### 6.4 The exit — `me()`

```js
function me(){
  if (reduced) { … snap … }
  if (C === 'revealing' && T) {                     // mid-reveal → reverse, don't restart
    let tl = T; T = null; w = tl; O = true; C = 'hidden'
    tl.eventCallback('onComplete', null)
    tl.eventCallback('onReverseComplete', pe)
    tl.timeScale(I.reverseSpeed).reverse()          // 1.6
    return
  }
  pe(); C = 'hidden'; g()
  b(u.filter(e => !e.lines.length))
  w = gsap.timeline({ onComplete: pe })
  u.forEach((entry, i) => {
    let at = i * I.outItemStagger                  // 0.016
    if (entry.kind === 'rule') {
      w.to(entry.element, { scaleX: 0, transformOrigin: 'right center',
                            duration: I.outDuration, ease: n, overwrite: 'auto' }, at)
      return
    }
    x(entry)                                       // split if not already
    gsap.set(entry.element, { autoAlpha: 1 })
    w.to(entry.lines, { yPercent: I.outShift, duration: I.outDuration, ease: n,
                        stagger: I.outLineStagger, overwrite: 'auto' }, at)
  })
}
```

`outShift` is `−120`, so lines leave **upward**. They enter from `+120`, **below**. Out and in are
deliberately not mirror images: the copy rises away and falls back in.

`pe()` is the completion path and it does the DOM cleanup the tweens cannot:

```js
function pe(){
  gsap.set(textEntries.map(e => e.element), { autoAlpha: 0 })   // hide the whole target
  revertSplit(entry)                                             // SplitText.revert()
  gsap.set(textEntries.map(e => e.element), { clearProps: 'transform' })
  l()                                                           // panel writes the new copy
}
```

Note `pe()` reverses the outer masks to `'idle'` and drops the pinned heights, so the copy is fully
inert between transitions.

### 6.5 Triggers and gates

Five conditions must ALL hold before the reveal starts:

```js
function fe(){                                     // polled every I.pollInterval = 40 ms
  let t = now()
  if (w && t > E) pe()                             // an OUT finished → write + reveal
  if (T && t > D) N()                              // an IN finished
  if (C === 'hidden' && !w && !released
      && ue()                                      // data-disc-flight is NOT 'true'  (§2.7)
      && le() && ce() && de()) {                   // panel API exists / past readyTimeout / page visible
    let dragging = e.getAttribute('data-disc-dragging') === 'true'
    if (t - lastChange >= (dragging ? I.dragRevealCap : I.settleDelay)) ge()
  }
  if (w || T || C === 'hidden') oe()               // keep polling while busy
}

function de(){                                     // Barba page-transition guard
  let container = e.closest('[data-barba="container"]')
  if (!container) return true
  let s = getComputedStyle(container)
  return s.visibility !== 'hidden' && parseFloat(s.opacity || '1') > .01
}
```

`data-disc-flight` is the bridge between the preloader and this engine: `M.revealCopy()` removes it
(§2.7) and the copy begins its own reveal on the next 40 ms tick. `settleDelay` and `dragRevealCap`
(§6) mean the copy waits for the index to stop moving, so a fast scroll cannot strobe the block.

The listener is one line:

```js
e.addEventListener('discgallerychange', () => { changed = true; me(); se() })
```

### 6.6 An external `out()` / `release()` pair

The engine exposes a promise-based pair so a page transition can drain the copy before swapping DOM:

```js
e.discTransitionsFlow = {
  out()      { released = true;
               if (reduced) { hideAll(); return Promise.resolve() }
               if (C === 'hidden' && !w && !T) return Promise.resolve()
               return new Promise(resolve => { pending.push(resolve); me(); oe() }) },
  release()  { released = false; se() }
}
```

`out()` resolves only once the OUT timeline has completed (`pe()` flushes `pending`). This is the
hand-off that keeps a Barba route change from tearing text mid-slide.

### 6.7 The DOM and CSS contract

To receive this behaviour an element must satisfy all of the following. This is the whole list.

```html
<!-- group 0: top-left copy -->
<aside class="experience_info">
  <div class="info-content">
    <div class="info-content_panel">              <!-- rule is absolutely positioned onto this -->
      <div class="divider-horizontal top"></div>
      <div class="info-content_label-wrap"><p>DIRECTED BY</p></div>
      <p data-film-target="primary-credit">Kane Parsons</p>
    </div>
    …
  </div>
</aside>

<!-- group 1: bottom-centre critic row -->
<div class="testimonial_wrap">
  <figure class="testimonial" data-review-target-item data-review-status="active">
    <div data-film-target="review-stars" class="testimonial__stars" role="img"
         aria-label="5 out of 5 stars">
      <i class="star"></i> × 5
    </div>
    <div class="testimonial__text">
      <p data-film-target="review-publication">The Playlist</p>
      <p data-film-target="review-testimonial">“Something Far More Haunting”</p>
    </div>
  </figure>
  <figure class="testimonial" data-review-target-item data-review-status="active"> … </figure>
</div>
```

```css
.experience_info {
  grid-column-gap: .5em; grid-row-gap: .5em;
  flex-flow: column; justify-content: flex-start; align-items: flex-start;
  width: 100%; max-width: 20.8333%;            /* 1/5 of the viewport — the disc owns the frame */
  display: flex;
}
.info-content_panel {
  justify-content: space-between; align-items: flex-start;   /* label left, value right */
  width: 100%; padding-top: .25em; padding-bottom: .25em;
  display: flex; position: relative;
}
.info-content_label-wrap { padding-top: .3em }
.divider-horizontal      { background: currentColor; width: 100%; height: .5px }
.divider-horizontal.top  { position: absolute; inset: 0% 0% auto }

.testimonial_wrap {
  grid-column-gap: .5em; grid-row-gap: .5em;      /* → gap: .5em */
  justify-content: center; align-items: center;  /* centred — this is the bottom-CENTRE row */
  margin-left: auto; margin-right: auto;
  padding-bottom: 2.5em;                          /* 6em ≤991px, 8em ≤767px */
  pointer-events: none;
  display: flex;
}
.testimonial {
  grid-column-gap: 1.625em; grid-row-gap: 1.625em;
  min-width: var(--testimonial-width, 20rem);
  flex-flow: column; display: flex;
}
.testimonial__stars {
  grid-column-gap: .125em; grid-row-gap: .125em;
  justify-content: center; align-items: center; display: flex;
}
.star { aspect-ratio: 1; width: fit-content; height: 1em }
.testimonial__text { grid-column-gap: .325em; grid-row-gap: .325em; flex-flow: column; display: flex }
[data-review-line] { white-space: nowrap; display: block }

.testimonial[data-review-status='empty'] { display: none }
.experience_info .divider-horizontal,
.testimonial_wrap .divider-horizontal     { will-change: transform }

/* the loader gate */
html[data-preload] :is(.experience_info, .testimonial_wrap) { visibility: hidden }
```

Responsive: `.experience_info { max-width: 50% }` at ≤991 px, `max-width: 100%` at ≤767 px, and
**`.testimonial_wrap { display: none }` at ≤767 px** — the critic row is dropped on phones entirely,
so the single group gap it consumed never applies there.

The A24 layout is a one-fifth column on the left and a centred row on the bottom edge; the disc has
the other four fifths plus the full height.

---

## 7. Complete verified config object

Extracted verbatim from the app chunk (§0). The single authoritative list.

```js
var c = {
  artScale: 1, artX: 0, artY: 0, artRot: 0, artBright: 1, artContrast: 1, artSat: 1,
  texGrain: .59, texPrint: .35, texScratches: .36, texGloss: 1,
  frontClearcoat: .8, frontRough: .42, frontMetal: .48,
  backBaseColor: '#1A1E2A', backRough: .23, backMetal: 1, backClearcoat: .34,
  backIridescence: 1, backIridIOR: 1.86, backIridThickness: 900, backRadialDetail: 1,
  edgeColor: '#FFFFFF', edgeRoughness: .04, edgeMetalness: .55, edgeBleed: .026,
  hubColor: '#FFFFFF', hubTransmission: .68, hubRoughness: .38, hubIOR: 2,
  hubMatrixIntensity: .85, hubMatrixWidth: .4, hubFrostedEdge: .54,
  discThickness: .01, edgeBevel: 1,
  holeSize: .14, hubSize: .24,
  galleryScale: 1.08, hGap: 2.3, depthGap: 1, activeDiscY: .06,
  galleryRotX: -30, galleryRotY: -30, inactiveScale: .8,
  cameraDistance: 4.4, cameraFOV: 40, exposure: .86, environmentIntensity: 1,
  keyIntensity: .75, keyColor: '#FFF9E8', keyX: 3.5, keyY: -8,
  fillIntensity: .3, rimIntensity: .75, rimColor: '#499FF5', topStripIntensity: 1.9,
  fogColor: '#FFFFFF',
  hoverTiltStrength: .21,
  dragSensitivity: .95, dragVelocitySmoothing: .32, dragMaxVelocity: .5,
  friction: .89, maxSpinAngle: 180, resetDuration: 1.2, dragStartDistance: 5,
  snapDuration: .46,
  flowLean: .055, flowLeanMax: .3, flowBank: .32, flowDip: .014, flowDipMax: .09,
  followTight: 15, followBase: 11, followFalloff: 1.15, followMin: 6.5,
  spawnSlide: .9, spawnShrink: .72,
  snapFreq: 9.5, snapDamping: 12,
  wipePush: .012, wipePushMax: .5, wipeSpin: .009, wipeSpinMax: .4, wipeMinSpeed: 9,
  pushDamping: 4.5, pushReturn: 3.4,
  pressDepth: .55, pressTilt: 1.5,
  flightRecede: 2.2, flightStagger: .45, flightStaggerIn: .28, flightStaggerMax: 4,
  flightPopScale: .35, flightPopScaleIn: .02,
  preloadBoost: .8, preloadGrowBy: .5, preloadSpin: 1.1,
  preloadRiseFrom: 3, preloadRiseDepth: .7, preloadFanDuration: 1.15,
  touchDragSpan: 0, touchFlickVelocity: .035, touchFit: 1, touchPeek: 1,
  touchMinScale: .3, touchMaxScale: 3, touchGap: 2.2, touchDepth: .5,
  touchLeadMaxHeight: .6, touchDropY: 1,
  touchActiveScale: 1.5, touchInactiveScale: .6,
  wheelNoiseFloor: .3, wheelStepThreshold: 6, wheelEventCap: 24,
  wheelEnvelopeTau: 550, wheelRiseFactor: 1.2,
  wheelTickGap: 34, wheelTickRatio: 1, wheelPauseGap: 130, wheelIdleReset: 150,
  wheelMinStepTick: 90, wheelMinStepFlick: 190,
  wheelSustainDelay: 480, wheelSustainRatio: .8,
  scribbleEnabled: 1, scribbleColor: '#000000', scribbleFps: 10, scribblePoints: 24,
  scribbleJitter: .028, scribbleLoops: 2, scribbleLoopGap: .045, scribblePadding: .06,
  scribbleWidth: .012, scribbleSweep: .68, scribbleSweepJitter: .4,
  scribbleIn: [.3, .5, .72], scribbleOut: [.72, .5, .3], scribbleLag: 15,
  renderRadius: 5, initialPreloadRadius: 5, artResolution: 1024
}
```

### Runtime overrides

The app chunk maps **34** `data-disc-*` attributes onto config keys, as a flat attribute-name → key
object. The verified mapping begins:

```js
var l = {
  'data-disc-gallery-scale':        'galleryScale',
  'data-disc-gap':                  'hGap',
  'data-disc-depth':                'depthGap',
  'data-disc-camera-distance':      'cameraDistance',
  'data-disc-camera-fov':           'cameraFOV',
  'data-disc-render-radius':        'renderRadius',
  'data-disc-preload-radius':       'initialPreloadRadius',
  'data-disc-art-resolution':       'artResolution',
  'data-disc-snap-duration':        'snapDuration',
  'data-disc-wheel-threshold':      'wheelStepThreshold',
  'data-disc-flight-stagger':       'flightStagger',
  'data-disc-touch-fit':            'touchFit',
  // …
}
```

Other `data-disc-*` state/markup attributes confirmed in source: `data-disc-canvas`,
`data-disc-gallery`, `data-disc-autofocus`, `data-disc-pa…` (pan state), `data-disc-panel-defer`,
`data-disc-dragging`, `data-disc-line-mask`, `data-disc-preloading`, `data-disc-flight` (flight
state).

**Ship your config as `data-disc-*` attributes.** The whole motion system becomes tunable from
markup with no code changes — it is how the original author iterated. Resolver: `implementation.md` §3.

---

## 8. Renderer

Moved with the rest of the renderer setup (pixel ratio, colour space, tone mapping, canvas styles,
`transmissionResolutionScale`): `disc-3d-spec.md` §5.5.

---

## 9. Complete disc position table (reference)

Positions for `L` exactly at an integer, `hGap = 2.3`, `depthGap = 1.0`, active at index 0,
`flowLean = dip = 0` (row at rest). Computed from `x = sin θ · 5.52`, `z = (1 − cos θ) · 2.4`:

    index   θ rad    θ deg      x         y       z         rotX   rotY     rotZ   scale
    −5      −1.750   −100.268   −5.4316   0       +2.8278   0      +1.750   0      0.80
    −4      −1.400   −80.214    −5.4397   0       +1.9921   0      +1.400   0      0.80
    −3      −1.050   −60.161    −4.7882   0       +1.2058   0      +1.050   0      0.80
    −2      −0.700   −40.107    −3.5561   0       +0.5644   0      +0.700   0      0.80
    −1      −0.350   −20.054    −1.8928   0       +0.1455   0      +0.350   0      0.88
     0       0        0         0.0000   +0.06    0.0000    0      0        0      1.00
    +1      +0.350   +20.054    +1.8928   0       +0.1455   0      −0.350   0      0.88
    +2      +0.700   +40.107    +3.5561   0       +0.5644   0      −0.700   0      0.80
    +3      +1.050   +60.161    +4.7882   0       +1.2058   0      −1.050   0      0.80
    +4      +1.400   +80.214    +5.4397   0       +1.9921   0      −1.400   0      0.80
    +5      +1.750   +100.268   +5.4316   0       +2.8278   0      −1.750   0      0.80

Scale is nearly binary: at `|Δ| = 1` it is `1 − 1 × 0.2 × 0.6 = 0.88`; at `|Δ| = 2` it is `0.76`,
below the `inactiveScale = 0.8` floor, so it clamps. Leader `1.00`, immediate neighbours `0.88`,
everything else `0.80`.

`activeDiscY = 0.06` lifts the leader 0.06 gallery units — a subtle nod that keeps the active disc
off the ribbon's exact axis.

At `|Δ| = 4` the row has swept its full `x` extent (`5.44`) and begun receding in Z (`1.99`).
`renderRadius: 5` culls to ±5 indices, so discs at ±5 sit at the fog boundary (`Fog('#FFFFFF', 7,
14)`) and are barely visible: the visible row is effectively `Δindex ∈ [−3, +4]`.

---

## 10. Critic review cards — the bottom-centre row

Group 1 of the §6 engine (`L[1] = '.testimonial_wrap'`). Content contract, verbatim.

### 10.1 Reading the source

```js
function me(item){                       // item = one [data-review-source-item]
  let t = {}
  item.querySelectorAll('[data-film-field]').forEach(el => {
    let k = FIELD(el.getAttribute('data-film-field'))
    k && (t[k] = readField(el, k))
  })
  return { publication: t['review-publication'] || ``,
           testimonial: t['review-testimonial'] || ``,
           rating: parseFloat(t['review-stars'] || `0`) || 0 }
}
```

A film keeps its own list, and **the cards are a fixed pool of slots, not generated per film**:

```js
let v = Array.from(root.querySelectorAll('[data-review-target-item]'))
              .filter(el => !el.closest('[data-film-item]'))
if (!v.length) v = Array.from(root.querySelectorAll('.testimonial_wrap > .testimonial'))
                              .filter(el => !el.closest('[data-film-item]'))
```

```js
function ir(film){
  let n = film.reviews.slice(0, v.length)               // at most one review per slot
  e.setAttribute('data-review-count', String(n.length))
  e.setAttribute('data-has-reviews', n.length ? 'true' : 'false')
  v.forEach((slot, i) => {
    let r = n[i]
    if (!r) { slot.setAttribute('aria-hidden', 'true')
              slot.setAttribute('data-review-status', 'empty'); return }
    slot.removeAttribute('aria-hidden')
    slot.setAttribute('data-review-status', 'active')
    let pub = pick(slot, 'review-publication'),
        quo = pick(slot, 'review-testimonial'),
        str = pick(slot, 'review-stars')
    pub && (pub.textContent = r.publication)
    quo && ye(quo, r.testimonial)
    ve(str, r.rating)
  })
}
```

**Empty slots get `data-review-status="empty"`, which is `display: none`.** Never delete a slot, never
build the row in JS, and never leave a dangling slot visible — a half-empty centred row reads as a
layout bug. The `review-count` / `has-reviews` attributes are the state to assert against.

### 10.2 Stars — `ve()`, five slots, no glyph swapping

```js
function ve(el, rating){
  if (!el) return
  let n = clamp(Number(rating) || 0, 0, 5)
  el.querySelectorAll('.star, [data-review-star]').forEach((star, i) => {
    let remaining = n - i
    let status = remaining >= 1 ? 'full' : remaining >= .5 ? 'half' : 'empty'
    star.setAttribute('data-star-status', status)
    star.setAttribute('aria-hidden', 'true')
    star.style.display = status === 'empty' ? 'none' : ``
    star.style.opacity  = `1`
    star.style.clipPath = status === 'half' ? 'inset(0 50% 0 0)' : `none`
    star.style.marginRight = status === 'half' ? `-0.5em` : ``
  })
  el.style.justifyContent = `center`
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', `${n} out of 5 stars`)
}
```

Every star is the same glyph. A half star is the **same glyph clipped to its left half plus a
negative right margin**, which is why `-0.5em` is applied to the half and only the half — the row
stays centred with no reflow. All five are `aria-hidden`; the container carries one
`aria-label="4.5 out of 5 stars"`. `aria-label` interpolates the raw number, so `4` reads "4 out of 5
stars" and `4.5` reads "4.5 out of 5 stars" — do not round it in the label.

### 10.3 The two-line pull quote — `ye()`, a real balance solver

The quote is split into exactly **two** lines, each in its own `[data-review-line]`, and the split
point is chosen by minimising a cost that trades length balance against even word count:

```js
function ye(el, raw){
  if (!el) return
  let n = clean(raw).replace(/^[“”"'‘’]+/, ``).replace(/[“”"'‘’]+$/, ``)
  el.replaceChildren()
  if (!n) return
  let words = n.split(/\s+/)
  if (words.length === 1) { el.textContent = `“${n}”`; return }     // short quote: one line
  let best = 1, bestCost = Infinity
  for (let i = 1; i < words.length; i++) {
    let a = words.slice(0, i).join(` `)
    let b = words.slice(i).join(` `)
    let cost = Math.abs(a.length - b.length) + Math.abs(i - (words.length - i)) * 2
    if (cost < bestCost) { bestCost = cost; best = i }
  }
  let top = document.createElement('span'), bottom = document.createElement('span')
  top.setAttribute('data-review-line', '1')
  bottom.setAttribute('data-review-line', '2')
  top.textContent    = `“${words.slice(0, best).join(` `)}`
  bottom.textContent = `${words.slice(best).join(` `)}”`
  el.append(top, bottom)
}
```

The `× 2` weight on the word-count term breaks ties toward an even number of words, which is what
stops a 9-word quote producing an 8/1 split just because the 8-word head happens to match the tail's
character length. Curly quotes are added by this function and stripped on input — **the data must
not carry them**, or you get doubled quotes. `[data-review-line] { white-space: nowrap }` keeps each
line from wrapping again after the split, so the solver's result is final.

### 10.4 The measured result

From the live page, lead film `Backrooms`, 1440 × 900:

    ★★★★★  THE PLAYLIST     “SOMETHING FAR MORE
                              HAUNTING”
    ★★★★½  THE DAILY BEAST  “CASTS A
                              SURREALISTIC SPELL”

Two cards, `gap: .5em`, each `min-width: 20rem`, centred on the viewport's bottom edge, sitting
under the disc with the disc's lower edge clearing them. The left card is 3 stars-shorter than the
right one's text block, so the two stars rows are centred independently — which is why
`justify-content: center` is set in JS on every write and not just in CSS.

---

## 11. Page transitions (Barba)

Source: the same `main.qdXy8l6N.js` as §0, plus the Barba runtime in `_astro/bootstrap.dru0MhUJ.js`
(177 648 B; `barba.init`, hooks and `window.barba` live there, the glue is in the main chunk). The
entry script `ExportPage.astro_astro_type_script_index_0_lang.DQlUkOwJ.js` (312 B) only imports
`bootstrap` when `[data-barba=wrapper]` exists. Provenance and what was run live: `evidence.md` §8.

Reading key for §11–§13: `config` blocks (`An`, `zn`, `R`, `Y`) are copied as shipped. Code marked
*readable form* or *reformatted* keeps the module-level minified names (`Bn`, `Hn`, `Ln`, `Vn`, `Y`,
`R`, `De`, …) and the numeric/ordering logic, but local variables are renamed and unrelated lines
are elided (`/* … */`) — grep the identifiers, do not diff the text. Unverified items are marked.

Behaviour and intent: `design-system.md` §4.8. This build ships none of it — the task list is
`PROMPT.md`.

### 11.1 `barba.init` — verbatim

```js
CustomEase.create('main', '0.625, 0.05, 0, 1')
gsap.defaults({ ease: 'main', duration: Q.durationDefault })      // durationDefault: not extracted

barba.hooks.enter(e => { ni(e) })
barba.hooks.afterEnter(e => { qr(e.next.container); Q.hasLenis && Q.lenis && Q.lenis.start() })
barba.hooks.after(() => requestAnimationFrame(() => {
  Q.hasLenis && Q.lenis && ti(); Q.hasScrollTrigger && ScrollTrigger.refresh(); Qr()
}))

barba.init({
  debug: Hr, timeout: 7e3, preventRunning: true,
  transitions: [...Hn, {
    name: 'default', sync: true,
    async once(e)  { return Gr(), Kr(e.next.container), Jr(e.next.container) },
    async leave(e) { return Yr(e.current.container, e.next.container) },
    async enter(e) { return Xr(e.next.container) },
  }],
})
```

`Hn` is the array of three disc transitions (§11.5). `preventRunning: true` makes a second `go()`
during a running transition a no-op; the scroll-next exit also checks
`window.barba.transitions.isRunning` itself (§13.5).

The default pair, verbatim:

```js
function Yr(current, next) {                       // leave
  let tl = gsap.timeline({ onComplete: () => current.remove() })
  return Q.reducedMotion ? tl.set(current, { autoAlpha: 0 })
                         : (tl.to(current, { autoAlpha: 0, duration: .4 }), tl)
}
function Xr(next) {                                // enter
  let tl = gsap.timeline()
  if (Q.reducedMotion) {
    tl.set(next, { autoAlpha: 1 }); tl.add('pageReady'); tl.call($, [next], 'pageReady')
    return new Promise(r => tl.call(r, null, 'pageReady'))
  }
  tl.add('startEnter', .4)
  tl.call(Qr, null, 'startEnter')
  tl.fromTo(next, { autoAlpha: 0 }, { autoAlpha: 1 }, 'startEnter')
  tl.add('pageReady'); tl.call($, [next], 'pageReady')
  // …resolves on 'pageReady'
}
```

### 11.2 Prefetch — verbatim

The active disc's detail URL is prefetched 450 ms after the active index settles on it, once per
URL; the scroll-next section prefetches its target on idle.

```js
function lr(index) {                               // called on every active-index change
  clearTimeout(cr)
  cr = setTimeout(() => {
    if (N) return                                  // gallery destroyed
    let url = f(m[index]?.detailUrl)
    if (url && !sr.has(url) && window.barba && typeof window.barba.prefetch == 'function') {
      sr.add(url); try { window.barba.prefetch(url) } catch {}
    }
  }, 450)
}
// scroll-next, `$n()`: requestIdleCallback(() => barba.prefetch(j.href), { timeout: 1500 })
//   armed by Y.idleBoot (2500 ms) or by the first IntersectionObserver hit
```

Verified live: the XHR `GET /production/backrooms` completes before the click; after landing on
that page `GET /production/the-invite` fires with no input.

### 11.3 Click on the active disc — verbatim

```js
function Ar(e) {                                   // e = the DOM event (or undefined for keys)
  let t = m[W], n = f(t?.detailUrl)                // W = active index
  if (!n) return false
  if (e?.metaKey || e?.ctrlKey) return window.open(n, '_blank', 'noopener'), true
  if (e?.type === 'click' && Dr(W), window.barba?.go)         // Dr = press impulse (§4.4)
    try { return window.barba.go(new URL(n, location.href).href), true } catch {}
  return window.location.href = n, true
}
```

The press impulse is fired first so the disc is already moving when the transition starts. Inactive
discs flip instead (§5.3). The nav dropdown film links carry `data-barba-prevent`; the gallery
listens for a `discgallerynavigate` event (`detail.title` → index → `moveTo(i, 'click')`) — who
dispatches it was not traced.

### 11.4 Config — verbatim

```js
An = { outDuration: .5, inDuration: 1.05, boost: 1.45, artTimeout: 900,
       flipReadyTimeout: 5e3, poseTimeout: 6500, fallbackFade: .4 }                // disc-flip
zn = { outDuration: .55, exitDuration: .8, exitSpin: Math.PI / 2, carryZIndex: 60,
       inDuration: 1.05, detailFade: .35, artTimeout: 900, readyTimeout: 5e3,
       fallbackFade: .4 }                                                           // detail open/close
```

### 11.5 The three disc transitions

    name                from → to (namespace)            sync   disc API used
    disc-flip           films|television → films|television   true   discGalleryFlip.out / .in
    disc-detail-open    films|television → production       true   discGalleryDetail.out (leave side only)
    disc-detail-close   production → films|television       true   discGalleryDetail.in (enter side only)
    default             anything else (incl. production → production)

Every transition falls back to a plain `autoAlpha` fade of `fallbackFade` (`0.4`, `detailFade 0.35`
on close) when reduced motion is set or the disc API is missing on the container. The `discGallery*`
objects are exposed on the `[data-disc-gallery]` element: `{ out(opts), in(opts) }`.

**`disc-detail-open`, reformatted:**

```js
{ name: 'disc-detail-open', sync: true,
  from: { namespace: ['films', 'television'] }, to: { namespace: ['production'] },
  before()      { Bn = { hold: Nn(), handedOver: false } },        // Nn() = deferred promise
  beforeEnter(e){ gsap.set(e.next.container, { autoAlpha: 0 }) },
  leave(e) {
    let cur = e.current.container, gal = Mn(cur)                   // Mn = querySelector('[data-disc-gallery]')
    return (async () => {
      gsap.set(cur, { pointerEvents: 'none' })
      let detail = gal?.discGalleryDetail
      if (jn() || !detail) { await gsap.to(cur, { autoAlpha: 0, duration: zn.fallbackFade }).then()
                             Bn.hold.resolve(); return }
      let drained = gal.discTransitionsFlow?.out() ?? Promise.resolve(), carry = null
      let handOver = () => {
        if (Bn.handedOver) return; Bn.handedOver = true
        carry = Vn(gal, zn.carryZIndex)                            // §11.6
        gsap.set(cur, { autoAlpha: 0, position: 'fixed', top: 0, left: 0, right: 0 })
        window.scrollTo(0, 0); Bn.hold.resolve()
      }
      await Promise.all([detail.out({ ...zn, onHandOver: handOver }), drained])
      handOver(); carry?.remove(); carry = null
    })()
  },
  enter(e) {
    let next = e.next.container
    return (async () => {
      await Bn.hold.promise; window.scrollTo(0, 0)
      await gsap.fromTo(next, { autoAlpha: 0 }, { autoAlpha: 1, duration: zn.detailFade }).then()
      In(next)                                                     // clearProps position,top,left,right,transform,…
    })()
  } }
```

Order that matters: `before` creates `hold`; the copy is drained **in parallel** with the disc's
exit; the canvas is handed to `body` the moment the exit reaches `onHandOver`; only then does the
next page become visible. The next container is `autoAlpha: 0` from `beforeEnter` until `hold`
resolves.

**`disc-detail-close`** mirrors it: `before` creates `hold`; `beforeEnter` sets the next container to
`autoAlpha 0` and **pre-creates up to four `Image`s** from every
`data-film-field="disc-art-url"` in `e.next.html` so the covers are decoded before the disc grows;
`leave` fades the current container to 0 over `detailFade` (`0.35`), `scrollTo(0, 0)`, resolves
`hold`; `enter` waits up to `readyTimeout` for the next container's `discGalleryDetail`, then runs
`detail.in({ inDuration, artTimeout, holdUntil })`, where `holdUntil` waits for `hold`, `scrollTo(0,0)`
and sets the container to `autoAlpha 1`.

**`disc-flip`** is the same skeleton with `discGalleryFlip`: `leave` first awaits
`Promise.race([posed, 6500 ms])` (the incoming side signals `onPosed` when its disc stands edge-on),
then `flip.out(An)` in parallel with the copy drain, then hides the current container, sets the next
container to `autoAlpha 1`, `scrollTo(0,0)` and resolves `hold`. `enter` waits up to
`flipReadyTimeout` (5 s) for `discGalleryFlip` on the next container.

### 11.6 The canvas carry — verbatim

The WebGL canvas is **moved**, not recreated, so the exiting disc survives the DOM swap:

```js
function Vn(gallery, zIndex) {
  let box = gallery?.querySelector('[data-disc-canvas]') || null
  let cv  = box?.querySelector('canvas') || null
  if (!box || !cv) return null
  let r = box.getBoundingClientRect()
  if (!r.width || !r.height) return null
  let wrap = document.createElement('div')
  wrap.setAttribute('data-disc-carry', ''); wrap.setAttribute('aria-hidden', 'true')
  Object.assign(wrap.style, { position: 'fixed', top: `${r.top}px`, left: `${r.left}px`,
    width: `${r.width}px`, height: `${r.height}px`, zIndex: String(zIndex),
    pointerEvents: 'none', overflow: 'visible' })
  wrap.appendChild(cv); document.body.appendChild(wrap)
  return wrap
}
```

Everything else about the canvas (renderer, size, render loop) is untouched. `wrap.remove()` drops
the canvas with it, which is only correct because the exiting gallery is being destroyed.

### 11.7 `out()` / `in()` on the disc — readable form

Both start with `Kr(!0)` (cancel copy/hover), `Ge += 1` (generation token), kill the position and
state tweens, zero the wobble impulse, set `data-disc-flight`, clear hover. The position is snapped
to the active disc first.

```js
// DETAIL OUT  (_r) — the lead presses in, springs, leaves edge-on
function _r(o = {}) {
  let outDuration = o.outDuration ?? .55,  pressScale = o.pressScale ?? .94, pressTime = o.pressTime ?? .12,
      springScale = o.springScale ?? 1.015, springTime = o.springTime ?? .16,
      exitDuration = Math.max(0, o.exitDuration ?? outDuration),
      exitSpin = Math.max(0, o.exitSpin ?? Math.PI / 2), onHandOver = o.onHandOver
  /* …shared prologue… */
  let snap = (reduced || dist < .002) ? 0 : clamp(.12 + dist * .25, .12, .4)   // dist = |L − activeIndex|
  // reduced: others = 0, active = .001, render once, onHandOver(), resolve
  tl.to(position, { value: active, duration: snap, ease: 'power2.out' }, 0)    // if snap > 0
  let m = snap * .6
  tl.to(G, { active: pressScale,  duration: pressTime,  ease: 'power2.out' }, m)
  tl.to(G, { active: springScale, duration: springTime, ease: 'power2.out' }, m + pressTime)
  tl.to(G, { others: 0, duration: outDuration, ease: 'none' },               m + pressTime)
  let h = m + pressTime + springTime
  tl.to(G, { active: .001, duration: exitDuration, ease: 'power2.in' }, h)
  // spin to the next edge-on angle at or beyond spinY + exitSpin:
  let k = Math.ceil((lead.spinY + exitSpin - Math.PI / 2) / Math.PI - 1e-6)
  tl.to(lead, { spinY: Math.PI / 2 + k * Math.PI, spinX: 0, duration: exitDuration, ease: 'power2.in' }, h)
  tl.call(onHandOver, null, Math.min(m + pressTime + outDuration, h + exitDuration))   // idempotent
}

// DETAIL IN  (vr) — wait for art, pose the lead at scale .001, grow to 1
async function vr(o = {}) {
  let inDuration = o.inDuration ?? 1, artTimeout = o.artTimeout ?? 900
  let compiled = renderer.compileAsync ? Promise.race([renderer.compileAsync(scene, camera).catch(() => {}),
                                                       sleep(1500)]) : Promise.resolve()
  await Promise.race([Promise.all(coverFor(active, 2).map(loadCover)), sleep(artTimeout)])
  await compiled; if (destroyed) return
  textures.forEach(t => renderer.initTexture(t))      // upload now, not on the first visible frame
  inbound = true; G.others = 0; G.active = .001; lead.spinY = 0; lead.spinX = 0
  render(); o.onPosed?.()
  if (o.holdUntil) await o.holdUntil
  document.dispatchEvent(new CustomEvent('discgalleryreveal'))
  if (galleryEl.getAttribute('data-disc-autofocus') !== 'false') focusGalleryUnlessUserIsElsewhere()
  // reduced: others = active = 1, spinY = 0, render
  tl.call(resolve, null, inDuration)
  tl.call(releaseCopy, null, inDuration * .9)         // gt(): the copy lands with the disc
  tl.to(G, { active: 1, duration: inDuration, ease: D }, 0)               // D = discGlide
  tl.to(G, { others: 1, duration: inDuration * .85, ease: 'none' }, inDuration * .1)
}
```

`coverFor(active, 2)` = the active disc plus the next one. The flip pair (`hr` / `gr`) differs only in
what the lead does: out tweens `active` to `boost` (`1.45`) `power2.in` and `spinY → π/2`
(starts at `snap·.6`, others fade `outDuration`); in starts at `spinY −π/2`, `active = boost`,
resolves both to `0` / `1` with `others` starting at `inDuration·.28` — the same shape as the
section switch already built (`build-notes.md` §3 item 3).

---

## 12. Ink dissolve — `[data-dissolve]`

The "ink" that eats the production hero as you scroll is **not** part of the Barba transition. It is
a scroll-scrubbed `clip-path` on the section, tracing the iso-contour of an animated noise field.
Source: `Ae()` and its helpers in the main chunk (`R`, `Le`, `ze`, `Ke`, `Ge`, `Me`).

### 12.1 Contract

    track      [data-dissolve-track]      positioned ancestor; falls back to the section's parent
    section    [data-dissolve]            the element that is CLIPPED (the hero)
    reveal     section.nextElementSibling the element uncovered underneath (the trailer section)
    bleed      [data-dissolve-bleed]      optional wrapper inside `reveal`; its img/video is pulled up
    safe       [data-dissolve-safe], a, button, input…   cursor drops never open over these

Written to `track`: `--dissolve-apron`, `--dissolve-overlap`, `--dissolve-bleed`, `--dissolve-rest`.
Written to `section`: `style.clipPath = path(evenodd, "…")` and `data-dissolve-ready`.
The effect does not run (and removes nothing) when: reduced motion, `ScrollTrigger` is missing,
`CSS.supports('clip-path','path("M 0 0 L 1 0 Z")')` is false, or the section has no
`nextElementSibling`. Cursor drops run only on `(hover: hover) and (pointer: fine)`.

Every `R` key has a per-section CSS-variable override, `--dissolve-<kebab>` (`--dissolve-reach`,
`--dissolve-life-speed`, `--dissolve-cursor-drops`, …), read from the section's computed style and
clamped (`scale ≥ 20`, `grid ≥ 4`, `finish ≥ .05`, `edge`/`below`/`life`/`smooth`/`finish ≤ 1`).

### 12.2 Config `R` — verbatim

```js
R = { reach: .4, peek: .19, wander: .13, intro: 1.5, center: .13, centerX: .5, edge: .5, below: .4,
      life: .85, lifeSpeed: .15, lifeEdge: .15, idleFps: 60,
      cursor: 1, cursorReserve: .8, cursorBite: .5, cursorDrop: 90, cursorSpread: 2.6, cursorWobble: .22,
      cursorWake: .15, cursorGlide: .3, cursorTurn: .3, cursorSpeed: 900, cursorRise: .05, cursorRelax: 1.1,
      cursorBand: 120, cursorGuard: 110, cursorDrops: 28, cursorStep: .3, cursorStir: 1.3, cursorScatter: .35,
      cursorWobbleMax: .6, cursorThin: .9, cursorCoalesce: 6,
      surge: .55, agitate: 2.2, velocityRef: 2600, velocityEase: .13,
      finish: .85, themeAt: .45, bleedSafety: .85,
      scale: 230, warp: 1.25, detail: .16, minBlob: 45, smooth: 1, grid: 16, seed: 1, margin: 3,
      safety: .12, simplify: 0, noiseMean: .478, noiseSpread: .26 }
```

### 12.3 Driver — readable form

```js
B = ScrollTrigger.create({
  trigger: reveal,
  start: section.getAttribute('data-dissolve-scroll-start') || 'clamp(top bottom)',
  end: () => `top top-=${Math.ceil(l + m + h)}`,     // l = section height − apron, m = surge px, h = cursor reserve
  scrub: true, invalidateOnRefresh: true, onRefresh: Ye, onToggle: e => { e.isActive && qe() },
})

function Ke(time) {                                  // gsap.ticker callback while the trigger is active
  let dt = Math.min(.1, Math.max(0, time - last)); last = time
  let span = B.end - B.start, r = span ? (B.scroll() - B.start) / span : 0
  V = clamp(s.finish < 1 ? r / s.finish : r, 0, 1)   // progress, reaches 1 at `finish` of the trigger
  if (U >= 1 && (r < -.05 || r > 1.05)) { Je(); return }          // out of range → stop the ticker
  let vel = clamp(B.getVelocity() / R.velocityRef, -1, 1)
  Fe += (vel - Fe) * R.velocityEase;  Ne = Fe * m                  // smoothed velocity; px of surge
  if (U < 1) { let t = s.intro; t <= 0 ? U = 1 : visible() && (U = Math.min(1, U + dt / t)) }   // intro 0→1 over 1.5 s
  H += dt * (s.lifeSpeed * (1 + Math.abs(Fe) * s.agitate)) * Math.PI * 2   // field phase: boils faster while scrolling
  let wait = Math.abs(Fe) > .004 || U < 1 || cursorBusy || s.idleFps >= 60 ? 0 : 1 / s.idleFps
  if (time - lastDraw >= wait) { lastDraw = time; Ge() }
}

function Ge(force) {                                 // build and apply the clip
  let u = Me(U)                                      // smootherstep(intro)
  let y = l - u * (l - (rest + V * (b - rest))) - Ne * u   // contour level in px from the top
  let life = H * s.life * u
  /* skip when |Δy| < .3 px, |Δlife| < .004 and |Δu| < .002, unless forced / cursor busy */
  let path = ze(Le(field, y + C * u, s), field, s)   // Le → polygons, ze → SVG path
  path.indexOf('NaN') === -1 && (section.style.clipPath = `path(evenodd, "${path}")`)
}
function Me(e) { let t = clamp(e, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10) }   // smootherstep
```

### 12.4 Field and contour — summary (not verbatim)

    field        value = n0·cos φ + n1·sin φ + slope     two value-noise layers, φ = H (the "life" phase);
                                                          domain-warped (warp 1.25), detail 0.16, scale 230 px
    grid         16 px cells, `margin` 3 cells outside the box; framed cells forced to 1e9 so the
                 contour never touches the box edge
    contour      marching squares at iso level `t`; segments linked by `linkA/linkB/linkN`, walked into
                 closed loops; loops below `minBlob` (45 px²) are dropped; `smooth` rounds corners
    output       one SVG path, `evenodd`, in the section's own pixel space
    cursor       up to `cursorDrops` (28) ripple drops stamped at the pointer along its path, each
                 `cursorDrop` (90 px) wide, decaying over `cursorRelax` (1.1 s); skipped over
                 `[data-dissolve-safe]`/interactive boxes (`cursorGuard` 110 px margin) and outside
                 `cursorBand` (120 px) of the live edge
    theme        two `data-theme-change` probes are inserted into `track` and split at `themeAt` (.45) of
                 the way the edge has travelled, so the nav theme flips with the ink, not with the scroll

The exact noise hash, the domain-warp function and the walker (`G`, `Ze`, `Ye`, `Xe`) were read but
not transcribed; a clean-room port needs only the table above and `R`.

---

## 13. Scroll-next — the disc at the bottom of a detail page

`zt()` in the main chunk, `[data-scroll-next]`. Its own `THREE` scene (own canvas, own renderer; the
`Y.look` block mirrors the shelf's material/lighting keys), a deterministic "next title" and a push
meter that leaves the page.

### 13.1 Two modes — read the attribute first

    attribute on the section             mode        next title                            leaves by
    (none) — the production pages        next        the item after the current one,       push meter → `barba.go`
                                                     same `type`, wrapping (`Lt(list,false)`)
    data-scroll-next-random              roulette    random item, chosen by a reel on      click disc → reel →
                                         (the 404 page)  click                              push meter

The production page template has **no** `data-scroll-next-random`; the roulette (§13.4) is not part
of the flow in the question and is optional for a port.

### 13.2 Contract

    [data-scroll-next-canvas]   mount for the section's own canvas
    [data-scroll-next-label]    wraps kicker + title; `-kicker`, `-title` (optional `-kicker-film` /
                                `-kicker-television`; `{title}` token, `|` = line break)
    [data-scroll-next-link]     the anchor; `href` and `aria-label` are written ("Next film: <title>")
    [data-scroll-next-list]     hidden CMS list; `[data-scroll-next-item]` →
                                `[data-scroll-next-field]` ∈ title, type, disc-art-url, slug, year, genre,
                                runtime, director(s), detail-url
    [data-scroll-next-hint]     optional; fades in (`0.6 s`) once the disc has landed
    .scroll-to__row > .divider-horizontal   rules the label sits between (`kickerRule 2`, `labelRule 3`)
    [data-scroll-next-credit]   `[data-reveal]` children are masked and rise `revealRise` (120 %)

Attribute overrides read with `parseFloat`: `data-scroll-next-disc-vh`, `-disc-vw`, `-disc-top`,
`-push`, `-kicker-rule`, `-label-rule`, `-kicker-align`, `-seed`.

### 13.3 Config `Y` — verbatim (non-look keys)

```js
Y = { restTiltX: -30, restTiltY: -30, arriveTiltX: -52, arriveTiltY: 10, pushTiltX: -16, pushTiltY: -10,
      touch: { discVw: 108, restTiltY: -14, lineHeight: 1.2, lift: .2, descent: .24 },
      kickerRule: 2, kickerAlign: 'left', labelRule: 3, discTop: 4.7, discVh: 120, discVw: 130,
      scatterRules: [2, 3, 4], scatterThreeFrom: 99, scatterStartMin: .02, scatterStartMax: .08,
      scatterOffsetMin: .18, scatterOffsetMax: .38, scatterTolerance: 1.3, slideRestShare: .6,
      arriveStart: .3, arriveEnd: .97, arriveDrop: .9, popScale: .35, popIn: 1.05, popOut: .45,
      ruleDuration: .9, revealDuration: .8, revealStagger: .09, revealRise: 120,
      spinGain: .0032, spinMax: 7, spinFollow: 9, spinFriction: 2.4, idleSpin: -.14,
      idleAmount: .022, idleRate: .5,
      pushWheel: 620, pushTouch: 380, pushKey: .34, pushHold: 180, pushDrain: .9, pushSettle: 350,
      pushGap: 140, pushSurge: 1.6, pushSurgeMin: 6, pushLift: .1, pushGrow: 1.04, pushSpin: -6,
      pushEase: 10, fillFps: 10, fillPadding: .09, fillWidth: .02, fillJitter: .018, fillPoints: 40,
      rimSamples: 96,
      exitDuration: .7, exitSpin: -16, exitLift: .35, exitCopyDuration: .45, exitRuleDuration: .5, exitGo: .48,
      roulette: { arriveDelay: .25, arriveDuration: 1.9, reelDelay: .35, reelLength: 11, reelFast: .07,
                  reelSlow: .46, reelSpin: -11, centreVh: .58, centreVw: .8, settle: 1.15, lift: .85,
                  lines: [{ rule: 2, x: 0, move: -.05 }, { rule: 3, x: -.2, move: -.3 }, { rule: 3, x: .2, move: .3 }],
                  kicker: '', kickerTouch: '' },
      bootMargin: '150%', idleBoot: 2500, canvasTop: .5, pixelBudget: 26e5, maxPixelRatio: 1.5,
      restFps: 0, buildTimeout: 1500 }
```

### 13.4 Per-frame pose — readable form

`n` is the section's scroll progress 0…1 (a `ScrollTrigger` over the section, `top bottom` →
`bottom bottom`), `De` the push meter, `dt` seconds.

```js
function wn(dt) {
  let n = reduced ? 1 : Ce                                         // Ce: scroll progress
  let a = Ct((n - Y.arriveStart) / (Y.arriveEnd - Y.arriveStart))  // Ct = 1 − (1 − x)^3, clamped
  Bt += (De - Bt) * Math.min(1, dt * Y.pushEase)                   // eased push meter
  if (Math.abs(De - Bt) < .0015) Bt = De
  let o = Ct(Bt)
  we *= Math.exp(-dt * 6)                                          // scroll-velocity memory
  if (!reduced) {
    let t = clamp(-we * Y.spinGain, -Y.spinMax, Y.spinMax)         // scroll velocity → spin rate
    Math.abs(t) > Math.abs(dt_) * .5 ? dt_ += (t - dt_) * Math.min(1, dt * Y.spinFollow)
                                     : dt_ *= Math.exp(-dt * Y.spinFriction)
    ft = (ft + (dt_ + Y.idleSpin * a + Y.pushSpin * o + exit.spin) * dt) % (Math.PI * 2)   // disc spin
  }
  ut += dt
  let s = reduced ? 0 : Y.idleAmount * a
  idleX = Math.sin(ut * Y.idleRate * Math.PI) * s;  idleY = Math.cos(ut * Y.idleRate * Math.PI * .7) * s
  let rad = MathUtils.degToRad
  disc.rotation.x = rad(Y.arriveTiltX) * (1 - a) + rad(Y.restTiltX) * a * (1 - o) + rad(Y.pushTiltX) * a * o
  disc.rotation.y = rad(Y.arriveTiltY) * (1 - a) + rad(restTiltY)   * a * (1 - o) + rad(Y.pushTiltY) * a * o
  disc.visible = pop.scale >= Y.popScale - .001
  let size = restSize * Math.max(1e-4, pop.scale) * (1 + (Y.pushGrow - 1) * o) * exit.grow
  disc.position.set(…, restY - Y.arriveDrop * restSize * (1 - a) + Y.pushLift * restSize * o + exit.lift * restSize, 0)
  disc.scale.setScalar(size)
}
```

So the disc *arrives* tilted back (−52°/10°) and below its slot (`arriveDrop 0.9` discs), settles
into the rest tilt over `arriveStart`…`arriveEnd` of the section's scroll, spins from scroll velocity
(`spinGain`), idles (`idleSpin`), and under push spins (`pushSpin`), tilts to `pushTilt`, grows
(`pushGrow`) and lifts (`pushLift`).

### 13.5 Push meter and exit — readable form

```js
function atEnd() {                                   // Nn
  let l = window.siteState?.lenis
  if (l && typeof l.limit == 'number') return (typeof l.targetScroll == 'number' ? l.targetScroll : l.scroll) >= l.limit - 2
  return window.scrollY >= document.documentElement.scrollHeight - innerHeight - 2
}
function push(amount) {                              // Pn — `De` is the 0…1 meter
  if (leaving || destroyed || !atEnd() || (random && !(landed && !rolling))) return
  De = clamp(De + amount, 0, 1); lastPush = performance.now()
  if (De >= 1) { exitNow(); return }                 // Jn
  startDrain(); invalidate()
}
function drain(t) {                                  // Fn — rAF while De > 0
  let step = clamp((t - prev) / 1000, 0, .05); prev = t
  if (t - lastPush > Y.pushHold) De = Math.max(0, De - step * Y.pushDrain)
  /* stops at De <= 0 */
}
window.addEventListener('wheel', e => {
  let d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1); if (!d) return
  let now = performance.now(), gap = now - lastWheel; lastWheel = now
  let a = Math.abs(d), surge = a > Y.pushSurgeMin && a > prevAbs * Y.pushSurge; prevAbs = a
  if (atEnd()) {
    endSince ||= now
    if (!armed) { let settled = now - endSince >= Y.pushSettle, fresh = gap >= Y.pushGap || surge
                  if (!settled || !fresh) return; armed = true }   // a flick that carried you to the end never counts
    push(clamp(d, -140, 140) / pushWheel)                          // pushWheel = max(120, data-scroll-next-push ?? 620)
  }
}, { passive: true })
// touch: push(dy / (pushWheel · pushTouch / 620)); keys ArrowDown / PageDown / Space: push(Y.pushKey)

function exitNow() {                                 // Jn
  if (leaving || destroyed || window.barba?.transitions?.isRunning) return
  leaving = true; De = 1; stopDrain(); section.setAttribute('data-scroll-next-leaving', 'true'); hint(false)
  let go = () => { destroyed || (window.barba && typeof window.barba.go == 'function'
                                   ? window.barba.go(new URL(j.href, location.href).href) : location.href = j.href) }
  if (reduced || !sceneReady) { go(); return }
  let tl = gsap.timeline()
  tl.to(exit,  { spin: Y.exitSpin, lift: Y.exitLift, duration: Y.exitDuration, ease: 'power2.in' }, 0)
  tl.to(pop,   { scale: Y.popScale, duration: Y.popOut, ease: 'power2.in', onComplete: () => { pop.scale = 0 } }, 0)
  tl.to([...creditEls, ...labelEls], { yPercent: -Y.revealRise, duration: Y.exitCopyDuration, ease: 'main', stagger: .03, overwrite: 'auto' }, 0)
  tl.to(rules, { scaleX: 0, duration: Y.exitRuleDuration, ease: 'main', stagger: { each: .04, from: 'end' }, overwrite: 'auto' }, .05)
  tl.call(go, null, Y.exitGo)                        // 0.48 s — the page is replaced while the disc is mid-spin
  invalidate()
}
```

The hit test for a click on the disc is a 48-point polygon of the disc's silhouette projected to NDC
and tested with an even-odd ray cast (`qn`) — not the DOM box.

### 13.6 Roulette (`data-scroll-next-random` only) — readable form

```js
function spinReel(candidates) {                      // Wn
  let pool = candidates.filter(c => c !== j.next), pick = rand(pool.length ? pool : candidates)
  let reel = shuffle(candidates.filter(c => c !== pick)).slice(0, Math.max(1, Y.roulette.reelLength - 1))
  reel.push(pick)                                    // the winner is always last
  let { reelFast, reelSlow, reelSpin } = Y.roulette, n = reel.length, at = Y.roulette.reelDelay
  reel.forEach((c, i) => {
    let u = n > 1 ? i / (n - 1) : 1, interval = reelFast + (reelSlow - reelFast) * u * u   // quadratic slow-down
    let last = i === n - 1
    delayedCall(at, () => {
      if (!last) { setDiscArt(textures.get(c)); spinRate = reelSpin * clamp(reelFast / interval, .12, 1) }
      else Promise.race([loaded[i], sleep(2500)]).then(() => { setDiscArt(textures.get(c)); landOn(pick) })
    })
    at += interval
  })
}
function landOn(pick) {                              // Gn — writes kicker/title/href, then tween(0, Y.roulette.settle)
  j = nextFor(list, true, pick) || j; label.textContent = kicker(); updateLink()
  section.setAttribute('data-scroll-next-pick', j.title); section.removeAttribute('data-scroll-next-rolling')
  /* then settle to rest over `settle` (1.15 s), `landed = true`, hint on */
}
```

The reel is a texture swap on one disc, not eleven discs: the "slot machine" is the art changing at
an increasing interval (`0.07 s` → `0.46 s`) while the spin rate falls with it.
