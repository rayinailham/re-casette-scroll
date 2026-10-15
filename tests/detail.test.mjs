/**
 * Acceptance tests for the detail flow's pure modules: route, copy, ink, push
 * meter, transition maths. None of them import three or the DOM.
 *
 *   node --test tests/
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { parseHash, hashFor, nextId, locate } from '../src/detail/route.js'
import { splitMeta, stillUrl, nextKicker, nextAria, titleLines } from '../src/detail/copy.js'
import {
  INK, createField, contourLoops, loopsToPath, keptArea, contourLevel, progress, inkPath,
  surgePx, smootherstep, polygonArea, insidePolygon,
} from '../src/detail/ink.js'
import { createPush, reducePush } from '../src/detail/push.js'
import { snapDuration, exitSpinTarget, handOverAt } from '../src/disc/transition.js'
import { NEXT, DETAIL } from '../src/disc/config.js'

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !≈ ${b}`)

// ── route ────────────────────────────────────────────────────────────────────

const films = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const games = [{ id: 'x' }, { id: 'y' }]
const sections = [{ id: 'films', items: films }, { id: 'games', items: games }]

test('hashFor and parseHash round-trip, and an unknown id is ignored', () => {
  const ids = ['a', 'b', 'x']
  assert.equal(hashFor('b'), '#/b')
  assert.equal(parseHash(hashFor('b'), ids), 'b')
  assert.equal(parseHash('#/nope', ids), null)
  assert.equal(parseHash('', ids), null)
  assert.equal(parseHash('#', ids), null)
  assert.equal(parseHash('#/a/extra', ids), null)
  assert.equal(parseHash('#/%E0%A4%A', ids), null, 'a malformed escape is not an id')
})

test('ids with characters that need escaping survive the round trip', () => {
  const ids = ["breakfast at tiffany's"]
  assert.equal(parseHash(hashFor(ids[0]), ids), ids[0])
})

test('nextId steps through the section and wraps at its end', () => {
  assert.equal(nextId(films, 'a'), 'b')
  assert.equal(nextId(films, 'c'), 'a', 'wraps')
  assert.equal(nextId(games, 'y'), 'x')
})

test('nextId never crosses a section boundary and returns null for an unknown id', () => {
  assert.equal(nextId(films, 'c'), 'a', 'the last film is followed by the FIRST FILM, not a game')
  assert.equal(nextId(films, 'x'), null)
  assert.equal(nextId([{ id: 'only' }], 'only'), 'only')
})

test('locate finds an item and its section', () => {
  assert.equal(locate(sections, 'y').section.id, 'games')
  assert.equal(locate(sections, 'zzz'), null)
})

// ── copy ─────────────────────────────────────────────────────────────────────

test('splitMeta separates a film runtime and gives a game no runtime row', () => {
  assert.deepEqual(splitMeta('Drama, Romance · 102 min'), { genre: 'Drama, Romance', runtime: '102 min' })
  assert.deepEqual(splitMeta('Action RPG · 2011'), { genre: 'Action RPG', runtime: null })
  assert.deepEqual(splitMeta('Drama'), { genre: 'Drama', runtime: null })
  assert.deepEqual(splitMeta(null), { genre: null, runtime: null })
})

test('the still is addressed by id, and the next label comes from the section label', () => {
  assert.equal(stillUrl('dark-souls'), 'assets/stills/dark-souls.webp')
  assert.equal(nextKicker({ label: 'Film' }), 'Next film')
  assert.equal(nextAria({ label: 'Game' }, 'Elden Ring'), 'Next game: Elden Ring')
})

// ── ink: determinism, closed loops, monotonic, minBlob, progress ─────────────

const W = 480, H = 300

test('the ink path is deterministic for a seed, phase, level and box', () => {
  const a = inkPath(W, H, 120, 1.3)
  const b = inkPath(W, H, 120, 1.3)
  assert.equal(a, b)
  assert.notEqual(a, inkPath(W, H, 120, 2.1), 'a different phase boils the edge')
  assert.notEqual(a, inkPath(W, H, 120, 1.3, { ...INK, seed: 9 }), 'a different seed is a different field')
})

test('the field never produces NaN across a sweep of level and phase', () => {
  for (let level = -400; level <= 700; level += 37) {
    for (let phase = 0; phase < 6.3; phase += 0.9) {
      const d = inkPath(W, H, level, phase)
      assert.ok(!d.includes('NaN') && !d.includes('Infinity'), `level ${level} phase ${phase}`)
    }
  }
})

test('every loop is closed: one Z per M, and the contour never touches the box edge', () => {
  const field = createField(W, H)
  for (const level of [60, 150, 240]) {
    const loops = contourLoops(field, { level, phase: 0.7 })
    assert.ok(loops.length >= 1)
    const d = loopsToPath(loops, 1)
    assert.equal((d.match(/M/g) ?? []).length, (d.match(/Z/g) ?? []).length)
    assert.equal((d.match(/M/g) ?? []).length, loops.length)
    for (const loop of loops) {
      assert.ok(loop.length >= 3)
      // the framed ring keeps the contour a margin cell clear of the sampled grid
      for (const [x, y] of loop) {
        assert.ok(x >= -INK.margin * INK.grid && x <= W + INK.margin * INK.grid + INK.grid)
        assert.ok(y >= -INK.margin * INK.grid && y <= H + INK.margin * INK.grid + INK.grid)
      }
    }
  }
})

test('the kept area grows monotonically with the level (no blob filter)', () => {
  const cfg = { ...INK, minBlob: 0 }
  const field = createField(W, H, cfg)
  let prev = -Infinity
  for (let level = -300; level <= 700; level += 25) {
    const loops = contourLoops(field, { level, phase: 0.9 }, cfg)
    const area = keptArea(loops)
    assert.ok(area >= prev - W * H * 0.01, `level ${level}: ${area} fell below ${prev}`)
    prev = Math.max(prev, area)
  }
  assert.ok(prev > W * H * 0.9, 'a high level keeps the whole box')
})

test('minBlob drops small loops and keeps big ones', () => {
  const cfg0 = { ...INK, minBlob: 0 }
  let withSmall = 0
  for (let level = 0; level < 500 && !withSmall; level += 10) {
    for (let phase = 0; phase < 6 && !withSmall; phase += 0.4) {
      const f0 = createField(W, H, cfg0)
      const all = contourLoops(f0, { level, phase }, cfg0)
      const kept = contourLoops(createField(W, H), { level, phase })
      const small = all.filter(l => Math.abs(polygonArea(l)) < INK.minBlob).length
      if (small) { withSmall = small; assert.equal(kept.length, all.length - small) }
    }
  }
  assert.ok(withSmall > 0, 'the sweep found a frame with a sub-minBlob loop')
  // and a huge threshold drops everything, which must still be a valid (empty) result
  const none = contourLoops(createField(W, H, { ...INK, minBlob: 1e9 }), { level: 100, phase: 1 }, { ...INK, minBlob: 1e9 })
  assert.equal(none.length, 0)
  assert.equal(loopsToPath(none), '')
})

test('the level runs from nothing eaten, through the peek, to fully gone', () => {
  const h = 900
  const start = contourLevel({ height: h, V: 0, u: 0 })
  const rest = contourLevel({ height: h, V: 0, u: 1 })
  const gone = contourLevel({ height: h, V: 1, u: 1 })
  near(rest, h * (1 - INK.peek), 1e-9)
  assert.ok(start > h, 'before the intro the edge is below the box')
  assert.ok(gone < 0, 'at V = 1 the edge is above the box')
  assert.ok(contourLevel({ height: h, V: 0.5, u: 1 }) < rest)
  // a surge lifts the edge, scaled by the intro
  assert.ok(contourLevel({ height: h, V: 0.3, u: 1, ne: 50 }) < contourLevel({ height: h, V: 0.3, u: 1 }))
  near(contourLevel({ height: h, V: 0.3, u: 0, ne: 50 }), start, 1e-9)
  near(surgePx(h), INK.surge * INK.peek * h, 1e-9)
})

test('progress clamps to [0, 1] and reaches 1 at `finish` of the travel', () => {
  const base = { top: 0, height: 1000, vh: 900, finish: 0.85 }
  assert.equal(progress({ ...base, scrollY: -50 }), 0)
  assert.equal(progress({ ...base, scrollY: 0 }), 0)
  assert.equal(progress({ ...base, scrollY: 99999 }), 1)
  near(progress({ ...base, scrollY: 850 }), 1, 1e-9)
  near(progress({ ...base, scrollY: 425 }), 0.5, 1e-9)
  // the start is clamp(top bottom): a box lower down the page starts when it enters
  near(progress({ scrollY: 1100, top: 2000, height: 1000, vh: 900, finish: 1 }), 0, 1e-9)
  assert.ok(progress({ scrollY: 1500, top: 2000, height: 1000, vh: 900, finish: 1 }) > 0)
  near(smootherstep(0.5), 0.5, 1e-12)
})

// ── push meter ───────────────────────────────────────────────────────────────

const Y = NEXT
const wheel = (s, now, delta = 120, atEnd = true) => reducePush(s, { type: 'wheel', now, delta, atEnd }, Y)

test('the arriving flick never counts', () => {
  // a flick: events 16 ms apart, the page reaches its end part-way through
  let s = createPush(), t = 1000, exits = 0
  for (let i = 0; i < 20; i++) { const r = wheel(s, t += 16, 120, i > 4); s = r.state; exits += +r.exit }
  assert.equal(s.meter, 0)
  assert.equal(exits, 0)
})

test('a second gesture — after settling and a pause — fills the meter', () => {
  let s = createPush(), t = 1000
  s = wheel(s, t += 16).state                  // the flick's last event at the end
  s = wheel(s, t += 16).state
  assert.equal(s.meter, 0)
  t += 600                                     // pause: settled, and the gap is fresh
  const r = wheel(s, t)
  assert.ok(r.state.meter > 0, 'the first event of the second gesture counts')
  assert.equal(r.state.armed, true)
  // and it keeps counting while armed, even with small gaps
  const r2 = wheel(r.state, t + 30)
  assert.ok(r2.state.meter > r.state.meter)
})

test('a surge counts as fresh even without a pause', () => {
  let s = createPush(), t = 1000
  s = wheel(s, t, 10).state                    // small events…
  t += 400                                     // …settled…
  s = wheel(s, t + 50, 10).state
  const r = wheel(s, t + 100, 100)             // …then a hard push: 100 > 10 × 1.6
  assert.ok(r.state.meter > 0)
})

test('the meter drains after pushHold and not before', () => {
  let s = { ...createPush(), meter: 0.5, lastPush: 1000, armed: true }
  s = reducePush(s, { type: 'tick', now: 1000 + Y.pushHold, dt: 0.016 }, Y).state
  assert.equal(s.meter, 0.5, 'still held')
  s = reducePush(s, { type: 'tick', now: 1000 + Y.pushHold + 10, dt: 0.05 }, Y).state
  near(s.meter, 0.5 - 0.05 * Y.pushDrain, 1e-9)
  for (let i = 0; i < 100; i++) s = reducePush(s, { type: 'tick', now: 3000 + i * 16, dt: 0.05 }, Y).state
  assert.equal(s.meter, 0)
})

test('filling the meter exits exactly once; nothing counts while leaving', () => {
  let s = { ...createPush(), endSince: 1, armed: true, meter: 0.95, lastPush: 1000, lastWheel: 1000 }
  const r = wheel(s, 1200, 140)
  assert.equal(r.exit, true)
  assert.equal(r.state.leaving, true)
  assert.equal(r.state.meter, 1)
  const again = wheel(r.state, 1220, 140)
  assert.equal(again.exit, false, 'no re-entry')
  assert.equal(reducePush(r.state, { type: 'key', now: 1300, atEnd: true }, Y).exit, false)
  assert.equal(reducePush(r.state, { type: 'tick', now: 9000, dt: 0.05 }, Y).state.meter, 1, 'and it does not drain')
})

test('leaving the end disarms: scrolling back up resets the gesture gate', () => {
  let s = createPush()
  s = wheel(s, 1000).state
  s = wheel(s, 1700).state                     // armed, meter > 0
  assert.equal(s.armed, true)
  s = wheel(s, 1800, -120, false).state        // not at the end any more
  assert.equal(s.armed, false)
  assert.equal(s.endSince, 0)
})

test('keys and touch only count at the end, and a scroll up pulls the meter down', () => {
  let s = createPush()
  assert.equal(reducePush(s, { type: 'key', now: 1, atEnd: false }, Y).state.meter, 0)
  s = reducePush(s, { type: 'key', now: 1, atEnd: true }, Y).state
  near(s.meter, Y.pushKey, 1e-9)
  const t = reducePush(s, { type: 'touch', now: 2, dy: 100, atEnd: true }, Y).state
  near(t.meter, Y.pushKey + 100 / (Y.pushWheel * Y.pushTouch / 620), 1e-9)
  const down = wheel({ ...s, armed: true, endSince: 1 }, 500, -140)
  assert.ok(down.state.meter < s.meter)
  assert.ok(down.state.meter >= 0)
  // three key presses fill it
  let k = createPush(), out = false
  for (let i = 0; i < 3; i++) { const r = reducePush(k, { type: 'key', now: i, atEnd: true }, Y); k = r.state; out ||= r.exit }
  assert.equal(out, true)
})

// ── the disc's exit maths ────────────────────────────────────────────────────

test('exit spin lands edge-on, at or past spinY + exitSpin', () => {
  for (const spinY of [0, 0.3, Math.PI / 2, Math.PI, 2.5, -1.2, 7]) {
    const target = exitSpinTarget(spinY, DETAIL.exitSpin)
    const k = (target - Math.PI / 2) / Math.PI
    near(k, Math.round(k), 1e-9)                          // π/2 + kπ
    assert.ok(target >= spinY + DETAIL.exitSpin - 1e-6)   // never short of the requested travel
    assert.ok(target < spinY + DETAIL.exitSpin + Math.PI + 1e-6, 'and no more than a half turn past it')
  }
  near(exitSpinTarget(0, Math.PI / 2), Math.PI / 2, 1e-9)
})

test('the snap and the hand-over follow motion-spec.md §11.7', () => {
  assert.equal(snapDuration(0), 0)
  assert.equal(snapDuration(0.001), 0)
  near(snapDuration(0.4), 0.22, 1e-9)
  assert.equal(snapDuration(10), 0.4, 'clamped')
  const c = { snap: 0, pressTime: DETAIL.pressTime, springTime: DETAIL.springTime, outDuration: DETAIL.outDuration, exitDuration: DETAIL.exitDuration }
  // out 0.55 + press 0.12 = 0.67 vs press + spring + exit = 1.08: the others fading finish first
  near(handOverAt(c), 0.67, 1e-9)
  near(handOverAt({ ...c, outDuration: 5 }), 0.12 + 0.16 + 0.8, 1e-9)
})

test('the silhouette hit test is an even-odd ray cast', () => {
  const sq = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  assert.equal(insidePolygon([0, 0], sq), true)
  assert.equal(insidePolygon([2, 0], sq), false)
})

test('the next title breaks into at most three lines, one word each while it fits', () => {
  assert.deepEqual(titleLines('The Invite'), ['The', 'Invite'])
  assert.deepEqual(titleLines('Tony'), ['Tony'])
  assert.deepEqual(titleLines('12 Angry Men'), ['12', 'Angry', 'Men'])
  const long = titleLines('Everything Everywhere All at Once')
  assert.equal(long.length, 3)
  assert.equal(long.join(' '), 'Everything Everywhere All at Once', 'no word is lost or split')
  assert.deepEqual(titleLines(''), [])
})
