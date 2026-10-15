/**
 * The hover scribble: a hand-drawn charcoal loop around the ACTIVE disc while
 * the pointer is on it.
 *
 * Ported from the reference's own implementation (a24.raviklaassens.com): each
 * loop is a triangle-strip ribbon in the disc's own plane, so it sits on the
 * disc's perspective ellipse instead of being a flat screen circle. The radius is
 * jittered at `points` control points and smoothstepped between them; the ribbon
 * tapers to a point at both ends. It is redrawn with FRESH random jitter at a
 * deliberately low 10 fps, which is what makes it read as hand-animated "boil"
 * rather than as a vector stroke:
 *
 *   in   three frames drawing the sweep on    [0.3, 0.5, 0.72] → 1, then boils
 *   out  three frames drawing it off          [0.72, 0.5, 0.3] → hidden
 *
 * It follows the disc with its own lag (1 − exp(−15·dt)) so it trails a wobble
 * by a hair instead of being welded to it.
 */
import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial,
} from 'three'
import { clamp } from './config.js'

export const SCRIBBLE = {
  color: '#000000',
  fps: 10,
  points: 24,
  jitter: 0.028,
  loops: 2,
  loopGap: 0.045,
  padding: 0.06,
  width: 0.012,
  sweep: 0.68,
  sweepJitter: 0.4,
  in: [0.3, 0.5, 0.72],
  out: [0.72, 0.5, 0.3],
  lag: 15,
}

/**
 * One loop's ribbon vertices, written into `pos` (a Float32Array of
 * (segments + 1) · 2 · 3). Pure apart from `rand`, so the shape is testable.
 *
 * `amount` is how much of the sweep is drawn (0…1). Each loop sweeps
 * `sweep · (1 ± sweepJitter/2)` turns (clamped to [0.12, 1]) from a random start
 * angle, and each further loop sits `loopGap` wider — two overlapping partial
 * arcs are what read as one scrawled circle.
 */
export function writeLoop (pos, loop, amount, rand = Math.random, S = SCRIBBLE) {
  const segments = S.points * 3
  const radius = 1 + S.padding + loop * S.loopGap
  const half = S.width * 0.5
  const turns = clamp(S.sweep * (1 + (rand() - 0.5) * S.sweepJitter), 0.12, 1) * amount
  const span = Math.PI * 2 * turns
  const start = rand() * Math.PI * 2

  const knots = []
  for (let i = 0; i <= S.points; i++) knots.push(1 + (rand() - 0.5) * 2 * S.jitter)

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const a = start + t * span
    const u = t * S.points * turns
    const k0 = Math.floor(u)
    const k1 = Math.min(S.points, k0 + 1)
    const f = u - k0
    const s = f * f * (3 - 2 * f)
    const r = radius * ((knots[k0] ?? 1) * (1 - s) + (knots[k1] ?? 1) * s)
    const taper = Math.min(1, Math.min(t, 1 - t) * 14 + 0.15)
    const inner = r - half * taper
    const outer = r + half * taper
    const c = Math.cos(a), sn = Math.sin(a)
    pos.set([c * inner, sn * inner, 0, c * outer, sn * outer, 0], i * 6)
  }
  return pos
}

/**
 * The scroll-next push meter's ring (§13.3 `fill*`): the same ribbon, one loop,
 * exactly `amount` of a turn. Measured on the live page: it is anchored at 150°
 * (lower left of the rim) and the tip grows clockwise over the top. Fresh jitter
 * on every call (the caller redraws at `fillFps`), but a fixed sweep and anchor,
 * so it only ever grows or shrinks.
 */
export const FILL_ANCHOR = Math.PI * 5 / 6
export function writeFill (pos, amount, S) {
  const fixed = [0.5, FILL_ANCHOR / (Math.PI * 2) - amount]
  let i = 0
  return writeLoop(pos, 0, amount, () => (i < 2 ? fixed[i++] : Math.random()), S)
}

export function createScribble (parent, S = SCRIBBLE) {
  const segments = S.points * 3
  const material = new MeshBasicMaterial({
    color: new Color(S.color), side: DoubleSide, depthWrite: false, toneMapped: false, fog: false,
  })

  const group = new Group()
  group.visible = false
  const geos = []
  for (let l = 0; l < S.loops; l++) {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array((segments + 1) * 2 * 3), 3))
    const index = []
    for (let i = 0; i < segments; i++) {
      const v = i * 2
      index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
    }
    geo.setIndex(index)
    const mesh = new Mesh(geo, material)
    mesh.renderOrder = 900          // after every transmissive disc
    geos.push(geo)
    group.add(mesh)
  }
  parent.add(group)

  function draw (amount) {
    geos.forEach((geo, l) => {
      const attr = geo.getAttribute('position')
      writeLoop(attr.array, l, amount, Math.random, S)
      attr.needsUpdate = true
      geo.computeBoundingSphere()
    })
  }

  function follow (target, dt, snap) {
    if (snap) {
      group.position.copy(target.position)
      group.quaternion.copy(target.quaternion)
      group.scale.copy(target.scale)
      return
    }
    const k = 1 - Math.exp(-S.lag * dt)
    group.position.lerp(target.position, k)
    group.quaternion.slerp(target.quaternion, k)
    group.scale.lerp(target.scale, k)
  }

  let phase = 'hidden'   // 'hidden' | 'in' | 'on' | 'out'
  let step = 0
  let lastDraw = 0
  let owner = null       // the disc group it is drawn around
  const frameMs = 1000 / S.fps

  /**
   * Per frame. `target` is the disc's `group` to circle, or null to draw off.
   * `snap` follows without lag (while the ribbon itself is still moving fast).
   */
  function update (target, now, dt, snap = false) {
    if (!target) {
      if (phase === 'hidden') return
      if (phase !== 'out') { phase = 'out'; step = 0; lastDraw = now }
      if (owner) follow(owner, dt, snap)
      if (now - lastDraw < frameMs) return
      lastDraw = now
      if (step >= S.out.length || !owner) { phase = 'hidden'; owner = null; group.visible = false; return }
      draw(S.out[step++])
      return
    }

    if (phase === 'hidden' || owner !== target) {
      phase = 'in'; step = 0; owner = target; lastDraw = now
      follow(target, dt, true)
      draw(S.in[0]); step = 1
      group.visible = true
      return
    }

    follow(target, dt, snap)
    if (now - lastDraw < frameMs) return
    lastDraw = now
    if (phase === 'in' && step < S.in.length) draw(S.in[step++])
    else { phase = 'on'; draw(1) }   // fresh jitter every frame: the boil
  }

  return {
    update,
    /** The ribbon group, so boot can show it once and compile its program. */
    object: group,
    get phase () { return phase },
    dispose () { geos.forEach(g => g.dispose()); material.dispose(); parent.remove(group) },
  }
}
