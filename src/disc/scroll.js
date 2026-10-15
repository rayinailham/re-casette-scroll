/**
 * Scroll position. One float index `position`, one integer detent `target`.
 * Scroll produces an index, never a pixel offset.
 *
 * motion-spec.md §3.5–§3.7, design-system.md §4.3, implementation.md §7.
 */
import { clamp } from './config.js'

export function createScroll (lo = 0, hi = 0) {
  return {
    position: lo,          // GLOBAL float index — the only thing the arc reads
    target: lo,            // GLOBAL integer detent the snap spring pulls toward
    vel: 0,                // drag fling delta, index/event — moves the POSITION
    flow: 0,               // FLOW velocity, index/s-ish — banks the ribbon, moves NOTHING
    springVel: 0,
    dragging: false,
    locked: false,         // true during the section-slide tween
    lo, hi,
  }
}

/**
 * Snap profile and flow kick per source. motion-spec.md §3.9, implementation.md §8.4.
 *
 * Duration scales with distance so one step is crisp and a six-disc jump is a
 * deliberate sweep. Only `flick` and the default get `kick: 0` — a flick already
 * arrived with velocity, so a second impulse would double-count it.
 */
export const SNAP = {
  base: 0.46,                                  // w.snapDuration
  wheel: { add: 0.05, kick: 2.5 },
  key:   { max: 0.60, kick: 4 },
  click: { min: 0.45, perIndex: 0.11, max: 1.05, kickPerIndex: 1.4, kickMax: 5 },
  flick: { add: 0.10, kick: 0 },
}

/** So a frantic scroll cannot wind up a permanent lean. */
export const FLOW_KICK_CLAMP = 12

export function snapProfile (source, distance, base = SNAP.base) {
  switch (source) {
    case 'wheel':
      return { duration: base + SNAP.wheel.add, kick: SNAP.wheel.kick }
    case 'key':
      return {
        duration: Math.min(SNAP.key.max, base - 0.04 + distance * 0.05),
        kick: SNAP.key.kick,
      }
    case 'click':
      return {
        duration: clamp(SNAP.click.min + distance * SNAP.click.perIndex, base, SNAP.click.max),
        kick: Math.min(SNAP.click.kickMax, distance * SNAP.click.kickPerIndex),
      }
    case 'flick':
      return { duration: base + SNAP.flick.add, kick: SNAP.flick.kick }
    default:
      return { duration: base, kick: 0 }
  }
}

/**
 * THE FLOW KICK. It lands on `flow`, the velocity the arc already consumes for
 * lean/dip/bank — never on the position. Without it a one-disc step is invisible
 * in the ribbon's bank: only the index changed, so only the index animates.
 */
export function kickFlow (flow, target, position, kick, limit = FLOW_KICK_CLAMP) {
  if (!kick) return flow
  const dir = Math.sign(target - position)
  return dir ? clamp(flow + dir * kick, -limit, limit) : flow
}

/**
 * Wheel quantiser. Raw deltaY is noisy and refresh-rate dependent, so it runs
 * through an exponential envelope follower (τ 550 ms, noise floor 0.3, rise 1.2).
 * When the accumulated envelope crosses 6, advance EXACTLY one index and reset.
 *
 * Returns −1, 0 or +1. Never a fraction.
 */
export function createWheel () {
  return { envelope: 0, lastAt: 0, queuedInFrame: 0 }
}

/** Typical gap between two mouse notches — the first event has no history to blend. */
const FIRST_EVENT_MS = 60

export function wheelStep (state, deltaY, deltaMode, now, viewportHeight, w) {
  const ms = state.lastAt ? now - state.lastAt : FIRST_EVENT_MS
  state.lastAt = now

  let dy = deltaY
  if (deltaMode === 1) dy *= 16                    // DOM_DELTA_LINE
  else if (deltaMode === 2) dy *= viewportHeight   // DOM_DELTA_PAGE

  const alpha = Math.min(1, ms / w.wheelEnvelopeTau)
  state.envelope = state.envelope * (1 - alpha) + Math.abs(dy) * alpha * w.wheelRiseFactor

  if (state.envelope < w.wheelNoiseFloor) return 0
  if (state.envelope < w.wheelStepThreshold) return 0

  state.envelope = 0
  return Math.sign(dy) || 0
}

/** Wheel event cap: at most 24 events are consumed per animation frame. */
export function resetWheelFrame (state) { state.queuedInFrame = 0 }
export function wheelFrameFull (state, w) { return state.queuedInFrame >= w.wheelEventCap }

/**
 * Free inertia, then the damped harmonic snap.
 *
 *   vel *= 0.89 ^ (dt·60)          friction is a per-60 Hz-frame constant
 *   position += vel · dt
 *   delta = target − position
 *   springVel += delta · 9.5² · dt ;  springVel *= exp(−12 · dt)
 *   position += springVel · dt
 *
 * ω = 9.5 rad/s with exp(−12·dt) is slightly UNDERdamped (critical would be 19),
 * so the row overshoots very slightly and catches — one small bounce into the
 * detent. That reads as magnetic.
 */
export function stepScroll (s, dt, w, snapVelocityEpsilon = 1e-3, snap = true) {
  // The flow velocity decays with the same per-60 Hz-frame friction as the fling:
  // the kick is one sharp impulse that eases out, never a sustained tilt.
  s.flow *= Math.pow(w.friction, dt * 60)
  if (Math.abs(s.flow) < 1e-3) s.flow = 0

  if (s.dragging || s.locked) { s.springVel = 0; return }

  if (s.vel !== 0) {
    // `vel` is a per-event index DELTA, not a rate — so friction is expressed as
    // 0.89 per 60 Hz frame, which is exactly what `dt·60` in the exponent buys.
    s.position = clamp(s.position + s.vel, s.lo, s.hi)
    s.vel *= Math.pow(w.friction, dt * 60)
    s.target = clamp(Math.round(s.position), s.lo, s.hi)
    if (Math.abs(s.vel) < snapVelocityEpsilon) s.vel = 0
    return
  }

  // reduced motion: snap sets the integer directly instead of springing
  if (!snap) { s.position = s.target; s.springVel = 0; s.flow = 0; return }

  const delta = s.target - s.position
  s.springVel += delta * w.snapFreq * w.snapFreq * dt
  s.springVel *= Math.exp(-w.snapDamping * dt)
  s.position += s.springVel * dt

  if (Math.abs(delta) < 8e-4 && Math.abs(s.springVel) < 0.004) {
    s.position = s.target          // exact integer, not merely near one
    s.springVel = 0
  }
}

/**
 * Drag. ΔL = −(Δx / width) × 6 × dragSensitivity — a six-disc drag span across
 * the viewport.
 *
 * `vel` is the per-event index DELTA, smoothed with a 0.32 lerp and clamped to
 * ±0.5 (half a disc per event, so one wild mousemove can never teleport the row).
 * Integrating it reproduces the drag offset exactly, and what is left on release
 * is the fling: friction 0.89 per 60 Hz frame coasts about 0.9 discs further.
 *
 * (It is a per-event delta, not an index-per-second rate: at 0.5/s a normal drag
 * could never cross six discs in any reasonable time.)
 */
export function dragStep (s, deltaX, width, w) {
  const dL = -(deltaX / width) * 6 * w.dragSensitivity
  s.vel += (dL - s.vel) * w.dragVelocitySmoothing
  s.vel = clamp(s.vel, -w.dragMaxVelocity, w.dragMaxVelocity)
  s.position = clamp(s.position + s.vel, s.lo, s.hi)
  s.springVel = 0
}