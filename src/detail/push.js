/**
 * The push meter. motion-spec.md §13.5. A pure reducer: state in, event in, state
 * and an `exit` flag out — no DOM, no clock — so the rules that keep a page from
 * leaving by accident are unit-tested.
 *
 *   · it only fills at the END of the page, and only by a deliberate second
 *     gesture: a flick that carried you there is ignored while it settles
 *     (`pushSettle`) and a follow-up must come after a pause (`pushGap`) or as a
 *     surge (`pushSurge`);
 *   · it drains once you stop (`pushHold`, `pushDrain`);
 *   · filling it leaves exactly once; `leaving` blocks everything after.
 */
import { clamp } from '../disc/config.js'

export const createPush = () => ({
  meter: 0,          // De — 0…1
  lastPush: 0,       // ms of the last accepted push
  endSince: 0,       // ms of the first wheel event seen at the end
  lastWheel: 0,
  prevAbs: 0,
  armed: false,      // the arriving flick is over; this is a new gesture
  leaving: false,
})

const apply = (s, amount, now) => {
  const meter = clamp(s.meter + amount, 0, 1)
  const next = { ...s, meter, lastPush: now }
  if (meter >= 1) { next.leaving = true; return { state: next, exit: true } }
  return { state: next, exit: false }
}

/**
 * @param event one of
 *   { type: 'wheel', now, delta, atEnd }     delta in px (deltaMode already normalised)
 *   { type: 'touch', now, dy, atEnd }        dy: finger travel in px, upward positive;
 *                                            `atEnd` is whether the GESTURE began at the end
 *   { type: 'key',   now, atEnd }
 *   { type: 'tick',  now, dt }               drain; `dt` in seconds
 */
export function reducePush (s, e, cfg) {
  if (s.leaving) return { state: s, exit: false }

  if (e.type === 'tick') {
    if (s.meter <= 0 || e.now - s.lastPush <= cfg.pushHold) return { state: s, exit: false }
    const step = clamp(e.dt, 0, 0.05)
    return { state: { ...s, meter: Math.max(0, s.meter - step * cfg.pushDrain) }, exit: false }
  }

  if (e.type === 'key') {
    // a press that scrolled the page to the end happened while it was NOT at the end
    return e.atEnd ? apply(s, cfg.pushKey, e.now) : { state: s, exit: false }
  }

  if (e.type === 'touch') {
    return e.atEnd ? apply(s, e.dy / (cfg.pushWheel * cfg.pushTouch / 620), e.now) : { state: s, exit: false }
  }

  // wheel
  if (!e.delta) return { state: s, exit: false }
  const gap = e.now - s.lastWheel
  const abs = Math.abs(e.delta)
  const surge = abs > cfg.pushSurgeMin && abs > s.prevAbs * cfg.pushSurge
  let n = { ...s, lastWheel: e.now, prevAbs: abs }
  if (!e.atEnd) return { state: { ...n, endSince: 0, armed: false }, exit: false }
  if (!n.endSince) n.endSince = e.now
  if (!n.armed) {
    const settled = e.now - n.endSince >= cfg.pushSettle
    const fresh = gap >= cfg.pushGap || surge
    if (!settled || !fresh) return { state: n, exit: false }
    n.armed = true
  }
  return apply(n, clamp(e.delta, -140, 140) / cfg.pushWheel, e.now)
}
