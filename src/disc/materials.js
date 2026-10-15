/**
 * The six visible surfaces. disc-3d-spec.md §4.
 *
 * All six are MeshPhysicalMaterial. Two things to carry across:
 *  · `clearcoatRoughness` collapses to 0 on the front face because gloss is
 *    maxed — the clearcoat is a perfect mirror over the artwork. Wet laminated look.
 *  · `hubFrostedEdge: 0.54` is a MASTER FADER driving roughness up AND
 *    transmission down together. Derive both from the one token.
 */
import {
  CanvasTexture, DoubleSide, MeshPhysicalMaterial, RepeatWrapping, SRGBColorSpace, Vector2,
} from 'three'

/**
 * The cover texture builder — disc-3d-spec.md §4.1.
 *
 * The annulus: outer radius t/2, hub punched out at t·0.12, even-odd clip so the
 * hub is genuinely absent rather than painted over. The supplied covers are
 * already 1024×1024, so the aspect fit is exact and nothing is cropped.
 */
export function buildCoverTexture (image, size = 1024, maxAnisotropy = 1) {
  const t = size
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = t
  const ctx = canvas.getContext('2d')

  ctx.beginPath()
  ctx.arc(t / 2, t / 2, t / 2, 0, Math.PI * 2)
  ctx.arc(t / 2, t / 2, t * 0.12, 0, Math.PI * 2, true)
  ctx.clip('evenodd')

  ctx.fillStyle = '#0c0c0e'
  ctx.fillRect(0, 0, t, t)

  // The supplied covers are already 1024×1024, so this aspect-preserving fit is
  // exact: scale 1, drawn at (0,0,1024,1024). Nothing cropped, nothing resized.
  const iw = image.naturalWidth || image.width
  const ih = image.naturalHeight || image.height
  const scale = t / Math.max(iw, ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(image, (t - dw) / 2, (t - dh) / 2, dw, dh)

  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = Math.min(8, maxAnisotropy)
  tex.needsUpdate = true
  return tex
}

/**
 * Procedural print/scratch normal + roughness maps. The single highest-value trick
 * in the whole build: a 1024² procedural normal map gives a printed disc its
 * micro-scratches and ink texture for ZERO bytes of download, and it scales to any
 * disc count. disc-3d-spec.md §4.1.
 */
function valueNoise (x, y) {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return v - Math.floor(v)
}

export function buildSurfaceMaps (w, size = 512) {
  const nrm = document.createElement('canvas'); nrm.width = nrm.height = size
  const rgh = document.createElement('canvas'); rgh.width = rgh.height = size
  const nc = nrm.getContext('2d'); const rc = rgh.getContext('2d')
  const nImg = nc.createImageData(size, size); const rImg = rc.createImageData(size, size)
  const inv = 1 / size

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const u = x * inv, v = y * inv
      // fine ink grain
      const grain = valueNoise(x * 0.9, y * 0.9) - 0.5
      // broad print mottling
      const print = valueNoise(x * 0.07, y * 0.07) - 0.5
      // directional scratches: strongly stretched in x
      const scr = valueNoise(x * 0.02, y * 2.6) - 0.5

      const nx = grain * w.texGrain * 0.9 + print * w.texPrint * 0.5 + scr * w.texScratches * 0.6
      const ny = grain * w.texGrain * 0.5 - print * w.texPrint * 0.5 + scr * w.texScratches * 0.35
      const nz = 1
      const len = Math.hypot(nx, ny, nz)

      nImg.data[i] = ((nx / len) * 0.5 + 0.5) * 255
      nImg.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255
      nImg.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255
      nImg.data[i + 3] = 255

      // three MULTIPLIES roughnessMap.g by material.roughness, so the map has to
      // sit near 1.0 for the spec'd 0.42 to survive — it carries grain variation
      // only, it does not set the roughness.
      const rough = Math.max(0.86, Math.min(1, 1 - Math.abs(grain * w.texGrain * 0.5 + Math.abs(scr) * w.texScratches * 0.4) * 0.22))
      const rv = rough * 255
      rImg.data[i] = rv; rImg.data[i + 1] = rv; rImg.data[i + 2] = rv; rImg.data[i + 3] = 255
    }
  }
  nc.putImageData(nImg, 0, 0)
  rc.putImageData(rImg, 0, 0)

  const normalMap = new CanvasTexture(nrm)
  const roughnessMap = new CanvasTexture(rgh)
  for (const t of [normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(3, 3)
  }
  return { normalMap, roughnessMap }
}

/** The matrix ring's 512² radial-gradient canvas with four concentric tracks. §4.5. */
function matrixRingTexture () {
  const size = 512
  const c = document.createElement('canvas'); c.width = c.height = size
  const ctx = c.getContext('2d')
  const stops = ['#d9dde4', '#f0f2f5', '#cfd4dc', '#b8bec8']
  const g = ctx.createLinearGradient(0, 0, 0, size)
  g.addColorStop(0.00, stops[0])
  g.addColorStop(0.34, stops[1])
  g.addColorStop(0.66, stops[2])
  g.addColorStop(1.00, stops[3])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  // four concentric tracks — this ring is what makes the render read as optical
  // media at a glance rather than as a generic circle
  ctx.strokeStyle = 'rgba(120,128,142,0.55)'
  for (let i = 0; i < 4; i++) {
    ctx.lineWidth = 2 + i
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size * (0.16 + i * 0.09), 0, Math.PI * 2)
    ctx.stroke()
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

export function buildMaterials (w) {
  const { normalMap, roughnessMap } = buildSurfaceMaps(w)

  return {
    front: new MeshPhysicalMaterial({
      roughness: w.frontRough,                       // 0.42
      metalness: w.frontMetal,                       // 0.48
      clearcoat: w.frontClearcoat,                   // 0.80
      // collapses to 0 because texGloss = 1 (max gloss): a perfect mirror layer
      clearcoatRoughness: 0.18 * (1 - w.texGloss),    // 0
      normalScale: new Vector2(0.3, 0.3),
      envMapIntensity: 0.85,
      normalMap,
      roughnessMap,
    }),

    back: new MeshPhysicalMaterial({
      color: w.backBaseColor,                        // '#1A1E2A'
      roughness: w.backRough,                        // 0.23
      metalness: w.backMetal,                        // 1.0
      clearcoat: w.backClearcoat,                    // 0.34
      clearcoatRoughness: 0.06,
      iridescence: w.backIridescence,                // 1.0
      iridescenceIOR: w.backIridIOR,                 // 1.86
      iridescenceThicknessRange: [140, w.backIridThickness],  // [140, 900]
      normalScale: new Vector2(0.5, 0.5),
      envMapIntensity: 1.5,
      side: DoubleSide,
    }),

    edge: new MeshPhysicalMaterial({
      color: w.edgeColor,                            // '#FFFFFF'
      roughness: w.edgeRoughness,                    // 0.04
      metalness: w.edgeMetalness,                    // 0.55
      clearcoat: 0.7, clearcoatRoughness: 0.05,
      envMapIntensity: 1.8,                          // highest in the scene
      side: DoubleSide,
    }),

    hub: new MeshPhysicalMaterial({
      color: w.hubColor,                             // '#FFFFFF'
      roughness: w.hubRoughness,                     // 0.38
      metalness: 0,
      transmission: w.hubTransmission,               // 0.68
      thickness: 0.6,
      ior: w.hubIOR,                                 // 2.0 — glassy, almost diamond
      clearcoat: 1.0, clearcoatRoughness: 0.04,
      envMapIntensity: 1.3,
      transparent: true,
      side: DoubleSide,
    }),

    matrix: new MeshPhysicalMaterial({
      color: 0xDFDFEB,
      map: matrixRingTexture(),
      roughness: 0.28,
      metalness: 0.82,
      clearcoat: 0.7, clearcoatRoughness: 0.12,
      envMapIntensity: 1.45,
      side: DoubleSide,
    }),

    frost: new MeshPhysicalMaterial({
      color: 0xEEF1F5,
      // hubFrostedEdge is the master fader — derive BOTH from the one token
      roughness: 0.25 + w.hubFrostedEdge * 0.55,     // 0.547
      metalness: 0,
      transmission: (1 - w.hubFrostedEdge) * 0.5,    // 0.23
      thickness: 0.3, ior: 1.5,
      clearcoat: 0.4, clearcoatRoughness: 0.3,
      envMapIntensity: 0.9,
      transparent: true,
      side: DoubleSide,
    }),
  }
}