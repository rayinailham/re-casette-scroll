/**
 * The ink, on the page. motion-spec.md §12.1–§12.3 — the DOM half of ink.js.
 *
 * A `gsap.ticker` callback runs ONLY while the scroll is within range of the
 * effect; outside it the ticker is detached and a passive scroll listener waits
 * to re-attach it. Each tick maps `scrollY` → V (a pure function, not a
 * ScrollTrigger scrub), eases the intro, boils the field's phase, builds one path
 * and writes `clip-path`. The last frame before leaving range is always drawn at
 * the clamped V, so a jump cannot strand the edge half-way.
 *
 * Gates (§12.1): reduced motion, no `path()` support, or no still to uncover —
 * then nothing runs and the hero is a plain section above the still.
 */
import { gsap } from '../anim/eases.js'
import {
  INK, clamp, smootherstep, createField, contourLoops, loopsToPath, contourLevel, surgePx, progress,
} from './ink.js'

export const supportsInk = () =>
  typeof CSS !== 'undefined' && CSS.supports('clip-path', 'path("M 0 0 L 1 0 Z")')

export function createDissolve ({ track, hero, still, bleed, reduced, cfg = INK }) {
  let on = false            // armed: layout switched, listeners attached
  let ticking = false
  let field = null
  let H = 0, vh = 0, top = 0, m = 0, runway = 0
  let V = 0, U = 0, Fe = 0, phase = 0, level = 0, lastY = 0
  let drawn = { y: NaN, life: NaN, u: NaN }
  let lastTime = 0, prevScroll = 0
  let clipLen = 0

  const vars = ['--dissolve-apron', '--dissolve-overlap', '--dissolve-bleed', '--dissolve-rest']

  function measure () {
    vh = innerHeight
    H = vh
    m = surgePx(H, cfg)
    runway = H + m
    // pinned layout first, so `top` is the track's real document position
    track.dataset.ink = 'on'
    top = track.getBoundingClientRect().top + scrollY
    track.style.setProperty('--dissolve-apron', `${m}px`)            // extra runway: the surge reserve
    track.style.setProperty('--dissolve-overlap', `${H}px`)          // the still sits fully under the hero
    track.style.setProperty('--dissolve-bleed', `${Math.round(H * 0.1)}px`)   // parallax ±10 %
    track.style.setProperty('--dissolve-rest', `${H * (1 - cfg.peek)}px`)
    field = createField(hero.clientWidth || innerWidth, H, cfg)
  }

  const inRange = () => {
    const start = Math.max(0, top - vh)
    const span = top + runway - start
    const r = span ? (scrollY - start) / span : 0
    return r > -0.05 && r < 1.05
  }

  /** §12.4 `themeAt`: the nav goes light once the edge has passed it, and dark again when the still leaves. */
  function theme () {
    const dark = on && V >= cfg.themeAt && scrollY < top + runway
    document.documentElement.toggleAttribute('data-ink-dark', dark)
  }

  function draw (force) {
    const u = smootherstep(U)
    const life = phase * cfg.life * u
    const ne = Fe * m
    V = progress({ scrollY, top, height: runway, vh, finish: cfg.finish })
    theme()
    level = contourLevel({ height: H, V, u, ne }, cfg)
    if (!force && Math.abs(level - drawn.y) < 0.3 && Math.abs(life - drawn.life) < 0.004 && Math.abs(u - drawn.u) < 0.002) return
    drawn = { y: level, life, u }
    const d = loopsToPath(contourLoops(field, { level, phase: life }, cfg), cfg.smooth)
    if (d.includes('NaN')) return
    // an empty path is "nothing kept": `path(evenodd, "")` is invalid and would show the whole hero
    const clip = `path(evenodd, "${d || 'M0 0Z'}")`
    hero.style.clipPath = clip
    clipLen = clip.length
    hero.setAttribute('data-dissolve-ready', '')
    // parallax: the still drifts ±bleed across the runway
    const p = clamp(scrollY / runway, 0, 1)
    const img = still.querySelector('img')
    if (img) img.style.transform = `translate3d(0, ${((0.5 - p) * 2 * H * 0.1).toFixed(1)}px, 0)`
  }

  function tick (time) {
    const dt = clamp(time - lastTime, 0, 0.1)
    lastTime = time
    const y = scrollY
    const vel = dt > 0 ? clamp(((y - prevScroll) / dt) / cfg.velocityRef, -1, 1) : 0
    prevScroll = y
    Fe += (vel - Fe) * (1 - Math.pow(1 - cfg.velocityEase, dt * 60))
    if (U < 1) U = cfg.intro <= 0 ? 1 : Math.min(1, U + dt / cfg.intro)
    phase += dt * cfg.lifeSpeed * (1 + Math.abs(Fe) * cfg.agitate) * Math.PI * 2
    draw(false)
    // out of range and the intro done: stop — after the clamped frame above
    if (U >= 1 && !inRange() && Math.abs(Fe) < 0.004) detach()
  }

  function attach () {
    if (ticking) return
    ticking = true
    lastTime = gsap.ticker.time
    prevScroll = scrollY
    gsap.ticker.add(tick)
  }
  function detach () {
    if (!ticking) return
    ticking = false
    gsap.ticker.remove(tick)
  }
  const onScroll = () => {
    V = progress({ scrollY, top, height: runway, vh, finish: cfg.finish })
    theme()
    if (inRange()) attach()
  }
  const onResize = () => { if (!on) return; measure(); draw(true) }

  return {
    /** Switch the page to the ink layout and start. false when a gate is closed. */
    start () {
      if (on) return true
      if (reduced || !supportsInk() || !still || still.hidden) return false
      on = true
      U = cfg.intro <= 0 ? 1 : 0
      Fe = 0; phase = 0
      measure()
      drawn = { y: NaN, life: NaN, u: NaN }
      draw(true)                 // the first frame is the whole hero, never a flash of nothing
      addEventListener('scroll', onScroll, { passive: true })
      addEventListener('resize', onResize)
      attach()
      return true
    },
    /** Clear everything: the clip, the ticker, the layout switch. */
    stop () {
      detach()
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onResize)
      on = false
      document.documentElement.removeAttribute('data-ink-dark')
      hero.style.clipPath = ''
      hero.removeAttribute('data-dissolve-ready')
      delete track.dataset.ink
      for (const v of vars) track.style.removeProperty(v)
      const img = still?.querySelector('img')
      if (img) img.style.transform = ''
      clipLen = 0
      V = 0
    },
    get state () {
      return { on, running: ticking, progress: +V.toFixed(4), level: +level.toFixed(1), u: +U.toFixed(3), clip: clipLen }
    },
  }
}
