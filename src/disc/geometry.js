/**
 * Disc geometry. disc-3d-spec.md §2–§3.
 *
 * RingGeometry pair for the faces, four LatheGeometry profiles for the rim, hub,
 * matrix ring and frosted clamp ring. ~5 600 verts per disc.
 */
import {
  CircleGeometry, DoubleSide, LatheGeometry, Mesh, MeshBasicMaterial,
  RingGeometry, Vector2,
} from 'three'

/** Derived radii, verbatim from disc-3d-spec.md §2. */
export function discRadii (w) {
  const hole = w.holeSize                                   // 0.14
  const hub = w.hubSize                                     // 0.24
  const band = hub - hole                                   // 0.10
  const clamp = hole + band * 0.34                          // 0.174
  const matrix = clamp + band * w.hubMatrixWidth            // 0.214
  const edge = 1 - w.edgeBleed                              // 0.974
  const half = w.discThickness / 2                          // 0.005
  return { hole, hub, clamp, matrix, edge, half, band, guard: 0.0006 }
}

/**
 * Planar UV remap. A RingGeometry's default UVs are radial and unusable for
 * artwork — verbatim from disc-3d-spec.md §3.1.
 */
function planarUV (geo) {
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, geo.attributes.position.getX(i) * 0.5 + 0.5,
                geo.attributes.position.getY(i) * 0.5 + 0.5)
  }
  uv.needsUpdate = true
  return geo
}

/** Edge bevel — hexagonal chamfer, 256 segments. §3.2. */
function edgeBevel (w) {
  const e = w.discThickness / 2                              // 0.005
  const t = 0.0015 + w.edgeBevel * Math.min(w.discThickness * 0.55, 0.018) // 0.007
  const n = 1 - w.edgeBleed                                  // 0.974
  const profile = [
    new Vector2(n, e), new Vector2(1 - t, e), new Vector2(1, e - t),
    new Vector2(1, -e + t), new Vector2(1 - t, -e), new Vector2(n, -e),
  ]
  const g = new LatheGeometry(profile, 256)
  g.computeVertexNormals()   // LatheGeometry's averaged normals band badly at the chamfer
  return layFlat(g)
}

/**
 * LatheGeometry revolves a profile around the **Y** axis. A disc's axis is **Z**,
 * so every lathed part has to be laid on its side. Without this the hub, matrix
 * ring, clamp ring and edge bevel render as flat washers lying in the XZ plane.
 *   rotateX(+90°) maps profile +Y → +Z, which puts the front face at +Z.
 */
function layFlat (geo) {
  geo.rotateX(Math.PI / 2)
  return geo
}

/**
 * Hub / matrix / clamp — one shared lathe. §3.3.
 *
 * The ripple weighting `0.6 + 0.4·cos(3πt)` biases the wave so it does NOT start
 * and end at the same height. A symmetric ripple reads as a machined groove
 * pattern; the asymmetry reads as a moulded plastic surface.
 */
function ringLathe (innerR, outerR, thickness, ripple, segments = 160) {
  const o = thickness / 2
  const s = Math.max(0.002, innerR)
  const c = Math.max(1e-4, outerR - s)
  const profile = [new Vector2(s, -o), new Vector2(s, o)]

  for (let k = 0; k <= 5; k++) {                             // outer face, bottom → top
    const t = k / 5
    const z = o * (1 - ripple) + o * ripple * (0.6 + 0.4 * Math.cos(t * Math.PI * 3))
    profile.push(new Vector2(s + c * t, z))
  }
  // rim chamfer: pull the outer edge in to 92 % of half-thickness
  profile.push(new Vector2(outerR, o * 0.92), new Vector2(outerR, -o * 0.92))
  for (let k = 5; k >= 0; --k) {                             // outer face, top → bottom
    const t = k / 5
    const z = -(o * (1 - ripple) + o * ripple * (0.6 + 0.4 * Math.cos(t * Math.PI * 3)))
    profile.push(new Vector2(s + c * t, z))
  }

  const g = new LatheGeometry(profile, segments)
  g.computeVertexNormals()
  return layFlat(g)
}

/**
 * Build every piece of ONE disc. Geometries are shared across all 20 discs —
 * the only per-disc data is the cover texture.
 */
export function buildDiscGeometries (w) {
  const R = discRadii(w)
  const front = planarUV(new RingGeometry(R.hub, R.edge, 220, 1))
  const back = planarUV(new RingGeometry(R.hub, R.edge, 220, 1))
  return {
    radii: R,
    front,
    back,
    edge: edgeBevel(w),
    hub: ringLathe(R.matrix, R.hub, R.band, 0.22, 160),
    matrix: ringLathe(R.clamp, R.matrix, R.band * 0.88, 0.12, 128),
    frost: ringLathe(R.hole, R.clamp, R.band * 0.96, 0.12, 128),
    pick: new CircleGeometry(1, 24),
  }
}

/**
 * Twenty disc nodes, built once, up front. Every disc for BOTH sections exists
 * from the first frame — switching sections must not create geometry.
 *
 * Two-group hierarchy is mandatory: `group` owns position and the arc tangent,
 * `spin` owns orientation and the wobble rotation. Merged, the wobble rotation
 * fights `rotY = −θ` every frame.
 */
export function buildDiscGroups (geo, mats, count = 20) {
  const out = []
  for (let i = 0; i < count; i++) {
    const group = new Mesh()
    group.name = `disc-${i}`

    const spin = new Mesh()
    spin.name = `disc-${i}-spin`

    const front = new Mesh(geo.front, mats.front)
    front.position.z = geo.radii.half + geo.radii.guard    // z-fighting guard
    const back = new Mesh(geo.back, mats.back)
    back.position.z = -(geo.radii.half + geo.radii.guard)
    back.rotation.y = Math.PI

    const edge = new Mesh(geo.edge, mats.edge)
    const hub = new Mesh(geo.hub, mats.hub)
    const matrix = new Mesh(geo.matrix, mats.matrix)
    const frost = new Mesh(geo.frost, mats.frost)

    // Never rendered — it exists only for the raycast, and its UV is what feeds
    // the press tilt. CircleGeometry UVs are a clean centred planar 0…1 mapping.
    // DoubleSide: the raycaster honours `side`, so a one-sided pick is invisible
    // to it once the disc is flipped to its back — no hover, no click, no way back.
    const pick = new Mesh(geo.pick, new MeshBasicMaterial({ visible: false, depthWrite: false, side: DoubleSide }))
    pick.userData.index = i

    spin.add(front, back, edge, hub, matrix, frost, pick)
    group.add(spin)

    group.visible = false
    out.push({ group, spin, front, back, edge, hub, matrix, frost, pick })
  }
  return out
}

export { planarUV }