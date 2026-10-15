/**
 * The intro pose — a PURE FUNCTION of loader progress P.
 *
 * Nothing here reads a clock or a timeline. Change P and the disc lands in a
 * new, consistent pose, which is why the intro can be scrubbed, reversed, or
 * stretched by a slow connection without a single special case.
 *
 * Three different exponents on three different channels. Do not unify them:
 *   turn  2.4  — turns fast, faces you while still small
 *   grow  2    — medium
 *   rise  3    — slowest, so the disc is already facing camera and near-full-size
 *                 while it is still travelling
 * Their desynchronisation is what makes the motion read as physical rather than
 * as one rigid tween.
 *
 * motion-spec.md §1.2 / §2.3 / §2.10, design-system.md §4.2, implementation.md §10.
 */
import { clamp } from './config.js'

export const easeTurn = e => 1 - Math.pow(1 - e, 2.4)
export const easeRise = e => 1 - Math.pow(1 - e, 3)

export function introPose (P, w) {
  const o = w.riseAfter                                     // 0.03
  const riseInput = clamp((P - o) / (1 - o), 0, 1)
  const turnInput = clamp((P - o) / (w.turnBy - o), 0, 1)    // turnBy 0.8

  const rise = easeRise(riseInput)
  const turn = easeTurn(turnInput)
  const grow = Math.min(1, rise / w.preloadGrowBy)          // preloadGrowBy 0.5
  const active = Math.max(0.001, w.preloadBoost * (1 - (1 - grow) * (1 - grow)))

  const turnT = 1 - turn                                    // 1 at start, 0 at end
  const riseT = 1 - rise

  return {
    riseInput, turnInput, rise, turn, grow, active,
    spinY: -(Math.PI / 2) * turnT,       // edge-on −90° → face-on
    spinZ: w.preloadSpin * turnT * turnT, // 1.1 rad, quadratic release — settles late
    offsetY: -w.preloadRiseFrom * riseT,  // −3.0
    offsetZ: -w.preloadRiseDepth * riseT, // −0.7
  }
}

/**
 * The rise offset, authored in gallery-local units, converted into parent space:
 * divide by the gallery zoom, then undo the gallery rotation. Adding this to the
 * disc's LOCAL arc target makes the rise vertical on screen; a naive (0, −3, −0.7)
 * in world space would slide diagonally. See motion-spec.md §2.10.
 *
 * Algebra:  worldTarget = q·(arcLocal)·s + offset
 *        ⟹  arcLocal′  = q⁻¹·(offset / s) + arcLocal
 */
export function riseOffsetIntoLocal (out, galleryScale, invGalleryQuat) {
  return out.divideScalar(galleryScale).applyQuaternion(invGalleryQuat)
}