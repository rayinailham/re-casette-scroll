/**
 * The loader. motion-spec.md §2, design-system.md §4.1.
 *
 * Runs on the GSAP ticker, NOT its own rAF — one clock for the whole page. The
 * lead disc's pose is a pure function of the scalar P this produces.
 *
 * Crucially this module imports no 3D. The preloader must not be blocked behind
 * a 600 KB three.js parse. It reads the gallery's screen-space anchor, which the
 * gallery writes each frame.
 */
import { gsap, energyEase } from '../anim/eases.js'
import { PRELOADER } from '../disc/config.js'
import { realAssetProgress, progressTarget, chase, beatReady, yearFromProgress } from '../disc/progress.js'
import { buildCounter, buildYearDrum, buildSpinner, exitCorners } from './counter.js'

const pad3 = n => String(n).padStart(3, '0')
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1))

export function createPreloader ({ root, anchor, diag, onProgress, onReady, onExitArmed }) {
  const C = PRELOADER

  // Beat 1 opens on the curator's initial and the shelf's first item; beats 2 and 3
  // are randomised on every load, so the counter never tells the same story twice.
  const beats = [
    { ...C.beats[0], value: () => 'R01' },
    { ...C.beats[1], value: () => pad3(randInt(40, 52)) },
    { ...C.beats[2], value: () => pad3(randInt(68, 80)) },
    { ...C.beats[3], value: () => '100' },
  ]

  const counter = buildCounter(root.querySelector('[data-counter]'), { anchor, gap: C.discGap })
  counter.reset()
  counter.set('R00', { roll: 0, stagger: 0 })

  // The drum builder queries its digit drums INSIDE the root it is given, so it
  // needs the wrapper — handing it the first drum itself found zero digits and
  // the year never rendered.
  const yearDrum = buildYearDrum(root.querySelector('[data-year-drum-root]'), {
    from: C.yearFrom, to: new Date().getFullYear(), duration: C.yearRoll,
  })
  yearDrum.set(C.yearFrom)

  const spinnerEl = document.querySelector('[data-nav-spinner]')
  const spinner = spinnerEl ? buildSpinner(spinnerEl, C.spinnerDuration) : null
  const label = document.querySelector('[data-nav-loading-label]')

  // Everything that enters on beat 1 starts parked below its own mask: the
  // counter cells, the two side labels and the nav's brand + loading word. The
  // page is empty until the disc starts to rise — nothing pops in under it.
  const shells = [...root.querySelectorAll('[data-counter] .preloader__shell')]
  const sides = [...root.querySelectorAll('.preloader__side-inner')]
  const navIntro = [...document.querySelectorAll('[data-nav-intro]')]
  gsap.set(shells, { yPercent: 110 })
  gsap.set(sides, { yPercent: 120 })
  gsap.set(navIntro, { yPercent: 105 })

  function enter () {
    gsap.to(shells, { yPercent: 0, duration: C.beats[0].roll, ease: 'power3.out', stagger: C.rollStagger })
    gsap.to(sides, { yPercent: 0, duration: 0.7, ease: 'power3.out', stagger: 0.07 })
    gsap.to(navIntro, { yPercent: 0, duration: 0.7, ease: energyEase(), stagger: 0.05 })
  }

  // rotate the loader word in lockstep with the spinner
  let wordAt = 0
  const wordCall = label && gsap.delayedCall(C.spinnerDuration, function tick () {
    wordAt = (wordAt + 1) % C.spinWords.length
    label.textContent = C.spinWords[wordAt]
    this.restart(true)
  })

  const src = { fontsReady: false, sceneReady: false, elapsed: 0, coversLoaded: 0, coversTotal: 0 }

  let P = 0
  let elapsed = 0
  let beatIndex = 0
  let done = false
  let armed = false
  let clocked = true

  // the counter is set in the webfont, so its box is only right once it lands
  document.fonts?.ready.then(() => { src.fontsReady = true; counter.measure() })
  counter.measure()
  addEventListener('resize', () => counter.measure(), { once: true })

  const tick = (_time, deltaMs) => {
    const dt = Math.min(0.1, deltaMs / 1000)   // ONE clamp, and it also keeps a
    elapsed += dt                             // backgrounded tab from skipping ahead
    src.elapsed = elapsed

    const target = progressTarget(realAssetProgress(src, C), elapsed, C)
    P = chase(P, target, dt, C)
    diag.progress(P, elapsed)
    onProgress?.(P)

    yearDrum.set(yearFromProgress(P, C.yearFrom, new Date().getFullYear()))

    // ORBIT (§2.6): weld the DOM counter to the moving 3D disc every frame.
    counter.place()
    // EXIT (§2.9): from setOff onward, the counter leaves on the disc's GROWTH.
    if (armed) counter.driveExit()

    if (diag.on) {
      const pl = counter.placement
      const a = anchor
      diag.orbitFrame({
        b: beatIndex,
        th: +counter.theta.toFixed(4),
        p: +P.toFixed(4),
        cx: +pl.cx.toFixed(1), cy: +pl.cy.toFixed(1),
        // displacement from the disc centre, and how far it landed
        dx: +(pl.cx - a.x).toFixed(1), dy: +(pl.cy - a.y).toFixed(1),
        dist: +Math.hypot(pl.cx - a.x, pl.cy - a.y).toFixed(1),
        cl: pl.clamped ? 1 : 0,
        bw: +pl.w.toFixed(2), bh: +pl.h.toFixed(2),
        dx0: +a.x.toFixed(1), dy0: +a.y.toFixed(1),
        r: +a.r.toFixed(2), live: +a.live.toFixed(2), rest: +a.rest.toFixed(2),
        t: +counter.exitProgress.toFixed(4),
        from: +counter.exitOrigin.from.toFixed(2),
        fRest: +counter.exitOrigin.rest.toFixed(2),
        y: counter.exitValues.map(v => +v.toFixed(1)),
      })
    }

    const beat = beats[beatIndex]
    if (beat && beatReady(beat, P, elapsed)) {
      if (beatIndex === 0) enter()
      counter.set(beat.value(), { roll: beat.roll, stagger: C.rollStagger })
      // each beat also steps the orbit by π/4, so the counter travels
      // below → left → upper-left → above
      counter.orbitTo(beatIndex, beats, C.arcEnd, C.travel)
      beatIndex++
      if (beatIndex >= beats.length) finish()
    }

    // The ticker keeps running past P = 1: the growth-coupled exit is driven from
    // the disc's projected radius and needs a frame every tick until it lands.
    // Dropping the clock at P = 1 is what strands the counter mid-exit.
    if (armed && counter.exitFinished) stopClock()
  }
  gsap.ticker.add(tick)

  function stopClock () {
    if (!clocked) return
    clocked = false
    gsap.ticker.remove(tick)
  }

  function finish () {
    if (done) return
    done = true
    onReady?.(P, exit)
  }

  function exit () {
    // §2.7: arm the counter exit FIRST, snapshotting `live` while the disc is
    // still at 0.8 — then hand the lead's pose to the fan timeline. Reversing
    // these two would measure the growth from the wrong instant.
    gsap.delayedCall(C.setOff, () => {
      armed = true
      counter.armExit()
      onExitArmed?.()
    })

    // the year drum settles on the final year alongside the counter's exit
    gsap.delayedCall(C.setOff, () => yearDrum.settle())

    exitCorners(root, { setOff: C.setOff, exit: C.exit, stagger: 0.04 })

    // nav reveals 0.15 s after the corner text starts leaving: the loading word
    // rolls up and out, then the collection links roll up into its place one by
    // one (yPercent 105 → 0, energy, 0.05 apart) and the active dot springs in.
    gsap.delayedCall(C.setOff + C.navAfter, () => {
      const loading = document.querySelector('.nav-loading-item')
      gsap.to(loading?.querySelector('[data-nav-intro]') ?? [], {
        yPercent: -105, duration: 0.4, ease: energyEase(),
        onComplete: () => {
          loading?.setAttribute('hidden', '')
          spinner?.kill()
          wordCall?.kill()
          const links = document.querySelectorAll('[data-nav-reveal]')
          gsap.set(links, { yPercent: 105 })
          document.documentElement.removeAttribute('data-preload')
          gsap.to(links, { yPercent: 0, duration: 0.7, ease: energyEase(), stagger: 0.05 })
        },
      })
    })

    // copy panel reveals 0.30 s after — the 0.15 / 0.30 offsets are deliberate.
    // The copy must not move at the same instant as the title. The preloader
    // does NOT animate the copy; it only removes `data-disc-flight`, which is
    // the flag the text-transition engine polls (§6.5).
    gsap.delayedCall(C.setOff + C.copyAfter, () => {
      document.querySelector('.experience_info')?.removeAttribute('data-disc-flight')
    })

    // Fade the loader away only once the CORNERS have finished (their outer
    // wrapper runs 0.70 s from setOff, landing at 1.15 s). Hiding on the counter's
    // exit-complete instead would truncate them mid-slide.
    gsap.delayedCall(C.setOff + C.exit + 0.2, () => {
      gsap.set(root, { autoAlpha: 0, pointerEvents: 'none' })
    })

    // a backstop, so a loader that never arms (a dead WebGL context) still stops
    gsap.delayedCall(C.setOff + 3, () => stopClock())
  }

  return {
    get progress () { return P },
    setSceneReady () { src.sceneReady = true },
    setCovers (loaded, total) { src.coversLoaded = loaded; src.coversTotal = total },
  }
}
