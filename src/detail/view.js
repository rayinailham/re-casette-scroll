/**
 * The detail page's DOM: writes one item's copy into the static skeleton in
 * index.html and reveals it with the shelf's own vocabulary — SplitText lines in
 * masks rising under the `energy` ease, hairlines growing from their left edge,
 * the cumulative stagger of `planReveal`. It does not fork the shelf's engine
 * (src/text/reveal.js is bound to `.experience_info`); it reuses the pure planner
 * and the tokens. design-system.md §4.6, motion-spec.md §6.
 *
 * Every string lands through `textContent`: titles come from JSON.
 */
import { SplitText } from 'gsap/SplitText'
import { gsap, energyEase } from '../anim/eases.js'
import { TEXT } from '../disc/config.js'
import { planReveal } from '../text/reveal.js'
import { splitMeta, stillUrl, nextKicker, nextAria, titleLines } from './copy.js'
import { hashFor } from './route.js'

gsap.registerPlugin(SplitText)

/** Scroll-next: the first title line sits on the 3rd rule (`labelRule`, §13.3); offsets are the live ones (−240 / +282 px at 1440). */
const NEXT_RULE = 3
const NEXT_SCATTER = ['-16.7vw', '19.6vw', '-8vw']

/** The hero's reveal order: title, then each hairline with its label and value. */
const HERO_TEXT = '.detail-hero [data-detail-target]'

export function createDetailView ({ root, fields, ratingOf, reduced }) {
  const $ = sel => root.querySelector(sel)
  const targets = Object.fromEntries(
    [...root.querySelectorAll('[data-detail-target]')].map(el => [el.dataset.detailTarget, el]))
  const fieldEls = Object.fromEntries(
    [...root.querySelectorAll('[data-detail-field]')].map(el => [el.dataset.detailField, el]))

  const track = $('[data-dissolve-track]')
  const hero = $('[data-dissolve]')
  const stillSection = $('[data-detail-still]')
  const bleed = $('[data-dissolve-bleed]')
  const title = targets.title
  const link = $('[data-scroll-next-link]')
  const kicker = $('[data-scroll-next-kicker]')
  const nextTitle = $('[data-scroll-next-title]')

  let splits = []
  let revealTl = null
  let token = 0                     // a newer write invalidates an older still probe

  const set = (key, value) => {
    const el = targets[key]
    if (!el) return
    if (typeof value === 'number') { el.style.setProperty('--value', value); el.textContent = ''; return }
    el.textContent = value ?? ''
  }
  const field = (key, on) => { if (fieldEls[key]) fieldEls[key].hidden = !on }

  function clearReveal () {
    revealTl?.kill(); revealTl = null
    for (const s of splits) s.revert()
    splits = []
    gsap.set(root.querySelectorAll('[data-detail-target], .detail-row .divider-horizontal, .detail-hero__rule'),
      { clearProps: 'opacity,visibility,transform,clipPath' })
  }

  /**
   * Fill the page for `item`. Resolves true when a still exists and is in the DOM
   * (decoded), false when `assets/stills/<id>.webp` is absent — in which case no
   * <img> exists at all and the still section stays hidden, not broken.
   */
  async function write (item, { section, nextItem }) {
    const mine = ++token
    clearReveal()
    const f = fields(item)
    const { genre, runtime } = splitMeta(item.meta)

    set('title', f.title)
    set('creditLabel', f.creditLabel); set('credit', f.credit)
    set('secondaryLabel', f.secondaryLabel); set('secondary', f.secondary)
    set('yearLabel', f.yearLabel); set('year', f.year)
    set('genreLabel', genre && 'Genre'); set('genre', genre)
    set('runtimeLabel', runtime && 'Runtime'); set('runtime', runtime)
    field('credit', f.credit != null)
    field('secondary', f.secondary != null)
    field('year', f.year != null)
    field('genre', genre != null)
    field('runtime', runtime != null)

    const rated = f.stars != null
    field('rating', rated)
    set('stars', rated ? f.stars : null)
    set('noteLabel', f.noteLabel); set('note', f.note)
    set('ratingText', rated ? `Rated ${ratingOf(item)} of 10` : '')
    set('stillQuote', f.note)
    if (stillSection) stillSection.dataset.hasQuote = String(!!f.note)

    // the next title: the label and the always-present link (the reduced-motion path)
    if (nextItem) {
      kicker.textContent = nextKicker(section)
      // one masked line per hairline, each sat on its rule and pushed off-centre
      // (--r: which rule, --dx: the scatter). A text node between them keeps
      // textContent equal to the title.
      const parts = []
      titleLines(nextItem.title).forEach((text, i) => {
        if (i) parts.push(' ')
        const line = document.createElement('span')
        line.className = 'detail-next__line'
        line.style.setProperty('--r', String(NEXT_RULE + i))
        line.style.setProperty('--dx', NEXT_SCATTER[i % NEXT_SCATTER.length])
        const word = document.createElement('span')
        word.className = 'detail-next__word'
        word.textContent = text
        line.appendChild(word)
        parts.push(line)
      })
      nextTitle.replaceChildren(...parts)
      link.href = hashFor(nextItem.id)
      link.setAttribute('aria-label', nextAria(section, nextItem.title))
      link.dataset.nextId = nextItem.id
    }

    // the still: probe first, insert only what decoded
    bleed.querySelector('img')?.remove()
    stillSection.hidden = true
    const img = new Image()
    img.alt = ''
    img.decoding = 'async'
    img.src = stillUrl(item.id)
    const ok = await img.decode().then(() => true, () => false)
    if (mine !== token) return false
    if (ok) { bleed.appendChild(img); stillSection.hidden = false }
    return ok
  }

  /**
   * The hero's copy rises into place. Nothing to do under reduced motion.
   * `hold` primes it — lines masked, rules unborn — and leaves the timeline
   * paused for `play()`: the page can fade in with its copy already hidden,
   * instead of showing the finished text and then taking it back to animate it.
   */
  function enter ({ hold = false } = {}) {
    if (reduced) return null
    const ease = energyEase()
    const entries = []
    for (const el of root.querySelectorAll(`${HERO_TEXT}, .detail-hero .divider-horizontal`)) {
      if (el.closest('[hidden]')) continue
      if (el.matches('.divider-horizontal')) { entries.push({ el, kind: 'rule' }); continue }
      if (!el.textContent) continue
      entries.push({ el, kind: 'text' })
    }
    for (const e of entries) {
      if (e.kind === 'rule') { gsap.set(e.el, { scaleX: 0, transformOrigin: 'left center' }); continue }
      const s = new SplitText(e.el, { type: 'lines', linesClass: 'disc-line' })
      splits.push(s)
      for (const line of s.lines) {
        const mask = document.createElement('div')
        mask.setAttribute('data-disc-line-mask', '')
        line.parentNode.insertBefore(mask, line)
        mask.appendChild(line)
      }
      e.lines = s.lines
      gsap.set(e.lines, { yPercent: TEXT.inShift })
    }
    const at = planReveal(entries.map(e => ({ group: 0, together: false })), TEXT)
    const tl = revealTl = gsap.timeline({
      paused: hold,
      onComplete: () => { for (const s of splits) s.revert(); splits = []; revealTl = null },
    })
    entries.forEach((e, i) => {
      if (e.kind === 'rule') tl.to(e.el, { scaleX: 1, duration: TEXT.inDuration, ease }, at[i])
      else tl.to(e.lines, { yPercent: 0, duration: TEXT.inDuration, ease, stagger: TEXT.inLineStagger }, at[i])
    })
    return tl
  }

  return {
    root, track, hero, stillSection, bleed, link, kicker, nextTitle,
    write, enter,
    play () { revealTl?.play() },
    focus () { title.focus({ preventScroll: true }) },
    /** The still's <img>, or null — what the harness and the parallax read. */
    get still () { return bleed.querySelector('img') },
    reset: clearReveal,
  }
}
