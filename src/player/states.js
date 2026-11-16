// PLAYER STATES. Each state: enter(p, from) / update(p, dt, input) -> name of the next state (or nothing) / exit(p).
// A new ability = a new state here (plus an unlock flag), not another branch in an if/else pile.
// update() only decides velocities and transitions; Player.step() then runs gravity + collision for everyone.

import { approach } from '../core/math.js';

export function attackFrameAt(def, t) {     // which frame of the attack is showing at time t
  let i = 0; while (i < def.frames.length - 1 && t >= def.frames[i].end - 1e-9) i++;
  return i;
}

const groundState = p => (p.moving ? 'run' : 'idle');
const airState = p => (p.vy > p.char.timing.fallVelThreshold ? 'fall' : 'rise');

function landing(p) {                       // just touched down from the air
  const impact = p.airPeakFall; p.airPeakFall = 0;
  p.emit('land', impact);
  return impact >= p.char.timing.landMinImpact ? 'land' : groundState(p);
}
function wantsWallSlide(p, input) {         // airborne + touching a wall + holding into it + not rising
  return p.abilities.wallSlide && !p.grounded && p.wallJumpLock <= 0 && p.touching !== 0 && p.vy >= 0 &&
    ((p.touching === 1 && input.down('right')) || (p.touching === -1 && input.down('left')));
}
function clingToWall(p) {                   // the wall slide itself: capped fall speed, facing away from the wall
  if (p.vy > p.phys.wallSlideSpeed) p.vy = p.phys.wallSlideSpeed;
  p.facing = -p.touching;
  p.airPeakFall = 0;
}
function airCommon(p, input) {              // shared exits of every airborne state
  if (p.grounded) return landing(p);
  if (wantsWallSlide(p, input)) { clingToWall(p); return 'wallSlide'; }
}

export const STATES = {
  idle: {
    update(p, dt, input) {
      p.steer(dt, input);
      if (!p.grounded) return airState(p);
      if (p.moving) return 'run';
    },
  },
  run: {
    update(p, dt, input) {
      p.steer(dt, input);
      if (!p.grounded) return airState(p);
      if (!p.moving) return 'idle';
    },
  },
  land: {                                   // a short landing pose; she keeps full control during it
    enter(p) { p.stateDur = p.moving ? p.char.timing.landTimeMoving : p.char.timing.landTime; },
    update(p, dt, input) {
      p.steer(dt, input);
      if (!p.grounded) return airState(p);
      if (p.stateT >= p.stateDur) return groundState(p);
    },
  },
  jumpStart: {                              // takeoff pose (ground jump and wall jump)
    update(p, dt, input) {
      p.steer(dt, input);
      const next = airCommon(p, input); if (next) return next;
      if (p.vy > p.char.timing.fallVelThreshold) return 'fall';
      if (p.stateT >= p.char.timing.jumpStartTime) return 'rise';
    },
  },
  rise: {
    update(p, dt, input) {
      p.steer(dt, input);
      const next = airCommon(p, input); if (next) return next;
      if (p.vy > p.char.timing.fallVelThreshold) return 'fall';
    },
  },
  fall: {
    update(p, dt, input) {
      p.steer(dt, input);
      const next = airCommon(p, input); if (next) return next;
      if (p.vy <= p.char.timing.fallVelThreshold) return 'rise';
    },
  },
  doubleJump: {                             // the flip; movement is ordinary air movement
    update(p, dt, input) {
      p.steer(dt, input);
      const next = airCommon(p, input); if (next) return next;
      if (p.stateT >= p.char.timing.doubleJumpTime) return airState(p);
    },
  },
  wallSlide: {
    update(p, dt, input) {
      p.steer(dt, input);
      if (p.grounded) { p.airPeakFall = 0; return groundState(p); }
      if (!wantsWallSlide(p, input)) return airState(p);
      clingToWall(p);
    },
  },
  dash: {                                   // fixed speed, fixed time, no gravity in the air; she decelerates out of it afterwards
    enter(p) { p.stateDur = p.phys.dashTime; },
    update(p, dt) {
      p.vx = p.dashDir * p.phys.dashSpeed; p.facing = p.dashDir;
      if (!p.grounded) { p.vy = 0; p.gravityScale = 0; }
      if (p.stateT + dt >= p.stateDur - 1e-9) return p.grounded ? groundState(p) : airState(p);
    },
    exit(p) { p.gravityScale = 1; },
  },
  // ANIMATION-DRIVEN: every attack runs through this one state, driven by its frame data (data/characters/<id>.json, "attacks").
  // The frame on screen decides the movement and the hitboxes; the movement still goes through collision like everything else.
  attack: {
    update(p, dt, input) {
      const a = p.attack, d = a.def;
      p.moving = input.axisX() !== 0;
      if (d.air && p.grounded && d.onLand !== 'continue') return landing(p);   // an aerial that touches down ends there
      a.frame = attackFrameAt(d, a.t);
      const f = d.frames[a.frame];
      p.facing = a.dir;
      // movement type: planted / slowed / momentum kept / lunge
      if (d.movement === 'lunge') p.vx = a.dir * (f.vx || 0);
      else if (d.movement === 'planted') p.vx = 0;
      else p.vx = approach(p.vx, 0, (p.grounded ? p.phys.groundDecel : p.phys.airDecel) * (d.decelScale != null ? d.decelScale : 1) * dt);   // slowed + momentum: coast down
      if (f.vx != null && d.movement !== 'lunge') p.vx = a.dir * f.vx;          // a per-frame step / push on any attack
      p.gravityScale = p.grounded ? 1 : (d.gravity != null ? d.gravity : 1);    // gravity during aerials: 1 normal, <1 reduced, 0 hang
      a.t += dt;
      if (a.t >= d.total - 1e-9) return p.grounded ? groundState(p) : airState(p);
    },
    exit(p) { p.gravityScale = 1; p.attack = null; },
  },
  // LATER: slide, grapple, witchTime ...
};
