/**
 * Loader progress P. motion-spec.md §2.3–§2.4, design-system.md §4.1.
 *
 * target = min(realAssetProgress, elapsed / 2.85)
 * P     += (target − P) × (1 − exp(−8 × dt))
 *
 * `minDuration` means a hot cache still gets a beat to breathe, and it guarantees
 * the intro always plays at full length. Because the target is non-decreasing and
 * the chase is a lerp toward it, P is monotonic: it never jumps, never goes back.
 */
import { clamp } from './config.js'

/**
 * The two-source progress number. Non-decreasing in every branch:
 *
 *   fonts not ready → min(actual, 0.9)
 *   scene still booting → sceneShare × clamp(elapsed / sceneCreep, 0, 1)
 *   otherwise → sceneShare + (1 − sceneShare) × (coversLoaded / coversTotal)
 *
 * `sceneShare` (0.18) reserves a slice of the bar for the 3D scene so the counter
 * is never at 100 % over an empty canvas. The 0.9 font cap stops the counter
 * finishing before the type is measurable.
 */
export function realAssetProgress (s, w) {
  const base = s.sceneReady
    ? (s.coversTotal ? w.sceneShare + (1 - w.sceneShare) * (s.coversLoaded / s.coversTotal) : 1)
    : w.sceneShare * clamp(s.elapsed / w.sceneCreep, 0, 1)
  return s.fontsReady ? base : Math.min(base, 0.9)
}

export function progressTarget (real, elapsed, w) {
  return Math.min(real, clamp(elapsed / w.minDuration, 0, 1))
}

/** One chase step. Returns the new P. Monotonic for a non-decreasing target. */
export function chase (P, target, dt, w) {
  let next = P + (target - P) * (1 - Math.exp(-w.chase * dt))
  if (target >= 1 && next > 0.995) next = 1                 // snap the last 0.5 %
  return next
}

/** Both conditions must hold: P >= beat.at AND elapsed >= beat.after. */
export function beatReady (beat, P, elapsed) {
  return P >= beat.at && elapsed >= beat.after
}

/** The preloader counter's year drum: `from` → `to`, easeInOutQuad. easeInOutQuad — year interpolation */
const easeInOutQuad = e => (e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2)

export function yearFromProgress (P, from, to) {
  return from + Math.floor(easeInOutQuad(clamp(P, 0, 1)) * (to - from))
}