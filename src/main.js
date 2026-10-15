/**
 * Boot. Loads the shelf JSON — never inlined, never hardcoded in the markup —
 * starts the loader, then brings up the 3D scene behind it and hands control over.
 *
 * The loader imports no 3D. `three` is a dynamic import so a 600 KB parse never
 * sits between the first paint and the counter.
 */
import { resolveConfig, DETAIL } from './disc/config.js'
import { createDiag } from './disc/diag.js'
import { createPreloader } from './preloader/index.js'
import { createReveal } from './text/reveal.js'
import { gsap } from './anim/eases.js'
import { parseHash, hashFor, nextId, locate } from './detail/route.js'
import { stillUrl } from './detail/copy.js'
import { createDetailView } from './detail/view.js'
import { createDissolve } from './detail/dissolve.js'

const galleryEl = document.querySelector('[data-disc-gallery]')
const panel = document.querySelector('.experience_info')
const canvas = document.querySelector('[data-disc-canvas]')
const preloaderEl = document.querySelector('[data-preloader]')
const status = document.querySelector('#shelf-status')
const switchEls = [...document.querySelectorAll('[data-shelf-switch]')]
const htmlEl = document.documentElement
const mainEl = document.querySelector('main')
const detailEl = document.querySelector('[data-detail]')
const shelfTitle = document.title
try { history.scrollRestoration = 'manual' } catch { /* the page scrolls only while a detail is open */ }
htmlEl.dataset.view = 'shelf'

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const w = resolveConfig(galleryEl)
const diag = createDiag(location)

/**
 * The one screen-space anchor, shared by both consumers — the loader imports no
 * 3D, so it cannot compute this itself. The gallery writes it every frame; the
 * loader reads it every frame. Neither owns it. implementation.md §10.1.
 */
const anchor = { x: innerWidth / 2, y: innerHeight * 2, r: 0, live: 0, rest: 0, ready: false }

const shelf = await fetch('./content/shelf.json', { cache: 'no-cache' }).then(r => {
  if (!r.ok) throw new Error(`shelf.json ${r.status}`)
  return r.json()
})

// The curator's ratings live in their own file so the cover/metadata generator
// (tools/fetch-covers.py rewrites shelf.json) can never wipe them. Optional:
// without it every note block simply stays hidden.
const notes = await fetch('./content/notes.json', { cache: 'no-cache' })
  .then(r => (r.ok ? r.json() : null)).catch(() => null)
const noteOf = item => {
  const n = notes?.items?.[item.id]
  const r = Number(n?.rating)
  return n && n.rating != null && Number.isFinite(r) ? { rating: Math.min(10, Math.max(0, r)), note: n.note } : null
}
/** Star meter width in em: whole stars plus a fraction of the next one. Each
 *  star cell is 1.125 em (a 1 em star + .125 em gap), so 8.5 → 8 · 1.125 + .5 em.
 *  The meter is ten stars wide: ratings run 0–10, one star per point. */
const starsWidth = r => Math.floor(r) * 1.125 + (r % 1)

const sectionOf = id => shelf.sections.find(s => s.id === id)
const ids = shelf.sections.flatMap(s => s.items.map(i => i.id))
/** `#/<id>` at load: the shelf starts on that item and the page opens over it. */
const deepId = parseHash(location.hash, ids)

/**
 * `.experience_info` holds the active item's title over label/value rows, each
 * under its own hairline, and the shelf position bottom-left. A null value
 * nulls its label too, which hides the field AND its rule, so no dangling
 * hairline is ever left behind.
 *
 * `meta` is "Genre · runtime" for films and "Genre · year" for games; the year
 * already has its own row, so a trailing year is dropped rather than repeated.
 */
const sectionOfItem = item => shelf.sections.find(s => s.items.includes(item))
const fields = item => {
  const section = sectionOfItem(item)
  const films = section?.id === 'films'
  const genre = item.meta?.replace(/ · \d{4}$/, '') || null
  const n = noteOf(item)
  return {
    title: item.title,
    creditLabel: films ? 'Directed by' : item.creditLabel,
    credit: item.credit,
    yearLabel: 'Year',
    year: String(item.year),
    genreLabel: genre && 'Genre',
    genre,
    secondaryLabel: item.secondary ? (films ? 'Starring' : 'Edition') : null,
    // a cast list wraps between names, never inside one (NBSP within a name)
    secondary: item.secondary?.split(', ').map(n => n.replaceAll(' ', '\u00A0')).join(', ') ?? null,
    section: section?.plural ?? '',
    index: `${String(item.index).padStart(2, '0')} / ${String(section?.items.length ?? 0).padStart(2, '0')}`,
    // bottom centre: null hides the whole block
    stars: n ? starsWidth(n.rating) : null,
    noteLabel: n ? (n.note ? (notes.label ?? 'Note') : '') : null,
    note: n ? (n.note ? `\u201C${n.note}\u201D` : '') : null,
  }
}

const reveal = createReveal({
  panel, gate: galleryEl, reduced, fields,
  held: () => !!gallery?.copyHeld(),
})
reveal.start()

let gallery = null
let currentId = null

function render (item, { mount = false } = {}) {
  if (!item || item.id === currentId) return
  currentId = item.id
  if (mount) reveal.mount(item)
  else reveal.show(item)

  const note = noteOf(item)
  const section = sectionOf(gallery.state.section)
  const prefix = section.prefix
  const n = String(item.index).padStart(2, '0')
  status.textContent =
    `${shelf.curator.indexLabel.replace('{prefix}', prefix).replace('{n}', n)}. ` +
    `${item.title}, ${item.year}. ${item.meta}. ${item.creditLabel} ${item.credit}` +
    (item.secondary ? `. ${item.secondary}` : '') +
    (note ? `. Rated ${note.rating} of 10${note.note ? `: ${note.note}` : ''}` : '')
}

// `id` is passed on a click: the gallery only adopts the new section at the
// flip's midpoint, but the nav must answer the click straight away.
function syncSwitcher (id = gallery.state.section) {
  for (const b of switchEls) b.setAttribute('aria-pressed', String(b.dataset.shelfSwitch === id))
}

// ── reduced motion is a real branch, not shortened durations ────────────────
if (reduced) {
  document.documentElement.removeAttribute('data-preload')
  panel?.removeAttribute('data-disc-flight')
  document.querySelector('.nav-loading-item')?.setAttribute('hidden', '')
}

let preloader = null
if (!reduced) {
  preloader = createPreloader({
    root: preloaderEl,
    anchor,
    diag,
    onProgress: P => gallery?.setProgress(P),
    onReady: (_P, exit) => exit(),
    // The loader arms the growth-coupled counter exit at `setOff` FIRST — while
    // the disc is still at 0.8 — and only then hands the lead's pose over. Order
    // matters: measuring the growth from after the fan starts is measuring from
    // the wrong instant. motion-spec.md §2.7.
    onExitArmed: () => gallery?.fanOut(),
  })
}

const { createGallery } = await import('./disc/gallery.js')
gallery = createGallery({
  canvas, galleryEl, shelf, config: w, diag, reduced, anchor, initial: deepId,
  onCovers: (loaded, total) => preloader?.setCovers(loaded, total),
  onActive: d => { render(d.item); prefetchSoon(d.item) },
})

// The 3D scene exists now, so the bar leaves its boot creep and starts tracking
// real cover progress.
preloader?.setSceneReady()
if (reduced) gallery.settle()
await gallery.ready

// Reduced motion mounts the copy outright; otherwise the first item is QUEUED,
// and the engine reveals it (lines up out of their masks, rules growing) the
// moment the loader lifts `data-disc-flight` — the copy animates in, never pops.
const first = gallery.state.section
render(deepId ? locate(shelf.sections, deepId).item : sectionOf(first).items[0], { mount: reduced })
syncSwitcher()
galleryEl.focus({ preventScroll: true })

// ── section switcher ────────────────────────────────────────────────────────
// On a detail page the same links are the way home: they close the page, then
// the shelf lands on the section that was asked for (the reference's nav does the same).
let wantSection = null
function switchTo (id) {
  if (!gallery.switchSection(id)) return
  reveal.leave()                          // the copy leaves with the discs, not after
  currentId = null                        // force the copy to re-render for the new section
  syncSwitcher(id)
  status.textContent = `${sectionOf(id).plural}.`
  galleryEl.focus({ preventScroll: true })
}
for (const b of switchEls) {
  b.addEventListener('click', () => {
    if (route === null) { if (!busy) switchTo(b.dataset.shelfSwitch); return }
    if (busy) return
    wantSection = b.dataset.shelfSwitch
    back()
  })
}

// The drain pair, so a route change waits for the copy instead of tearing it
// mid-slide. motion-spec.md §6.6. The detail router below calls it.
galleryEl.discTransitionsFlow = { out: () => reveal.out(), release: () => reveal.release() }

// ═══════════════════════════════════════════════════════════════════════════
// The detail view — motion-spec.md §11–§13, design-system.md §4.8.
// One document, two views, a hash router (build-notes.md §4). The shelf scene is
// never rebuilt: the disc leaves on the same canvas and the page fades in over it.
// ═══════════════════════════════════════════════════════════════════════════
const ratingOf = item => noteOf(item)?.rating ?? null
const view = createDetailView({ root: detailEl, fields, ratingOf, reduced })
const dissolve = createDissolve({
  track: view.track, hero: view.hero, still: view.stillSection, bleed: view.bleed, reduced,
})

let route = null                 // the id the detail view shows, or null on the shelf
let busy = false
let queued = null                // { id } — only the LAST request made while a transition runs
let lastTransition = null
let nextCtl = null               // the scroll-next disc (src/detail/next.js), built lazily
let nextToken = 0

const fade = (el, to, duration) => gsap.to(el, { autoAlpha: to, duration, ease: 'none' }).then()
const fadeTime = () => (reduced ? DETAIL.reducedFade : null)

function setView (name) {
  const detail = name === 'detail'
  htmlEl.dataset.view = name
  mainEl.inert = detail
  if (detail) mainEl.setAttribute('aria-hidden', 'true'); else mainEl.removeAttribute('aria-hidden')
  detailEl.hidden = !detail
  if (detail) detailEl.removeAttribute('aria-hidden'); else detailEl.setAttribute('aria-hidden', 'true')
  detail ? startDetailClock() : stopDetailClock()
}

// the page's own frame clock (the shelf's ring stops when the shelf parks)
let clockOn = false
function startDetailClock () {
  if (clockOn || !diag.on) return
  clockOn = true
  diag.resetDetailClock()
  let prev = 0
  const loop = now => {
    if (!clockOn) return
    if (prev) diag.detailFrame(now - prev)
    prev = now
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
const stopDetailClock = () => { clockOn = false }

/** The loader's `data-preload` leaves <html> when the nav rolls up; a deep link waits for it. */
const loaderGone = () => new Promise(resolve => {
  if (!htmlEl.hasAttribute('data-preload')) { resolve(); return }
  const mo = new MutationObserver(() => {
    if (!htmlEl.hasAttribute('data-preload')) { mo.disconnect(); resolve() }
  })
  mo.observe(htmlEl, { attributes: true, attributeFilter: ['data-preload'] })
})

const ctxFor = id => {
  const { item, section } = locate(shelf.sections, id)
  return { item, section, nextItem: locate(shelf.sections, nextId(section.items, id)).item }
}

// ── prefetch (motion-spec.md §11.2) ─────────────────────────────────────────
const prefetched = new Set()
const prefetch = url => {
  if (!url || prefetched.has(url)) return
  prefetched.add(url)
  const img = new Image()
  img.src = url
}
let prefetchTimer = 0
/** 450 ms after the active disc settles on an item, its still is fetched — once. */
function prefetchSoon (item) {
  clearTimeout(prefetchTimer)
  if (!item) return
  prefetchTimer = setTimeout(() => prefetch(stillUrl(item.id)), 450)
}
/** On a detail page: the next title's still and cover, when the browser is idle. */
function prefetchNext (nextItem) {
  const go = () => { prefetch(stillUrl(nextItem.id)); prefetch(nextItem.cover) }
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 1500)
}

// ── the scroll-next disc ────────────────────────────────────────────────────
async function buildNext (ctx) {
  const mine = ++nextToken
  nextCtl?.dispose(); nextCtl = null
  if (reduced) return                           // a plain link, no second WebGL context
  const { createScrollNext } = await import('./detail/next.js')
  if (mine !== nextToken) return
  nextCtl = createScrollNext({
    section: detailEl.querySelector('[data-scroll-next]'),
    nextItem: ctx.nextItem,
    config: w,
    diag,
    onLeave: () => navigate(ctx.nextItem.id, { replace: true }),
  })
}
function disposeNext () {
  nextToken++
  nextCtl?.dispose(); nextCtl = null
}

/** The page is visible: reveal its copy, start the ink and the next disc. */
function presentPage (ctx, hasStill, primed = false) {
  if (primed) view.play(); else view.enter()
  if (hasStill) dissolve.start()
  buildNext(ctx)
  prefetchNext(ctx.nextItem)
}
function dismissPage () {
  dissolve.stop()
  disposeNext()
  view.reset()
}

// ── transitions ─────────────────────────────────────────────────────────────
const landed = () => !gallery.state.inbound && !gallery.state.introLive && !gallery.state.switching

/** Shelf → detail, the disc leaves (motion-spec.md §11.5 `disc-detail-open`). */
async function openDetail (id) {
  const ctx = ctxFor(id)
  const active = gallery.discs[gallery.state.active]
  if (active?.item.id !== id) gallery.focusItem(id)

  let handOver
  const handed = new Promise(r => { handOver = r })
  const written = view.write(ctx.item, ctx)
  const drained = reveal.out()                      // the copy leaves WITH the disc, not after
  const exited = gallery.exitToDetail({ onHandOver: handOver })

  await Promise.all([handed, written])
  const hasStill = await written
  gsap.set(detailEl, { autoAlpha: 0 })
  setView('detail')
  scrollTo(0, 0)
  route = id
  document.title = `${ctx.item.title} — ${shelf.curator.name}`
  // The canvas rides ABOVE the page while the disc finishes leaving — the
  // reference carries it into <body> at z-index 60 (§11.6) — so the page fading
  // in beneath never shows the disc as a ghost through a half-opaque layer. The
  // copy is released only once the page is up (`pageReady`, §11.1), not with it.
  htmlEl.dataset.exiting = ''
  // the copy is hidden BEFORE the page fades in, so it never shows its finished
  // text and then pulls it back to animate — that read as the page "reloading"
  const primed = view.enter({ hold: true })
  await fade(detailEl, 1, fadeTime() ?? DETAIL.detailFade)
  presentPage(ctx, hasStill, !!primed)
  await Promise.all([exited, drained])
  delete htmlEl.dataset.exiting
  htmlEl.dataset.covered = ''
  view.focus()                                      // an element under visibility:hidden cannot take focus
}

/** A deep link: the page is simply there once the loader has lifted. No disc exit. */
async function openInstant (id) {
  const ctx = ctxFor(id)
  gallery.holdForDetail()
  const drained = reveal.out()
  const hasStill = await view.write(ctx.item, ctx)
  detailEl.dataset.instant = ''
  detailEl.addEventListener('animationend', () => delete detailEl.dataset.instant, { once: true })
  gsap.set(detailEl, { autoAlpha: 1 })
  setView('detail')
  scrollTo(0, 0)
  route = id
  document.title = `${ctx.item.title} — ${shelf.curator.name}`
  await drained
  await loaderGone()
  presentPage(ctx, hasStill)
  htmlEl.dataset.covered = ''
  view.focus()
}

/** Detail → shelf: the page fades, the disc grows back into its slot, the copy lands with it. */
async function closeDetail () {
  const ctx = ctxFor(route)
  gallery.focusItem(route)                          // the title we ended on, not the one we opened
  gallery.poseHidden()                              // the canvas is blank before the page lifts
  htmlEl.removeAttribute('data-covered')
  await fade(detailEl, 0, fadeTime() ?? DETAIL.detailFade)
  dismissPage()
  setView('shelf')
  scrollTo(0, 0)
  document.title = shelfTitle
  route = null
  await gallery.enterFromDetail({
    onReleaseCopy: () => { reveal.release(); reveal.show(ctx.item) },
  })
  galleryEl.focus({ preventScroll: true })
  const want = wantSection
  wantSection = null
  if (want && want !== gallery.state.section) switchTo(want)
}

/** Detail → detail (scroll-next, or a typed hash): a cross-fade, `default` of §11.1. */
async function swapDetail (id) {
  const ctx = ctxFor(id)
  await fade(detailEl, 0, fadeTime() ?? DETAIL.fallbackFade)
  dismissPage()
  const hasStill = await view.write(ctx.item, ctx)
  gallery.focusItem(id)                             // so Back lands on THIS title's slot
  gallery.poseHidden()
  route = id
  document.title = `${ctx.item.title} — ${shelf.curator.name}`
  scrollTo(0, 0)
  const faded = fade(detailEl, 1, fadeTime() ?? DETAIL.fallbackFade)
  presentPage(ctx, hasStill)
  await faded
  view.focus()
}

async function run (id, { instant = false } = {}) {
  busy = true
  const kind = route === null ? 'open' : id === null ? 'close' : 'swap'
  const t0 = performance.now()
  try {
    if (kind === 'open') await (instant || !landed() ? openInstant(id) : openDetail(id))
    else if (kind === 'close') await closeDetail()
    else await swapDetail(id)
  } catch (e) {
    console.error('detail transition failed', e)
  } finally {
    busy = false
    lastTransition = { kind, id, ms: Math.round(performance.now() - t0) }
  }
  if (queued) { const q = queued; queued = null; request(q.id) }
}

/** Every route change goes through here; a transition in flight keeps only the last request. */
function request (id, opts) {
  if (busy) { queued = { id }; return }
  if (id === route) return
  run(id, opts)
}

/** Programmatic navigation: keep the address bar and the history in step. */
function navigate (id, { replace = false } = {}) {
  const url = id ? hashFor(id) : location.pathname + location.search
  try {
    if (replace) history.replaceState(history.state, '', url)
    else history.pushState({ detail: true }, '', url)
  } catch { /* a sandboxed frame: the view still changes */ }
  request(id)
}

/** Back / Esc: pop the entry the shelf pushed; a deep link has none, so rewrite it. */
function back () {
  if (route === null && !busy) return
  if (history.state?.detail) history.back()
  else navigate(null, { replace: true })
}

function reconcile () {
  const h = location.hash
  if (h === '' || h === '#' || h === '#/') { request(null); return }
  const id = parseHash(h, ids)
  if (id) request(id)                     // an id that is not on the shelf is ignored
}
addEventListener('hashchange', reconcile)
addEventListener('popstate', reconcile)

galleryEl.addEventListener('discactivate', e => {
  const id = e.detail?.item?.id
  if (id && route === null && !busy) navigate(id)
})
detailEl.querySelector('[data-detail-back]').addEventListener('click', back)
addEventListener('keydown', e => { if (e.key === 'Escape' && (route !== null || busy)) { e.preventDefault(); back() } })
view.link.addEventListener('click', e => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return
  e.preventDefault()
  nextCtl ? nextCtl.leave() : navigate(view.link.dataset.nextId, { replace: true })
})

// ── diagnostics: the keys that belong to no gallery ─────────────────────────
diag.setExtra(() => ({
  view: htmlEl.dataset.view,
  route,
  ink: (({ progress, level, clip }) => ({ progress, level, clip }))(dissolve.state),
  next: nextCtl?.state() ?? { progress: 0, push: 0, leaving: false, built: false },
  transition: { running: busy, last: lastTransition },
}))
// the shelf's loop parks under a detail page and takes its own publishing with it
if (diag.on) setInterval(() => { if (htmlEl.dataset.view === 'detail') diag.publish(gallery.diag()) }, 200)

if (deepId) request(deepId, { instant: true })

// ── verification hook ───────────────────────────────────────────────────────
// `?diag&autoswitch` makes the page switch to the other collection on its own,
// once the intro has fully landed. It exists so the harness can measure a
// section switch with zero CDP input traffic in the window — a Playwright click
// injects enough main-thread work to look like a dropped frame. Gated behind
// `?diag`, inert otherwise, and it touches no geometry, texture or scene object.
if (diag.on && new URLSearchParams(location.search).has('autoswitch')) {
  const other = shelf.sections.find(s => s.id !== gallery.state.section)
  // 5.2 s is safely past the 2.85 s loader floor plus the 1.15 s fan-out, so the
  // switch never overlaps the intro — otherwise the two animations share a frame
  setTimeout(() => { if (gallery.switchSection(other.id)) reveal.leave() }, reduced ? 800 : 5200)
}