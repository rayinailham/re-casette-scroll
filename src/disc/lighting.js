/**
 * The light rig. disc-3d-spec.md §5.3.
 *
 * Warm key from below-right, cool rim from above-behind — a standard
 * three-quarter cinematic key/fill/rim split with a deliberate warm/cool split.
 * It is what makes the metallic edge read as chrome rather than grey plastic.
 *
 * The 6 × 0.4 RectAreaLight strip above and in front draws a long horizontal
 * highlight across the tops of every disc in the row: the strongest single cue
 * that these are reflective objects. It requires RectAreaLightUniformsLib —
 * without it the strip silently does nothing.
 */
import {
  AmbientLight, DirectionalLight, RectAreaLight, Vector3,
} from 'three'
import { RectAreaLightUniformsLib } from '../../vendor/three/RectAreaLightUniformsLib.js'

let uniformsReady = false
function ensureUniforms () {
  if (uniformsReady) return
  RectAreaLightUniformsLib.init()
  uniformsReady = true
}

export function buildLighting (scene, w) {
  ensureUniforms()

  scene.add(new AmbientLight(0xFFFFFF, 0.25))

  const key = new DirectionalLight(w.keyColor, w.keyIntensity)   // #FFF9E8, 0.75
  key.position.set(w.keyX, w.keyY, 6)                            // 3.5, −8, 6
  scene.add(key)

  const fill = new DirectionalLight(0xFFFFFF, w.fillIntensity)   // 0.30
  fill.position.set(-5, -2, 4)
  scene.add(fill)

  const rim = new DirectionalLight(w.rimColor, w.rimIntensity)    // #499FF5, 0.75
  rim.position.set(0, 3, -6)
  scene.add(rim)

  const strip = new RectAreaLight(0xFFFFFF, w.topStripIntensity, 6, 0.4)  // 1.90
  strip.position.set(0, 3.2, 3)
  strip.lookAt(new Vector3(0, 0, 0))
  scene.add(strip)

  return { key, fill, rim, strip }
}