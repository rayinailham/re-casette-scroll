/**
 * Procedural studio environment — NO HDR FILE. disc-3d-spec.md §5.4.
 *
 * A 1024×512 canvas: a near-black vertical gradient plus FOUR soft horizontal
 * light bands at deliberately unequal opacities (1.00 / 0.60 / 0.85 / 0.35),
 * run through PMREMGenerator.fromEquirectangular.
 *
 * Four bands rather than one gives the clearcoat layer multiple distinct specular
 * streaks as the discs rotate — a single band produces one long highlight that
 * looks wrong when it moves. Zero network cost, and it scales to any disc count.
 */
import { CanvasTexture, EquirectangularReflectionMapping, PMREMGenerator } from 'three'

export const ENV_BANDS = [
  { y: 0.14, half: 0.070, peak: 0.85 * 1.00 },   // 0.8500
  { y: 0.40, half: 0.049, peak: 0.85 * 0.60 },   // 0.5100
  { y: 0.26, half: 0.077, peak: 0.85 * 0.85 },   // 0.7225
  { y: 0.62, half: 0.035, peak: 0.85 * 0.35 },   // 0.2975
]

export function buildEnvironmentCanvas (width = 1024, height = 512) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const base = ctx.createLinearGradient(0, 0, 0, height)
  base.addColorStop(0.0, '#25282f')
  base.addColorStop(0.5, '#0e0f13')
  base.addColorStop(1.0, '#020203')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, width, height)

  ctx.globalCompositeOperation = 'lighter'
  for (const band of ENV_BANDS) {
    const cy = band.y * height
    const ch = band.half * height
    const g = ctx.createLinearGradient(0, cy - ch, 0, cy + ch)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, `rgba(255,255,255,${band.peak})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, cy - ch, width, ch * 2)
  }
  ctx.globalCompositeOperation = 'source-over'

  return canvas
}

export function buildEnvironment (renderer, w) {
  const equi = new CanvasTexture(buildEnvironmentCanvas())
  equi.mapping = EquirectangularReflectionMapping

  const pmrem = new PMREMGenerator(renderer)
  const target = pmrem.fromEquirectangular(equi)
  equi.dispose()
  pmrem.dispose()

  return target.texture
}