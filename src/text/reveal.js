/**
 * Copy transitions. motion-spec.md §6, design-system.md §4.6.
 *
 * ONE engine over a GROUP-INDEXED target list: `['.experience_info',
 * '.testimonial_wrap']`, where the array index IS the group number. `inGroupGap`
 * is added on group CHANGE, so the second group starts one gap after the first
 * and reads as its answer — not one gap per group.
 *
 *   OUT  rules  scaleX 0 (origin right center)   0.4 s  energy  stagger 0.016
 *   OUT  lines  yPercent −120                    0.4 s  energy  stagger 0.016
 *   OUT  target autoAlpha 0                      0.4 s  energy
 *   IN   rules  scaleX 1, origin LEFT center     0.7 s  energy  at += 0.035
 *   IN   lines  yPercent 0                       0.7 s  energy  stagger 0.05
 *   IN   target autoAlpha 1                      0.7 s  energy
 *   IN   mask   height → naturalHeight           0.5 s  energy  skipped if |Δ| < 0.5 px
 *
 * Two corrections that are easy to get wrong and are verified against the bundle:
 *
 *  1. `transformOrigin` is `left center` on the HIDDEN state. The OUT tween's
 *     `right center` is unobservable at `scaleX: 0`, so the state you actually
 *     see is the one set before the IN tween. Rules retract toward, and grow out
 *     of, the LEFT edge. A settled `.divider-horizontal` reads `transform-origin:
 *     0% 50%`.
 *
 *  2. Text entries FADE as well as slide. `autoAlpha: 0` is the hidden state and
 *     `autoAlpha: 1` is set at reveal start. A pure slide with no fade reads as a
 *     mechanical shutter; the fade is what lets it read as ink appearing.
 *
 * Lines exit UPWARD (`outShift −120`) and enter from BELOW (`inShift +120`).
 * Out and in are deliberately not mirror images.
 */
import { SplitText } from 'gsap/SplitText'
import { gsap, energyEase } from '../anim/eases.js'
import { TEXT } from '../disc/config.js'

gsap.registerPlugin(SplitText)

const GROUPS = ['.experience_info', '.testimonial_wrap']
const TARGETS = '[data-film-target], .divider-horizontal, [data-disc-reveal]'
/** The reference's `.info-content_panel`: the box a rule belongs to, and the
 *  unit a null value hides. The note block is one such unit. */
const PANEL = '.experience_info__field, .testimonial'
/** Blocks that change with the title but must not trail the cascade. */
const TOGETHER = '.testimonial, .info-index'

/**
 * The cumulative reveal stagger. Pure, so the group-gap and cross-kind ordering
 * are unit-testable without a DOM.
 *
 * `at` advances by `itemStagger` for rules AND text, which is what makes the
 * order read title → rule → year → rule → credit. Advancing only for text stacks
 * every rule at `t = 0`.
 *
 * `inGroupGap` is added when the group CHANGES, never per group index: comparing
 * against the numeric index would insert a gap per group count and drift.
 *
 * An entry flagged `together` starts at 0 and neither advances the cursor nor
 * triggers a gap.
 */
export function planReveal (entries, { inItemStagger, inGroupGap }) {
  const at = new Array(entries.length)
  let cursor = 0
  let group = entries.find(e => !e.together)?.group
  for (let i = 0; i < entries.length; i++) {
    // `together` entries (the note block, the position index) all start with the
    // title and take no part in the cascade, so they never arrive a beat late
    if (entries[i].together) { at[i] = 0; continue }
    if (entries[i].group !== group) { group = entries[i].group; cursor += inGroupGap }
    at[i] = cursor
    cursor += inItemStagger
  }
  return at
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.panel    the `.experience_info` panel (also the flight gate)
 * @param {HTMLElement} opts.gate     the element carrying `data-disc-gallery`
 * @param {boolean} opts.reduced      prefers-reduced-motion
 * @param {(item: object) => object} opts.fields  item → { key: text } map
 * @param {() => boolean} [opts.held]  extra gate on the IN only — true while a
 *   section switch is mid-flight, so the new copy waits for the new disc
 */
export function createReveal ({ panel, gate, reduced, fields, held }) {
  /**
   * Nested targets are hoisted (only the outermost animates) and a rule that
   * lives inside a panel is spliced in immediately before that panel's own text,
   * so the stagger reads in reading order rather than "every rule, then every
   * line". motion-spec.md §6.1.
   */
  function collect () {
    const out = []
    GROUPS.forEach((selector, group) => {
      for (const scope of document.querySelectorAll(selector)) {
        if (scope.hasAttribute('hidden')) continue
        const targets = [...scope.querySelectorAll(TARGETS)]
        const hoisted = targets.filter(el => !targets.some(o => o !== el && o.contains(el)))
        for (const el of hoisted) {
          const entry = {
            el, group,
            kind: el.matches('.divider-horizontal') ? 'rule' : 'text',
            field: el.closest(PANEL),
            together: !!el.closest(TOGETHER),
            mask: null, split: null, lines: [],
            restHeight: 0, naturalHeight: 0,
          }
          if (entry.kind !== 'rule') { out.push(entry); continue }
          const box = el.closest(PANEL)
          if (!box) { out.push(entry); continue }
          const i = out.findIndex(c => box.contains(c.el))
          if (i < 0) out.push(entry); else out.splice(i, 0, entry)
        }
      }
    })
    return out
  }

  const entries = collect()

  /** The outer mask is created once, wrapping the whole target. §6.2 */
  function ensureMask (entry) {
    const el = entry.el
    const parent = el.parentElement
    if (parent?.hasAttribute('data-disc-mask')) { entry.mask = parent; return }
    const m = document.createElement('div')
    m.setAttribute('data-disc-mask', 'idle')
    parent.insertBefore(m, el)
    m.appendChild(el)
    entry.mask = m
  }
  for (const e of entries) if (e.kind !== 'rule') ensureMask(e)

  /** A hidden field hides its own text AND its rule, so no hairline is orphaned. */
  const live = e => !e.field?.hasAttribute('hidden') && !e.el.hasAttribute('hidden')
  const liveEntries = () => entries.filter(live)

  // ── DOM helpers ──────────────────────────────────────────────────────────
  /**
   * Clip only while animating. A permanent `overflow: hidden` clips descenders
   * and focus rings, so this is a STATE toggle, not a one-way latch.
   */
  const setMaskState = state => {
    for (const e of entries) e.mask?.setAttribute('data-disc-mask', state)
  }
  const rememberRest = () => { for (const e of entries) if (e.mask) e.restHeight = e.mask.offsetHeight }
  const pin = () => { for (const e of entries) if (e.mask && e.restHeight) e.mask.style.height = `${e.restHeight}px` }
  const unpin = () => { for (const e of entries) if (e.mask) e.mask.style.height = '' }

  function measureNatural () {
    for (const e of entries) {
      if (!e.mask || !live(e)) continue
      const prev = e.mask.style.height
      e.mask.style.height = ''
      e.naturalHeight = e.mask.offsetHeight
      e.mask.style.height = prev
    }
  }

  const keyOf = e => e.el.dataset.filmTarget || e.el.dataset.discReveal

  function setText (entry, value) {
    if (entry.split) { entry.split.revert(); entry.split = null }
    entry.lines = []
    // a NUMBER drives the element through `--value` instead of text (the star
    // meter's width), so it still reveals and hides like any other target
    if (typeof value === 'number') { entry.el.style.setProperty('--value', value); value = '' }
    entry.el.textContent = value
    if (value == null) { entry.field?.setAttribute('hidden', ''); return }
    entry.field?.removeAttribute('hidden')
  }

  function split (entry) {
    if (entry.split) return
    const s = new SplitText(entry.el, { type: 'lines', linesClass: 'disc-line' })
    for (const line of s.lines) {
      const mask = document.createElement('div')
      mask.setAttribute('data-disc-line-mask', '')
      line.parentNode.insertBefore(mask, line)
      mask.appendChild(line)
    }
    entry.split = s
    entry.lines = s.lines
  }

  function write (item) {
    const map = fields(item)
    for (const e of entries) if (e.kind !== 'rule') setText(e, map[keyOf(e)] ?? null)
  }

  // ── state ────────────────────────────────────────────────────────────────
  let phase = 'hidden'          // 'hidden' | 'out' | 'revealing' | 'revealed'
  let running = null
  let pending = null            // the item waiting to be revealed
  let resolvers = []
  let released = false
  let lastChange = 0
  let current = null
  let poll = 0

  const ease = energyEase()

  function flushResolvers () {
    const r = resolvers
    resolvers = []
    for (const resolve of r) resolve()
  }

  function complete () {
    phase = 'hidden'
    running = null
    setMaskState('idle')
    hideAll()
    unpin()
    flushResolvers()
  }

  function hideAll () {
    for (const e of entries) {
      if (e.kind === 'rule') continue
      gsap.set(e.el, { autoAlpha: 0 })
      if (e.split) { e.split.revert(); e.split = null }
      e.lines = []
      gsap.set(e.el, { clearProps: 'transform,clipPath' })
    }
  }

  /** OUT. motion-spec.md §6.4 */
  function out () {
    if (reduced) { complete(); return null }
    // mid-reveal → reverse, never restart: fast scrolling reads as a flip-through
    if (phase === 'revealing' && running) {
      const tl = running
      tl.eventCallback('onComplete', null)
      tl.eventCallback('onReverseComplete', complete)
      tl.timeScale(TEXT.reverseSpeed).reverse()
      phase = 'out'
      running = tl
      return tl
    }
    pin()
    const list = liveEntries()
    for (const e of list) if (e.kind !== 'rule' && !e.split) split(e)
    for (const e of list) if (e.kind !== 'rule') gsap.set(e.el, { autoAlpha: 1 })

    const tl = gsap.timeline({ onComplete: complete })
    list.forEach((e, i) => {
      const at = e.together ? 0 : i * TEXT.outItemStagger
      if (e.kind === 'rule') {
        tl.to(e.el, { scaleX: 0, transformOrigin: 'right center',
                      duration: TEXT.outDuration, ease, overwrite: 'auto' }, at)
        return
      }
      tl.to(e.lines, { yPercent: TEXT.outShift, duration: TEXT.outDuration, ease,
                       stagger: TEXT.outLineStagger, overwrite: 'auto' }, at)
      tl.to(e.el, { autoAlpha: 0, duration: TEXT.outDuration, ease, overwrite: 'auto' }, at)
    })
    phase = 'out'
    running = tl
    return tl
  }

  /** IN. motion-spec.md §6.3 */
  function revealIn () {
    const item = pending
    if (!item) return
    pending = null
    current = item

    if (reduced) {
      // reduced motion is instant: write, show, done — no tween at all
      write(item)
      for (const e of liveEntries()) {
        if (e.kind === 'rule') { gsap.set(e.el, { scaleX: 1, transformOrigin: 'left center' }); continue }
        gsap.set(e.el, { clearProps: 'transform' })
        split(e)
        gsap.set(e.lines, { yPercent: 0 })
        gsap.set(e.el, { autoAlpha: 1 })
      }
      rememberRest()
      unpin()
      setMaskState('idle')
      phase = 'revealed'
      running = null
      flushResolvers()
      return
    }

    pin()
    write(item)
    setMaskState('clip')

    for (const e of liveEntries()) {
      if (e.kind === 'rule') { gsap.set(e.el, { scaleX: 0, transformOrigin: 'left center' }); continue }
      gsap.set(e.el, { clearProps: 'transform' })
      split(e)
      gsap.set(e.lines, { yPercent: TEXT.inShift })
      // an element with no text (the star meter) has no lines to slide, so it is
      // wiped in from its left edge while it fades — never popped on
      if (e.lines.length) gsap.set(e.el, { autoAlpha: 1 })
      else gsap.set(e.el, { autoAlpha: 0, clipPath: 'inset(0 100% 0 0)' })
    }
    measureNatural()

    const list = liveEntries()
    const tl = gsap.timeline({
      onComplete: () => {
        phase = 'revealed'
        running = null
        // rest height is whatever the panel settled at, so the next transition
        // pins the correct value rather than a stale one
        rememberRest()
        unpin()
        setMaskState('idle')
      },
    })

    // height tweens at position 0, skipped when they are a no-op: most items have
    // the same row count, so most of the time there is nothing to collapse
    for (const e of list) {
      if (!e.mask) continue
      const pinned = parseFloat(e.mask.style.height)
      if (!Number.isFinite(pinned)) continue
      if (Math.abs(pinned - e.naturalHeight) < 0.5) { e.mask.style.height = ''; continue }
      tl.to(e.mask, { height: e.naturalHeight, duration: TEXT.heightDuration, ease, overwrite: 'auto' }, 0)
    }

    const at = planReveal(list, TEXT)
    list.forEach((e, i) => {
      if (e.kind === 'rule') {
        tl.to(e.el, { scaleX: 1, duration: TEXT.inDuration, ease, overwrite: 'auto' }, at[i])
      } else if (e.lines.length) {
        tl.to(e.lines, { yPercent: 0, duration: TEXT.inDuration, ease,
                         stagger: TEXT.inLineStagger, overwrite: 'auto' }, at[i])
      } else {
        tl.to(e.el, { autoAlpha: 1, clipPath: 'inset(0 0% 0 0)', duration: TEXT.inDuration, ease,
                      clearProps: 'clipPath', overwrite: 'auto' }, at[i])
      }
    })

    phase = 'revealing'
    running = tl
  }

  /**
   * Five conditions must ALL hold before the reveal starts. motion-spec.md §6.5.
   *   1. nothing running, phase hidden
   *   2. an item is pending
   *   3. `data-disc-flight` is gone — the LOADER unblocks the copy, this engine
   *      decides when
   *   4. past the settle delay (500 ms while dragging)
   *   5. not released by an external `out()`
   */
  function tick () {
    if (released) return
    if (running) return
    if (!pending) return
    const dragging = gate?.getAttribute('data-disc-dragging') === 'true'
    const wait = dragging ? TEXT.dragRevealCap : TEXT.settleDelay
    if (performance.now() - lastChange < wait) return
    // the gates hold the IN only: the old copy may always leave
    if (phase !== 'hidden') { running = out(); return }
    if (panel.hasAttribute('data-disc-flight') || held?.()) return
    revealIn()
  }

  return {
    /** First paint — write and show with no transition. */
    mount (item) {
      current = item
      write(item)
      const list = liveEntries()
      for (const e of list) {
        if (e.kind === 'rule') { gsap.set(e.el, { scaleX: 1, transformOrigin: 'left center' }); continue }
        gsap.set(e.el, { clearProps: 'transform' })
        split(e)
        gsap.set(e.lines, { yPercent: 0 })
        gsap.set(e.el, { autoAlpha: 1 })
      }
      rememberRest()
      unpin()
      setMaskState('idle')
      phase = 'revealed'
    },

    /** Queue a new item. The poll decides when it is allowed to animate. */
    show (item) {
      if (item?.id === current?.id && phase === 'revealed' && !pending) return
      pending = item
      lastChange = performance.now()
    },

    /**
     * Drain the copy before a route change, instead of tearing text mid-slide.
     * Resolves once the OUT timeline has completed. motion-spec.md §6.6.
     */
    out () {
      released = true
      if (reduced) { complete(); return Promise.resolve() }
      if (phase === 'hidden' && !running) return Promise.resolve()
      return new Promise(resolve => { resolvers.push(resolve); out() })
    },

    /**
     * Start the OUT now, without waiting for a new item or the settle delay — a
     * section switch takes the copy away as the discs leave, not after.
     */
    leave () {
      if (released || phase === 'hidden' || phase === 'out') return
      if (reduced) { complete(); return }
      running = out()
    },

    /** Hand the engine back after `out()`. */
    release () { released = false },

    /** Diagnostic surface — the harness reads this, the page does not. */
    state: () => ({
      phase, entries: entries.length, pending: !!pending,
      groups: entries.reduce((a, e) => (a[e.group] = (a[e.group] ?? 0) + 1, a), {}),
    }),

    start () {
      if (poll) return
      poll = setInterval(tick, TEXT.pollInterval)
    },
  }
}
