/**
 * The ink: an animated noise field, contoured with marching squares into one
 * `clip-path: path(evenodd, …)`. motion-spec.md §12. Pure — no DOM, no three —
 * so determinism, closed loops and the scroll mapping are unit-tested.
 *
 * What is the reference's and what is this build's. §12.2 (`R`) and §12.3's
 * formulas are the reference's. §12.4 says the noise hash, the domain warp and
 * the walker were read but not transcribed; those are written here from the
 * summary table. §12.3 also elides `rest`, `b`, `C` and the apron — they are
 * reconstructed from `peek`, `wander` and `center` (see `contourLevel`, `inkField`)
 * and recorded in build-notes.md §4.
 *
 * Convention: y is px from the TOP of the clipped box. The path is the KEPT
 * region — the part of the hero still standing — so raising `level` keeps more.
 */

/**
 * `R` verbatim (§12.2). Read by this build: peek, wander, intro, center, centerX,
 * lifeSpeed, life, idleFps, surge, agitate, velocityRef, velocityEase, finish,
 * scale, warp, detail, minBlob, smooth, grid, seed, margin, noiseMean,
 * noiseSpread. The rest are the reference's cursor / theme / bleed keys.
 * `cursor` is 0 here: the cursor drops (§12.4) are not built.
 */
export const INK = {
  reach: 0.4, peek: 0.04, wander: 0.13, intro: 1.5, center: 0.13, centerX: 0.5, edge: 0.5, below: 0.4,
  life: 0.85, lifeSpeed: 0.15, lifeEdge: 0.15, idleFps: 60,
  cursor: 0, cursorReserve: 0.8, cursorBite: 0.5, cursorDrop: 90, cursorSpread: 2.6, cursorWobble: 0.22,
  cursorWake: 0.15, cursorGlide: 0.3, cursorTurn: 0.3, cursorSpeed: 900, cursorRise: 0.05, cursorRelax: 1.1,
  cursorBand: 120, cursorGuard: 110, cursorDrops: 28, cursorStep: 0.3, cursorStir: 1.3, cursorScatter: 0.35,
  cursorWobbleMax: 0.6, cursorThin: 0.9, cursorCoalesce: 6,
  surge: 0.55, agitate: 2.2, velocityRef: 2600, velocityEase: 0.13,
  finish: 0.85, themeAt: 0.45, bleedSafety: 0.85,
  scale: 230, warp: 1.25, detail: 0.16, minBlob: 45, smooth: 1, grid: 16, seed: 1, margin: 3,
  safety: 0.12, simplify: 0, noiseMean: 0.478, noiseSpread: 0.26,
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
/** §12.3 `Me` — smootherstep. */
export const smootherstep = e => { const t = clamp(e, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10) }

// ── noise ───────────────────────────────────────────────────────────────────

/** Integer lattice hash → [0, 1). Deterministic and platform-independent. */
export function hash2 (ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2147483647)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Bilinear value noise with a smootherstep fade — C2, so the contour has no creases. */
export function valueNoise (x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const fx = x - x0, fy = y - y0
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed)
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed)
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v
}

/** One noise layer: domain-warped (`warp`), plus a finer octave (`detail`). [0, 1]. */
export function layerNoise (x, y, seed, cfg) {
  const px = x / cfg.scale, py = y / cfg.scale
  const wx = (valueNoise(px * 0.8 + 13.7, py * 0.8 + 5.1, seed + 101) - 0.5) * cfg.warp
  const wy = (valueNoise(px * 0.8 + 3.3, py * 0.8 + 21.9, seed + 202) - 0.5) * cfg.warp
  const qx = px + wx, qy = py + wy
  const coarse = valueNoise(qx, qy, seed)
  const fine = valueNoise(qx * 2.7, qy * 2.7, seed + 303)
  return (coarse + cfg.detail * fine) / (1 + cfg.detail)
}

// ── the field ───────────────────────────────────────────────────────────────

/**
 * The two noise layers sampled once per grid node. Position-only, so they are
 * built once per box size; every frame afterwards only re-blends them with the
 * phase (§12.4 `n0·cos φ + n1·sin φ`) — which is the whole "boil".
 */
export function createField (width, height, cfg = INK) {
  const { grid, margin } = cfg
  const cols = Math.ceil(width / grid) + 2 * margin + 1
  const rows = Math.ceil(height / grid) + 2 * margin + 1
  const n = cols * rows
  const n0 = new Float32Array(n), n1 = new Float32Array(n)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i - margin) * grid, y = (j - margin) * grid
      n0[j * cols + i] = layerNoise(x, y, cfg.seed, cfg)
      n1[j * cols + i] = layerNoise(x, y, cfg.seed + 7919, cfg)
    }
  }
  return {
    width, height, cols, rows, cfg, n0, n1,
    values: new Float32Array(n),                 // scratch: f at every node
    px: new Float32Array(n * 2), py: new Float32Array(n * 2),   // crossing per edge key
    adjA: new Int32Array(n * 2), adjB: new Int32Array(n * 2),
    seen: new Uint8Array(n * 2),
  }
}

/** Largest |normalised noise| the φ-blend can reach: √2 · max(mean, 1 − mean) / spread. */
export const normMax = (cfg = INK) => Math.SQRT2 * Math.max(cfg.noiseMean, 1 - cfg.noiseMean) / cfg.noiseSpread

/**
 * The contour level (px from the top) for scroll progress `V`, intro `u` and
 * velocity surge `ne` px. §12.3, verbatim shape:
 *
 *   y = l − u·(l − (rest + V·(b − rest))) − ne·u
 *
 * `l` is where nothing is eaten (below the box by the noise's reach, so the
 * wander cannot nibble at the bottom edge before the intro), `rest` is the
 * level the intro settles on (`peek` of the hero already eaten) and `b` is
 * where the hero is fully gone (above the top by the noise's reach).
 */
export function contourLevel ({ height, V, u, ne = 0 }, cfg = INK) {
  const reach = cfg.wander * height * normMax(cfg) + cfg.grid
  const l = height + reach
  const rest = height * (1 - cfg.peek)
  const b = -reach
  return l - u * (l - (rest + clamp(V, 0, 1) * (b - rest))) - ne * u
}

/** Px of velocity surge at full speed (`Ne = Fe · m`). */
export const surgePx = (height, cfg = INK) => cfg.surge * cfg.peek * height

/**
 * §12.3 `Ke`: document scroll → V in [0, 1].
 *
 *   start = clamp(top bottom)  — the box's top reaches the viewport bottom, never < 0
 *   end   = top + height       — `height` is the scroll travel past `top`
 *   V     = clamp((scrollY − start) / (end − start) / finish)
 */
export function progress ({ scrollY, top, height, vh, finish = INK.finish }) {
  const start = Math.max(0, top - vh)
  const span = top + height - start
  const r = span > 0 ? (scrollY - start) / span : 0
  return clamp(finish < 1 ? r / Math.max(0.05, finish) : r, 0, 1)
}

// ── marching squares ────────────────────────────────────────────────────────
//
// Cell corners tl, tr, br, bl; bit order 8·tl + 4·tr + 2·br + 1·bl, inside = f < 0.
// Edges: 0 top, 1 right, 2 bottom, 3 left. Saddles (5, 10) resolve on the cell
// centre's mean so a pinched neck is cut or joined consistently from frame to
// frame instead of flickering.
const SEGMENTS = [
  [], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], null, [[0, 2]], [[0, 3]],
  [[0, 3]], [[0, 2]], null, [[0, 1]], [[3, 1]], [[1, 2]], [[2, 3]], [],
]

/** Share of R.wander / R.center the edge keeps at rest (see `evaluate`). */
const REST_WANDER = 0.3
const REST_DOME = 0.4

/** Fill `values` with f at every node: f < 0 is kept. */
function evaluate (field, level, phase) {
  const { cols, rows, cfg, n0, n1, values, width, height } = field
  const { grid, margin, noiseMean: mean, noiseSpread: spread } = cfg
  // Measured on the live page (round 4): at rest the reference shows a low, wide
  // hill of still — ~4–9 % of the height — not R.peek's 19 % plus a full-strength
  // wander. So the wander and the dome are held down at rest and grow to R's
  // full values as the edge eats up the page (g: 0 at rest → 1 hero gone).
  const reach = cfg.wander * height * normMax(cfg) + cfg.grid
  const rest = height * (1 - cfg.peek)
  const g = clamp((rest - level) / (rest + reach), 0, 1)
  const amp = cfg.wander * height * (REST_WANDER + (1 - REST_WANDER) * g)
  const dome = cfg.center * height * (REST_DOME + (1 - REST_DOME) * g)
  const cos = Math.cos(phase), sin = Math.sin(phase)
  const mixMean = mean * (cos + sin)
  for (let j = 0; j < rows; j++) {
    const y = (j - margin) * grid
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i
      if (i === 0 || j === 0 || i === cols - 1 || j === rows - 1) { values[k] = 1e9; continue }   // framed: always outside
      const x = (i - margin) * grid
      const nb = (n0[k] * cos + n1[k] * sin - mixMean) / spread
      const t = clamp((x / width - cfg.centerX) / 0.5, -1, 1)
      values[k] = (y - level) - amp * nb + dome * (1 - t * t)
    }
  }
}

/**
 * Closed polygons bounding the kept region of the box, as arrays of [x, y].
 * Loops with an area under `minBlob` px² are dropped (§12.4).
 */
export function contourLoops (field, { level, phase }, cfg = field.cfg) {
  evaluate(field, level, phase)
  const { cols, rows, values: f, px, py, adjA, adjB, seen } = field
  const { grid, margin } = cfg
  adjA.fill(-1); adjB.fill(-1); seen.fill(0)

  const hKey = (i, j) => (j * cols + i) * 2          // edge (i,j) → (i+1,j)
  const vKey = (i, j) => (j * cols + i) * 2 + 1      // edge (i,j) → (i,j+1)
  const link = (a, b) => {
    if (adjA[a] < 0) adjA[a] = b; else adjB[a] = b
    if (adjA[b] < 0) adjA[b] = a; else adjB[b] = a
  }
  const placeH = (i, j) => {
    const k = hKey(i, j), a = f[j * cols + i], b = f[j * cols + i + 1]
    px[k] = ((i - margin) + a / (a - b)) * grid; py[k] = (j - margin) * grid
    return k
  }
  const placeV = (i, j) => {
    const k = vKey(i, j), a = f[j * cols + i], b = f[(j + 1) * cols + i]
    px[k] = (i - margin) * grid; py[k] = ((j - margin) + a / (a - b)) * grid
    return k
  }

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const tl = f[j * cols + i], tr = f[j * cols + i + 1]
      const bl = f[(j + 1) * cols + i], br = f[(j + 1) * cols + i + 1]
      const idx = (tl < 0 ? 8 : 0) | (tr < 0 ? 4 : 0) | (br < 0 ? 2 : 0) | (bl < 0 ? 1 : 0)
      if (idx === 0 || idx === 15) continue
      let segs = SEGMENTS[idx]
      if (!segs) {
        const centreInside = (tl + tr + br + bl) < 0
        if (idx === 5) segs = centreInside ? [[0, 3], [2, 1]] : [[0, 1], [3, 2]]
        else segs = centreInside ? [[0, 1], [3, 2]] : [[0, 3], [2, 1]]
      }
      // edge → key, placing the crossing the first time an edge is touched
      const edge = e => (e === 0 ? placeH(i, j) : e === 2 ? placeH(i, j + 1) : e === 3 ? placeV(i, j) : placeV(i + 1, j))
      for (const [a, b] of segs) link(edge(a), edge(b))
    }
  }

  const loops = []
  const minBlob = cfg.minBlob
  for (let start = 0; start < adjA.length; start++) {
    if (adjA[start] < 0 || seen[start]) continue
    const pts = []
    let prev = -1, cur = start
    while (cur >= 0 && !seen[cur]) {
      seen[cur] = 1
      pts.push([px[cur], py[cur]])
      const next = adjA[cur] !== prev ? adjA[cur] : adjB[cur]
      prev = cur
      cur = next
    }
    if (pts.length < 3) continue
    if (Math.abs(polygonArea(pts)) < minBlob) continue
    loops.push(pts)
  }
  return loops
}

/** Signed shoelace area. */
export function polygonArea (pts) {
  let a = 0
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n]
    a += x0 * y1 - x1 * y0
  }
  return a / 2
}

const r1 = v => Math.round(v * 10) / 10

/**
 * One SVG path, every loop closed with `Z`. `smooth` rounds the corners with
 * quadratic curves through edge midpoints; 0 leaves the raw polygon.
 */
export function loopsToPath (loops, smooth = 1) {
  let d = ''
  for (const pts of loops) {
    const n = pts.length
    if (smooth > 0) {
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const m0 = mid(pts[n - 1], pts[0])
      d += `M${r1(m0[0])} ${r1(m0[1])}`
      for (let i = 0; i < n; i++) {
        const c = pts[i], m = mid(c, pts[(i + 1) % n])
        d += `Q${r1(c[0])} ${r1(c[1])} ${r1(m[0])} ${r1(m[1])}`
      }
    } else {
      d += `M${r1(pts[0][0])} ${r1(pts[0][1])}`
      for (let i = 1; i < n; i++) d += `L${r1(pts[i][0])} ${r1(pts[i][1])}`
    }
    d += 'Z'
  }
  return d
}

/** Even-odd ray cast: is `p` inside the polygon `poly` ([x, y] pairs)? Also the disc's click test (§13.5). */
export function insidePolygon (p, poly) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** Kept area of a set of loops under the even-odd rule — what the browser paints. */
export function keptArea (loops) {
  let total = 0
  loops.forEach((loop, i) => {
    let depth = 0
    loops.forEach((other, j) => { if (i !== j && insidePolygon(loop[0], other)) depth++ })
    total += (depth % 2 === 0 ? 1 : -1) * Math.abs(polygonArea(loop))
  })
  return total
}

let memo = null

/**
 * The whole pipeline for one frame: field → contour → path. Deterministic for a
 * given box, level, phase and config (seed included). The field is cached per box.
 */
export function inkPath (width, height, level, phase, cfg = INK) {
  if (!memo || memo.width !== width || memo.height !== height || memo.cfg !== cfg) memo = createField(width, height, cfg)
  return loopsToPath(contourLoops(memo, { level, phase }, cfg), cfg.smooth)
}
