# Disc 3D Spec — geometry, materials, lighting

Everything below is verbatim from the shipped bundle unless marked **[inferred]**.

What this file does NOT own:

    motion maths, gallery transform source, arc layout   ->  motion-spec.md
    tokens, behaviour                                    ->  design-system.md
    render loop, perf budget, failure modes              ->  implementation.md
    why it is a disc, not a cassette                     ->  README.md "Naming correction"

---

## 1. Hierarchy

    scene
    ├─ AmbientLight, 3 × DirectionalLight, 1 × RectAreaLight
    ├─ environment (PMREM target)
    └─ gallery  (Group)           tilt + zoom, set once per frame (motion-spec.md §3.1)
       └─ <disc>                  (Group)   ← arc position + hover tilt + push offset
          ├─ spin                (Group)   ← spinX/spinY (flip) + pushRotX/pushRotY (wobble)
          │  ├─ front mesh       Ring,  z = +0.0056
          │  ├─ back mesh        Ring,  z = -0.0056, rotation.y = π
          │  ├─ edge mesh        Lathe
          │  ├─ hub mesh         Lathe
          │  ├─ matrix mesh      Lathe
          │  ├─ frost mesh       Lathe
          │  └─ pick mesh        Circle, visible false
          └─ scribble ring       (Group)   ← hover-only, regenerated at 10 fps

**Two groups is mandatory.** `group` owns position and the arc tangent; `spin` owns orientation and
the wobble rotation. As one object, the wobble rotation would fight `rotY = -θ` every frame.

`renderOrder` is set per frame (`motion-spec.md` §4.6) to force correct transparency sorting against
`transmission`: far discs get a lower `renderOrder`, so the transmission pass composites them before
near discs.

---

## 2. Radial dimensions

All radii are normalised so the disc's outer edge is `1.0` at unit scale: total diameter `2.0` world
units. With the camera of §5.1 a unit disc subtends roughly half the viewport height before the
gallery transform.

    ring                         inner r   outer r   source
    centre hole                  0         0.14      w.holeSize
    frosted clamp ring           0.14      0.174     derived
    matrix ring                  0.174     0.214     derived
    hub                          0.214     0.24      w.hubSize
    data area (front/back face)  0.24      0.974     w.hubSize → 1 − w.edgeBleed
    edge bevel                   0.974     1.0       w.edgeBleed

Derived radii, verbatim (the touch build repeats the same derivation with `K.` names):

```js
let r = Xt / 2,                       // Xt = holeSize * 2 = 0.28  →  r = 0.14
    a = Zt - r,                       // Zt = hubSize = 0.24        →  a = 0.10
    o = r + a * .34,                  //                             →  o = 0.174
    s = o + a * w.hubMatrixWidth,     // hubMatrixWidth = 0.4       →  s = 0.214
    c = Qt * 1.02                     // Qt = discThickness = 0.01  →  c = 0.0102
```

---

## 3. Geometry construction

### 3.1 Front and back faces

```js
let t = new THREE.RingGeometry(Zt, $t, 220, 1)     // Zt = 0.24, $t = 0.974
let n = new THREE.RingGeometry(Zt, $t, 220, 1)
an(t); an(n)                                        // planar UV remap
```

UV remap, verbatim — a `RingGeometry`'s default UVs are radial and unusable for artwork:

```js
let n = e.attributes.uv
for (let e = 0; e < t.count; e += 1)
  n.setXY(e, t.getX(e) / 1 * .5 + .5, t.getY(e) / 1 * .5 + .5)
n.needsUpdate = !0
```

Back face sits at `-Qt/2 - 0.0006` with `rotation.y = Math.PI`; front at `+Qt/2 + 0.0006`. The
`0.0006` offset is a z-fighting guard.

`220` radial segments on a `1.0`-radius ring is `2π/220 ≈ 0.0286` per segment (~0.9°) — smooth enough
that the silhouette reads as a circle at any realistic viewport.

### 3.2 Edge bevel — `LatheGeometry`

```js
function en() {
  let e  = Qt / 2,                                  // 0.005
      t  = .0015 + w.edgeBevel * Math.min(Qt * .55, .018),   // .0015 + 1 × .0055 = .007
      n  = 1 - w.edgeBleed,                         // 0.974
      r  = [
        new THREE.Vector2(n,  e),                   // (0.974,  0.005)
        new THREE.Vector2(1-t, e),                  // (0.993,  0.005)
        new THREE.Vector2(1,  e-t),                 // (1.000, -0.002)
        new THREE.Vector2(1, -e+t),                 // (1.000,  0.002)
        new THREE.Vector2(1-t, -e),                 // (0.993, -0.005)
        new THREE.Vector2(n, -e)                    // (0.974, -0.005)
      ],
      a = new THREE.LatheGeometry(r, 256)
  return a.computeVertexNormals(), a
}
```

6 profile points revolved 256 times — a **hexagonal chamfer**: flat top → 45° bevel → vertical wall →
45° bevel → flat bottom. `computeVertexNormals()` is required because `LatheGeometry` produces
averaged normals that band badly at the chamfer corners (call it on every lathe). `256` segments on
a 0.026-wide rim is deliberately over-tessellated: the rim catches the key light as a bright
specular line and any facet shows.

### 3.3 Hub, matrix ring, clamp ring — one shared lathe

```js
// verbatim from the app chunk (motion-spec.md §0), minified locals renamed to readable ones
function tn(innerR, outerR, thickness, ripple, segments = 160) {
  const o = thickness / 2                                // half thickness
  const s = Math.max(.002, innerR)                       // inner radius, floored
  const c = Math.max(1e-4, outerR - s)                   // radial width, floored
  const l = [
    new THREE.Vector2(s, -o),                            // 1. inner wall, bottom
    new THREE.Vector2(s,  o)                             // 2. inner wall, top
  ]

  // 3. outer face, bottom → top: 6 steps up the inner radius…
  for (let k = 0; k <= 5; k += 1) {
    const t  = k / 5
    const n  = s + c * t
    const z  = o * (1 - ripple) + o * ripple * (.6 + .4 * Math.cos(t * Math.PI * 3))
    l.push(new THREE.Vector2(n, z))
  }

  // 4.–5. the rim, stepped back in to 92 % of half-thickness so the rim
  //        reads as a chamfer rather than a square edge
  l.push(new THREE.Vector2(outerR,  o * .92))
  l.push(new THREE.Vector2(outerR, -o * .92))

  // 6. outer face, top → bottom: the same 6 steps, mirrored
  for (let k = 5; k >= 0; --k) {
    const t = k / 5
    const n = s + c * t
    const z = -(o * (1 - ripple) + o * ripple * (.6 + .4 * Math.cos(t * Math.PI * 3)))
    l.push(new THREE.Vector2(n, z))
  }

  const u = new THREE.LatheGeometry(l, segments)
  return u.computeVertexNormals(), u
}
```

The ripple, in isolation:

    z(t) = ± ( o·(1−ρ) + o·ρ·(0.6 + 0.4·cos(3π·t)) )

- `ρ` is the ripple depth (`0.22` hub, `0.12` matrix ring).
- `cos(3π·t)` over `t ∈ [0,1]` gives **1.5 cosine periods** across the face.
- The `0.6 + 0.4·cos(...)` weighting biases the wave so it does **not** start and end at the same
  height. A symmetric ripple reads as machined grooves; the asymmetry reads as moulded plastic.
- The two extra points at `(outerR, ±0.92·o)` pull the outer edge in from full thickness to `92 %`,
  giving the hub its rounded lip.

Call sites:

```js
e.hubGeometry    = tn(s, Zt, c, .22, 160)      // 0.214 → 0.24,  ripple .22, 160 segments
e.matrixGeometry = tn(o, s, c * .88, .12, ...) // 0.174 → 0.214, ripple .12, 88 % thickness
e.frostGeometry  = tn(r, o, c * .96, ...)      // 0.14  → 0.174, 96 % thickness
```

### 3.4 Pick mesh

```js
new THREE.CircleGeometry(1, 24)
// material: { visible: false, depthWrite: false }
// userData.index = disc index
```

`24` segments is deliberately low — raycast only, never rendered. `CircleGeometry` UVs are a clean
planar `0…1` mapping centred on the disc; that UV is what feeds the press tilt
(`motion-spec.md` §4.4).

### 3.5 Geometry budget

    mesh         type     segments   verts (approx)
    front face   Ring     220        442
    back face    Ring     220        442
    edge         Lathe    256        1 792
    hub          Lathe    160        ~1 120
    matrix       Lathe    128        ~900
    clamp        Lathe    128        ~900
    pick         Circle   24         26

≈ **5 600 verts per disc**, × 11 live discs ≈ 62 k. Trivial for any GPU; the cost is `transmission`
(`implementation.md` §12.1).

---

## 4. Materials

All six visible surfaces are `THREE.MeshPhysicalMaterial`.

### 4.1 Front (artwork)

```js
{
  roughness:  w.frontRough,               // 0.42
  metalness:  w.frontMetal,               // 0.48
  clearcoat:  w.frontClearcoat,           // 0.80
  clearcoatRoughness: .18 * (1 - w.texGloss),   // 0.18 × 0 = 0.0
  normalScale: new THREE.Vector2(.3, .3),
  envMapIntensity: .85,
  map: <canvas texture, 1024², circular clip>
  normalMap: <procedural worker normal map>
  roughnessMap: <procedural worker roughness map>
}
```

`clearcoatRoughness` collapses to `0` because `texGloss = 1`: the clearcoat is a perfect mirror layer
over the artwork — the wet, laminated look.

Procedural surface detail:

```js
texGrain: .59,        // → roughness map amplitude
texPrint: .35,        // → normal map, print/ink layer
texScratches: .36,    // → normal map, surface scratches
texGloss: 1
```

The site generates **normal and roughness maps in a Web Worker** rather than shipping texture files.
Value noise, verbatim:

```js
function valueNoise(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return value - Math.floor(value)
}
```

**The single highest-value trick to copy.** A 1024² procedural normal map gives a printed disc its
micro-scratches and ink texture for zero bytes of download and scales to any disc count. The formula
is arbitrary — replace it with any hash; only the decorrelation matters.

### 4.2 Back (iridescent)

```js
{
  color:     w.backBaseColor,            // '#1A1E2A'
  roughness: w.backRough,                // 0.23
  metalness: w.backMetal,                // 1.0
  clearcoat: w.backClearcoat,            // 0.34
  clearcoatRoughness: .06,
  iridescence: w.backIridescence,        // 1.0
  iridescenceIOR: w.backIridIOR,         // 1.86
  iridescenceThicknessRange: [140, 900], // w.backIridThickness = 900
  normalScale: new THREE.Vector2(.5, .5),
  envMapIntensity: 1.5,
  side: THREE.DoubleSide
}
```

`IOR 1.86` over `[140, 900]` nm gives the oil-slick rainbow on the reverse of a real disc.
`metalness: 1.0` on a near-black base is the correct model for a reflective data layer.

### 4.3 Edge

```js
{
  color: w.edgeColor,                    // '#FFFFFF'
  roughness: w.edgeRoughness,            // 0.04
  metalness: w.edgeMetalness,            // 0.55
  clearcoat: .7, clearcoatRoughness: .05,
  envMapIntensity: 1.8,
  side: THREE.DoubleSide
}
```

`envMapIntensity: 1.8` is the highest in the scene: the rim must read as a bright hairline against
the artwork, and at `roughness: 0.04` it acts almost as a mirror for the light rig.

### 4.4 Hub — transmissive

```js
{
  color: w.hubColor,                     // '#FFFFFF'
  roughness: w.hubRoughness,             // 0.38
  metalness: 0,
  transmission: w.hubTransmission,       // 0.68
  thickness: .6,
  ior: w.hubIOR,                         // 2.0
  clearcoat: 1.0, clearcoatRoughness: .04,
  envMapIntensity: 1.3,
  transparent: true,
  side: THREE.DoubleSide
}
```

`ior: 2.0` (water is 1.33) with `thickness: 0.6` gives a hard, glassy, almost diamond-like centre — the
frosted polycarbonate hub of a real disc. The most expensive material in the scene: `transmission`
needs a separate render pass.

### 4.5 Matrix ring — procedural texture

```js
{
  color: 0xDFDFEB,
  map: <512² canvas>,
  roughness: .28,
  metalness: .82,
  clearcoat: .7, clearcoatRoughness: .12,
  envMapIntensity: 1.45,
  side: THREE.DoubleSide
}
```

The 512² canvas is a radial gradient with four concentric tracks:

    #d9dde4  →  #f0f2f5  →  #cfd4dc  →  #b8bec8

This ring is what makes the render read as *optical media* at a glance rather than a generic circle.

### 4.6 Frosted clamp ring

```js
{
  color: 0xEEF1F5,
  roughness: .25 + w.hubFrostedEdge * .55,       // .25 + .54 × .55 = 0.547
  metalness: 0,
  transmission: (1 - w.hubFrostedEdge) * .5,     // (1 - .54) × .5 = 0.23
  thickness: .3, ior: 1.5,
  clearcoat: .4, clearcoatRoughness: .3,
  envMapIntensity: .9,
  transparent: true,
  side: THREE.DoubleSide
}
```

`hubFrostedEdge: 0.54` is a **master fader**: it drives roughness up *and* transmission down
together. `0` = clear glass, `1` = opaque matte; `0.54` lands just on the frosted side. Derive both
values from one token instead of setting them independently.

---

## 5. Camera, lighting, environment

### 5.1 Camera and fog

```js
scene.fog = new THREE.Fog(w.fogColor, 7, 14)          // '#FFFFFF', near 7, far 14
camera = new THREE.PerspectiveCamera(w.cameraFOV, 1, .1, 100)   // FOV 40, near 0.1, far 100
camera.position.set(0, 0, w.cameraDistance)                     // 4.4
camera.lookAt(0, 0, 0)
```

Fog starts at distance `7` and is fully opaque at `14`; with the camera at `4.4` it begins `2.6`
units past the camera, roughly at the `Δindex ≈ +2` disc once the gallery's `−30°/−30°` rotation
pushes far discs further out. Far discs dissolve into the white page instead of being clipped.

### 5.2 Gallery transform

Source and values (`−30° / −30° / 1.08`): `motion-spec.md` §3.1. The tilt is the single most
important compositional decision. It turns a row of circles into a row of **ellipses**, which:

- reads as depth immediately,
- creates a consistent specular sweep across the row as the light rig meets the varying normals,
- gives the `rotY = -θ` tangent rotation something to compose against.

### 5.3 Light rig — verbatim

```js
scene.add(new THREE.AmbientLight(0xFFFFFF, .25))

let key  = new THREE.DirectionalLight(w.keyColor, w.keyIntensity)   // #FFF9E8, 0.75
key.position.set(w.keyX, w.keyY, 6)                                // 3.5, -8, 6
scene.add(key)

let fill = new THREE.DirectionalLight(0xFFFFFF, w.fillIntensity)    // 0.30
fill.position.set(-5, -2, 4)
scene.add(fill)

let rim  = new THREE.DirectionalLight(w.rimColor, w.rimIntensity)   // #499FF5, 0.75
rim.position.set(0, 3, -6)
scene.add(rim)

let strip = new THREE.RectAreaLight(0xFFFFFF, w.topStripIntensity, 6, .4)   // intensity 1.9, 6 × 0.4
strip.position.set(0, 3.2, 3)
strip.lookAt(0, 0, 0)
scene.add(strip)
```

Two deliberate choices:

- **`#FFF9E8` key, `#499FF5` rim** — warm from below-right, cool from above-behind: a three-quarter
  cinematic key/fill/rim split with a warm/cool split, which makes the metallic edge read as chrome
  rather than grey plastic.
- **`RectAreaLight` at `(0, 3.2, 3)`** — a `6 × 0.4` soft strip above and in front draws a long
  horizontal highlight across the tops of every disc, the strongest single cue that these are
  reflective objects.

`RectAreaLight` requires `RectAreaLightUniformsLib` or it silently does nothing. The site guards it:

```js
async function ue() {
  if (window.THREE && window.RectAreaLightUniformsLib)
    return { THREE: window.THREE, RectAreaLightUniformsLib: window.RectAreaLightUniformsLib }
  if (!window.threeReady) throw Error(`Global Three.js is not available. ...`)
  let e = await window.threeReady
  return { THREE: e?.THREE || window.THREE, RectAreaLightUniformsLib: e?.RectAreaLightUniformsLib }
}
```

### 5.4 Procedural environment — no HDR file

```js
function Ut() {
  let e = A.get(X)
  if (!e) {
    let t   = _('environment', Wt)                        // 1024 × 512 canvas, memoised
    let n   = new THREE.CanvasTexture(t)
    n.mapping = THREE.EquirectangularReflectionMapping
    let r   = new THREE.PMREMGenerator(X)
    let a   = r.fromEquirectangular(n)
    n.dispose(); r.dispose()
    e = { target: a }
    A.set(X, e)
  }
  scene.environment = e.target.texture
  scene.environmentIntensity = w.environmentIntensity      // 1.0
}
```

The canvas, verbatim:

    // base gradient: vertical linear, (0,0) → (0,512)
    0.0 : '#25282f'
    0.5 : '#0e0f13'
    1.0 : '#020203'

    // then four horizontal soft bands, each:  centre y, half-height, peak opacity
    band 1 : 0.14 × 512, 0.07 × 512,  0.85 × 1.00 = 0.8500
    band 2 : 0.40 × 512, 0.049 × 512, 0.85 × 0.60 = 0.5100
    band 3 : 0.26 × 512, 0.077 × 512, 0.85 × 0.85 = 0.7225
    band 4 : 0.62 × 512, 0.035 × 512, 0.85 × 0.35 = 0.2975

**Four soft horizontal light bands on a near-black gradient** — a synthetic studio softbox rig.
Four rather than one gives the clearcoat several distinct specular streaks as discs rotate; a single
band gives one long highlight that looks wrong when it moves. The unequal opacities
(`1.00 / 0.60 / 0.85 / 0.35`) keep the streaks visibly different, not a repeating pattern.

**Zero network cost.** No `.hdr`; `PMREMGenerator.fromEquirectangular` does the roughness
pre-filtering.

### 5.5 Renderer

Verbatim (the touch build caps pixel ratio at `1.5`):

```js
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2))
renderer.outputColorSpace     = THREE.SRGBColorSpace
renderer.toneMapping          = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure  = w.exposure            // 0.86
renderer.setClearColor(0, 0)
'transmissionResolutionScale' in renderer && (renderer.transmissionResolutionScale = .5)

Object.assign(renderer.domElement.style, {
  position: 'absolute', inset: '0', width: '100%', height: '100%',
  display: 'block', background: 'transparent', pointerEvents: 'none'
})
```

`exposure: 0.86` under ACES Filmic: ACES already darkens; `0.86` keeps the white page from blowing out
while retaining highlight rolloff on the specular edges.

`transmissionResolutionScale = 0.5` halves the transmission render target and is non-negotiable while
you keep the transmissive hub and clamp ring. Cost model and fallbacks: `implementation.md` §12.1.

### 5.6 Compile pipeline

```js
try {
  typeof renderer.compileAsync == 'function'
    ? renderer.compileAsync(scene, camera).catch(() => {}).then(next)
    : (renderer.compile(scene, camera), next())
} catch { next() }
```

`compileAsync` (WebGL2 parallel shader compile) removes the multi-hundred-millisecond first-frame
stall; the site degrades to synchronous `compile`, then to nothing, each in a `try`. Run it during the
preloader, where nobody is looking.

---

## 6. Swapping in a cassette

If you want an actual cassette instead of a disc, replace §2–§4 only. Everything in
[`motion-spec.md`](./motion-spec.md) and [`design-system.md`](./design-system.md) §4 is
transform-level and transfers unchanged.

Minimum changes:

1. **Two reels instead of one hub.** Duplicate the lathe at `x = ±0.42`, radius `0.22`, with `spoke`
   teeth cut into the outer face (the `cos(3π·t)` ripple in `tn()` already does most of this —
   increase the ripple depth).
2. **Add continuous reel rotation.** The disc has no spinning part. A cassette needs
   `reel.rotation.z += ω * dt` with `ω` driven by scroll velocity and `0` when idle. Budget a fifth
   per-frame update.
3. **Add a shell.** A single `LatheGeometry` won't do — the shell needs a rectangular footprint with
   a window cut. `ExtrudeGeometry` from a `THREE.Shape` with a `THREE.Path` hole is the clean route.
   The shell is the cheapest mesh in the scene (flat planes, no lathe, no transmission); keep
   transmission on the window only.
4. **Replace the clearcoat/iridescence with acrylic.** `transmission: 0.9, ior: 1.49, thickness: 0.05,
   roughness: 0.05` on the window — cheap glass, no IOR 2.0 diamond trick.
5. **Keep `flightRecede`.** It is what makes the stack slide in from depth rather than popping.

Do **not** carry over: `iridescence` (wrong material model), the procedural value-noise normal map at
`.35` (print noise reads as dust on plastic), or the four-band softbox rig (a cassette is matte, so
three lights and no rim read better).
