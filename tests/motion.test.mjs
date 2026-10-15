/**
 * Acceptance tests for the pure motion system.
 *
 * These modules import nothing from three, so the maths is verified directly and
 * deterministically rather than through the browser. `tools/verify.mjs` covers
 * what can only be measured live: frame rate, GPU uploads, the loader's real
 * progress, the section switch.
 *
 *   node --test tests/
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULTS as W, clamp } from '../src/disc/config.js'
import {
  arcPosition, arcScale, arcApex, followRate, flowLean, staggerFactor, staggerVisible, ARC_STEP,
} from '../src/disc/layout.js'
import {
  createImpulse, integrate, wipeImpulse, pressImpulse, impulseEnergy, PUSH_SLEEP,
} from '../src/disc/impulse.js'
import { introPose, easeRise, easeTurn } from '../src/disc/intro.js'
import { realAssetProgress, progressTarget, chase, beatReady, yearFromProgress } from '../src/disc/progress.js'
import { PRELOADER as C, TEXT } from '../src/disc/config.js'
import {
  createScroll, createWheel, wheelStep, stepScroll, dragStep,
  snapProfile, kickFlow, SNAP, FLOW_KICK_CLAMP,
} from '../src/disc/scroll.js'
import { cellStagger, exitCells, PUSH_BY, PUSH_STAGGER, DISC_GAP } from '../src/preloader/counter.js'
import { planReveal } from '../src/text/reveal.js'

const glide = p => p                     // stand-in for the parsed discGlide
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !≈ ${b}`)

// ── the arc ──────────────────────────────────────────────────────────────────

test('arc reproduces the reference position table', () => {
  // motion-spec.md §9 is the authoritative table.
  const table = [
    [0, 0.0000, 0.0000], [1, 1.8928, 0.1455], [2, 3.5561, 0.5644],
    [3, 4.7882, 1.2058], [4, 5.4397, 1.9921], [5, 5.4316, 2.8278],
    [-1, -1.8928, 0.1455], [-2, -3.5561, 0.5644], [-3, -4.7882, 1.2058],
    [-4, -5.4397, 1.9921], [-5, -5.4316, 2.8278],
  ]
  for (const [m, x, z] of table) {
    const a = arcPosition(m, W)
    near(a.x, x, 5e-5)
    near(a.z, z, 5e-5)
    near(a.rotY, -m * ARC_STEP, 1e-12)
  }
  near(ARC_STEP * 180 / Math.PI, 20.054, 1e-3)
})

test('x is NON-MONOTONIC past Δindex ≈ +4.49 — the ribbon turns away', () => {
  // This is the single detail that makes the row read as a curve with a far side
  // rather than a line running off-screen. If arcPosition is wrong, this fails.
  near(arcApex(), 4.488, 1e-3)
  const near4 = arcPosition(4.0, W)
  const at5 = arcPosition(5.0, W)
  assert.ok(at5.x < near4.x, `x must reverse: x(5) ${at5.x} < x(4) ${near4.x}`)
  assert.ok(at5.z > near4.z, `and z must keep receding: z(5) ${at5.z} > z(4) ${near4.z}`)
  // and it keeps reversing: x falls monotonically from the apex outward
  for (let m = 5; m <= 8; m++) assert.ok(arcPosition(m + 1, W).x < arcPosition(m, W).x)
  // ...while z keeps receding, so the far side turns away from the viewer
  for (let m = 5; m <= 8; m++) assert.ok(arcPosition(m + 1, W).z > arcPosition(m, W).z)
})

test('the arc is an ellipse in XZ with radii 5.52 and 2.4', () => {
  near(W.hGap * 2.4, 5.52, 1e-12)
  near(Math.max(W.discThickness * 3, 0.12, W.depthGap) * 2.4, 2.4, 1e-12)
  // at the apex x is maximal and z is exactly Rz
  const apex = arcPosition(arcApex(), W)
  near(apex.x, 5.52, 1e-3)
  near(apex.z, 2.4, 1e-3)
})

test('inactive scale is 1.00 leader, 0.88 neighbours, 0.80 beyond — desktop and coarse', () => {
  near(arcScale(0, true, W, false), 1)
  near(arcScale(1, false, W, false), 0.88, 1e-12)
  near(arcScale(2, false, W, false), 0.8, 1e-12)      // clamped at the inactiveScale floor
  near(arcScale(5, false, W, false), 0.8, 1e-12)
  // coarse pointers shrink harder to suggest depth: the 0.6 factor becomes 1.0
  near(arcScale(1, false, W, true), 1 - 0.2, 1e-12)      // 0.80 (clamped)
  assert.ok(arcScale(1, false, W, true) < arcScale(1, false, W, false))
  // …which is why the desktop curve is 0.88 at the neighbours and coarse is not
  near(arcScale(1, false, W, false), 1 - 0.2 * 0.6, 1e-12)
})

test('follow rate drops with distance and clamps to [6.5, 15]', () => {
  near(followRate(0, false, W), 11)
  near(followRate(0, true, W), 15)
  near(followRate(3, false, W), 11 - 3 * 1.15, 1e-12)   // 7.55
  near(followRate(4, true, W), 15 - 4 * 1.15, 1e-12)    // 10.4 — dragging is tighter
  near(followRate(4, false, W), 6.5)                    // 11 − 4.6 = 6.4, floored
  near(followRate(8, true, W), 6.5)                     // floor
  near(followRate(0, false, W), W.followBase)
  near(followRate(0, true, W), W.followTight)
})

test('flow lean uses sqrt, so a gentle flick over-banks', () => {
  const slow = flowLean(0.05, true, W)
  const fast = flowLean(0.5, true, W)
  assert.ok(fast.lean > slow.lean * 3, 'sqrt must make the lean disproportionate')
  near(slow.lean, Math.sqrt(0.05) * W.flowLean, 1e-12)
  assert.equal(flowLean(0.5, false, W).lean, 0)        // reduced motion / coarse → no bank
  assert.equal(flowLean(0.5, false, W).dip, 0)
  near(flowLean(100, true, W).lean, W.flowLeanMax)     // clamped
  near(flowLean(100, true, W).dip, W.flowDipMax)
})

test('fan-in stagger distributes per disc and recedes from depth', () => {
  near(staggerFactor(0, 0, true, glide, W), 0)
  assert.equal(staggerVisible(staggerFactor(0, 0, true, glide, W), true, W), false)
  // at others = 1 every disc has arrived
  for (const h of [0, 1, 2, 3, 4, 7]) near(staggerFactor(1, h, true, glide, W), 1, 1e-9)
  // and an in-flight value is ordered by distance: the leader arrives first
  const e = 0.35
  const lead = staggerFactor(e, 0, true, glide, W)
  const far = staggerFactor(e, 4, true, glide, W)
  assert.ok(lead > far, 'nearer discs must lead')
  assert.ok(staggerFactor(0.3, 0, false, glide, W) > staggerFactor(0.3, 3, false, glide, W))
  // the outbound (non-inbound) shape is o·(2−o), not the glide curve
  const local = 0.3 / (1 - W.flightStagger)
  near(staggerFactor(0.3, 0, false, glide, W), local * (2 - local), 1e-9)
})

// ── the wobble ───────────────────────────────────────────────────────────────

test('the impulse integrator reaches EXACT zero within 10 simulated seconds', () => {
  const p = createImpulse()
  wipeImpulse(p, 400, 300, W)                       // a violent flick
  for (let i = 0; i < 600; i++) integrate(p, 1 / 60, W)
  for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'rotX', 'rotY', 'vRotX', 'vRotY']) {
    assert.equal(p[k], 0, `${k} must be exactly zero, not merely small`)
  }
  assert.equal(impulseEnergy(p), 0)
})

test('the wobble integrator is frame-rate independent', () => {
  const run = (dt, steps) => {
    const p = createImpulse()
    wipeImpulse(p, 400, 300, W)
    for (let i = 0; i < steps; i++) integrate(p, dt, W)
    return p.rotY
  }
  // 144 steps at 1/144 must land within 0.01 of 60 steps at 1/60
  const a = run(1 / 144, 144), b = run(1 / 60, 60)
  assert.ok(Math.abs(a - b) < 0.01, `144 Hz gave ${a.toFixed(6)}, 60 Hz gave ${b.toFixed(6)}`)
})

test('the follow smoother is frame-rate independent', () => {
  // α = min(1, dt·k) — the single most common bug in this class of code is
  // writing `v += (t − v) · 0.1` instead, which passes at one refresh rate only.
  const run = (dt, steps, k) => {
    let v = 0
    for (let i = 0; i < steps; i++) v += (1 - v) * Math.min(1, dt * k)
    return v
  }
  near(run(1 / 144, 144, W.followBase), run(1 / 60, 60, W.followBase), 0.01)
  near(run(1 / 144, 144, W.followMin), run(1 / 60, 60, W.followMin), 0.01)
  // and the spec's two headline numbers
  near(Math.min(1, (1 / 60) * W.followBase), 0.1833, 1e-3)
  near(Math.min(1, (1 / 60) * W.followMin), 0.1083, 1e-3)
  // the lazy version really is wrong
  // the lazy version is wrong: after 0.1 s it has covered 77 % of the distance at
  // 144 Hz but only 47 % at 60 Hz — the same second, two different animations
  const lazy = (steps) => { let v = 0; for (let i = 0; i < steps; i++) v += (1 - v) * 0.1; return v }
  assert.ok(Math.abs(lazy(14) - lazy(6)) > 0.25, `lazy 144 Hz ${lazy(14).toFixed(3)} vs 60 Hz ${lazy(6).toFixed(3)}`)
})

test('the integrator sleeps at 8e-4 rather than shimmering forever', () => {
  const p = createImpulse()
  wipeImpulse(p, 30, 0, W)
  let steps = 0
  while (impulseEnergy(p) !== 0 && steps < 100000) { integrate(p, 1 / 60, W); steps++ }
  assert.ok(steps < 600, `must sleep inside 10 s, took ${steps} frames`)
  assert.equal(impulseEnergy(p), 0, 'and the hard-zero must be exact')
})

test('a press is asymmetric about the disc’s OWN centre', () => {
  const left = createImpulse(); pressImpulse(left, -1, 0, W)
  const right = createImpulse(); pressImpulse(right, 1, 0, W)
  const centre = createImpulse(); pressImpulse(centre, 0, 0, W)
  const top = createImpulse(); pressImpulse(top, 0, 1, W)

  assert.equal(Math.sign(left.vRotY), -1)
  assert.equal(Math.sign(right.vRotY), 1)
  assert.ok(left.vRotX === 0, 'a horizontal press must not touch the vertical axis')
  assert.ok(right.vRotX === 0)
  near(left.vRotY, -W.pressTilt, 1e-12)
  near(right.vRotY, W.pressTilt, 1e-12)

  assert.ok(centre.vRotX === 0, 'a centre press produces zero tilt')
  assert.ok(centre.vRotY === 0)
  assert.equal(centre.vz, -W.pressDepth, 'but it is a pure Z-push')

  assert.ok(top.vRotY === 0)
  // the spec: press at the top gives pushRotVX = −1.5 — exactly this sign
  near(top.vRotX, -W.pressTilt, 1e-12)

  // 30 % right of centre gives +0.45 and no pitch at all — the spec's own example
  const q = createImpulse(); pressImpulse(q, 0.3, 0, W)
  near(q.vRotY, 0.45, 1e-12)
  assert.ok(q.vRotX === 0)
  // the disc reacts where you touched it: mirroring the press mirrors the tilt
  const mirrored = createImpulse(); pressImpulse(mirrored, -0.3, 0, W)
  assert.equal(Math.sign(mirrored.vRotY), -Math.sign(q.vRotY))
})

test('the wipe floor and clamp ceilings bound the impulse', () => {
  const slow = createImpulse(); wipeImpulse(slow, 8, 0, W)      // below the 9 px/frame floor
  assert.equal(impulseEnergy(slow), 0)

  const fast = createImpulse(); wipeImpulse(fast, 100000, 100000, W)
  assert.equal(fast.vx, W.wipePushMax)
  assert.equal(fast.vy, -W.wipePushMax)
  assert.equal(fast.vRotY, W.wipeSpinMax)
  assert.equal(fast.vRotX, W.wipeSpinMax)
})

test('wipe couples translation to rotation about the other axis', () => {
  const p = createImpulse(); wipeImpulse(p, 100, 0, W)
  assert.ok(p.vx > 0, 'horizontal motion pushes sideways')
  assert.ok(p.vRotY > 0, 'and spins about Y')
  assert.equal(p.vRotX, 0, 'but not about X')
})

// ── the intro ────────────────────────────────────────────────────────────────

test('the intro pose is a PURE function of P', () => {
  for (const P of [0, 0.03, 0.25, 0.5, 0.8, 0.97, 1]) {
    assert.deepEqual(introPose(P, W), introPose(P, W))
  }
  // scrubbing to the same P from anywhere gives the same pose
  const a = introPose(0.5, W)
  introPose(0.9, W); introPose(0.1, W)
  assert.deepEqual(introPose(0.5, W), a)
})

test('the three intro curves use exponents 2.4, 2 and 3 — and desynchronise', () => {
  near(easeTurn(0.5), 1 - Math.pow(0.5, 2.4), 1e-12)
  near(easeRise(0.5), 1 - Math.pow(0.5, 3), 1e-12)

  const p = introPose(0.5, W)
  // rise (exp 3) is the slowest, so at any P it lags turn (exp 2.4)
  assert.ok(p.rise < p.turn, `rise ${p.rise} must lag turn ${p.turn}`)
  // grow is derived from rise and clamped at 1, so it leads
  assert.ok(p.grow >= p.rise, `grow ${p.grow} must lead rise ${p.rise}`)
  // at P = 0.5 the three are genuinely different values, not one rigid tween
  const distinct = new Set([p.rise.toFixed(4), p.turn.toFixed(4), p.grow.toFixed(4)])
  assert.equal(distinct.size, 3, `rise ${p.rise}, turn ${p.turn}, grow ${p.grow} must differ`)
})

test('the intro pose reconstructs exactly from the spec', () => {
  const at0 = introPose(0, W)
  near(at0.spinY, -Math.PI / 2, 1e-12)          // edge-on, −90°
  near(at0.spinZ, W.preloadSpin, 1e-12)         // 1.1 rad, 63°
  near(at0.offsetY, -W.preloadRiseFrom, 1e-12)  // −3.0
  near(at0.offsetZ, -W.preloadRiseDepth, 1e-12) // −0.7
  assert.equal(at0.active, 0.001)                // max(0.001, …)
  assert.equal(at0.others_unused, undefined)

  const at1 = introPose(1, W)
  near(at1.spinY, 0, 1e-12)
  near(at1.spinZ, 0, 1e-12)
  near(at1.offsetY, 0, 1e-12)
  near(at1.offsetZ, 0, 1e-12)
  near(at1.active, W.preloadBoost, 1e-12)        // tops out at preloadBoost; the fan takes it to 1
  assert.equal(at1.others ?? 0, 0)

  // quadratic release: spinZ is turnT², so it settles late
  const p = introPose(0.9, W)
  near(p.spinZ, W.preloadSpin * Math.pow(1 - p.turn, 2), 1e-12)
})

test('intro inputs are gated by riseAfter and turnBy', () => {
  near(introPose(W.riseAfter, W).riseInput, 0, 1e-12)
  near(introPose(W.riseAfter, W).turnInput, 0, 1e-12)
  near(introPose(W.turnBy, W).turnInput, 1, 1e-12)      // turn completes at turnBy = 0.8
  assert.ok(introPose(W.turnBy, W).riseInput < 1)        // rise has NOT finished at 0.8
})

// ── loader progress ──────────────────────────────────────────────────────────

test('P is monotonic for a non-decreasing target', () => {
  let P = 0
  const targets = [0.2, 0.2, 0.5, 0.9, 0.9, 1.0]
  for (const t of targets) {
    const before = P
    P = chase(P, t, 1 / 60, C)
    assert.ok(P >= before, `P went backwards: ${before} → ${P}`)
  }
  for (let i = 0; i < 400 && P !== 1; i++) P = chase(P, 1, 1 / 60, C)
  assert.equal(P, 1, 'and snaps to exactly 1 once the target is 1 and P > 0.995')
})

test('realAssetProgress is non-decreasing across every source change', () => {
  let prev = -1
  const step = (s) => { const v = realAssetProgress(s, C); assert.ok(v >= prev, `${v} < ${prev}`); prev = v }
  // scene still booting, fonts not ready — the creep only ever rises
  for (let e = 0; e <= 1; e += 0.1) step({ fontsReady: false, sceneReady: false, elapsed: e, coversLoaded: 0, coversTotal: 0 })
  // fonts resolve, covers start arriving
  for (let c = 0; c <= 20; c++) step({ fontsReady: true, sceneReady: false, elapsed: 1, coversLoaded: c, coversTotal: 20 })
  // the scene exists; covers carry on arriving (they never un-arrive)
  for (let c = 0; c <= 20; c++) step({ fontsReady: true, sceneReady: true, elapsed: 1, coversLoaded: c, coversTotal: 20 })
  assert.equal(prev, 1)
})

test('the loader can never finish before the 2.85 s floor', () => {
  // every asset already ready at t = 0
  const ready = { fontsReady: true, sceneReady: true, elapsed: 0, coversLoaded: 20, coversTotal: 20 }
  let done = null
  for (let t = 0; t < 4; t += 1 / 120) {
    const src = { ...ready, elapsed: t }
    const target = progressTarget(realAssetProgress(src, C), t, C)
    if (target >= 1 && done === null) done = t
  }
  assert.ok(done >= C.minDuration && done < C.minDuration + 1 / 60,
    `P cannot reach 1 before minDuration even on a hot cache (reached at ${done})`)
  assert.equal(C.minDuration, 2.85)
  assert.equal(C.chase, 8)
  assert.equal(C.sceneShare, 0.18)
})

test('the 0.18 scene share is reserved so the counter never sits at 100 % over an empty canvas', () => {
  assert.equal(realAssetProgress({ fontsReady: true, sceneReady: false, elapsed: 99, coversLoaded: 0, coversTotal: 0 }, C), C.sceneShare)
  assert.equal(realAssetProgress({ fontsReady: false, sceneReady: false, elapsed: 0, coversLoaded: 0, coversTotal: 0 }, C), 0)
})

test('fonts gate caps real progress at 0.9', () => {
  const ready = { fontsReady: false, sceneReady: true, elapsed: 99, coversLoaded: 20, coversTotal: 20 }
  assert.equal(realAssetProgress(ready, C), 0.9)
})

test('the four beats need BOTH P and elapsed', () => {
  assert.equal(C.beats.length, 4)
  assert.deepEqual(C.beats.map(b => b.at), [0.05, 0.5, 0.75, 1])
  assert.deepEqual(C.beats.map(b => b.after), [0.8, 1.9, 2.35, 2.8])
  const b = C.beats[1]
  assert.equal(beatReady(b, 0.9, 0.1), false, 'P alone is not enough')
  assert.equal(beatReady(b, 0.1, 9.9), false, 'elapsed alone is not enough')
  assert.equal(beatReady(b, 0.9, 9.9), true)
})

test('the year drum interpolates on easeInOutQuad', () => {
  near(yearFromProgress(0, 2012, 2026), 2012)
  near(yearFromProgress(1, 2012, 2026), 2026)
  near(yearFromProgress(0.5, 2012, 2026), 2012 + 7)
  const years = new Set()
  for (let p = 0; p <= 1.0001; p += 0.001) years.add(yearFromProgress(p, 2012, 2026))
  assert.equal(years.size, 15, 'monotonic, and never leaves the range')
})

// ── scroll ───────────────────────────────────────────────────────────────────

test('wheel advances by exactly ±1, never fractionally', () => {
  const steps = (deltas, gap = 80, mode = 0) => {
    const w = createWheel()
    const out = []
    let t = 100
    for (const d of deltas) { t += gap; out.push(wheelStep(w, d, mode, t, 900, W)) }
    return out
  }
  // a trackpad's small deltas never reach the threshold
  assert.deepEqual(steps([1, 2, 1, 3, 1, 2, 1, 1]), Array(8).fill(0))
  // a mouse notch does — exactly once, and the envelope resets so the next notch
  // has to rebuild before it can step again
  assert.deepEqual(steps([120]), [1])
  assert.deepEqual(steps([120, 0, 120]), [1, 0, 1])
  assert.deepEqual(steps([-120]), [-1])
  // the return value is never fractional, whatever arrives
  const w = createWheel()
  for (const d of [3, -400, 0, 1, 900, -7]) {
    const step = wheelStep(w, d, 0, 100 + Math.abs(d), 900, W)
    assert.ok(step === 0 || step === 1 || step === -1, `deltaY ${d} produced ${step}`)
  }
})

test('deltaMode 1 is normalised ×16 and deltaMode 2 × window height', () => {
  const env = (d, mode) => { const w = createWheel(); wheelStep(w, d, mode, 160, 900, W); return w.envelope }
  near(env(3, 1), env(48, 0), 1e-12)      // 3 lines ≡ 48 px
  near(env(1, 2), env(900, 0), 1e-12)     // 1 page ≡ one window height
})

test('a wheel notch moves the index by exactly one and the detent is exact', () => {
  const s = createScroll(0, 9)
  s.target = 4
  for (let i = 0; i < 400; i++) stepScroll(s, 1 / 60, W)
  assert.equal(s.position, 4)
  assert.equal(Number.isInteger(s.position), true)
})

test('a flick settles on an exact integer, and the settle time is what it is', () => {
  const s = createScroll(0, 9)
  s.position = 0; s.target = 3; s.vel = 0
  let frames = 0
  while (!(Number.isInteger(s.position) && s.position === s.target) && frames < 2000) {
    stepScroll(s, 1 / 60, W); frames++
  }
  assert.equal(s.position, 3)
  const seconds = frames / 60
  // ζ = 12 / (2·9.5) ≈ 0.632, so the envelope decays as exp(−6t): reaching
  // |delta| < 8e-4 takes ln(1/8e-4)/6 ≈ 1.18 s. Reported, not papered over.
  assert.ok(seconds > 0.9 && seconds < 1.6, `settle took ${seconds.toFixed(2)} s`)
})

test('free-drag inertia decays with friction and then snaps', () => {
  const s = createScroll(0, 9)
  s.position = 2; s.target = 2; s.vel = 0.5
  let frames = 0
  while (s.vel !== 0 && frames < 5000) { stepScroll(s, 1 / 60, W); frames++ }
  assert.equal(s.vel, 0)
  for (let i = 0; i < 400; i++) stepScroll(s, 1 / 60, W)
  assert.ok(Number.isInteger(s.position))
})

test('reduced motion sets the integer directly instead of springing', () => {
  const s = createScroll(0, 9)
  s.position = 4.37; s.target = 5; s.vel = 0
  stepScroll(s, 1 / 60, W, 1e-3, false)
  assert.equal(s.position, 5, 'no spring, no overshoot')
})

test('drag integrates to a six-disc span across the viewport and clamps velocity', () => {
  const s = createScroll(0, 9)
  s.position = 0; s.target = 0
  const width = 1200
  for (let i = 0; i < 60; i++) dragStep(s, -width / 60, width, W)
  assert.ok(s.position > 4.5 && s.position <= 6, `expected ≈ 5.7 discs, got ${s.position.toFixed(2)}`)
  assert.ok(Math.abs(s.vel) <= W.dragMaxVelocity, 'one event can never exceed half a disc')
  // what is left on release coasts further, by vel / (1 − 0.89)
  const coast = s.vel / (1 - W.friction)
  for (let i = 0; i < 120; i++) stepScroll(s, 1 / 60, W)
  assert.ok(s.position >= 5.7 && s.position <= 6.7, `glide carried ~${coast.toFixed(2)} further`)
  assert.ok(Number.isInteger(s.position), 'and it lands on an exact index')
  // opposite direction is unimpeded and clamps to the range
  for (let i = 0; i < 200; i++) dragStep(s, width / 60, width, W)
  assert.equal(s.position, 0, 'clamped to lo')
})

test('every integrator takes dt and the caller clamps dt to ≤ 0.1 s', () => {
  // the clamp lives in the render loop; assert the functions are stable at the cap
  const p = createImpulse()
  wipeImpulse(p, 400, 0, W)
  for (let i = 0; i < 200; i++) integrate(p, 0.1, W)
  assert.ok(Math.abs(p.x) < 10, 'a 0.1 s step must not produce a divergent kick')
  const s = createScroll(0, 9)
  s.target = 9
  for (let i = 0; i < 600; i++) stepScroll(s, 0.1, W)
  assert.ok(Number.isInteger(s.position))
})

// ── config integrity ─────────────────────────────────────────────────────────

test('every verified constant survived', () => {
  const expected = {
    hGap: 2.3, depthGap: 1, activeDiscY: 0.06,
    galleryScale: 1.08, galleryRotX: -30, galleryRotY: -30, inactiveScale: 0.8,
    cameraDistance: 4.4, cameraFOV: 40, exposure: 0.86, environmentIntensity: 1,
    keyIntensity: 0.75, keyColor: '#FFF9E8', keyX: 3.5, keyY: -8,
    fillIntensity: 0.3, rimIntensity: 0.75, rimColor: '#499FF5', topStripIntensity: 1.9,
    hoverTiltStrength: 0.21, dragSensitivity: 0.95, dragVelocitySmoothing: 0.32,
    dragMaxVelocity: 0.5, dragStartDistance: 5, friction: 0.89, resetDuration: 1.2,
    snapFreq: 9.5, snapDamping: 12,
    flowLean: 0.055, flowLeanMax: 0.3, flowBank: 0.32, flowDip: 0.014, flowDipMax: 0.09,
    followTight: 15, followBase: 11, followFalloff: 1.15, followMin: 6.5,
    wipePush: 0.012, wipePushMax: 0.5, wipeSpin: 0.009, wipeSpinMax: 0.4, wipeMinSpeed: 9,
    pushDamping: 4.5, pushReturn: 3.4, pressDepth: 0.55, pressTilt: 1.5,
    flightRecede: 2.2, flightStagger: 0.45, flightStaggerIn: 0.28, flightStaggerMax: 4,
    flightPopScale: 0.35, flightPopScaleIn: 0.02,
    preloadBoost: 0.8, preloadGrowBy: 0.5, preloadSpin: 1.1,
    preloadRiseFrom: 3, preloadRiseDepth: 0.7, preloadFanDuration: 1.15,
    riseAfter: 0.03, turnBy: 0.8, renderRadius: 5, artResolution: 1024,
    frontRough: 0.42, frontMetal: 0.48, frontClearcoat: 0.8, texGloss: 1,
    backBaseColor: '#1A1E2A', backIridIOR: 1.86, backIridThickness: 900,
    edgeRoughness: 0.04, edgeMetalness: 0.55, edgeBleed: 0.026,
    hubTransmission: 0.68, hubIOR: 2, hubFrostedEdge: 0.54,
    holeSize: 0.14, hubSize: 0.24, discThickness: 0.01,
    wheelNoiseFloor: 0.3, wheelStepThreshold: 6, wheelEventCap: 24,
    wheelEnvelopeTau: 550, wheelRiseFactor: 1.2,
  }
  for (const [k, v] of Object.entries(expected)) assert.equal(W[k], v, `${k} must be ${v}`)
  assert.equal(C.minDuration, 2.85)
  assert.equal(C.chase, 8)
  assert.equal(C.sceneShare, 0.18)
  assert.equal(C.sceneCreep, 0.6)
  assert.equal(C.setOff, 0.45)
  assert.equal(C.exit, 0.5)
  assert.equal(C.navAfter, 0.15)
  assert.equal(C.copyAfter, 0.3)
  assert.equal(C.spinnerDuration, 0.8)
  assert.equal(TEXT.settleDelay, 100)
  assert.equal(TEXT.dragRevealCap, 500)
  assert.equal(TEXT.outDuration, 0.4)
  assert.equal(TEXT.outLineStagger, 0.016)
  assert.equal(TEXT.outShift, -120)
  assert.equal(TEXT.inDuration, 0.7)
  assert.equal(TEXT.inLineStagger, 0.05)
  assert.equal(TEXT.heightDuration, 0.5)
  assert.equal(TEXT.reverseSpeed, 1.6)
})

test('clamp is the spec clamp', () => {
  assert.equal(clamp(-1, 0, 1), 0)
  assert.equal(clamp(2, 0, 1), 1)
  assert.equal(clamp(0.5, 0, 1), 0.5)
})
// ── the flow kick ────────────────────────────────────────────────────────────
// motion-spec.md §3.9 / implementation.md §8.4. The kick lands on the FLOW
// velocity, which the arc consumes for lean/dip/bank — never on the position.

test('a wheel notch kicks the flow velocity by exactly ±2.5', () => {
  assert.equal(snapProfile('wheel', 1).kick, 2.5)
  const s = createScroll(0, 9)
  s.position = 3; s.target = 4
  const before = s.flow
  s.flow = kickFlow(s.flow, 4, s.position, snapProfile('wheel', 1).kick)
  near(s.flow - before, 2.5, 1e-9)
  // and backwards
  s.flow = kickFlow(s.flow, 2, s.position, snapProfile('wheel', 1).kick)
  near(s.flow, 0, 1e-9)
})

test('only wheel, key and click kick — flick and the default carry none', () => {
  assert.equal(snapProfile('flick', 3).kick, 0)
  assert.equal(snapProfile('snap', 3).kick, 0)
  assert.equal(snapProfile('key', 1).kick, 4)
  assert.equal(snapProfile('click', 1).kick, 1.4)
  assert.equal(snapProfile('click', 9).kick, 5, 'click kick is capped at 5')
})

test('snap duration scales with distance and is capped per source', () => {
  near(snapProfile('wheel', 1).duration, 0.51, 1e-9)
  near(snapProfile('flick', 1).duration, 0.56, 1e-9)
  near(snapProfile('key', 1).duration, 0.46 - 0.04 + 0.05, 1e-9)
  near(snapProfile('key', 99).duration, 0.6, 1e-9)          // key is capped at 0.60
  near(snapProfile('click', 0).duration, 0.46, 1e-9)      // floor = snapDuration
  near(snapProfile('click', 2).duration, 0.45 + 2 * 0.11, 1e-9)
  near(snapProfile('click', 99).duration, 1.05, 1e-9)      // cap
  // one step is crisp, a six-disc jump is a sweep
  assert.ok(snapProfile('click', 6).duration > snapProfile('click', 1).duration)
  assert.equal(SNAP.base, W.snapDuration, 'the base is the configured snapDuration')
})

test('the flow kick is clamped to ±12 so a frantic scroll cannot lean forever', () => {
  assert.equal(FLOW_KICK_CLAMP, 12)
  let f = 0
  for (let i = 0; i < 20; i++) f = kickFlow(f, 9, 0, 2.5)
  assert.equal(f, 12)
  let g = 0
  for (let i = 0; i < 20; i++) g = kickFlow(g, -9, 0, 2.5)
  assert.equal(g, -12)
})

test('a kick in the direction already travelling is additive, not a reset', () => {
  const f = kickFlow(3, 9, 0, 2.5)
  near(f, 5.5, 1e-9)
  // a zero-distance move produces no kick at all
  assert.equal(kickFlow(0, 4, 4, 2.5), 0)
})

test('the flow velocity eases out and reaches exact zero', () => {
  const s = createScroll(0, 9)
  s.flow = 2.5
  s.position = s.target = 0                     // nothing to spring toward
  for (let i = 0; i < 600; i++) stepScroll(s, 1 / 60, W)
  assert.equal(s.flow, 0, 'flow sleeps rather than shimmering forever')
})

test('the flow kick never touches the position', () => {
  const s = createScroll(0, 9)
  s.position = 3; s.target = 4
  s.flow = kickFlow(s.flow, 4, s.position, 2.5)
  for (let i = 0; i < 240; i++) stepScroll(s, 1 / 60, W)
  // the bank decays; the index is still what actually moved it
  near(s.flow, 0, 1e-9)
  assert.ok(Number.isInteger(s.position) && s.position === 4)
})

test('reduced motion zeroes the flow velocity on the immediate path', () => {
  const s = createScroll(0, 9)
  s.flow = 9
  s.target = 5
  stepScroll(s, 1 / 60, W, 1e-3, false)
  assert.equal(s.position, 5)
  assert.equal(s.flow, 0, 'a stale kick must not leak into the next move')
})

// ── the counter exit ─────────────────────────────────────────────────────────
// motion-spec.md §2.9. No timer, no tween: a per-frame read of the disc's growth.

test('the counter exit finishes at ≈70 % of the disc growth, not on a timer', () => {
  const from = 320; const rest = 400                      // 0.8·R → 1.0·R
  const at = live => exitCells({ from, live, rest }, [0])
  assert.equal(at(from).t, 0, 'nothing moves at the arming instant')
  near(at(from + (rest - from) * 0.70).t, 1, 1e-9)
  assert.equal(at(from + (rest - from) * 0.35).values[0], -110 * 0.5)
  assert.equal(at(rest).values[0], -110, 'fully pushed at the end')
  // the whole point: identical output for identical input, at any frame time
  near(at(from + (rest - from) * 0.7).values[0], -110, 1e-9)
})

test('the counter exit is growth-coupled, so it CANNOT finish before the disc', () => {
  // a fixed-duration tween would have finished here, while the disc is untouched
  const from = 320; const rest = 400
  const { t, values } = exitCells({ from, live: from, rest }, [0])
  assert.equal(t, 0)
  assert.equal(values[0], 0)
})

test('the counter exit is a WAVE across cells, not one block', () => {
  const staggers = cellStagger([40, 40, 40])            // glyph + two digits
  assert.deepEqual(staggers.map(s => +s.toFixed(4)), [0, 0.07, 0.14])
  const span = 1 - 0.14
  const live = 320 + (400 - 320) * 0.70 * 0.9          // just before t = 1
  const { values } = exitCells({ from: 320, live, rest: 400 }, staggers)
  // glyph has left, the last digit has not
  assert.equal(values[0], -110)
  assert.ok(values[2] > -110 && values[2] < 0, `last digit should be mid-wave, got ${values[2]}`)
  // and the wave is monotonic: the glyph always leads
  assert.ok(values[0] <= values[1] && values[1] <= values[2])
})

test('collapsed cells are filtered out of the stagger before spacing', () => {
  // a single-glyph beat: three drums at width 0 must not eat two thirds of the spread
  const staggers = cellStagger([40, 0, 0, 0])
  assert.equal(staggers.length, 4)
  assert.equal(staggers[0], 0, 'the one visible cell carries offset 0')
  assert.deepEqual([...new Set(staggers)], [0])
  // two visible cells → half the spread each
  assert.deepEqual(cellStagger([40, 0, 40, 0]).map(s => +s.toFixed(4)), [0, 0, 0.14, 0])
})

test('the exit divisor is 1 − max(stagger) = 0.86, so the last cell still reaches −110', () => {
  const staggers = cellStagger([40, 40, 40])
  const span = 1 - Math.max(...staggers)
  near(span, 0.86, 1e-9)
  const { values } = exitCells({ from: 320, live: 400, rest: 400 }, staggers)
  for (const v of values) assert.equal(v, -110)
})

test('a degenerate anchor (rest ≤ from) pushes out immediately instead of hanging', () => {
  const { t, values } = exitCells({ from: 300, live: 300, rest: 300.2 }, [0])
  assert.equal(t, 1)
  assert.equal(values[0], -110)
})

// ── the counter orbit ────────────────────────────────────────────────────────

test('the orbit steps π/4 per beat and visits below → left → upper-left → above', () => {
  const beats = [0, 1, 2, 3].map(() => ({ travel: 0.8 }))
  const thetas = beats.map((_, i) => Math.PI * C.arcEnd * ((i + 1) / beats.length))
  assert.deepEqual(thetas.map(t => +(t / Math.PI).toFixed(4)), [0.25, 0.5, 0.75, 1])
  // sign convention: x = discX − sin(θ)·Rx, y = discY + cos(θ)·Ry
  const place = theta => ({ dx: -Math.sin(theta), dy: Math.cos(theta) })
  const home = place(0)
  near(home.dy, 1, 1e-9); near(home.dx, 0, 1e-9)          // θ=0    directly BELOW
  const [, b, c, d] = thetas.map(place)
  near(b.dx, -1, 1e-9); near(b.dy, 0, 1e-9)               // θ=π/2  directly LEFT
  near(c.dx, -Math.SQRT1_2, 1e-9); near(c.dy, -Math.SQRT1_2, 1e-9)   // θ=3π/4 upper-left
  near(d.dy, -1, 1e-9)                                    // θ=π    directly ABOVE
  // and the direction of travel is monotonic: it never doubles back
  for (let i = 1; i < thetas.length; i++) assert.ok(thetas[i] > thetas[i - 1])
})

test('the orbit radius clears the disc and tracks its projected size', () => {
  const discR = 200; const cw = 120; const ch = 80; const gap = 0.35
  const Rx = discR + cw / 2 + ch * gap
  const Ry = discR + ch / 2 + ch * gap
  assert.ok(Rx > discR + cw / 2, 'horizontally clear of the disc edge')
  assert.ok(Ry > discR + ch / 2, 'vertically clear of the disc edge')
  // it tracks the projection, not a fixed pixel offset: a bigger disc, a bigger orbit
  const bigRx = 400 + cw / 2 + ch * gap
  assert.ok(bigRx - Rx === 200)
})

// ── the copy reveal planner ──────────────────────────────────────────────────
// motion-spec.md §6.3. Pure, so the ordering contract is testable without a DOM.

test('the reveal order is cumulative ACROSS kinds, not stacked at t = 0', () => {
  const entries = [
    { group: 0 }, { group: 0 }, { group: 0 }, { group: 0 }, { group: 0 },
  ]
  const at = planReveal(entries, TEXT).map(v => +v.toFixed(6))
  assert.deepEqual(at, [0, 0.035, 0.07, 0.105, 0.14])
  const uniq = new Set(at)
  assert.equal(uniq.size, entries.length, 'no two entries start together')
})

test('a group change adds exactly ONE gap, and it is 0.06 s', () => {
  const at = planReveal(
    [{ group: 0 }, { group: 0 }, { group: 1 }, { group: 1 }],
    TEXT
  ).map(v => +v.toFixed(6))
  assert.deepEqual(at, [0, 0.035, 0.13, 0.165])
  assert.equal(TEXT.inGroupGap, 0.06)
  // group 0 always starts at 0 — the gap is never spent before it
  assert.equal(at[0], 0)
})

test('three groups get two gaps, not one per group index', () => {
  const at = planReveal([{ group: 0 }, { group: 1 }, { group: 2 }], TEXT)
  const gaps = at.slice(1).map((v, i) => +(v - at[i] - TEXT.inItemStagger).toFixed(6))
  assert.deepEqual(gaps, [TEXT.inGroupGap, TEXT.inGroupGap])
  assert.notEqual(gaps[0], TEXT.inGroupGap * 2, 'not a per-group-index drift')
})

test('a single-group copy plans a clean cumulative stagger', () => {
  const at = planReveal([{ group: 0 }, { group: 0 }, { group: 0 }], TEXT)
  assert.deepEqual(at, [0, 0.035, 0.07])
})

test('`together` entries start with the title and take no part in the cascade', () => {
  const at = planReveal(
    [{ group: 0 }, { group: 0 }, { group: 0, together: true }, { group: 1, together: true }, { group: 0 }],
    TEXT
  ).map(v => +v.toFixed(6))
  // the two together entries sit at 0 and add neither a stagger step nor a gap
  assert.deepEqual(at, [0, 0.035, 0, 0, 0.07])
})

// ── hover scribble ─────────────────────────────────────────────────────────
import { writeLoop, writeFill, FILL_ANCHOR, SCRIBBLE } from '../src/disc/scribble.js'

test('the scribble ribbon sits just outside the rim, tapers at both ends, and lies flat', () => {
  const S = SCRIBBLE
  const n = S.points * 3
  const pos = writeLoop(new Float32Array((n + 1) * 6), 0, 1, () => 0.5)
  // rand = 0.5 → zero jitter, zero sweep jitter, start angle π
  const r = i => Math.hypot(pos[i * 3], pos[i * 3 + 1])
  const mid = n / 2
  const inner = r(mid * 2), outer = r(mid * 2 + 1)
  assert.ok(Math.abs((inner + outer) / 2 - (1 + S.padding)) < 1e-6, 'centred on 1 + padding')
  assert.ok(Math.abs(outer - inner - S.width) < 1e-6, 'full width mid-stroke')
  const endWidth = r(1) - r(0)
  assert.ok(endWidth < S.width * 0.2, `tapered at the start (${endWidth})`)
  for (let i = 2; i < pos.length; i += 3) assert.equal(pos[i], 0)
  // second loop is one loopGap wider
  const pos2 = writeLoop(new Float32Array((n + 1) * 6), 1, 1, () => 0.5)
  const mid2 = (Math.hypot(pos2[mid * 6], pos2[mid * 6 + 1]) + Math.hypot(pos2[mid * 6 + 3], pos2[mid * 6 + 4])) / 2
  assert.ok(Math.abs(mid2 - (1 + S.padding + S.loopGap)) < 1e-6)
})

test('a partial draw sweeps proportionally less arc', () => {
  const n = SCRIBBLE.points * 3
  const ang = amt => {
    const p = writeLoop(new Float32Array((n + 1) * 6), 0, amt, () => 0.5)
    const a0 = Math.atan2(p[1], p[0]), a1 = Math.atan2(p[n * 6 + 1], p[n * 6])
    return ((a1 - a0) + Math.PI * 4) % (Math.PI * 2)
  }
  assert.ok(Math.abs(ang(0.5) / ang(1) - 0.5) < 1e-6)
})

test('the push ring is anchored at 150° and its tip sweeps exactly the meter', () => {
  const S = { ...SCRIBBLE, points: 40, jitter: 0, loops: 1, padding: 0.09, width: 0.02, sweep: 1, sweepJitter: 0 }
  const n = S.points * 3
  const ang = (p, i) => Math.atan2(p[i * 6 + 1] + p[i * 6 + 4], p[i * 6] + p[i * 6 + 3])
  for (const amount of [0.15, 0.4, 0.9]) {
    const p = writeFill(new Float32Array((n + 1) * 6), amount, S)
    assert.ok(Math.abs(ang(p, n) - FILL_ANCHOR) < 1e-6, `anchored at 150° at ${amount}`)
    const sweep = (((ang(p, n) - ang(p, 0)) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    assert.ok(Math.abs(sweep / (Math.PI * 2) - amount) < 1e-6, `sweeps ${amount} of a turn`)
  }
})
