/**
 * The two hand-authored easing curves. They are the whole signature vocabulary of
 * this motion system, and they share the control point (0.32, 0.72):
 * rise fast, then glide. The first ~32 % of the timeline covers ~72 % of the distance.
 *
 * motion-spec.md §1.1. Each falls back to a stock GSAP ease, exactly as the
 * reference does, so the system still runs if CustomEase is unavailable.
 */
import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'

gsap.registerPlugin(CustomEase)

let glide = 'power3.out'
let energy = 'power2.out'

try { CustomEase.create('discGlide', '0.32, 0.72, 0, 1'); glide = 'discGlide' } catch { /* fallback */ }
try { CustomEase.create('energy', 'M0,0 C0.32,0.72 0,1 1,1'); energy = 'energy' } catch { /* fallback */ }

export const glideEase = () => glide
export const energyEase = () => energy

/** The parsed `discGlide`, as a function of progress. Feeds the fan-in stagger. */
export const glideFn = () => gsap.parseEase(glide)

export { gsap }