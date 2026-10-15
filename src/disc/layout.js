/**
 * The arc. This is THE arc function — there is exactly one of it in the
 * codebase, shared by both collections.
 *
 * An ellipse in the XZ plane, stepped by index. Not a spline, not a Bezier.
 *   motion-spec.md §3.2 / design-system.md §4.3 / implementation.md §4
 */
import { clamp } from './config.js'

/** rad per disc — 20.054° per neighbour */
export const ARC_STEP = 0.35

/**
 * `m` is the FLOAT relative index (disc global index − scrollPosition).
 * The fractional part is what produces smooth motion.
 */
export function arcPosition (m, w) {
  const theta = m * ARC_STEP
  const Rx = w.hGap * 2.4                                        // 5.52
  const Rz = Math.max(w.discThickness * 3, 0.12, w.depthGap) * 2.4 // 2.4
  return {
    x: Math.sin(theta) * Rx,               // sin θ · 5.52
    y: 0,
    z: (1 - Math.cos(theta)) * Rz,         // (1 − cos θ) · 2.4
    rotY: -theta,                          // arc tangent
  }
}

/**
 * `x` peaks at m ≈ +4.49 (the sin apex at θ = π/2) and then REVERSES — at m = +5
 * the disc has moved back left while receding in Z. That reversal is load-bearing:
 * it is what makes the ribbon read as a curve with a far side.
 */
export function arcApex () { return Math.PI / 2 / ARC_STEP }     // ≈ 4.488

export function arcScale (m, isActive, w, coarse) {
  if (isActive) return 1
  const h = Math.abs(m)
  return Math.max(w.inactiveScale, 1 - h * (1 - w.inactiveScale) * (coarse ? 1 : 0.6))
}

/** Per-disc follow rate: drops with distance from the lead. */
export function followRate (h, dragging, w) {
  const base = dragging ? w.followTight : w.followBase
  return clamp(base - h * w.followFalloff, w.followMin, w.followTight)
}

/**
 * Flow lean. `sqrt` on velocity means a gentle flick produces a DISPROPORTIONATE
 * lean — the ribbon banks into fast motion and hangs into slow motion.
 */
export function flowLean (velocity, canFlow, w) {
  if (!canFlow) return { lean: 0, dip: 0 }
  const lean = clamp(
    Math.sign(velocity) * Math.sqrt(Math.abs(velocity)) * w.flowLean,
    -w.flowLeanMax, w.flowLeanMax
  )
  const dip = Math.min(w.flowDipMax, Math.abs(velocity) * w.flowDip)
  return { lean, dip }
}

/**
 * Fan-in stagger. `others` is one scalar (0 → 1); this distributes it per disc
 * by distance so the row assembles from the leader outwards.
 * `glide` is the parsed `discGlide` CustomEase (power3.out fallback), injected so
 * this stays pure and unit-testable.
 */
export function staggerFactor (others, h, inbound, glide, w) {
  const e = clamp(others, 0, 2)
  const spread = clamp(inbound ? w.flightStaggerIn : w.flightStagger, 0, 0.9)
  const maxDelay = Math.max(1, Math.round(w.flightStaggerMax))
  const delay = (Math.min(h, maxDelay) / maxDelay) * spread
  const window = Math.max(0.1, 1 - spread)
  const local = clamp((Math.min(1, e) - delay) / window, 0, 1)
  return (inbound ? glide(local) : local * (2 - local)) + Math.max(0, e - 1)
}

export function staggerVisible (s, inbound, w) {
  return s > clamp(inbound ? w.flightPopScaleIn : w.flightPopScale, 0, 0.9)
}