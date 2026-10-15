/**
 * Acceptance instrumentation.
 *
 * Off unless the page is loaded with `?diag`, in which case a compact JSON
 * snapshot is mirrored into `[data-shelf-diag]` a few times a second. That
 * element is what the verification harness reads — it is the only channel out of
 * the page, so no globals are exposed and nothing ships that the page does not
 * already need.
 *
 * Two counters are unconditional because they are a comparison and a subtraction:
 * `pViolations` counts frames where loader progress went backwards, and
 * `progressDoneAt` records the elapsed time at which P first reached 1. Together
 * they are the two load-bearing acceptance claims.
 */
const RING = 240
/** The loader's per-frame orbit/exit log. It runs for ~4 s at 60 Hz, so 400 is
 *  enough to cover the whole intro with room to spare. */
const ORBIT_RING = 400

export function createDiag (location) {
  const on = new URLSearchParams(location.search).has('diag')
  const el = on ? document.querySelector('[data-shelf-diag]') : null

  const p = { violations: 0, last: 0, doneAt: null, elapsed: 0 }
  const frameMs = { ring: new Float32Array(RING), n: 0, head: 0, count: 0, t0: 0, lastAt: 0 }
  const samples = []
  const orbit = { ring: new Array(ORBIT_RING), n: 0, head: 0 }
  // the detail page's own frame clock: the shelf's ring stops when the shelf parks
  const detail = { ring: new Float32Array(RING), n: 0, head: 0, count: 0 }
  let extra = null

  return {
    on,

    /** loader progress — monotonicity + the 2.85 s floor, measured, not assumed */
    progress (value, elapsed) {
      if (p.last !== 0 && value < p.last) p.violations++
      p.last = value
      p.elapsed = elapsed
      if (value >= 1 && p.doneAt === null) p.doneAt = elapsed
    },

    /** frame timing ring buffer */
    frame (ms, now) {
      frameMs.ring[frameMs.head] = ms
      frameMs.head = (frameMs.head + 1) % RING
      frameMs.n = Math.min(RING, frameMs.n + 1)
      frameMs.count++
      if (frameMs.t0 === 0) frameMs.t0 = now
      frameMs.lastAt = now
    },

    /** Frame time on a detail page, fed by the page's ticker. */
    detailFrame (ms) {
      detail.ring[detail.head] = ms
      detail.head = (detail.head + 1) % RING
      detail.n = Math.min(RING, detail.n + 1)
      detail.count++
    },

    resetDetailClock () { detail.n = 0; detail.head = 0; detail.count = 0 },

    /** A provider of keys that belong to no gallery: view, route, ink, next, transition. */
    setExtra (fn) { extra = fn },

    resetFrameClock () {
      frameMs.n = 0; frameMs.head = 0; frameMs.count = 0; frameMs.t0 = 0; frameMs.lastAt = 0
      samples.length = 0
    },

    /**
     * Open a measurement window. The switcher calls this itself, so the harness
     * reads exactly the frames of a section switch instead of guessing which
     * frames belong to it.
     */
    beginWindow (label) {
      if (!on) return
      this.resetFrameClock()
      samples.push({ t: Math.round(performance.now()), begin: label })
    },

    /** Per-frame trace of whatever the gallery is doing — one push per frame. */
    trace (entry) {
      if (!on) return
      samples.push(entry)
    },

    /** One-shot notes (compile phase, warm-up counts) for the harness to read. */
    sample (extra) {
      if (!on) return
      samples.push({ t: Math.round(performance.now()), ...extra })
      if (samples.length > 24) samples.shift()
    },

    /**
     * One frame of the counter: where it was told to go (theta, beat), where it
     * actually landed on screen (cx, cy), and the three anchor radii it read to
     * get there. This is the evidence for "the counter follows the disc" — both
     * for the orbit and for the growth-coupled exit.
     */
    orbitFrame (entry) {
      if (!on) return
      orbit.ring[orbit.head] = { t: Math.round(performance.now()), ...entry }
      orbit.head = (orbit.head + 1) % ORBIT_RING
      orbit.n = Math.min(ORBIT_RING, orbit.n + 1)
    },

    orbitLog () {
      return Array.from(orbit.ring.slice(0, orbit.n)).filter(Boolean)
    },

    snapshot (state) {
      const times = Array.from(frameMs.ring.slice(0, frameMs.n)).filter(v => v > 0).sort((a, b) => a - b)
      const at = q => times.length ? times[Math.min(times.length - 1, Math.floor(times.length * q))] : 0
      const sum = times.reduce((a, b) => a + b, 0)
      const span = frameMs.lastAt - frameMs.t0
      const dt = Array.from(detail.ring.slice(0, detail.n)).filter(v => v > 0).sort((a, b) => a - b)
      const dq = q => dt.length ? dt[Math.min(dt.length - 1, Math.floor(dt.length * q))] : 0
      return {
        p: +p.last.toFixed(6),
        pViolations: p.violations,
        progressDoneAt: p.doneAt === null ? null : +p.doneAt.toFixed(3),
        frames: frameMs.count,
        fpsSinceBoot: span > 0 ? +((frameMs.count * 1000) / span).toFixed(2) : null,
        fps: sum > 0 ? +((times.length * 1000) / sum).toFixed(2) : null,   // over the ring
        frameMsP50: +at(0.5).toFixed(2),
        frameMsP95: +at(0.95).toFixed(2),
        frameMsMax: +(times.length ? times[times.length - 1] : 0).toFixed(2),
        samples,
        orbit: this.orbitLog(),
        detailFrames: detail.count,
        detailFrameMsP50: +dq(0.5).toFixed(2),
        detailFrameMsP95: +dq(0.95).toFixed(2),
        detailFrameMsMax: +(dt.length ? dt[dt.length - 1] : 0).toFixed(2),
        ...state,
        ...(extra ? extra() : {}),
      }
    },

    publish (state) {
      if (!el) return
      el.textContent = JSON.stringify(this.snapshot(state))
    },
  }
}