/**
 * The complete verified config. Every number here is verbatim from
 * motion-spec.md §7 (disc config), §2.1 (preloader config) and §6 (text config).
 *
 * Keys this build does not exercise (the reference's separate coarse-pointer
 * "touch layout" branch: touchFit / touchPeek / touchGap / touchDepth /
 * touchActiveScale / …) are deliberately absent rather than carried as dead
 * config — build-notes.md §4.
 */

/** Disc config — motion-spec.md §7. */
export const DEFAULTS = {
  // disc construction
  artResolution: 1024,
  discThickness: 0.01,
  edgeBevel: 1,
  edgeBleed: 0.026,
  holeSize: 0.14,
  hubSize: 0.24,
  hubMatrixWidth: 0.4,
  hubMatrixIntensity: 0.85,
  hubFrostedEdge: 0.54,

  // front surface
  frontClearcoat: 0.8,
  frontRough: 0.42,
  frontMetal: 0.48,
  texGrain: 0.59,
  texPrint: 0.35,
  texScratches: 0.36,
  texGloss: 1,

  // back surface
  backBaseColor: '#1A1E2A',
  backRough: 0.23,
  backMetal: 1,
  backClearcoat: 0.34,
  backIridescence: 1,
  backIridIOR: 1.86,
  backIridThickness: 900,

  // edge
  edgeColor: '#FFFFFF',
  edgeRoughness: 0.04,
  edgeMetalness: 0.55,

  // hub
  hubColor: '#FFFFFF',
  hubTransmission: 0.68,
  hubRoughness: 0.38,
  hubIOR: 2,

  // gallery / arc
  galleryScale: 1.08,
  hGap: 2.3,
  depthGap: 1,
  activeDiscY: 0.06,
  galleryRotX: -30,
  galleryRotY: -30,
  inactiveScale: 0.8,
  renderRadius: 5,

  // camera / renderer
  cameraDistance: 4.4,
  cameraFOV: 40,
  exposure: 0.86,
  environmentIntensity: 1,

  // light rig
  keyIntensity: 0.75,
  keyColor: '#FFF9E8',
  keyX: 3.5,
  keyY: -8,
  fillIntensity: 0.3,
  rimIntensity: 0.75,
  rimColor: '#499FF5',
  topStripIntensity: 1.9,
  fogColor: '#FFFFFF',

  // hover
  hoverTiltStrength: 0.21,

  // scroll
  dragSensitivity: 0.95,
  dragVelocitySmoothing: 0.32,
  dragMaxVelocity: 0.5,
  dragStartDistance: 5,
  friction: 0.89,
  resetDuration: 1.2,
  snapDuration: 0.46,
  snapFreq: 9.5,
  snapDamping: 12,

  // wheel quantiser
  wheelNoiseFloor: 0.3,
  wheelStepThreshold: 6,
  wheelEventCap: 24,
  wheelEnvelopeTau: 550,
  wheelRiseFactor: 1.2,

  // follow smoothing
  followTight: 15,
  followBase: 11,
  followFalloff: 1.15,
  followMin: 6.5,

  // flow lean
  flowLean: 0.055,
  flowLeanMax: 0.3,
  flowBank: 0.32,
  flowDip: 0.014,
  flowDipMax: 0.09,

  // pointer wobble
  wipePush: 0.012,
  wipePushMax: 0.5,
  wipeSpin: 0.009,
  wipeSpinMax: 0.4,
  wipeMinSpeed: 9,
  pushDamping: 4.5,
  pushReturn: 3.4,
  pressDepth: 0.55,
  pressTilt: 1.5,

  // fan-in stagger
  flightRecede: 2.2,
  flightStagger: 0.45,
  flightStaggerIn: 0.28,
  flightStaggerMax: 4,
  flightPopScale: 0.35,
  flightPopScaleIn: 0.02,

  // intro pose
  preloadBoost: 0.8,
  preloadGrowBy: 0.5,
  preloadSpin: 1.1,
  preloadRiseFrom: 3,
  preloadRiseDepth: 0.7,
  preloadFanDuration: 1.15,
  riseAfter: 0.03,
  turnBy: 0.8,

  // section switch
  switchDuration: 0.9,
  switchGhostDuration: 0.35,
  switchGhostValue: 0.002,
  switchInStagger: 0.02,
}

/**
 * Detail open / close — motion-spec.md §11.4 `zn`, and the `_r` defaults of §11.7.
 * Copied, not retuned. `carryZIndex` and `readyTimeout` are the reference's canvas
 * carry between two documents; there is one document here (build-notes.md §4).
 */
export const DETAIL = {
  outDuration: 0.55,
  exitDuration: 0.8,
  exitSpin: Math.PI / 2,
  inDuration: 1.05,
  detailFade: 0.35,
  artTimeout: 900,
  fallbackFade: 0.4,
  // `_r` parameter defaults (§11.7)
  pressScale: 0.94,
  pressTime: 0.12,
  springScale: 1.015,
  springTime: 0.16,
  // reduced motion: every transition is one short fade (implementation.md §11)
  reducedFade: 0.15,
}

/**
 * Scroll-next — motion-spec.md §13.3 `Y`, non-look keys, verbatim. Read by this
 * build: every tilt, arrive*, pop*, spin*, idle*, push*, exit* key, disc* and
 * pixelBudget, maxPixelRatio, bootMargin, idleBoot, touch.{discVw,restTiltY}.
 * Not carried: `roulette` (random mode is out of scope), the scatter keys and
 * slideRestShare, and `rimSamples` (the fill follows the disc's own plane, not a sampled rim).
 */
export const NEXT = {
  restTiltX: -30, restTiltY: 0, arriveTiltX: -52, arriveTiltY: 10, pushTiltX: -16, pushTiltY: -10,
  touch: { discVw: 108, restTiltY: -14, lineHeight: 1.2, lift: 0.2, descent: 0.24 },
  discTop: 4.7, discVh: 120, discVw: 130, discCap: 0.52, ruleDuration: 0.9, revealDuration: 0.8, revealStagger: 0.09, exitRuleDuration: 0.5,
  arriveStart: 0.3, arriveEnd: 0.97, arriveDrop: 0.9, popScale: 0.35, popIn: 1.05, popOut: 0.45,
  spinGain: 0.0032, spinMax: 7, spinFollow: 9, spinFriction: 2.4, idleSpin: -0.14,
  idleAmount: 0.022, idleRate: 0.5,
  pushWheel: 620, pushTouch: 380, pushKey: 0.34, pushHold: 180, pushDrain: 0.9, pushSettle: 350,
  pushGap: 140, pushSurge: 1.6, pushSurgeMin: 6, pushLift: 0.1, pushGrow: 1.04, pushSpin: -6,
  pushEase: 10,
  fillFps: 10, fillPadding: 0.09, fillWidth: 0.02, fillJitter: 0.018, fillPoints: 40,
  exitDuration: 0.7, exitSpin: -16, exitLift: 0.35, exitCopyDuration: 0.45, exitGo: 0.48,
  bootMargin: '150%', idleBoot: 2500, pixelBudget: 26e5, maxPixelRatio: 1.5,
}

/** Preloader config — motion-spec.md §2.1. */
export const PRELOADER = {
  minDuration: 2.85,
  sceneShare: 0.18,
  sceneCreep: 0.6,
  chase: 8,
  // riseAfter / turnBy are intro-pose gates, not loader-bar gates — they live in
  // DEFAULTS so there is exactly one source of truth for them.
  beats: [
    { at: 0.05, after: 0.8,  roll: 0.7,  travel: 0.85 },
    { at: 0.5,  after: 1.9,  roll: 0.55, travel: 0.75 },
    { at: 0.75, after: 2.35, roll: 0.55, travel: 0.75 },
    { at: 1.0,  after: 2.8,  roll: 0.6,  travel: 0.8  },
  ],
  rollStagger: 0.05,
  yearFrom: 2012,
  yearRoll: 0.4,
  // counter orbit — motion-spec.md §2.6. `arcEnd: 1` makes each beat step the
  // orbit by `π/4 · arcEnd`, so four beats travel below → left → upper-left → above.
  arcEnd: 1,
  travel: 0.75,
  navGap: 0.35,
  discGap: 0.35,
  openAt: 0.3,
  open: 0.38,
  setOff: 0.45,
  exit: 0.5,
  navAfter: 0.15,
  copyAfter: 0.3,
  spinWords: [
    'Projecting', 'Developing', 'Splicing', 'Rewinding',
    'Spooling', 'Threading', 'Screening', 'Printing',
  ],
  spinnerDuration: 0.8,
}

/** Text transition config — motion-spec.md §6. */
export const TEXT = {
  settleDelay: 100,
  dragRevealCap: 500,
  outDuration: 0.4,
  outLineStagger: 0.016,
  outItemStagger: 0.016,
  outShift: -120,
  inDuration: 0.7,
  inLineStagger: 0.05,
  inItemStagger: 0.035,
  inGroupGap: 0.06,
  inShift: 120,
  heightDuration: 0.5,
  readyTimeout: 4000,
  reverseSpeed: 1.6,
  pollInterval: 40,
}

/**
 * Runtime overrides from `data-disc-*` attributes on the gallery element.
 * motion-spec.md §7 "Runtime overrides" — the whole motion system stays
 * tunable from markup.
 */
const ATTR_MAP = {
  'data-disc-gap': 'hGap',
  'data-disc-depth': 'depthGap',
  'data-disc-gallery-scale': 'galleryScale',
  'data-disc-active-y': 'activeDiscY',
  'data-disc-inactive-scale': 'inactiveScale',
  'data-disc-render-radius': 'renderRadius',
  'data-disc-camera-distance': 'cameraDistance',
  'data-disc-camera-fov': 'cameraFOV',
  'data-disc-exposure': 'exposure',
  'data-disc-gallery-rot-x': 'galleryRotX',
  'data-disc-gallery-rot-y': 'galleryRotY',
  'data-disc-hover-tilt': 'hoverTiltStrength',
  'data-disc-follow-base': 'followBase',
  'data-disc-follow-falloff': 'followFalloff',
  'data-disc-snap-freq': 'snapFreq',
  'data-disc-snap-damping': 'snapDamping',
  'data-disc-friction': 'friction',
  'data-disc-drag-sensitivity': 'dragSensitivity',
  'data-disc-wheel-threshold': 'wheelStepThreshold',
  'data-disc-wheel-tau': 'wheelEnvelopeTau',
  'data-disc-push-damping': 'pushDamping',
  'data-disc-push-return': 'pushReturn',
  'data-disc-press-depth': 'pressDepth',
  'data-disc-press-tilt': 'pressTilt',
  'data-disc-flight-stagger': 'flightStagger',
  'data-disc-flight-stagger-in': 'flightStaggerIn',
  'data-disc-flight-pop': 'flightPopScale',
  'data-disc-flight-recede': 'flightRecede',
  'data-disc-fan-duration': 'preloadFanDuration',
  'data-disc-switch-duration': 'switchDuration',
  'data-disc-switch-ghost': 'switchGhostDuration',
}

export function resolveConfig (el) {
  const w = { ...DEFAULTS }
  if (!el) return w
  for (const [attr, key] of Object.entries(ATTR_MAP)) {
    const raw = el.getAttribute(attr)
    if (raw == null) continue
    const n = parseFloat(raw)
    if (Number.isFinite(n)) w[key] = n
  }
  return w
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)