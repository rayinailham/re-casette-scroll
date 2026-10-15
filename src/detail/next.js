/**
 * Scroll-next: the disc at the bottom of a detail page. motion-spec.md §13.1
 * (next mode), §13.4 (pose), §13.5 (push meter, exit).
 *
 * Its own tiny scene, canvas and renderer, built with the shelf's own geometry,
 * material, environment and lighting builders — one disc, the next title's cover.
 * Built lazily when the section is within `bootMargin` of the viewport and
 * DISPOSED in full (geometry, materials, textures, renderer, canvas) when the
 * page closes or changes title, so twenty round trips hold no GPU memory.
 */
import {
  ACESFilmicToneMapping, BufferAttribute, BufferGeometry, Color, DoubleSide, MathUtils, Mesh, MeshBasicMaterial,
  PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer, WebGLRenderTarget,
} from 'three'
import { gsap, energyEase } from '../anim/eases.js'
import { NEXT, clamp } from '../disc/config.js'
import { buildDiscGeometries, buildDiscGroups } from '../disc/geometry.js'
import { buildMaterials, buildCoverTexture } from '../disc/materials.js'
import { buildEnvironment } from '../disc/environment.js'
import { buildLighting } from '../disc/lighting.js'
import { createPush, reducePush } from './push.js'
import { insidePolygon } from './ink.js'
import { SCRIBBLE, writeFill } from '../disc/scribble.js'

const ease3 = x => { const t = clamp(x, 0, 1); return 1 - Math.pow(1 - t, 3) }
const DEG = MathUtils.degToRad

export function createScrollNext ({ section, nextItem, config: w, diag, onLeave }) {
  const host = section.querySelector('[data-scroll-next-canvas]')
  const link = section.querySelector('[data-scroll-next-link]')
  const kicker = section.querySelector('[data-scroll-next-kicker]')
  const rules = [...section.querySelectorAll('.detail-next__rules .divider-horizontal')]
  const words = () => [...section.querySelectorAll('.detail-next__word')]
  const coarse = matchMedia('(pointer: coarse)').matches
  const Y = NEXT
  const FILL = {
    ...SCRIBBLE, points: Y.fillPoints, jitter: Y.fillJitter, loops: 1, padding: Y.fillPadding,
    width: Y.fillWidth, sweep: 1, sweepJitter: 0,
  }
  const restTiltY = coarse ? Y.touch.restTiltY : Y.restTiltY
  const discVw = coarse ? Y.touch.discVw : Y.discVw

  let disposed = false
  let built = false
  let leaving = false
  let G = null                     // GPU things, present once built
  let raf = 0
  let io = null
  let pushState = createPush()
  let lastFill = 0                 // the ring's own 10 fps clock
  let eased = 0                    // Bt: the eased meter
  let n = 0                        // section scroll progress 0…1
  let spinRate = 0                 // dt_
  let spin = 0                     // ft
  let memory = 0                   // we: scroll-velocity memory, px/s
  let idleT = 0
  let lastY = scrollY
  let lastFrame = 0
  const pop = { scale: 0 }
  const exit = { spin: 0, lift: 0 }
  let tl = null
  let idleCb = 0
  let canTouchPush = false
  let revealed = false

  // The label starts hidden: rules unborn, words below their masks. Both come in
  // when a third of the section is on screen (§13.3 `ruleDuration`, `revealStagger`).
  gsap.set(rules, { scaleX: 0, transformOrigin: '50% 50%' })
  gsap.set(words(), { yPercent: 120 })
  gsap.set(kicker, { autoAlpha: 0 })
  function reveal () {
    if (revealed || disposed) return
    revealed = true
    const ease = energyEase()
    tl = gsap.timeline()
    tl.to(rules, { scaleX: 1, duration: Y.ruleDuration, ease, stagger: 0.06 }, 0)
      .to(words(), { yPercent: 0, duration: Y.revealDuration, ease, stagger: Y.revealStagger }, 0.12)
      .to(kicker, { autoAlpha: 1, duration: Y.revealDuration, ease: 'none' }, 0.2)
  }
  const revealIo = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) { reveal(); revealIo.disconnect() }
  }, { threshold: 0.35 })
  revealIo.observe(section)

  const atEnd = () => scrollY >= document.documentElement.scrollHeight - innerHeight - 2

  // ── build ────────────────────────────────────────────────────────────────
  function build () {
    if (disposed || built) return
    const img = new Image()
    img.onload = () => { if (!disposed) construct(img) }
    img.onerror = () => { /* no cover: the link still leads on */ }
    img.src = nextItem.cover
  }

  async function construct (image) {
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    host.appendChild(canvas)
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = w.exposure
    renderer.setClearColor(0x000000, 0)
    if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.5

    const scene = new Scene()
    const camera = new PerspectiveCamera(w.cameraFOV, 1, 0.1, 100)
    camera.position.set(0, 0, w.cameraDistance)
    scene.environment = buildEnvironment(renderer, w)
    scene.environmentIntensity = w.environmentIntensity
    buildLighting(scene, w)

    const geometry = buildDiscGeometries(w)
    const materials = buildMaterials(w)
    const [node] = buildDiscGroups(geometry, materials, 1)
    node.front.material = materials.front.clone()
    const cover = buildCoverTexture(image, w.artResolution, renderer.capabilities.getMaxAnisotropy())
    node.front.material.map = cover
    node.group.visible = true
    // only a cap of the disc is in frame: without this, which of its parts are
    // frustum-culled — and so which geometries/textures get uploaded — depends on
    // the tilt and spin of the moment, and the scene's GPU footprint is not stable
    node.group.traverse(o => { o.frustumCulled = false })
    // the push meter's ink ring (§13.3 `fill*`): a ribbon in the disc's plane, not spinning with it
    const segments = FILL.points * 3
    const ringGeo = new BufferGeometry()
    ringGeo.setAttribute('position', new BufferAttribute(new Float32Array((segments + 1) * 6), 3))
    const strip = []
    for (let i = 0; i < segments; i++) strip.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    ringGeo.setIndex(strip)
    const ringMat = new MeshBasicMaterial({ color: new Color(FILL.color), side: DoubleSide, depthWrite: false, toneMapped: false, fog: false })
    const ring = new Mesh(ringGeo, ringMat)
    ring.renderOrder = 900
    ring.frustumCulled = false
    ring.visible = false
    node.group.add(ring)
    scene.add(node.group)

    G = { canvas, renderer, scene, camera, geometry, materials, node, cover, ring, size: 1, restY: 0 }
    resize()
    // Link the programs off the main thread BEFORE the first frame (the reference's
    // `vr` does the same, §11.7). A synchronous first render() links them all in
    // one task — ~0.8–1.9 s on an integrated GPU — and lands right as the page
    // appears. Two passes: the transmission material draws the scene into a
    // linear render target first, and that is a second program per material that
    // compileAsync only builds for whatever target is bound. compileAsync also
    // only sees visible objects, so the ring is shown for the calls.
    ring.visible = true
    const probe = new WebGLRenderTarget(1, 1)
    const compile = () => Promise.race([renderer.compileAsync(scene, camera), new Promise(r => setTimeout(r, 1500))]).catch(() => {})
    await compile()
    if (!disposed) {
      renderer.setRenderTarget(probe)
      await compile()
      renderer.setRenderTarget(null)
    }
    probe.dispose()
    ring.visible = false
    if (disposed) return
    built = true
    renderer.initTexture(cover)
    for (const m of Object.values(materials)) for (const t of [m.map, m.normalMap, m.roughnessMap]) if (t) renderer.initTexture(t)
    gsap.to(pop, { scale: 1, duration: Y.popIn, ease: 'power3.out' })
    section.addEventListener('pointermove', onPointerMove, { passive: true })
    section.addEventListener('click', onClick)
    start()
  }

  function resize () {
    if (!G) return
    const cw = host.clientWidth || innerWidth, ch = host.clientHeight || innerHeight
    const dpr = Math.min(devicePixelRatio || 1, Y.maxPixelRatio, Math.sqrt(Y.pixelBudget / (cw * ch)))
    G.renderer.setPixelRatio(dpr)
    G.renderer.setSize(cw, ch, false)
    G.camera.aspect = cw / ch
    G.camera.updateProjectionMatrix()
    // world units per px at the disc's plane, then the disc's diameter in px
    const visible = 2 * w.cameraDistance * Math.tan(DEG(w.cameraFOV / 2))
    const perPx = visible / ch
    // Measured on the live page: the canvas is the lower half of the section and
    // only a cap of the disc shows. Its width at the bottom edge puts the diameter
    // at ≈ .745 of `discVh` of the WINDOW (not of that box), at 1440 × 900.
    // shortcut: the .8 is fitted to one viewport, not read from the reference's source.
    const diameter = Math.min(Y.discVh / 100 * 0.745 * innerHeight, discVw / 100 * cw)
    G.size = (diameter / 2) * perPx
    const centrePx = Y.discCap * ch + diameter / 2
    G.restY = (ch / 2 - centrePx) * perPx
  }
  const onResize = () => resize()
  addEventListener('resize', onResize)

  // ── per-frame pose (§13.4) ────────────────────────────────────────────────
  function frame (now) {
    raf = requestAnimationFrame(frame)
    const dt = clamp((now - lastFrame) / 1000, 0, 0.1)
    lastFrame = now
    if (!built || dt === 0) return

    const rect = section.getBoundingClientRect()
    n = clamp((innerHeight - rect.top) / rect.height, 0, 1)

    // meter: drain, then ease toward it
    pushState = reducePush(pushState, { type: 'tick', now, dt }, Y).state
    eased += (pushState.meter - eased) * Math.min(1, dt * Y.pushEase)
    if (Math.abs(pushState.meter - eased) < 0.0015) eased = pushState.meter

    // scroll velocity → spin rate
    const v = (scrollY - lastY) / dt
    lastY = scrollY
    memory = Math.abs(v) > Math.abs(memory) ? v : memory
    memory *= Math.exp(-dt * 6)
    const a = ease3((n - Y.arriveStart) / (Y.arriveEnd - Y.arriveStart))
    const o = ease3(eased)
    const target = clamp(-memory * Y.spinGain, -Y.spinMax, Y.spinMax)
    if (Math.abs(target) > Math.abs(spinRate) * 0.5) spinRate += (target - spinRate) * Math.min(1, dt * Y.spinFollow)
    else spinRate *= Math.exp(-dt * Y.spinFriction)
    spin = (spin + (spinRate + Y.idleSpin * a + Y.pushSpin * o + exit.spin) * dt) % (Math.PI * 2)
    idleT += dt
    const amp = Y.idleAmount * a
    const idleX = Math.sin(idleT * Y.idleRate * Math.PI) * amp
    const idleY = Math.cos(idleT * Y.idleRate * Math.PI * 0.7) * amp

    const { group, spin: spinGroup } = G.node
    group.rotation.x = DEG(Y.arriveTiltX) * (1 - a) + DEG(Y.restTiltX) * a * (1 - o) + DEG(Y.pushTiltX) * a * o + idleX
    group.rotation.y = DEG(Y.arriveTiltY) * (1 - a) + DEG(restTiltY) * a * (1 - o) + DEG(Y.pushTiltY) * a * o + idleY
    spinGroup.rotation.z = spin
    group.visible = pop.scale >= Y.popScale - 0.001
    const size = G.size * Math.max(1e-4, pop.scale) * (1 + (Y.pushGrow - 1) * o)
    group.position.set(0, G.restY - Y.arriveDrop * G.size * (1 - a) + Y.pushLift * G.size * o + exit.lift * G.size, 0)
    group.scale.setScalar(size)

    // the ink ring: redrawn at fillFps with fresh jitter, so it boils like the hover scribble
    const { ring } = G
    ring.visible = eased > 0.004
    if (ring.visible && now - lastFill >= 1000 / Y.fillFps) {
      lastFill = now
      const attr = ring.geometry.getAttribute('position')
      writeFill(attr.array, eased, FILL)
      attr.needsUpdate = true
    }

    G.renderer.render(G.scene, G.camera)
  }

  /** Only while the section is near: an off-screen WebGL loop is pure waste. */
  function start () {
    if (raf || disposed) return
    lastFrame = performance.now()
    raf = requestAnimationFrame(frame)
  }
  function stop () { cancelAnimationFrame(raf); raf = 0 }

  // ── input: the push meter (§13.5) ─────────────────────────────────────────
  const feed = e => {
    if (!built || leaving || disposed) return
    const r = reducePush(pushState, e, Y)
    pushState = r.state
    if (r.exit) exitNow()
  }
  const onWheel = e => {
    const mode = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1
    feed({ type: 'wheel', now: performance.now(), delta: e.deltaY * mode, atEnd: atEnd() })
  }
  let touchY = 0
  const onTouchStart = e => { touchY = e.touches[0].clientY; canTouchPush = atEnd() }
  const onTouchMove = e => {
    const y = e.touches[0].clientY
    feed({ type: 'touch', now: performance.now(), dy: touchY - y, atEnd: canTouchPush && atEnd() })
    touchY = y
  }
  const onKey = e => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      feed({ type: 'key', now: performance.now(), atEnd: atEnd() })
    }
  }
  addEventListener('wheel', onWheel, { passive: true })
  addEventListener('touchstart', onTouchStart, { passive: true })
  addEventListener('touchmove', onTouchMove, { passive: true })
  addEventListener('keydown', onKey)

  // ── the disc's silhouette (§13.5: 48 points, even-odd) ────────────────────
  const _v = new Vector3()
  function silhouette () {
    const group = G.node.group, camera = G.camera
    group.updateWorldMatrix(true, false)
    const poly = []
    for (let i = 0; i < 48; i++) {
      const t = (i / 48) * Math.PI * 2
      _v.set(Math.cos(t), Math.sin(t), 0).applyMatrix4(group.matrixWorld).project(camera)
      poly.push([_v.x, _v.y])
    }
    return poly
  }
  function ndc (e) {
    const r = G.canvas.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)]
  }
  function onPointerMove (e) {
    if (!built || leaving) return
    section.style.cursor = insidePolygon(ndc(e), silhouette()) ? 'pointer' : ''
  }
  function onClick (e) {
    if (!built || leaving || e.target.closest('a')) return
    if (insidePolygon(ndc(e), silhouette())) exitNow()
  }

  // ── exit (§13.5 `Jn`) ─────────────────────────────────────────────────────
  function exitNow () {
    if (leaving || disposed) return
    leaving = true
    pushState = { ...pushState, meter: 1, leaving: true }
    section.setAttribute('data-scroll-next-leaving', 'true')
    if (!built) { onLeave(); return }
    tl = gsap.timeline()
    tl.to(exit, { spin: Y.exitSpin, lift: Y.exitLift, duration: Y.exitDuration, ease: 'power2.in' }, 0)
      .to(pop, { scale: Y.popScale, duration: Y.popOut, ease: 'power2.in', onComplete: () => { pop.scale = 0 } }, 0)
      .to([...words(), kicker], { yPercent: -120, autoAlpha: 0, duration: Y.exitCopyDuration, ease: 'power2.in', stagger: 0.03 }, 0)
      .to(rules, { scaleX: 0, duration: Y.exitRuleDuration, ease: 'power2.in', stagger: { each: 0.04, from: 'end' } }, 0.05)
      .call(() => { if (!disposed) onLeave() }, null, Y.exitGo)
  }

  // ── lazy boot ────────────────────────────────────────────────────────────
  // Not while the page is still arriving, and not while it is being scrolled: the
  // first build links ~18 programs and uploads the textures, which on an
  // integrated GPU costs a 1.9 s frame, then a couple of seconds of ~10 fps. So
  // wait `idleBoot` after the page appears (§13.3) AND for 1.2 s without scroll
  // input — or go at once if the section is actually on screen.
  const born = performance.now()
  let lastInput = born
  const touched = () => { lastInput = performance.now() }
  const INPUTS = ['wheel', 'scroll', 'touchmove', 'keydown']
  for (const t of INPUTS) addEventListener(t, touched, { passive: true })
  let bootTimer = 0
  const settle = () => { const now = performance.now(); return Math.max(Y.idleBoot - (now - born), 1200 - (now - lastInput)) }
  const arm = () => {
    bootTimer = setTimeout(() => { settle() > 0 ? arm() : boot() }, Math.max(settle(), 50))
  }
  const boot = () => {
    clearTimeout(bootTimer)
    if (built || idleCb || disposed) return
    idleCb = 'requestIdleCallback' in window
      ? requestIdleCallback(build, { timeout: 800 })
      : setTimeout(build, 50)
  }
  io = new IntersectionObserver(entries => {
    const near = entries.some(e => e.isIntersecting)
    if (near && !built && !idleCb && !bootTimer) arm()
    if (built) near ? start() : stop()
  }, { rootMargin: Y.bootMargin })
  io.observe(section)
  const seenIo = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) boot() })
  seenIo.observe(section)

  return {
    /** The link / disc click: leave now. */
    leave: exitNow,
    state: () => ({
      progress: +n.toFixed(4), push: +pushState.meter.toFixed(4), leaving, built,
      mem: built ? { geometries: G.renderer.info.memory.geometries, textures: G.renderer.info.memory.textures } : null,
    }),
    dispose () {
      if (disposed) return
      disposed = true
      stop()
      io?.disconnect()
      seenIo.disconnect()
      clearTimeout(bootTimer)
      for (const t of INPUTS) removeEventListener(t, touched)
      if (typeof idleCb === 'number' && 'cancelIdleCallback' in window) cancelIdleCallback(idleCb)
      tl?.kill()
      gsap.killTweensOf(pop)
      revealIo.disconnect()
      gsap.killTweensOf([...rules, ...words(), kicker])
      gsap.set([...rules, ...words(), kicker], { clearProps: 'transform,opacity,visibility' })
      section.removeAttribute('data-scroll-next-leaving')
      section.style.cursor = ''
      removeEventListener('resize', onResize)
      removeEventListener('wheel', onWheel)
      removeEventListener('touchstart', onTouchStart)
      removeEventListener('touchmove', onTouchMove)
      removeEventListener('keydown', onKey)
      section.removeEventListener('pointermove', onPointerMove)
      section.removeEventListener('click', onClick)
      if (G) {
        const { geometry, materials, node, cover, scene, renderer, canvas } = G
        for (const g of Object.values(geometry)) g.dispose?.()
        node.front.material.dispose()
        for (const m of Object.values(materials)) {
          for (const t of [m.map, m.normalMap, m.roughnessMap]) t?.dispose()
          m.dispose()
        }
        cover.dispose()
        scene.environment?.dispose()
        node.pick.material.dispose()
        G.ring.geometry.dispose()
        G.ring.material.dispose()
        renderer.dispose()
        renderer.forceContextLoss()
        canvas.remove()
        G = null
      }
      built = false
    },
  }
}
