/**
 * The gallery: one scene, ONE carousel, twenty discs.
 *
 * Both collections exist from the first frame. Switching sections swaps which
 * slice of the ribbon is on screen — it does not rebuild the scene, upload a
 * texture, or create a geometry. That is the whole point: rebuilding 10 discs on
 * every switch produces a visible hitch exactly when the user expects the
 * interface to be at its smoothest.
 *
 * Exactly one arc function (layout.js), one follow smoother, one wobble
 * integrator (impulse.js), one scroll integrator (scroll.js). If you find
 * yourself writing any of them twice, you have forked.
 */
import {
  Fog, Group, MathUtils, PerspectiveCamera, Quaternion, Raycaster, Scene, Vector2, Vector3,
  ACESFilmicToneMapping, SRGBColorSpace, WebGLRenderer,
} from 'three'

import { clamp, DETAIL } from './config.js'
import { arcPosition, arcScale, followRate, flowLean, staggerFactor, staggerVisible } from './layout.js'
import { createImpulse, integrate, resetImpulse, wipeImpulse, pressImpulse } from './impulse.js'
import { introPose, riseOffsetIntoLocal } from './intro.js'
import { snapDuration, exitSpinTarget, handOverAt } from './transition.js'
import {
  createScroll, createWheel, stepScroll, wheelStep, dragStep, resetWheelFrame, wheelFrameFull,
  snapProfile, kickFlow,
} from './scroll.js'
import { buildDiscGeometries, buildDiscGroups } from './geometry.js'
import { buildMaterials, buildCoverTexture } from './materials.js'
import { buildEnvironment } from './environment.js'
import { buildLighting } from './lighting.js'
import { createScribble } from './scribble.js'
import { gsap, glideEase, glideFn } from '../anim/eases.js'

export const SECTION_KEY = 'shelf:section'

export function createGallery ({ canvas, galleryEl, shelf, config: w, diag, onActive, onCovers, reduced, anchor, initial = null }) {
  const coarse = matchMedia('(pointer: coarse)').matches

  // ── renderer / scene ────────────────────────────────────────────────────
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = w.exposure
  renderer.setClearColor(0x000000, 0)
  // NON-NEGOTIABLE: `transmission` renders the scene to a separate target per
  // transmissive mesh. Two per disc across twenty discs is the single largest
  // frame cost in the whole build — and the biggest reason the set lives in one
  // scene with one compile rather than two.
  if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.5

  const scene = new Scene()
  scene.fog = new Fog(w.fogColor, 7, 14)   // far discs dissolve into the page
  const camera = new PerspectiveCamera(w.cameraFOV, 1, 0.1, 100)
  camera.position.set(0, 0, w.cameraDistance)
  camera.lookAt(0, 0, 0)
  scene.environment = buildEnvironment(renderer, w)
  scene.environmentIntensity = w.environmentIntensity
  buildLighting(scene, w)

  // The gallery transform is CONSTANT, so it is set once here rather than per
  // frame. That removes implementation.md §13's "row shudders on resize" ordering
  // hazard by construction: there is no frame in which the discs fail to inherit it.
  const gallery = new Group()
  gallery.rotation.x = MathUtils.degToRad(w.galleryRotX)   // −30°
  gallery.rotation.y = MathUtils.degToRad(w.galleryRotY)   // −30°
  gallery.scale.setScalar(w.galleryScale)                  // 1.08
  scene.add(gallery)

  // the hover scribble lives in gallery space, next to the discs it circles
  const scribble = (coarse || reduced) ? null : createScribble(gallery)

  const geometry = buildDiscGeometries(w)
  const materials = buildMaterials(w)
  const frontTemplate = materials.front
  const nodes = buildDiscGroups(geometry, materials)

  // ── content: 20 entries, each carrying its section and a stable global index
  const sections = []
  let total = 0
  for (const s of shelf.sections) { sections.push({ ...s, start: total }); total += s.items.length }

  const discs = sections.flatMap(section => section.items.map((item, local) => {
    const globalIndex = section.start + local
    return {
      item,
      sectionId: section.id,
      localIndex: local,
      globalIndex,
      ...nodes[globalIndex],
      hover: 0,
      ghost: 1,
      scaleMul: 1,
      spinX: 0,
      spinY: 0,
      live: true,
      flipTween: null,
      ghostTween: null,
      impulse: createImpulse(),
    }
  }))

  // 20 front materials — one per disc, so each carries its own cover. Every other
  // material (edge, back, hub, matrix, frost) is SHARED: identical parameters, one
  // shader program, no visual difference.
  for (const d of discs) d.front.material = frontTemplate.clone()
  gallery.add(...discs.map(d => d.group))

  const sectionOf = id => sections.find(s => s.id === id)
  const sectionStart = id => sectionOf(id).start
  const sectionLength = id => sectionOf(id).items.length
  const discByGlobal = new Map(discs.map(d => [d.globalIndex, d]))

  // ── state ───────────────────────────────────────────────────────────────
  const state = {
    section: sections[0].id,
    active: 0,             // GLOBAL integer anchor — what the UI reads
    activeProgress: 0.001, // intro/fan scale for the lead
    others: 0,             // fan-in stagger driver
    inbound: true,         // intro flag
    introLive: true,       // whether P still owns the lead's pose
    switching: false,
    detail: null,          // null | 'exiting' | 'open' | 'entering' — a detail page owns the shelf
    holdCopy: false,       // keeps the new copy back until the new disc has landed
    switchTl: null,
    P: 0,
  }

  let scroll = createScroll(0, 9)
  const wheel = createWheel()
  const pointer = new Vector2()
  const rayNdc = new Vector2()
  const uvHit = { x: 0, y: 0 }
  const downUV = { x: 0, y: 0 }
  const invGalleryQuat = new Quaternion()
  const riseVec = new Vector3()
  const raycaster = new Raycaster()

  let velX = 0, velY = 0, prevX = 0, prevY = 0, lastMoveAt = 0
  let hoverIndex = -1
  let pointerIn = false   // no hover at all while the pointer is off the shelf
  let dragging = false, dragActive = false, downX = 0, downY = 0, downId = -1, dragPrevX = 0
  let pickMeshes = []
  let lastDt = 1 / 60
  /** The last press impulse's raycast UV. Diagnostic only. */
  const pressLog = { x: 0, y: 0, index: -1, at: 0 }

  // ── raycast ─────────────────────────────────────────────────────────────
  function raycast () {
    if (!pointerIn) { hoverIndex = -1; return -1 }
    rayNdc.set(pointer.x, pointer.y)
    raycaster.setFromCamera(rayNdc, camera)
    // three's raycaster ignores `visible`, and a culled disc keeps its last pose —
    // after a flip that is a stale spot that can sit in front of the lead
    const hit = raycaster.intersectObjects(pickMeshes, false)
      .find(h => discs[h.object.userData.index].group.visible)
    if (!hit) { hoverIndex = -1; return -1 }
    // uv → −1…1 from the disc's OWN centre. This is the press-tilt input.
    // Seen from the back the disc's local +x points at the viewer's left, so the
    // press input is mirrored to stay in screen space.
    const hitDisc = discs[hit.object.userData.index]
    const side = Math.cos(hitDisc.spinY) < 0 ? -1 : 1
    uvHit.x = hit.uv ? (hit.uv.x * 2 - 1) * side : 0
    uvHit.y = hit.uv ? hit.uv.y * 2 - 1 : 0
    hoverIndex = hit.object.userData.index
    return hoverIndex
  }

  // ── scroll control ──────────────────────────────────────────────────────
  /**
   * `clampPosition: false` is what makes the section slide possible: clamping
   * the live float into the incoming section's range would TELEPORT it to that
   * section's start before the tween could carry it there, and the switch would
   * read as a snap. The tween owns the position across the boundary; the clamp
   * only ever runs at rest.
   */
  function setRange (id, { clampPosition = true } = {}) {
    scroll.lo = sectionStart(id)
    scroll.hi = scroll.lo + sectionLength(id) - 1
    if (!clampPosition) return
    scroll.position = clamp(scroll.position, scroll.lo, scroll.hi)
    scroll.target = clamp(scroll.target, scroll.lo, scroll.hi)
  }

  /**
   * One index change is never a raw position write: the flow velocity is kicked
   * FIRST, so the whole ribbon banks into the turn before the position tween even
   * starts. Without the kick only the index animates and the row reads as
   * teleport-and-settle. motion-spec.md §3.9.
   *
   * A new index request clears the drag fling and the spring (`Se = Te = 0`) but
   * NOT the flow velocity — clearing that is what would cancel the kick.
   */
  function moveTo (index, source) {
    // The intro pose belongs to whichever disc is ACTIVE. Moving the index while
    // the loader or the fan-out still runs hands that pose to the next disc,
    // which then jumps up-right out of its slot mid-intro — so, as on the
    // reference, the shelf takes no input until the intro has landed.
    if (state.switching || state.inbound || state.detail) return false
    const n = clamp(index, scroll.lo, scroll.hi)
    const dist = Math.abs(n - scroll.position)
    const { kick } = snapProfile(source, dist)
    if (!reduced) scroll.flow = kickFlow(scroll.flow, n, scroll.position, kick)
    if (n === scroll.target && dist < 1e-6) return false
    scroll.vel = 0            // a fresh notch wins over any fling in progress
    scroll.springVel = 0
    scroll.target = n
    return true
  }

  /** Drag release: keep the fling, aim at the nearest detent, add NO kick. */
  function flickToNearest () {
    if (state.switching) return
    scroll.target = clamp(Math.round(scroll.position), scroll.lo, scroll.hi)
  }

  function stepIndex (n, source = 'snap') { return moveTo(scroll.target + n, source) }
  function goTo (i, source = 'snap') { return moveTo(i, source) }

  /** The reduced-motion / immediate path. A stale kick must not leak forward. */
  function settleNow (n) {
    scroll.position = clamp(n, scroll.lo, scroll.hi)
    scroll.target = scroll.position
    scroll.vel = 0
    scroll.flow = 0
    scroll.springVel = 0
  }

  /** Re-level one disc. motion-spec.md §3.7 / §5.4 */
  function relevelOne (d) {
    d.flipTween?.kill()
    d.flipTween = gsap.to(d, {
      spinX: 0, spinY: 0,
      duration: reduced ? 0.15 : w.resetDuration,
      ease: 'power3.out',
      overwrite: true,
      onComplete: () => { d.flipTween = null },
    })
  }

  /** Re-level every disc after a drag. motion-spec.md §3.7 */
  function relevelAll () {
    for (const d of discs) relevelOne(d)
  }

  /**
   * Click on a disc. design-system.md §5:
   *   inactive → flip it to its back face
   *   active   → navigate to its detail page
   *
   * The active disc dispatches `discactivate`; main.js's router answers it with
   * `exitToDetail`. If nothing took the disc over it simply re-levels.
   * build-notes.md §4.
   */
  function activate (d) {
    if (state.detail) return
    if (d.globalIndex !== activeGlobal) { flipDisc(d); return }
    galleryEl.dispatchEvent(new CustomEvent('discactivate', {
      bubbles: true,
      detail: { index: d.globalIndex, section: d.sectionId, item: d.item },
    }))
    if (!state.detail) relevelOne(d)
  }

  /** Click → flip. motion-spec.md §5.3 */
  function flipDisc (d) {
    d.flipTween?.kill()
    const toBack = Math.abs(d.spinY) <= Math.PI / 2
    d.flipTween = gsap.to(d, {
      spinY: toBack ? Math.PI : 0,
      spinX: 0,
      duration: reduced ? 0.15 : 0.75,
      ease: 'power3.inOut',
      overwrite: true,
      onComplete: () => { d.flipTween = null },
    })
  }

  // ── input ───────────────────────────────────────────────────────────────
  function onPointerMove (e) {
    pointerIn = true
    const rect = canvas.getBoundingClientRect()
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1)

    // normalise cursor velocity to a 60 Hz frame, discarding stale samples, so a
    // 240 Hz mouse produces the same impulse magnitude as a 60 Hz one
    const now = performance.now()
    const ms = now - lastMoveAt
    lastMoveAt = now
    if (ms < 120) {
      const norm = 16.7 / Math.max(8, ms)
      velX = (e.clientX - prevX) * norm
      velY = (e.clientY - prevY) * norm
    }
    prevX = e.clientX; prevY = e.clientY

    if (!dragging) return
    // 5 px of movement promotes a pointerdown to a drag, so a click still registers
    if (!dragActive) {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) < w.dragStartDistance) return
      dragActive = true
      dragPrevX = e.clientX
      galleryEl.setAttribute('data-disc-dragging', 'true')
      scroll.vel = 0
    }
    dragStep(scroll, e.clientX - dragPrevX, galleryEl.clientWidth, w)
    dragPrevX = e.clientX
  }

  function onPointerDown (e) {
    pointerIn = true
    if (e.button !== 0 || state.switching || state.inbound || state.detail) return
    downId = raycast()
    downUV.x = uvHit.x; downUV.y = uvHit.y
    dragging = true
    dragActive = false
    downX = e.clientX; downY = e.clientY
    scroll.vel = 0
    galleryEl.setPointerCapture?.(e.pointerId)
  }

  function onPointerUp (e) {
    if (!dragging) return
    const wasDrag = dragActive
    const clickTarget = downId >= 0 ? downId : hoverIndex
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY)

    dragging = false
    dragActive = false
    downId = -1
    galleryEl.removeAttribute('data-disc-dragging')
    galleryEl.releasePointerCapture?.(e.pointerId)

    if (!wasDrag) {
      if (moved < w.dragStartDistance && clickTarget >= 0) {
        const d = discs[clickTarget]
        // The press input is the raycast hit point on the disc's OWN pick mesh,
        // not the cursor. Recorded so the harness can prove the wiring — a cursor
        // at the same screen point on a different disc yields a different UV.
        pressLog.x = +downUV.x.toFixed(4)
        pressLog.y = +downUV.y.toFixed(4)
        pressLog.index = clickTarget
        pressLog.at = Math.round(performance.now())
        pressImpulse(d.impulse, downUV.x, downUV.y, w)
        activate(d)
      }
      return
    }
    flickToNearest()
    if (reduced) settleNow(scroll.target)
    relevelAll()
  }

  function onWheel (e) {
    e.preventDefault()
    if (wheelFrameFull(wheel, w)) return
    wheel.queuedInFrame++
    const step = wheelStep(wheel, e.deltaY, e.deltaMode, performance.now(), innerHeight, w)
    if (step) stepIndex(step, 'wheel')
  }

  function onKeyDown (e) {
    const k = e.key
    if (k === 'ArrowRight' || k === 'ArrowDown') { stepIndex(1, 'key'); e.preventDefault() }
    else if (k === 'ArrowLeft' || k === 'ArrowUp') { stepIndex(-1, 'key'); e.preventDefault() }
    else if (k === 'Home') { goTo(scroll.lo, 'key'); e.preventDefault() }
    else if (k === 'End') { goTo(scroll.hi, 'key'); e.preventDefault() }
    else if (k === 'Enter' || k === ' ') {
      const d = discByGlobal.get(state.active)
      if (d && !state.detail) { pressImpulse(d.impulse, 0, 0, w); activate(d) }
      e.preventDefault()
    }
  }

  galleryEl.addEventListener('pointermove', onPointerMove, { passive: true })
  galleryEl.addEventListener('pointerdown', onPointerDown)
  galleryEl.addEventListener('pointerup', onPointerUp)
  galleryEl.addEventListener('pointercancel', onPointerUp)
  // Leaving recentres the tilt input — and NDC (0, 0) is exactly where the
  // active disc sits, so without `pointerIn` the next raycast would "hover" it
  // with the cursor up on the nav.
  galleryEl.addEventListener('pointerleave', () => { pointerIn = false; pointer.set(0, 0); hoverIndex = -1 })
  galleryEl.addEventListener('wheel', onWheel, { passive: false })
  galleryEl.addEventListener('keydown', onKeyDown)

  function refreshPickMeshes () {
    pickMeshes = discs.filter(d => d.sectionId === state.section).map(d => d.pick)
    galleryEl.style.cursor = 'grab'
  }

  // ── section switching ───────────────────────────────────────────────────
  /** Park one collection and bring the other live. No geometry, no texture. */
  function adoptSection (nextId) {
    for (const d of discs) {
      if (d.sectionId === nextId) {
        d.flipTween?.kill(); d.flipTween = null
        d.live = true; d.ghost = 1; d.spinX = 0; d.spinY = 0
      } else if (d.sectionId === state.section) {
        d.live = false; d.group.visible = false; d.spinY = 0; d.spinX = 0
      }
    }
    state.section = nextId
    setRange(nextId, { clampPosition: false })
    refreshPickMeshes()
  }

  /**
   * The reference's "disc-flip" transition, in one scene:
   *
   *   OUT (0.5 s)  the trailing discs fold back into depth, staggered outward
   *                (the fan run in reverse); the lead swells 1 → 1.45 and turns
   *                edge-on (spinY 0 → π/2), both power2.in — it leaves by
   *                turning its back, not by sliding away.
   *   SWAP         the outgoing ten are parked, the range and the position jump
   *                to the incoming section's first disc — invisible, because the
   *                only thing on screen is an edge-on disc.
   *   IN (1.05 s)  the new lead starts edge-on the other way (spinY −π/2) at
   *                1.45 and turns to face you (power2.out) while settling to 1
   *                (discGlide); its neighbours fan in from depth from 0.294 s.
   *                The copy is released at 0.945 s, so the text lands with it.
   *
   * No textures, geometries or programs are created: both collections already
   * live in the scene.
   */
  function switchSection (nextId, { animate = true, persist = true } = {}) {
    const next = sectionOf(nextId)
    if (!next || next.id === state.section || state.switching || state.detail) return false

    const prev = state.section
    if (persist) { try { localStorage.setItem(SECTION_KEY, next.id) } catch { /* private mode */ } }

    const outgoing = discs.filter(d => d.sectionId === prev)
    const swap = () => { adoptSection(next.id); settleNow(scroll.lo) }

    if (reduced || !animate) {
      swap()
      state.switching = false
      return true
    }

    // open the measurement window on the switch itself, not on a wall clock
    diag.beginWindow(`switch:${prev}->${next.id}`)

    const lead = discByGlobal.get(activeGlobal)
    const newLead = discByGlobal.get(next.start)
    const BOOST = 1.45
    // no lock: the spring finishes settling the outgoing row on its detent while
    // it folds away; every new index request is refused while switching
    scroll.vel = 0
    scroll.flow = 0
    scroll.target = clamp(Math.round(scroll.position), scroll.lo, scroll.hi)
    state.switching = true
    state.holdCopy = true
    state.inbound = false
    for (const d of outgoing) d.flipTween?.kill()

    state.switchTl?.kill()
    const tl = state.switchTl = gsap.timeline({
      onComplete: () => {
        state.inbound = false
        state.switching = false
        state.holdCopy = false
        state.switchTl = null
      },
    })

    // OUT
    tl.to(state, { others: 0, duration: 0.5, ease: 'none' }, 0)
      .to(state, { activeProgress: BOOST, duration: 0.5, ease: 'power2.in' }, 0)
    if (lead) tl.to(lead, { spinY: Math.PI / 2, spinX: 0, duration: 0.5, ease: 'power2.in' }, 0)

    // SWAP at 0.5, then IN. Built up front with fromTo + immediateRender:false so
    // the IN values only apply once the playhead reaches them.
    const IN = 0.5, INDUR = 1.05
    tl.add(() => {
      swap()
      state.inbound = true            // fan-in curve + no follow lag: discs land in pose
    }, IN)
      .fromTo(newLead, { spinY: -Math.PI / 2 },
        { spinY: 0, duration: INDUR, ease: 'power2.out', immediateRender: false }, IN)
      .fromTo(state, { activeProgress: BOOST },
        { activeProgress: 1, duration: INDUR, ease: glideEase(), immediateRender: false }, IN)
      .fromTo(state, { others: 0 },
        { others: 1, duration: INDUR * 0.85, ease: 'none', immediateRender: false }, IN + INDUR * 0.28)
      .add(() => { state.holdCopy = false }, IN + INDUR * 0.9)
    return true
  }

  function initialSection () {
    const wanted = new URLSearchParams(location.search).get('shelf')
    if (wanted && sectionOf(wanted)) {
      try { localStorage.setItem(SECTION_KEY, wanted) } catch { /* private mode */ }
      return wanted
    }
    try {
      const stored = localStorage.getItem(SECTION_KEY)
      if (stored && sectionOf(stored)) return stored
    } catch { /* private mode */ }
    return sections[0].id
  }

  // ── screen-space anchor ─────────────────────────────────────────────────
  // implementation.md §10.1. The preloader counter orbits this and leaves on its
  // growth, so it needs THREE radii, not one:
  //   r    — at 0.8 scale, the orbit radius the counter must clear
  //   live — at the disc's CURRENT scale, how big it is right now
  //   rest — at 1.0, where it is going
  // The sample points are offset along +X in GALLERY-LOCAL space. The gallery is
  // rotated (−30°, −30°), so that lands on the disc's apparent horizontal
  // half-width on screen — exactly the distance the counter has to clear.
  // Measuring in world space gives a number that stops being a radius the moment
  // the gallery rotation changes.
  const _probe = new Vector3()
  const _offset = new Vector3()

  function publishAnchor () {
    const lead = discByGlobal.get(activeGlobal)
    if (!lead) return
    gallery.updateWorldMatrix(true, false)

    const cw = canvas.clientWidth || 1
    const ch = canvas.clientHeight || 1
    const px = v => { const p = v.clone().project(camera)
                      return { x: (p.x + 1) * 0.5 * cw, y: (1 - p.y) * 0.5 * ch } }
    // the lead's live gallery-local position — arc target, rise offset and
    // activeDiscY lift are all already baked into `group.position`
    const centre = px(gallery.localToWorld(_probe.copy(lead.group.position)))
    const rad = s => {
      const q = px(gallery.localToWorld(
        _probe.copy(lead.group.position).add(_offset.set(s, 0, 0))))
      return Math.hypot(q.x - centre.x, q.y - centre.y)
    }

    anchor.x = centre.x
    anchor.y = centre.y
    anchor.r = rad(w.preloadBoost)                                  // 0.8·R
    anchor.live = rad(Math.max(w.preloadBoost, state.activeProgress))
    anchor.rest = rad(1)                                            // 1.0·R
    anchor.ready = true
  }

  // ── render loop ─────────────────────────────────────────────────────────
  const glide = glideFn()
  let last = performance.now()
  let frameNo = 0
  let activeGlobal = -1
  let enterMiss = 0   // diag: worst distance from its slot a disc was first drawn at

  function resize () {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2))
    renderer.setSize(innerWidth, innerHeight, false)
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
  }
  addEventListener('resize', resize)

  // A detail page owns the screen: the loop parks (no render, no raycast, no
  // diag frame) and restarts in `enterFromDetail`. It parks only once the intro
  // has landed — the loader's counter is welded to this loop's anchor.
  let wantPause = false
  let parked = false

  function frame (now) {
    if (wantPause && state.detail === 'open' && !state.introLive && !state.inbound) {
      parked = true
      return
    }
    requestAnimationFrame(frame)
    step(now)
  }

  function step (now) {
    const t0 = performance.now()

    // ONE clamp, used everywhere. A backgrounded tab that resumes after 4 s must
    // not teleport the disc.
    const dt = clamp((now - last) / 1000, 0, 0.1)
    last = now
    lastDt = dt
    frameNo++
    diag.frame(dt * 1000, now)
    resetWheelFrame(wheel)

    // 1. input → scroll position
    stepScroll(scroll, dt, w, 1e-3, !reduced)

    // 2. flow lean — sqrt, so a gentle flick banks disproportionately. It reads
    //    `flow`, never the drag fling: those are two different channels and
    //    conflating them is how a wheel notch ends up with no bank at all.
    const { lean, dip } = flowLean(scroll.flow, !reduced && !coarse, w)

    // 3. hover raycast, throttled to 30 Hz: imperceptible for hover detection and
    //    it halves the raycast cost. The press UV is taken at pointerdown instead,
    //    so it never depends on this cadence.
    if (frameNo % 2 === 0) {
      const before = hoverIndex
      raycast()
      if (!dragging) {
        galleryEl.style.cursor = hoverIndex >= 0 ? 'pointer' : 'grab'
        if (hoverIndex !== before && hoverIndex >= 0 && !reduced && !coarse) {
          wipeImpulse(discs[hoverIndex].impulse, velX, velY, w)
        }
      }
    }

    // 4. active index — GLOBAL, so the whole ribbon knows where it is
    const nextActive = clamp(Math.round(scroll.position), scroll.lo, scroll.hi)
    if (nextActive !== activeGlobal) {
      activeGlobal = nextActive
      state.active = activeGlobal
      onActive?.(discByGlobal.get(activeGlobal), 'change')
    }

    // 5. per disc. `m` is the FLOAT relative index; its fractional part is the
    //    smooth motion.
    invGalleryQuat.copy(gallery.quaternion).invert()

    for (const d of discs) {
      if (!d.live) { d.drawn = false; continue }

      const m = d.globalIndex - scroll.position
      const h = Math.abs(m)
      const isActive = d.globalIndex === activeGlobal
      const inSection = d.sectionId === state.section

      // Cull to ±(renderRadius + 1) indices — implementation.md §12.3. With the
      // reference's numbers the camera only frames about three discs, so the rest
      // are fogged or off-screen; drawing them costs a full transmissive pass each
      // and they are the difference between a flat 16.7 ms frame and a 100 ms one
      // when both collections are briefly on screen during a switch.
      const inRange = h <= w.renderRadius + 1

      let recede = 0
      if (inSection) {
        if (isActive) {
          d.scaleMul = state.activeProgress
          d.group.visible = inRange && d.ghost > w.switchGhostValue
        } else {
          const s = staggerFactor(state.others, h, state.inbound, glide, w)
          d.scaleMul = s
          recede = (1 - Math.min(1, s)) * w.flightRecede   // emerge from depth
          d.group.visible = inRange && staggerVisible(s, state.inbound, w)
        }
      } else {
        // the other collection is still ghosting out — it keeps its place on the
        // arc (and keeps sliding) until it reaches the ghost value and freezes
        d.group.visible = inRange && d.ghost > w.switchGhostValue
      }

      if (!d.group.visible) { d.drawn = false; continue }

      const a = arcPosition(m, w)

      // wobble. Coarse pointers zero all six channels every frame: touch gets the
      // tap-to-flip but not the sweep.
      if (coarse) resetImpulse(d.impulse)
      else integrate(d.impulse, dt, w)

      // hover: first-order lag, τ = 0.1 s, then an isotropic tip toward the cursor
      const target = (hoverIndex === d.globalIndex && !dragging) ? 1 : 0
      d.hover += (target - d.hover) * Math.min(1, dt * 10)
      if (!isActive && d.flipTween === null) {
        d.spinX += (0 - d.spinX) * Math.min(1, dt * 2.5)   // settle back into the rack
      }

      // intro: the lead disc's edge-on turn (spinY) and quadratic release (spinZ)
      // are pure functions of P, applied on the spin group alongside the rise
      let introSpinY = 0, introSpinZ = 0
      if (isActive && state.introLive) {
        const pose = introPose(state.P, w)
        introSpinY = pose.spinY
        introSpinZ = pose.spinZ
      }

      let x = a.x + d.impulse.x
      let y = a.y + d.impulse.y + (isActive ? w.activeDiscY : 0) - dip * (isActive ? 0.7 : 1)
      let z = a.z + d.impulse.z - recede

      if (isActive && state.introLive) {
        const pose = introPose(state.P, w)
        riseVec.set(0, pose.offsetY, pose.offsetZ)
        riseOffsetIntoLocal(riseVec, gallery.scale.x, invGalleryQuat)
        x += riseVec.x; y += riseVec.y; z += riseVec.z
      }

      const rotX = d.hover * w.hoverTiltStrength * pointer.y
      const rotY = a.rotY + lean * (isActive ? 1 : 1.12) + d.hover * w.hoverTiltStrength * pointer.x
      const rotZ = -lean * w.flowBank * (isActive ? 0.7 : 1)

      // follow smoothing — a frame-rate-independent exponential whose rate drops
      // with distance, so the leader is crisp and trailing discs smear
      // A disc entering the render range still holds the pose it had when it was
      // last drawn — or, never drawn, the gallery origin right behind the lead.
      // Easing from there flings it from the centre up-right to its far slot on
      // the first scroll, so it lands in its slot instead.
      const k = followRate(h, dragging, w)
      const alpha = (state.inbound || reduced || coarse || !d.drawn) ? 1 : Math.min(1, dt * k)

      d.group.position.x += (x - d.group.position.x) * alpha
      d.group.position.y += (y - d.group.position.y) * alpha
      d.group.position.z += (z - d.group.position.z) * alpha
      if (!d.drawn) {
        enterMiss = Math.max(enterMiss, Math.hypot(x - d.group.position.x, y - d.group.position.y, z - d.group.position.z))
        d.drawn = true
      }
      d.group.scale.setScalar(d.group.scale.x +
        (arcScale(m, isActive, w, coarse) * d.scaleMul * d.ghost - d.group.scale.x) * alpha)
      d.group.rotation.x += (rotX - d.group.rotation.x) * alpha
      d.group.rotation.y += (rotY - d.group.rotation.y) * alpha
      d.group.rotation.z += (rotZ - d.group.rotation.z) * alpha

      // wobble rotation lives on the INNER group so it never fights rotY = −θ
      d.spin.rotation.x = d.spinX + d.impulse.rotX
      d.spin.rotation.y = d.spinY + d.impulse.rotY + introSpinY
      d.spin.rotation.z = introSpinZ

      // transparency sorting against transmission. three reads renderOrder per
      // MESH, not per Group, so this goes on the transmissive meshes themselves —
      // far discs get a lower order and composite before near ones.
      const order = Math.round(500 + d.group.position.z * 10 - d.globalIndex * 0.01)
      d.hub.renderOrder = order
      d.frost.renderOrder = order
    }

    // 6. the hover scribble: only around the ACTIVE disc, only while the pointer
    //    is on it and nothing else is driving the ribbon
    if (scribble) {
      const lead = discByGlobal.get(activeGlobal)
      const on = lead && lead.group.visible && hoverIndex === activeGlobal &&
                 !dragging && !state.switching && !state.inbound && !state.introLive && !state.detail
      const moving = dragActive || scroll.vel !== 0 ||
                     Math.abs(scroll.position - Math.round(scroll.position)) > 0.0015
      scribble.update(on ? lead.group : null, now, dt, moving)
    }

    // 7. publish the screen-space anchor, then render
    publishAnchor()
    renderer.render(scene, camera)

    if (diag.on) {
      // per-frame trace of the switch: the harness reads this instead of polling
      // over CDP, which is both slower and less accurate than the real thing
      if (state.switching) {
        let live = 0
        for (const d of discs) if (d.group.visible) live++
        diag.trace({
          n: frameNo,
          t: Math.round(now),
          p: +scroll.position.toFixed(4),
          lo: scroll.lo,
          ms: +(dt * 1000).toFixed(2),
          js: +(performance.now() - t0).toFixed(2),
          live,
          calls: renderer.info.render.calls,
        })
      }
      diag.publish({ ...galleryDiag() })
    }
  }

  // ── loading ─────────────────────────────────────────────────────────────
  const coverReady = { loaded: 0, total: discs.length }

  async function boot () {
    const images = await Promise.all(discs.map(d => new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`cover failed: ${d.item.cover}`))
      img.src = d.item.cover
    })))

    // Build all 20 textures up front, reporting progress as each one lands.
    // Switching sections must never upload one.
    for (let i = 0; i < discs.length; i++) {
      discs[i].front.material.map =
        buildCoverTexture(images[i], w.artResolution, renderer.capabilities.getMaxAnisotropy())
      coverReady.loaded++
      onCovers?.(coverReady.loaded, coverReady.total)
    }

    // Compile with everything visible: compileAsync traverses the VISIBLE scene,
    // so a hidden disc would not be compiled and would stall on first reveal.
    const wasVisible = discs.map(d => d.group.visible)
    discs.forEach(d => { d.group.visible = true })
    // the scribble's program too, or the first hover compiles it mid-frame
    if (scribble) scribble.object.visible = true
    try {
      if (typeof renderer.compileAsync === 'function') await renderer.compileAsync(scene, camera)
      else renderer.compile(scene, camera)
    } catch { /* a first-frame stall, but it renders */ }

    // One warm-up frame with all twenty discs drawn. This is what makes the
    // switcher free: without it the second collection's geometries and cover
    // textures are uploaded to the GPU the first time you switch, which is a
    // visible hitch at exactly the moment the user expects things to be smooth.
    // It also publishes the very first anchor, so the counter's first beat has a
    // real disc position to orbit rather than a cold default.
    publishAnchor()
    renderer.render(scene, camera)

    discs.forEach((d, i) => { d.group.visible = wasVisible[i] })
    if (scribble) scribble.object.visible = false
    diag.sample({ warm: renderer.info.memory.geometries })

    requestAnimationFrame(frame)
  }

  function galleryDiag () {
    let live = 0
    for (const d of discs) if (d.group.visible) live++
    return {
      section: state.section,
      activeGlobal: activeGlobal,
      activeLocal: activeGlobal - sectionStart(state.section),
      position: +scroll.position.toFixed(6),
      target: scroll.target,
      flow: +scroll.flow.toFixed(4),
      switching: state.switching,
      pressUV: { x: pressLog.x, y: pressLog.y, index: pressLog.index },
      hoverIndex,
      anchor: {
        x: +anchor.x.toFixed(2), y: +anchor.y.toFixed(2),
        r: +anchor.r.toFixed(2), live: +anchor.live.toFixed(2),
        rest: +anchor.rest.toFixed(2), ready: !!anchor.ready,
      },
      sceneChildren: scene.children.length,
      discNodes: discs.length,
      visibleDiscs: live,
      coversLoaded: coverReady.loaded,
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      programs: renderer.info.programs?.length ?? null,
      introLive: state.introLive,
      inbound: state.inbound,
      detailState: state.detail,
      parked,
      enterMiss: +enterMiss.toFixed(4),
      flipped: discs.filter(d => Math.cos(d.spinY) < 0).map(d => d.globalIndex),
      activeProgress: +state.activeProgress.toFixed(4),
      others: +state.others.toFixed(4),
      reduced,
      coarse,
      dpr: renderer.getPixelRatio(),
      size: [innerWidth, innerHeight],
    }
  }


  // ── detail open / close ─────────────────────────────────────────────────
  // motion-spec.md §11.7. The shelf scene is never rebuilt: the same twenty
  // discs leave and come back, the only things that move are `activeProgress`,
  // `others` and the lead's spin.
  const sleep = ms => new Promise(r => setTimeout(r, ms))

  /** Everything that moves the shelf by itself or by hand, stopped. */
  function stopMotion () {
    state.switchTl?.kill(); state.switchTl = null
    state.switching = false
    state.holdCopy = false
    gsap.killTweensOf(state)
    for (const d of discs) { d.flipTween?.kill(); d.flipTween = null; resetImpulse(d.impulse) }
    scroll.vel = 0; scroll.springVel = 0
    dragging = false; dragActive = false; downId = -1
    galleryEl.removeAttribute('data-disc-dragging')
    hoverIndex = -1; pointerIn = false
    galleryEl.style.cursor = ''
  }

  function resume () {
    wantPause = false
    if (!parked) return
    parked = false
    last = performance.now()
    requestAnimationFrame(frame)
  }

  /** The hidden pose a detail page leaves behind: lead at .001, the rest folded away. */
  function poseHidden () {
    gsap.killTweensOf(state)
    state.introLive = false
    state.inbound = true
    state.activeProgress = 0.001
    state.others = 0
    for (const d of discs) { d.spinX = 0; d.spinY = 0 }
    if (parked) step(performance.now())     // the canvas must not keep the last shelf frame
  }

  /**
   * Press → spring → leave edge-on. `onHandOver` fires when the page may take
   * over; the promise resolves when the exit has fully played.
   */
  function exitToDetail (o = {}) {
    const c = { ...DETAIL, ...o }
    const lead = discByGlobal.get(activeGlobal)
    stopMotion()
    state.detail = 'exiting'
    state.inbound = false
    scroll.locked = true
    let handed = false
    const hand = () => { if (handed) return; handed = true; c.onHandOver?.() }

    return new Promise(resolve => {
      const finish = () => { hand(); state.detail = 'open'; wantPause = true; resolve() }
      if (reduced || !lead) {
        scroll.position = scroll.target = activeGlobal
        state.others = 0
        state.activeProgress = 0.001
        finish()
        return
      }
      const snap = snapDuration(Math.abs(scroll.position - activeGlobal))
      scroll.target = activeGlobal
      const tl = gsap.timeline({ onComplete: finish })
      if (snap > 0) tl.to(scroll, { position: activeGlobal, duration: snap, ease: 'power2.out' }, 0)
      else scroll.position = activeGlobal
      const m = snap * 0.6
      const h = m + c.pressTime + c.springTime
      tl.to(state, { activeProgress: c.pressScale, duration: c.pressTime, ease: 'power2.out' }, m)
        .to(state, { activeProgress: c.springScale, duration: c.springTime, ease: 'power2.out' }, m + c.pressTime)
        .to(state, { others: 0, duration: c.outDuration, ease: 'none' }, m + c.pressTime)
        .to(state, { activeProgress: 0.001, duration: c.exitDuration, ease: 'power2.in' }, h)
        .to(lead, { spinY: exitSpinTarget(lead.spinY, c.exitSpin), spinX: 0, duration: c.exitDuration, ease: 'power2.in' }, h)
        .call(hand, null, handOverAt({ snap, ...c }))
    })
  }

  /**
   * The shelf wakes up behind the (already faded) detail: pose the lead at .001,
   * make sure its texture is on the GPU before the first visible frame, then grow
   * it into its slot. `onReleaseCopy` fires at 90 % so the copy lands with it.
   */
  async function enterFromDetail (o = {}) {
    const c = { ...DETAIL, ...o }
    stopMotion()
    poseHidden()
    scroll.locked = false
    state.detail = 'entering'
    resume()
    await Promise.race([ready, sleep(c.artTimeout)])
    const lead = discByGlobal.get(activeGlobal)
    const map = lead?.front.material.map
    if (map) renderer.initTexture(map)
    o.onPosed?.()
    if (o.holdUntil) await o.holdUntil

    return new Promise(resolve => {
      const done = () => { state.inbound = false; state.detail = null; resolve() }
      if (lead) { lead.spinX = 0; lead.spinY = 0 }
      if (reduced) {
        state.activeProgress = 1; state.others = 1
        c.onReleaseCopy?.()
        done()
        return
      }
      gsap.timeline({ onComplete: done })
        .to(state, { activeProgress: 1, duration: c.inDuration, ease: glideEase() }, 0)
        .to(state, { others: 1, duration: c.inDuration * 0.85, ease: 'none' }, c.inDuration * 0.1)
        .call(() => c.onReleaseCopy?.(), null, c.inDuration * 0.9)
    })
  }

  /** Deep link: the page is already the owner. No exit — the loop parks once the intro has landed. */
  function holdForDetail () {
    state.detail = 'open'
    scroll.locked = true
    wantPause = true
  }

  /** Put the shelf on `id`, instantly and without a trace: used while a detail page covers it. */
  function focusItem (id) {
    const d = discs.find(x => x.item.id === id)
    if (!d) return false
    if (d.sectionId !== state.section) adoptSection(d.sectionId)
    settleNow(d.globalIndex)
    for (const x of discs) x.drawn = false
    if (parked) step(performance.now())
    return true
  }

  // ── boot ────────────────────────────────────────────────────────────────
  // A deep link names its item: the shelf starts on it, in its section, without
  // touching the persisted choice (that changes only when the user switches).
  const startDisc = initial ? discs.find(d => d.item.id === initial) : null
  state.section = startDisc ? startDisc.sectionId : initialSection()
  setRange(state.section)
  scroll.position = startDisc ? startDisc.globalIndex : scroll.lo
  scroll.target = scroll.position
  refreshPickMeshes()
  resize()

  // The other collection starts ghosted: it exists in the scene from frame zero
  // but is not laid out, not raycast, and not drawn.
  for (const d of discs) {
    const on = d.sectionId === state.section
    d.ghost = on ? 1 : w.switchGhostValue
    d.live = on
    d.group.visible = false
  }

  if (reduced) {
    state.activeProgress = 1
    state.others = 1
    state.introLive = false
    state.inbound = false
    for (const d of discs) d.spinY = 0
  }

  const ready = boot()

  return {
    scene, camera, renderer, gallery, discs, state, w, ready,
    get scroll () { return scroll },
    boot,
    switchSection,
    exitToDetail,
    enterFromDetail,
    holdForDetail,
    poseHidden,
    focusItem,
    isSwitching: () => state.switching,
    copyHeld: () => state.holdCopy,
    setProgress (P) {
      state.P = P
      // P owns the lead's pose ONLY while the intro is live. Once `fanOut()` has
      // handed the pose to its timeline, this must stop writing `activeProgress`
      // or the per-frame write races the tween and the fan never grows the disc.
      if (state.introLive) state.activeProgress = introPose(P, w).active
    },
    /** P reached 1 — hand the lead's pose over to the fan timeline. */
    fanOut (onDone) {
      state.introLive = false
      return gsap.timeline({ onComplete: () => { state.inbound = false; onDone?.() } })
        .to(state, { activeProgress: 1, duration: w.preloadFanDuration, ease: glideEase() }, 0)
        .to(state, { others: 1, duration: w.preloadFanDuration * 0.85, ease: 'none' },
             w.preloadFanDuration * 0.1)
    },
    /** Reduced motion: straight to the settled pose, no intro at all. */
    settle () {
      state.activeProgress = 1
      state.others = 1
      state.introLive = false
      state.inbound = false
    },
    coverReady,
    anchor,
    diag: galleryDiag,
  }
}