# Evidence & Provenance

What was observed, how, and how confident to be. This file owns provenance and confidence only —
the claims themselves live in the spec files named in the ledger.

---

## 1. Method

Three capture rounds. Round 1 established the geometry and the loader; round 2 (below) closed the
counter, the text transitions and the scroll mechanics; round 3 (§8) read the page transitions,
the ink dissolve and the scroll-next disc.

    stage                  tool                                              result
    ── round 1 ─────────────────────────────────────────────────────────────────────────────
    Navigate + filmstrip   rea_capture_browser_scenario (Chromium 1243,      6 screenshots across the intro timeline
                           headless, 1440×900)                               + full DOM + all JS response bodies
    Library fingerprint    grep over the decoded bundles                     GSAP, ScrollTrigger, CustomEase, SplitText,
                                                                             Lenis, THREE.js confirmed present
    Config extraction      Python substring extraction over decoded bundle   the full `c` config object, verbatim
    Behavioural extraction Python substring extraction + grep                intro pose, arc layout, physics integrator,
                                                                             eases, Lenis config, text transitions
    Stylesheet             curl /_astro/ExportPage.DV5vD961.css              167 496 bytes, all relevant rules extracted
    Numeric verification   python3 recomputation of the arc table            §4.2

    ── round 2 ─────────────────────────────────────────────────────────────────────────────
    Timed intro filmstrip  rea_capture_browser_scenario, 9 timed waits       10 screenshots at 1.1 s … 21.7 s, WebGL live
                           with screenshot after each step                    (ANGLE software GL; only a GPU-stall warning)
    Script-source capture  Chrome 149 on 127.0.0.1:9333, then                9 scripts, all with digests
                           rea_inspect_web_page(include_script_sources)      (source: ev_75b654c8…)
    Script materialisation rea_export_web_scripts                            digest-verified files + manifest.json
    Static analysis        rea_analyze_javascript_application (directory)     9 files, 1.39 MB, 371 080 AST nodes,
                                                                             authority: shipped-artifact
    Stylesheet             curl /_astro/ExportPage.DV5vD961.css              same URL, sha256 7b7f7dec…, content
                                                                             identical to round 1 (167 496 bytes)

Round 2 ran 21.7 s wall-clock for 10 frames. It returned an inline MCP response over budget; the
complete evidence (8 321 653 bytes, 1 record) was written to a scratch file — not retained — and read
from disk rather than truncated. The script export is likewise digest-addressed, so every line quoted
in the spec files can be traced back to the app chunk's sha256 (§3).

**The response bodies arrived base64-encoded.** Every JS file was decoded before analysis; a naive
`grep` over the raw capture finds nothing, which is why the first fingerprint pass came back empty.

---

## 2. Target

    URL                       https://a24.raviklaassens.com/
    Title                     A24 — Films
    Content                   12 film entries in application/ld+json ItemList
    Captured at               2026-10-14
    Browser                   Chromium 1243 (Playwright build), headless, deviceScaleFactor 1
    Viewport                  1440 × 900
    prefers-reduced-motion    no-preference (animations observed live)
    Service workers           blocked

Captured state: the preloader had **not** completed at the first screenshot — a grey page, tiny
edge-on disc centre-screen, `A24 Films` bottom-left, `2012` bottom-right, `Projecting ↻` in the nav.
The settled state shows the full row. (The capture screenshots are not kept in this repo; the frame
table below is the record.)

### Round 2 — the intro, timed

Same URL, same viewport, Chrome 149 headless at 127.0.0.1:9333, nine timed waits with a screenshot
after each. WebGL rendered through ANGLE's software rasteriser (a `GPU stall due to ReadPixels`
performance warning is the only console output; no errors). Lead film on this load was `Backrooms`.

Ten frames were captured; the whole scenario ran 21.7 s. Times below are **cumulative from scenario
start**, which is what the reported per-step `elapsed_ms` values sum to — the waits themselves
overshot their nominal durations (headless WebGL init and shader compile are slow), so the nominal
labels (`t0400`, `t1500`, …) do not correspond to wall-clock. What matters here is the *order* and
*content*, not the absolute clock.

    cumulative   frame shows
    ~1.1 s       blank grey page — first paint, before the preloader paints
    ~4.5 s       edge-on sliver centre-screen, counter mid-roll as `A23` BELOW the disc,
                 `A24 Films` left, `2012` right, `A24  Projecting ↻` in the nav
    ~7.6 s       disc face-on and tilted; counter `41` at the disc's LEFT; year `2021`
    ~9.6 s       counter `73` upper-left of the disc; year `2024`
    ~12.2 s      counter gone entirely; nav down to `A24` only; next disc sliding in from the right
    ~21.5 s      settled: top-left copy (`BACKROOMS` + 3 rule/label/value rows),
                 nav `Films • Television  Index ⌄`, and TWO critic cards at the
                 bottom centre — `★★★★★ THE PLAYLIST "SOMETHING FAR MORE HAUNTING"`
                 and `★★★★½ THE DAILY BEAST "CASTS A SURREALISTIC SPELL"`

The absolute timings are **not** usable as the intro's design durations: software GL stretched the
loader well past its 2.85 s floor. What the frames do establish is the *sequence* — counter below →
left → upper-left → absent — and the settled layout. Durations come from the bundle, not from here.

This is the direct observational confirmation of three claims:

- the counter **orbits** the disc rather than sitting centred (`motion-spec.md` §2.6);
- the counter's **exit is not a fixed-duration tween** — it is gone well before the fan-out finishes,
  which is what the growth-coupled mechanic in `motion-spec.md` §2.9 predicts;
- the bottom-centre row is **two critic cards**, not one quote (`design-system.md` §4.7).

Accessibility tree at the settled frame, verbatim:

    group "Film disc gallery":
      heading "Discover the A24 library of Films" [level=1]
      paragraph: Backrooms
      paragraph: DIRECTED BY          paragraph: Kane Parsons
      paragraph: YEAR                 paragraph: "2026"
      paragraph: STARRING             paragraph: Chiwetel Ejiofor Renate Reinsve
      img "5 out of 5 stars"          paragraph: The Playlist
      paragraph: “Something Far More Haunting”
      img "4.5 out of 5 stars"        paragraph: The Daily Beast
      paragraph: “Casts A Surrealistic Spell”
      paragraph: Backrooms, 1 of 12

The half star is exposed as `4.5 out of 5 stars` on the container — unrounded, all five `.star`
children `aria-hidden` (`motion-spec.md` §10.2).

---

## 3. Source artifacts

    #    file                      bytes     contents
    1    000.html                  59 352    page HTML, Astro/Webflow export, 12 films
    2    001.js                    312       Astro modulepreload polyfill
    3    002.js                    1 342     Astro createElement polyfill
    4    003.js / 004.js           4 810     text-balance polyfill
    5    008.js                    177 648   Astro preloader (string references to gsap/three/lenis plugins)
    6    009.js                    12 853    Astro dev helpers
    7    010.js                    247 280   THREE.js core
    8    011.js                    263 989   the gallery, preloader, physics, transitions   ← target
    9    012.js                    5 599     value noise + clamp helpers
    10   013.js                    684 230   app data (film metadata, routes)
    11   014.html                  69 808    second page (a film detail page)
    12   ExportPage.DV5vD961.css   167 496   stylesheet

`011.js` is minified by esbuild: newlines preserved, local identifiers 1–3 chars, string literals
intact — grep-able by distinctive token.

**Search anchors in `011.js`:** `preloadBoost`, `discGlide`, `w.pushDamping`, `w.hGap`,
`CustomEase.create`, `new Lenis`, `disc-line-mask`, `minDuration`.

### Round 2 — named artifacts and digests

Round 1's numbered filenames came from a flattened capture. Round 2 captured the **real** Astro asset
names, which are content-hashed per deploy. The app chunk is byte-identical in length (263 989) to
round 1's `011.js`, so the two rounds read the same code.

    file                                              bytes     sha256
    _astro/main.qdXy8l6N.js                           263 989   7f61e9af50bf810ea58f85d9f04313155faff1b3e50dcee1d292e080468ac72c
    _astro/ExportPage.DV5vD961.css                    167 496   7b7f7dec055384e991229c40553f6ed1cd584bb79cd9ab136ba5c3f4b36dc53c
    _astro/bootstrap.dru0MhUJ.js                      177 648   b31db87fdcae7af98ba55947e08a559341b9d8ded5cb7c209fa17c561c2b4c12
    _astro/preload-helper.CxFQXtKk.js                   1 342   b39ea8a0a9ff7dd6b08f09d4cc161dbfc41f2039d1606fecbaed8f165af4070d
    _astro/three.module.B1_OyRqk.js                   684 230   8925f89a2df5feb4f341e2962ca1473c8830ceca367482afcb0d2cd566d971c1
    _astro/three.module.CFOTFKy5.js                    12 853   2193112313a94202233554a1391c96f7f1fb7aa47ba49667c6ed73b093e16e50
    _astro/RectAreaLightUniformsLib.DJtkkHJU.js       247 280   a632ceca23c3e66085ea0885e5b8a58221ae5050e94d7c07fbd4ca28e83aa24a
    _astro/ExportPage.astro_astro_type_script_index_0_lang.DQlUkOwJ.js
                                                         312   602f00b1d1b4a3d219639748d4dc17cd3d861ba354d1d0a0ce8e0304fd8c0865

Round 1 listed a 5 599-byte `012.js` (value noise + clamp) and a 684 230-byte `013.js` (app data).
Round 2 did **not** surface those two: the 684 230-byte entry is now `three.module.B1_OyRqk.js`, and
no 5 599-byte script was observed. So **round 1's `013.js` label was wrong** — that byte count is
THREE.js, not app data, and round 1's `012.js` may have been a chunk not requested on this load.
Round 2's list is the one to trust for names and digests; it is what `motion-spec.md` §0 records.

**The stylesheet hash is unchanged between rounds** (same URL, same 167 496 bytes), so the CSS quoted
in `motion-spec.md` §6.7 and §10 is stable across both captures.

---

## 4. Confidence ledger

### 4.1 Directly verified (read from source, quoted verbatim)

All rows are **verified**. Where each claim is written up: motion → `motion-spec.md`, behaviour →
`design-system.md`, geometry/material/light → `disc-3d-spec.md`.

    claim                                                          where in the bundle
    Full config object `c` (~110 keys)                             one contiguous literal
    Full preloader config `J` (incl. 4 beats)                      one contiguous literal
    34 data-disc-* attribute → config-key mappings                 attribute map literal (motion-spec §7)
    Loader chase P += (a-P)*(1-exp(-8*dt))                         Te()
    dt clamp to 0.1                                                Te()
    Intro pose spinY = -π/2*t, spinZ = 1.1*t²                      tt()
    Intro growth 1-(1-t)² → G.active                               et()
    Intro rise offset (0,-3t,-0.7t) + inverse quat + ÷ scale       it()
    Rise/turn exponents 3 and 2.4                                  st(), ct()
    Rise/turn progress windows 0.03 / 0.8                          Te() + J
    Arc x = sin(m*0.35)*hGap*2.4, z = (1-cos(m*0.35))*v*2.4       br()
    Arc tangent rotY = -θ                                          br()
    Gallery transform -30°/-30°/1.08                               br()
    Flow lean sign(v)*sqrt(|v|)*0.055                              br()
    Follow smoothing min(1, dt*k), k ∈ [6.5, 15]                   br()
    Six-channel impulse integrator + 8e-4 sleep                    br()
    Wipe impulse + clamps                                          Er()
    Press impulse from raycast UV                                  Dr() + Tr()
    Cursor velocity 60 Hz normalisation                            Wr()
    Snap spring ω²=90.25, exp(-12*dt)                              layout loop
    Hover blend min(1, dt*10), tilt 0.21                           br()
    discGlide = '0.32, 0.72, 0, 1'                                 CustomEase.create
    energy = 'M0,0 C0.32,0.72 0,1 1,1'                             CustomEase.create
    Text transition config + all durations                         I literal
    Lenis config + ticker wiring                                   $r()
    Renderer settings incl. transmissionResolutionScale            renderer init
    Light rig (5 lights, exact positions/intensities)              scene init
    Fog ('#FFFFFF', 7, 14)                                         scene init
    Camera (40, 1, .1, 100) at z=4.4                               scene init
    Material stack (6 × MeshPhysicalMaterial)                      material builders
    RingGeometry(_, _, 220, 1) front/back                          geometry builder
    LatheGeometry(_, 256) edge, (_, 160) hub                       geometry builders
    CircleGeometry(1, 24) pick mesh                                geometry builder
    UV remap x*.5+.5 on ring faces                                 an()
    PMREMGenerator.fromEquirectangular                             Ut()
    valueNoise formula                                             inline literal
    CSS: .preloader*, .nav-loading*, [data-preload]                stylesheet
    CSS: .divider-horizontal height .5px                           stylesheet
    CSS: [data-disc-gallery] { cursor: grab }                      stylesheet
    Type scale (em-based, 3 breakpoints)                           stylesheet
    @font-face × 3                                                 stylesheet

Round 2 additions — every one read out of the digest-verified chunk:

    claim                                                          where in the bundle
    Counter orbit: X = discX − sin(θ)·orbitRx, Y = discY + cos(θ)·orbitRy  te()
    Orbit radii = discRadius + counter/2 + 0.35·counterHeight      O() + J.discGap
    θ steps π/4 per beat, power2.inOut, per-beat `travel`           ce()
    Counter clamp band clears the nav (navGap 0.35) and the disc     te() + w()
    anchor() returns three radii: 0.8·R (orbit), live·R, 1.0·R      lt()
    Growth-coupled counter exit, ÷ pushBy(0.7) over radius growth   j()
    Per-cell exit stagger across VISIBLE cells, pushStagger 0.14   ne()
    E.from = E.live captured at setOff, before the fan               De()
    Counter forced to −110 % only as a fallback after fan()         De()
    Two text groups; group index comes from the L array              L + De()
    Nested targets hoisted; rules spliced before their own panel     collect() in De()
    Outer mask data-disc-mask with idle/clip states                  f() + m()
    transformOrigin 'left center' on the IN hidden state            ge() + ae()
    autoAlpha 0→1 on text targets, on top of the yPercent slide     ge() + me()
    Cumulative cross-kind stagger, inGroupGap on group CHANGE        ge()
    Height tween skipped when |pinned − natural| < 0.5 px             ge()
    Reveal gated on data-disc-flight + settleDelay + dragging       fe() + ue()
    discgallerychange drives the transition, not the wheel event     listener in De()
    Promise out()/release() pair for page transitions               discTransitionsFlow
    Review slots fixed pool, data-review-status empty               ir() + _e()
    Half star = clipPath inset(0 50% 0 0) + marginRight −0.5em      ve()
    aria-label interpolates the raw rating (4.5 not rounded)         ve()
    Two-line quote split solver, word-count weighted ×2              ye()
    Curly quotes stripped on input, re-added on output               ye()
    Snap kick per source: wheel 2.5, key 4, click ≤5, flick 0        pr()
    Kick added to flow velocity, clamped ±12, before the tween       mr()
    Snap duration scales with distance, 0.46 → 1.05                  pr()
    flick/immediate path resets flow velocity to 0                   mr()
    CSS: .experience_info max-width 20.8333%, flex column            stylesheet
    CSS: .testimonial_wrap centred flex row, gap .5em, display:none
         below 768 px                                               stylesheet
    CSS: .testimonial min-width 20rem, .star height 1em              stylesheet
    CSS: [data-review-line] white-space nowrap                      stylesheet

### 4.2 Verified by recomputation

The arc position table (`motion-spec.md` §9) was recomputed independently from
`x = sin(m·0.35)·5.52` and `z = (1−cos(m·0.35))·2.4`.

An earlier hand-computed draft had wrong `z` values at `Δindex ≥ 3` (it used `1−cos θ` values from a
different radius). The corrected table is the shipped one. The load-bearing result — `x` is
non-monotonic past `Δindex ≈ +4.49`, the row wraps past the `sin` apex and recedes — is explained in
`design-system.md` §4.3.

### 4.2b Corrections found in round 2

Two claims written up from round 1 were wrong, and both are now fixed in the spec files (correct
statements: `motion-spec.md` §6.3, §10). Recorded here so the error is traceable rather than
silently overwritten.

    wrong (round 1)                                   right (round 2, verified)
    Rules collapse from the RIGHT                     Rules retract toward / grow out of the LEFT
                                                     (`transformOrigin: 'left center'`, `motion-spec.md` §6.3)

    why it was wrong                                  the OUT tween writes `right center`, but its end state is
                                                     `scaleX: 0`, where the origin is unobservable. The state you
                                                     watch is the one `ge()` sets before the IN tween. Runtime
                                                     check: the settled rule carries `transform-origin: 0% 50%`.

    `.testimonial_wrap` = one quote block            TWO critic cards, stars + publication + 2-line quote
                                                     (`motion-spec.md` §10, design-system.md §4.7)

    why it was wrong                                  round 1's DOM never reached the settled frame, so the row
                                                     was empty and the slot structure was not visible. Round 2's
                                                     settled frame and a11y tree both show two cards.

Also added that round 1 simply did not record: the outer `[data-disc-mask]` (distinct from the inner
`[data-disc-line-mask]`), the `autoAlpha` fade, the group gap between the copy and the critic row, the
`< 0.5 px` height-tween guard, and the flow kick on `stepTo`. None of these were missing from the
bundle — they were outside the regions round 1 read.

### 4.3 Inferred (reasoned, not read)

Marked **[inferred]** in the docs.

    item                                                              basis
    Physical motivation for pressDepth / pressTilt                    name + behaviour; no comment in source
    Rationale for sceneShare = 0.18                                   behaviour (bar never hits 100 % over an empty canvas)
    The 0.6 vs 1.0 inactive-scale coefficient = desktop/touch split   code branches on a coarse-pointer check; intent inferred
    scribbleLag: 15 being flicker hysteresis                          consistent with the value's magnitude; no comment
    Environment bands being a "studio softbox rig"                    4-band structure and their opacities; no comment

### 4.4 Unknowns / not established

    item                                          status
    Full wheel envelope state machine             the 12 wheel* config keys were read verbatim; the control flow
                                                  connecting them was not traced. A simplified faithful port is in
                                                  implementation.md §8.3
    Exact scribble ring line-mesh construction    config keys verified; the per-frame point-generation function
                                                  was not extracted
    Barba page-transition integration             resolved in round 3: `motion-spec.md` §11, `evidence.md` §8
    Other page templates (014.html)               captured but not analysed
    Behaviour at other viewports / touch          only 1440×900 desktop captured; the touch code path (touch*
                                                  config) exists but was not exercised
    Behaviour under prefers-reduced-motion        the guard exists in source; not observed live
    Exact frame timing of the fan                 timeline positions are exact; the *perceived* duration depends on
                                                  when the loader finishes, i.e. on asset loading

---

## 5. Negative results

Bounded searches that returned nothing. Recorded so they are not re-run.

    pattern                               files searched               result
    cassette, Cassette                    all 9 .js + both .html       not found (0 hits)
    tape, Tape                            same                         not found (0 hits)
    spoke, Spoke                          same                         not found (0 hits)
    reel, Reel                            same                         not found (0 hits)
    CatmullRomCurve3                      011.js                       0 hits
    CubicBezierCurve                      011.js                       0 hits
    deviceorientation, devicemotion       011.js                       0 hits — touch is Pointer Events only
    .hdr / HDR file reference             000.html, 011.js, stylesheet not found — the environment is procedural
    animejs, framer-motion, createRoot    all bundles                  not found
    ScrollTrigger scrub                   011.js                       2 hits, neither on the gallery

The two `scrub` hits are `scrub:!0` and `scrub:l`, both inside the generic `data-parallax` helper,
which reads its scrub from a `data-parallax-scrub` attribute. The gallery itself has no
ScrollTrigger.

The four zero-hit results (`cassette`, `tape`, `spoke`, `reel`) are the basis for the naming
correction in `README.md`.

---

## 6. Reproducing this analysis

The bundle is public and unauthenticated. No credentials, cookies or authorisation headers were used.

```bash
CHROME=~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome

# 1. capture (a REA capture_browser_scenario call — see §1)
#    browser:   { mode: "launch", executable_path: CHROME, headless: true }
#    start_url: { url: "https://a24.raviklaassens.com/" }
#    environment: { viewport: { width: 1440, height: 900, device_scale_factor: 1 },
#                   color_scheme: "dark", reduced_motion: "no-preference",
#                   service_workers: "block", timezone: "UTC", locale: "en-US" }
#    actions:   [ { step_id: "load", action: "goto", wait_until: "load", timeout_ms: 40000 },
#                 { step_id: "settle", action: "wait_for_timeout", duration_ms: 8000 } ]
#    capture:   { at_end: ["url", "screenshot", "dom"],
#                 events: ["console", "page-errors", "network"],
#                 network: { response_body: true, request_body: false, header_values: false } }

# 2. decode the base64 response bodies
#    ⚠ the capture tooling writes image response bodies into the PROCESS CWD as
#      cosmos_<id>.webp. Capture from a scratch directory, or move them afterwards —
#      they are A24 poster artwork (copyrighted) and do not belong in a repo.
# 3. curl the stylesheet
curl -sS https://a24.raviklaassens.com/_astro/ExportPage.DV5vD961.css -o export.css
```

Seven `cosmos_*.webp` poster files (256×351 up to 1440×1800, all WebP) were written to the working
directory by the capture and moved out of the repo to a scratch directory — third-party poster
artwork, not part of this deliverable and not retained.

To find the bundle without REA, the Astro entry point is in `000.html`:

```bash
curl -sS https://a24.raviklaassens.com/ \
  | grep -oE '(src|href)="/_astro/[^"]+\.(js|css)"'
```

The filenames contain content hashes, so **they will drift.** Re-run the capture; do not hard-code a
filename from this document.

---

## 7. Legal note

Reverse-engineering a public JavaScript bundle for interoperability and study is lawful in most
jurisdictions (this was a reimplementation study; the bundle is delivered to every visitor
unobfuscated).

**Reimplementing the visual design is a separate question.** The brand, poster, typeface and
metadata assets listed in `README.md` "Licence / attribution" are third-party property with active
trademark and copyright; a public clone of this page would infringe. A study of the *motion system* —
arc layout, progress-driven intro, impulse physics, ease vocabulary — using your own artwork, type and
content does not. Attribution requirements for shipping an homage: the same README section.

---

## 8. Round 3 — page transitions, ink dissolve, scroll-next

Question asked: what happens on a click on the disc, what is the "ink" on the detail page, and what
is the spinning disc at the bottom of it. Claims: `motion-spec.md` §11 (transitions), §12 (ink),
§13 (scroll-next); behaviour: `design-system.md` §4.8.

### 8.1 Method

    stage              tool                                              result
    runtime, load      rea_capture_browser_scenario (launch, Chromium    DOM (74 317 B), screenshot, 75 network
                       1243 = 153.0.8010.12, 1440×900, reduced_motion    events; the XHR prefetch of
                       no-preference, SW blocked)                         /production/backrooms observed
    runtime, click     same + click `[data-disc-gallery]` (centre =      frame-navigated to /production/backrooms
                       the active disc), 450 ms, 4 s                     with NO document request (Barba)
    static             curl of every `_astro/*.js` the capture listed,   transition code, config objects,
                       then offset-addressed slices of the main chunk    dissolve + scroll-next sources

The capture tool's result is large (the screenshot is inlined): save it and probe with `jq`/Python
rather than reading it. Neither the capture nor the downloaded bundles are kept in the repository.

### 8.2 Artifacts

    file                                                   bytes     sha256
    _astro/main.qdXy8l6N.js                                263 989   7f61e9af50bf810ea58f85d9f04313155faff1b3e50dcee1d292e080468ac72c   (= §3, unchanged)
    _astro/bootstrap.dru0MhUJ.js                           177 648   b31db87fdcae7af98ba55947e08a559341b9d8ded5cb7c209fa17c561c2b4c12
    _astro/ExportPage.astro_astro_type_script_index_0_lang.DQlUkOwJ.js   312   602f00b1d1b4a3d219639748d4dc17cd3d861ba354d1d0a0ce8e0304fd8c0865
    _astro/ExportPage.DV5vD961.css                         167 496   bd1589a042c62a17465ee7299767a13282f38d765bdb72c329c8c00ad2bcd717
    /production/backrooms (HTML)                            69 808   121488e5a77358166f2dcd40d36dc551ad5ae2f15d20bf1599fe4631244cbad7

Reference-page imagery seen on `/production/backrooms` (analysed, not stored): `disc.webp?v=7`
(the disc texture, same role as `assets/covers/`), `trailer.webp?v=8` — 2400×1350 RGB, a full-bleed
film still, parallaxed ±10 (`data-parallax-start/-end`) — and `vector.webp` — 1600×240 RGBA, a
**typographic wordmark of the title** (black type on transparent), not an illustration.

### 8.3 Directly verified

    claim                                                                   evidence
    A click on the active disc navigates with Barba, not a page load        runtime: no `document` request; frame-navigated
    The target is prefetched before the click                               runtime: XHR GET /production/backrooms precedes the click
    The landing page prefetches the next title with no input                runtime: XHR GET /production/the-invite
    The click path (meta/ctrl → new tab, press impulse, barba.go, fallback) `Ar()` read
    Prefetch debounce 450 ms, once per URL                                  `lr()` read
    Three disc transitions + default, their from/to namespaces              `Hn` read
    Config objects `An`, `zn`                                               read verbatim
    The canvas is moved into `[data-disc-carry]`, z-index 60                `Vn()` read
    Detail out/in timelines                                                 `_r()` / `vr()` read
    Ink = clip-path path(evenodd) from marching squares, scrubbed by        `Ae()`, `Ke()`, `Ge()` read
    ScrollTrigger; `R` config                                               
    Scroll-next config `Y`, pose function, push meter, exit timeline        `zt()`, `wn()`, `Pn()`, `Jn()` read
    Roulette exists only with `data-scroll-next-random`                     `zt()` start: `t = hasAttribute(...)`; the
                                                                            production DOM has no such attribute

### 8.4 Easy to get wrong

    misreading                                         what the source says
    "the ink is the page-change effect"               it is a scroll-scrubbed clip on the hero (§12); the page change is a
                                                       fade + the carried canvas (§11)
    "the spinning disc at the bottom is a roulette"   the reel only runs in random mode (404); on a production page
                                                       the disc spins from scroll velocity and the push meter (§13)
    "the title wordmark is an image to source"        it is a PNG of type; a port renders the title as text
    "Barba handles the nav film links"                they carry `data-barba-prevent`; the gallery's own
                                                       `discgallerynavigate` listener moves the disc

### 8.5 Inferred / not established

    item                                                              status
    production → production uses `default` (fade .4 / .4)             by elimination: no entry in `Hn`; not observed
    `Q.durationDefault`                                               not extracted
    who dispatches `discgallerynavigate`                              listener read, dispatcher not traced
    the noise hash, domain warp, marching-squares walker              read, not transcribed (`motion-spec.md` §12.4)
    what the ink looks like frame by frame                            no frames captured; geometry/colour of the edge unverified
    touch / reduced-motion / other viewports                          guards read in source, not exercised live
    `data-film-scroll` dropdown behaviour on a production page        links seen; handler not traced

