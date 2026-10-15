/**
 * The pure numbers of the detail open. motion-spec.md §11.7 (`_r`). No three, so
 * the formulas are unit-tested; gallery.js owns the timeline that uses them.
 */
import { clamp } from './config.js'

/** Seconds to centre the lead on its detent before the press starts. */
export function snapDuration (dist) {
  return dist < 0.002 ? 0 : clamp(0.12 + dist * 0.25, 0.12, 0.4)
}

/**
 * The next EDGE-ON angle at or beyond `spinY + exitSpin`: π/2 + kπ. Landing on a
 * multiple of π would end the exit face-on, with the disc at scale .001.
 */
export function exitSpinTarget (spinY, exitSpin) {
  const k = Math.ceil((spinY + exitSpin - Math.PI / 2) / Math.PI - 1e-6)
  return Math.PI / 2 + k * Math.PI
}

/**
 * When the page may take over, in seconds on the exit timeline: the moment the
 * others have finished fading or the lead has finished leaving, whichever is first.
 */
export function handOverAt ({ snap, pressTime, springTime, outDuration, exitDuration }) {
  const m = snap * 0.6
  return Math.min(m + pressTime + outDuration, m + pressTime + springTime + exitDuration)
}
