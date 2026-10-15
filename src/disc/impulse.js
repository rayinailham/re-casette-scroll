/**
 * The wobble integrator. motion-spec.md §4.3–§4.5 / implementation.md §5.
 *
 * This is NOT a harmonic spring. Velocity decays exponentially while position
 * decays LINEARLY toward zero. A real spring would store energy in position and
 * overshoot past rest; this cannot. One sharp kick, one ease-out glide back,
 * roughly 0.5 s, no ringing. That restraint is the design.
 */
import { clamp } from './config.js'

export const PUSH_SLEEP = 8e-4

export function createImpulse () {
  return {
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    rotX: 0, rotY: 0,
    vRotX: 0, vRotY: 0,
  }
}

export function impulseEnergy (p) {
  return Math.abs(p.x) + Math.abs(p.y) + Math.abs(p.z)
    + Math.abs(p.vx) + Math.abs(p.vy) + Math.abs(p.vz)
    + Math.abs(p.rotX) + Math.abs(p.rotY)
    + Math.abs(p.vRotX) + Math.abs(p.vRotY)
}

export function resetImpulse (p) {
  p.x = p.y = p.z = 0
  p.vx = p.vy = p.vz = 0
  p.rotX = p.rotY = 0
  p.vRotX = p.vRotY = 0
}

/** `dt` in seconds, already clamped by the caller's single frame clamp. */
export function integrate (p, dt, w) {
  if (impulseEnergy(p) <= PUSH_SLEEP) { resetImpulse(p); return false }

  const damp = Math.exp(-w.pushDamping * dt)   // 0.928 at 60 fps
  const ret = Math.min(1, dt * w.pushReturn)   // 0.057 at 60 fps

  p.x += p.vx * dt; p.vx *= damp
  p.y += p.vy * dt; p.vy *= damp
  p.z += p.vz * dt; p.vz *= damp
  p.rotX += p.vRotX * dt; p.vRotX *= damp
  p.rotY += p.vRotY * dt; p.vRotY *= damp

  p.x -= p.x * ret
  p.y -= p.y * ret
  p.z -= p.z * ret
  p.rotX -= p.rotX * ret
  p.rotY -= p.rotY * ret
  return true
}

/**
 * IMPULSE A — wipe. Horizontal motion pushes sideways AND spins about Y;
 * vertical motion pushes vertically AND spins about X. Not decoupled.
 */
export function wipeImpulse (p, vx, vy, w) {
  if (Math.hypot(vx, vy) < w.wipeMinSpeed) return false
  p.vx += clamp(vx * w.wipePush, -w.wipePushMax, w.wipePushMax)
  p.vy -= clamp(vy * w.wipePush, -w.wipePushMax, w.wipePushMax)
  p.vRotY += clamp(vx * w.wipeSpin, -w.wipeSpinMax, w.wipeSpinMax)
  p.vRotX += clamp(vy * w.wipeSpin, -w.wipeSpinMax, w.wipeSpinMax)
  return true
}

/**
 * IMPULSE B — press. `uvX`/`uvY` are the RAYCAST HIT POINT ON THE DISC'S OWN PICK
 * MESH, mapped from UV 0–1 to −1…+1. Not the cursor position.
 *
 * Click 30 % right of centre → vRotY = +0.45, vRotX = 0.
 * Click dead centre → pure Z-push, zero tilt.
 * Click the edge → maximum tilt. No normalising, no symmetry restoration.
 */
export function pressImpulse (p, uvX, uvY, w) {
  p.vz -= w.pressDepth
  p.vRotY += uvX * w.pressTilt
  p.vRotX -= uvY * w.pressTilt
}