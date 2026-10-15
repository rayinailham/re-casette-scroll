/**
 * The odometer. motion-spec.md §2.5, §2.6, §2.9.
 *
 * Three cells: a glyph cell plus two 20-row digit drums (`0-9` twice), rendered
 * with `white-space: pre`. One row = 5 % of the column, so digit `d` shows at
 * `yPercent: -5·d`. The overshoot into the second `0-9` block is intentional and
 * is what lets 9 → 0 roll continuously rather than snapping back.
 *
 * Two mechanics share the gallery's screen-space anchor and both are
 * load-bearing:
 *
 *   ORBIT (§2.6) — the counter is NOT centred. Every frame it is placed on an
 *   ellipse around the disc's projected position, stepping π/4 per beat.
 *
 *   EXIT (§2.9) — the counter's exit has NO timer and NO tween. It is a per-frame
 *   read of how far the disc has GROWN, finished at 70 % of that growth. Any
 *   tween has to guess when the disc finishes; sampling the projection cannot
 *   drift from it at any frame rate, disc size or fan duration.
 */
import { clamp } from '../disc/config.js'
import { gsap, glideEase } from '../anim/eases.js'

export const DRUM_ROWS = '0\n1\n2\n3\n4\n5\n6\n7\n8\n9\n0\n1\n2\n3\n4\n5\n6\n7\n8\n9'

/** The push finishes after this fraction of the disc's total growth. */
export const PUSH_BY = 0.7
/** Total spread of the per-cell wave, in units of `t`. */
export const PUSH_STAGGER = 0.14
/** How far clear of the disc and the nav the counter orbits, in counter heights. */
export const DISC_GAP = 0.35

/**
 * Per-cell stagger offsets, computed ONCE at arm time.
 *
 * Offsets are spaced across the VISIBLE cells only — measured width > 0.5 px —
 * because a single-glyph beat collapses its drums to zero width. Spacing across
 * invisible cells makes the exit read as one block instead of a wave.
 * motion-spec.md §2.9.
 */
export function cellStagger (widths, spread = PUSH_STAGGER) {
  const s = clamp(spread, 0, 0.8)
  const visible = []
  widths.forEach((w, i) => { if (w > 0.5) visible.push(i) })
  const n = Math.max(1, visible.length - 1)
  const rank = new Map(visible.map((cell, k) => [cell, k]))
  return widths.map((_, i) => (rank.has(i) ? (s * rank.get(i)) / n : 0))
}

/**
 * The growth→t mapping and the per-cell `yPercent`. Pure, so the whole exit is
 * unit-testable without a DOM, a camera or a clock.
 *
 *   growth = rest − from          how much radius is left to gain
 *   ratio  = (live − from) / growth   how far through the growth the disc is
 *   t      = ratio / 0.7             done at 70 % of the growth
 *   a_i    = (t − stagger_i) / (1 − max(stagger))   per cell, clamped
 */
export function exitCells ({ from, live, rest }, staggers, pushBy = PUSH_BY) {
  const growth = rest - from
  const ratio = growth > 0.5 ? clamp((live - from) / growth, 0, 1) : 1
  const t = clamp(ratio / clamp(pushBy, 0.05, 1), 0, 1)
  const span = 1 - Math.max(0, ...staggers)
  const values = staggers.map(off => {
    const a = clamp((t - off) / Math.max(0.05, span), 0, 1)
    const y = -110 * a
    return y === 0 ? 0 : y        // never hand back -0; it reads as a value
  })
  return { t, ratio, values }
}

export function buildCounter (root, { anchor, gap = DISC_GAP }) {
  const glyph = root.querySelector('[data-counter-glyph]')
  const drums = [...root.querySelectorAll('[data-counter-drum]')]

  for (const drum of drums) drum.textContent = DRUM_ROWS

  // `cells` are the clipped 1em boxes; `shells` are the rows that actually move.
  // One cell per drum plus the glyph, in reading order.
  const cells = [...root.querySelectorAll('.preloader__cell')]
  const shells = cells.map(c => c.querySelector('.preloader__shell'))

  /** Orbit angle. TWEENED, never integrated — a beat is a move, not a rate. */
  const ORBIT = { theta: 0 }

  let box = { w: 0, h: 0, top: 0 }
  let exitFrom = null
  let exitRest = 0
  let exitStagger = []
  let exitDone = false
  let exitT = 0
  /** Where the counter actually landed last frame, and the orbit it used. */
  let last = { cx: 0, cy: 0, Rx: 0, Ry: 0 }

  /**
   * Measured once and on resize. Reading layout every frame would thrash.
   *
   * The counter's own box is a FULL-WIDTH block (`left:0; right:0` so the flex
   * row can centre itself), so `root.getBoundingClientRect().width` is the
   * viewport, not the counter. Using it made both clamp bands collapse and the
   * horizontal orbit a no-op. Measure the CELLS instead: they are `flex: none`
   * inside a centred row, so their union is the counter's real ink box.
   */
  function measure () {
    const r = root.getBoundingClientRect()
    let lo = Infinity, hi = -Infinity
    for (const c of cells) {
      const b = c.getBoundingClientRect()
      if (b.width <= 0) continue
      lo = Math.min(lo, b.left)
      hi = Math.max(hi, b.right)
    }
    box = hi > lo
      ? { w: hi - lo, h: r.height, top: r.top }
      : { w: 0, h: r.height, top: r.top }
  }

  return {
    measure,

    /**
     * `value` is a 3-character readout: index 0 is the glyph, 1 and 2 are digits.
     * Beats 2 and 3 are randomised on every load, so the counter tells a slightly
     * different story every time — that is the whole point.
     */
    set (value, { roll, stagger }) {
      if (glyph && glyph.textContent !== value[0]) glyph.textContent = value[0]
      for (let i = 0; i < drums.length; i++) {
        const d = Number(value[i + 1] ?? '0')
        gsap.to(drums[i], { yPercent: -5 * d, duration: roll, ease: 'power3.out', delay: i * stagger, overwrite: true })
      }
    },

    /**
     * ORBIT (§2.6). One tween per beat: θ steps π/4, so the counter travels
     * below → left → upper-left → above, clearing the disc the whole way.
     */
    orbitTo (beatIndex, beats, arcEnd = 1, travelFallback = 0.75) {
      gsap.to(ORBIT, {
        theta: Math.PI * arcEnd * ((beatIndex + 1) / beats.length),
        duration: beats[beatIndex]?.travel ?? travelFallback,
        ease: 'power2.inOut',
        overwrite: true,
      })
    },

    /** Per-frame. Places the counter on the ellipse and clamps it on screen. */
    place () {
      if (!box.w || !anchor.ready) return
      const Rx = anchor.r + box.w / 2 + box.h * gap
      const Ry = anchor.r + box.h / 2 + box.h * gap

      // clamp band, in CENTRE coordinates: never under the nav, never through
      // the disc, however large the disc grows
      const minX = box.top + box.w / 2
      const maxX = innerWidth - box.top - box.w / 2
      const minY = box.top + box.h / 2
      const maxY = innerHeight - box.top - box.h / 2

      const x = clamp(anchor.x - Math.sin(ORBIT.theta) * Rx, minX, maxX)
      const y = clamp(anchor.y + Math.cos(ORBIT.theta) * Ry, minY, maxY)
      // whether the clamp actually bound: a clamped frame tells you nothing about
      // the orbit radius, and the harness must exclude it rather than guess
      const clamped = x !== anchor.x - Math.sin(ORBIT.theta) * Rx ||
                      y !== anchor.y + Math.cos(ORBIT.theta) * Ry
      last = { cx: x, cy: y, Rx, Ry, clamped }

      // back into the counter's own layout box: it is `left:0; right:0` and
      // centred, so its untransformed left edge is (innerWidth − w) / 2
      gsap.set(root, {
        x: x - box.w / 2 - (innerWidth - box.w) / 2,
        y: y - box.h / 2 - box.top,
      })
    },

    /**
     * EXIT (§2.9). Called once, at `setOff`. Snapshots the disc's radius RIGHT
     * NOW — before the fan tween starts moving it — and spaces the wave across
     * the cells that are actually on screen.
     */
    armExit (pushStagger = PUSH_STAGGER) {
      if (!box.w) measure()
      exitFrom = anchor.live
      exitRest = anchor.rest
      exitStagger = cellStagger(cells.map(c => c.getBoundingClientRect().width), pushStagger)
      exitDone = false
      exitT = 0
    },

    /**
     * The driver. No timer, no tween — one read of the disc's projected growth
     * per frame. Returns the current `t` so the loader can report it.
     */
    driveExit (pushBy = PUSH_BY) {
      if (exitDone || exitFrom === null) return exitT
      const { t, values } = exitCells({ from: exitFrom, live: anchor.live, rest: anchor.rest },
                                      exitStagger, pushBy)
      exitT = t
      for (let i = 0; i < shells.length; i++) {
        gsap.set(shells[i], { yPercent: values[i] ?? 0 })
      }
      if (t >= 1) exitDone = true
      return t
    },

    get exitProgress () { return exitT },
    /** The radius snapshot taken at `setOff` — the exit is measured against this.
     *  0 before the exit is armed, never null: the instrumentation reads this on
     *  every frame and `null.toFixed` would kill the ticker. */
    get exitOrigin () { return { from: exitFrom ?? 0, rest: exitRest ?? 0 } },
    get exitArmed () { return exitFrom !== null && !exitDone },
    get exitFinished () { return exitFrom !== null && exitDone },
    get theta () { return ORBIT.theta },
    /** Landing point + orbit radii of the last `place()`, for instrumentation. */
    get placement () { return { ...last, theta: ORBIT.theta, w: box.w, h: box.h } },
    /** The measured `yPercent` the exit last wrote, per cell. */
    get exitValues () {
      return shells.map(s => Number(gsap.getProperty(s, 'yPercent')) || 0)
    },

    /** Reset on every new load. motion-spec §2.6. */
    reset () {
      ORBIT.theta = 0
      exitFrom = null
      exitRest = 0
      exitStagger = []
      exitDone = false
      exitT = 0
    },
  }
}

/**
 * The year drum: `from` → `new Date().getFullYear()`, driven by loader progress.
 * Target year = from + floor(easeInOutQuad(P) × (to − from)).
 */
export function buildYearDrum (root, { from, to, duration }) {
  const digits = [...root.querySelectorAll('[data-year-drum]')]
  for (const drum of digits) drum.textContent = DRUM_ROWS

  let last = -1
  return {
    set (year) {
      const text = String(year).slice(-digits.length)
      for (let i = 0; i < digits.length; i++) {
        const d = Number(text[i] ?? '0')
        if (d === last && i === 0 && last >= 0 && text.length === digits.length) continue
        gsap.to(digits[i], { yPercent: -5 * d, duration, ease: 'power3.out', overwrite: true })
      }
      last = year
    },
    settle () { gsap.to(digits, { yPercent: -5 * Number(String(to).slice(-1)), duration, ease: 'power3.out', overwrite: true }) },
  }
}

/**
 * The nav spinner. A 1.5 px solid border with a transparent right edge,
 * `.65em` square, rotating 360° over 0.8 s linear, infinitely.
 *
 * Driven by a GSAP tween, NOT a CSS animation, so it stays in lockstep with
 * the GSAP ticker. Two clocks drift. `el.style.animation = 'none'` first.
 */
export function buildSpinner (el, duration) {
  el.style.animation = 'none'
  gsap.set(el, { rotation: 0 })
  return gsap.to(el, { rotation: 360, duration, ease: 'none', repeat: -1 })
}

/**
 * Corner labels. Outer wrapper and inner text move on DIFFERENT easings and
 * different durations, so the label settles rather than sliding rigidly.
 * −0.18 em is `lift (0.3) × 0.6`.
 */
export function exitCorners (preloader, { setOff, exit, stagger }) {
  gsap.to(preloader.querySelectorAll('.preloader__side-inner'),
    { yPercent: -120, duration: exit, ease: 'power3.in', delay: setOff, stagger })
  gsap.to(preloader.querySelectorAll('.preloader__side'),
    { y: '-0.18em', duration: 0.7, ease: 'power2.out', delay: setOff })
}

export { glideEase }
