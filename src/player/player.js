// THE PLAYER CONTROLLER. No DOM, no drawing: pure simulation (so it can be tested headless).
// Position = FEET (bottom-centre). Units: world px, seconds. One call to step() = one fixed step.
import { approach, smoothstep } from '../core/math.js';
import { moveBody, boxHitsSolid } from '../world/collision.js';
import { readPhysics, normalizePhysics } from './physics.js';
import { STATES } from './states.js';

export function prepareCharacter(json) {   // fill in derived values once, after loading the character JSON
  const char = JSON.parse(JSON.stringify(json));
  char.physics = readPhysics(char.physics);
  const dj = char.sprite && char.sprite.anims && char.sprite.anims.doubleJump;
  char.timing = Object.assign({ jumpStartTime: 0.05, landTime: 0.07, landTimeMoving: 0.05, landMinImpact: 250, fallVelThreshold: 30 }, char.timing);
  char.timing.doubleJumpTime = dj ? dj.inTime + dj.spinTime + dj.outTime : 0.54;
  char.hurtbox = Object.assign({ w: 38, h: 148 }, char.hurtbox);
  char.slide = Object.assign({ w: 110, h: 60 }, char.slide, { name: 'slide' });
  char.buttons = char.buttons || {};
  char.fx = char.fx || {};
  char.attacks = char.attacks || {};
  for (const [name, d] of Object.entries(char.attacks)) {   // frame data: add each frame's end time (s) and its phase
    let t = 0; const hits = d.frames.map(f => !!(f.hit && f.hit.length)), first = hits.indexOf(true), last = hits.lastIndexOf(true);
    d.name = name;
    d.frames.forEach((f, i) => { t += f.ms / 1000; f.end = t; f.phase = first < 0 || i < first ? 'startup' : i > last ? 'recovery' : 'active'; });
    d.total = t;
  }
  return char;
}

export class Player {
  constructor(char, room) {
    this.char = char;
    this.room = room;
    this.w = char.hurtbox.w; this.h = char.hurtbox.h;
    this.abilities = Object.assign({ dash: true, slide: true, doubleJump: false, wallSlide: false, grapple: false }, char.abilities);
    this.events = [];                      // [{ type, value }] raised during the last step (for visuals / audio)
    this.setPhysics(char.physics);
    this.spawn(room.spawn.x, room.spawn.y);
  }

  setPhysics(raw) { this.rawPhysics = raw; this.phys = normalizePhysics(raw); }   // live tuning calls this

  spawn(x, y) {
    Object.assign(this, {
      x, y, px: x, py: y, vx: 0, vy: 0, gravityScale: 1,
      grounded: false, touching: 0, facing: 1, moving: false,
      coyoteT: 0, jumpBufT: 0, jumpCutReady: false,
      dashCooldown: 0, dashDir: 1, airDashReady: true, airJumpReady: true,
      wallJumpLock: 0, wallJumpDir: 1, airPeakFall: 0,
      attack: null, airAttacksUsed: {},
      w: this.char.hurtbox.w, h: this.char.hurtbox.h, slideDir: 1, slideCooldown: 0, slideStrike: null,
      stateName: 'idle', state: STATES.idle, stateT: 0, stateDur: 0,
    });
    this.emit('spawn');
  }

  emit(type, value) { this.events.push({ type, value }); }

  setState(name) {
    if (!STATES[name]) throw new Error('unknown player state: ' + name);
    const from = this.stateName;
    if (this.state.exit) this.state.exit(this, name);
    this.stateName = name; this.state = STATES[name]; this.stateT = 0;
    if (this.state.enter) this.state.enter(this, from);
  }

  // ---------- ONE FIXED STEP ----------
  step(dt, input) {
    this.events.length = 0;
    this.px = this.x; this.py = this.y;
    const P = this.phys;

    // 1. edge inputs (buffered by the input module, handed over at the start of the step)
    for (const a of input.pressed) {
      if (a === 'jump') this.pressJump();
      else if (a === 'dash') { if (!(input.down('down') && this.trySlide(input))) this.tryDash(input); }
      else if (this.char.buttons[a]) this.tryAttack(a);
    }
    if (input.released.includes('jump') && !input.down('jump')) this.releaseJump();
    if (this.jumpBufT > 0) {               // a buffered jump fires the moment she can jump; if the key is already up by then it is a short hop
      this.jumpBufT -= dt;
      if (this.fireJump(false)) { if (!input.down('jump')) this.releaseJump(); }
    }

    // 2. the current state decides velocities + the next state
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (this.slideCooldown > 0) this.slideCooldown -= dt;
    const next = this.state.update(this, dt, input);
    this.stateT += dt;
    if (next && next !== this.stateName) this.setState(next);

    // 3. refills + coyote time
    if (this.vy > P.maxFallSpeed) this.vy = P.maxFallSpeed;
    if (this.grounded || (this.touching !== 0 && this.abilities.wallSlide)) { this.airDashReady = true; this.airJumpReady = true; }
    if (this.grounded) this.airAttacksUsed = {};   // once-per-airtime attacks only refill on the ground (not on walls)
    if (this.grounded) this.coyoteT = P.coyote; else if (this.coyoteT > 0) this.coyoteT -= dt;

    // 4. gravity + collision
    this.integrate(dt);
    if (!this.grounded) this.airPeakFall = Math.max(this.airPeakFall, this.vy);

    if (this.y > this.room.fallY) this.spawn(this.room.spawn.x, this.room.spawn.y);
  }

  integrate(dt) {
    const P = this.phys;
    let g = P.gravity * this.gravityScale;
    if (!this.grounded) {
      // SMOOTH APEX HANG: gravity eases down to apexHang at the very top of a jump and back up again.
      // (A hard on/off switch caused a visible lurch.)
      const ease = smoothstep(Math.min(1, Math.abs(this.vy) / P.apexBand));   // 0 at the peak, 1 at the edge of the band
      const target = this.vy > 0 ? P.fallGravity : 1;                          // what gravity blends back to
      g *= P.apexHang + (target - P.apexHang) * ease;
    }
    this.vy += g * dt;                     // velocity first, then position (semi-implicit Euler)
    if (this.vy > P.maxFallSpeed) this.vy = P.maxFallSpeed;
    moveBody(this, this.room, dt);
  }

  // ---------- HORIZONTAL MOVEMENT (shared by every code-driven state) ----------
  // Moves the actual speed toward the target speed. Speeding up uses accel; stopping or turning uses decel.
  // Dash and wall-jump lock set speed directly, so she decelerates out of them naturally.
  steer(dt, input) {
    const P = this.phys;
    if (this.wallJumpLock > 0) {           // just kicked off a wall: sideways speed is locked for a moment
      this.wallJumpLock -= dt;
      this.vx = this.wallJumpDir * P.wallJumpPush; this.facing = this.wallJumpDir; this.moving = true;
      return;
    }
    const max = P.moveSpeed * (this.grounded ? 1 : P.airControl);
    const left = input.down('left'), right = input.down('right');
    let target = 0;
    if (left) { target -= max; this.facing = -1; }
    if (right) { target += max; this.facing = 1; }
    this.moving = left || right;
    const speedingUp = (target !== 0 && Math.sign(target) === Math.sign(this.vx) && Math.abs(target) > Math.abs(this.vx)) || this.vx === 0;
    const rate = this.grounded ? (speedingUp ? P.groundAccel : P.groundDecel) : (speedingUp ? P.airAccel : P.airDecel);
    this.vx = approach(this.vx, target, rate * dt);
  }

  // ---------- JUMPING ----------
  pressJump() { if (!this.fireJump(true)) this.jumpBufT = this.phys.jumpBuffer; }   // can't jump yet: remember the press

  fireJump(allowAirJump) {                 // -> true if a jump happened
    const P = this.phys, dashing = this.stateName === 'dash';
    if (this.attack && !this.canCancel('jump')) return false;   // mid-attack: the press waits in the jump buffer
    if (this.stateName === 'slide' && !this.canStand()) return false;   // no room to stand: it waits in the buffer
    const canDouble = allowAirJump && this.abilities.doubleJump && this.airJumpReady && !this.grounded && this.coyoteT <= 0;
    if (dashing) {                         // mid-dash only the double jump cuts in; a ground / wall jump waits in the buffer
      if (!canDouble) return false;
    } else if (this.grounded || this.coyoteT > 0) {
      this.vy = -P.jumpForce; this.grounded = false; this.coyoteT = 0;
      this.jumpBufT = 0; this.jumpCutReady = true;
      this.setState('jumpStart'); this.emit('jump');
      return true;
    } else if (this.touching !== 0 && this.abilities.wallSlide) {   // wall jump: up and away from the wall
      this.wallJumpDir = -this.touching; this.vy = -P.wallJumpForce; this.wallJumpLock = P.wallJumpLock;
      this.touching = 0; this.facing = this.wallJumpDir;
      this.jumpBufT = 0; this.jumpCutReady = true;
      this.setState('jumpStart'); this.emit('wallJump');
      return true;
    }
    if (!canDouble) return false;
    this.airJumpReady = false; this.vy = -P.doubleJumpForce;
    this.jumpBufT = 0; this.jumpCutReady = true;
    this.setState('doubleJump'); this.emit('doubleJump');
    return true;
  }

  // VARIABLE JUMP HEIGHT: letting go while clearly rising cuts the upward speed - but never below the apex band,
  // so a release near the top changes nothing (no hitch). Normal, wall and double jumps; not during a dash.
  releaseJump() {
    const band = this.phys.apexBand;
    if (this.jumpCutReady && this.vy < -band && this.stateName !== 'dash') this.vy = Math.min(this.vy * this.phys.jumpCut, -band);
    this.jumpCutReady = false;
  }

  // ---------- DASH ----------
  tryDash(input) {
    if (this.attack && !this.canCancel('dash')) return false;
    if (this.stateName === 'slide') return false;
    if (!this.abilities.dash || this.stateName === 'dash' || this.dashCooldown > 0 || this.wallJumpLock > 0) return false;
    if (!this.grounded && !this.airDashReady) return false;   // one air dash per airtime
    if (!this.grounded) this.airDashReady = false;
    const held = input && this.stateName !== 'wallSlide' ? input.axisX() : 0;   // off a wall she always dashes away from it
    this.dashDir = held !== 0 ? held : this.facing;
    this.dashCooldown = this.phys.dashCooldown;
    this.setState('dash'); this.emit('dash');
    return true;
  }

  // ---------- SLIDE ----------
  canStand() {                             // would her standing hurtbox fit where she is now?
    return !boxHitsSolid(this.room, this.x, this.y, this.char.hurtbox.w, this.char.hurtbox.h);
  }

  trySlide(input) {
    if (!this.abilities.slide || !this.grounded || this.slideCooldown > 0 || this.stateName === 'slide' || this.wallJumpLock > 0) return false;
    if (this.attack && !this.canCancel('dash')) return false;
    const S = this.char.slide, held = input ? input.axisX() : 0, dir = held !== 0 ? held : this.facing;
    // the slide body is wider: grow it, then nudge her away from a wall it would poke into. No room at all -> no slide.
    let x = this.x;
    for (const s of this.room.solids) {
      if (!(this.y - S.h < s.y + s.h && this.y > s.y && x - S.w / 2 < s.x + s.w && x + S.w / 2 > s.x)) continue;
      x = s.x + s.w / 2 > x ? Math.min(x, s.x - S.w / 2) : Math.max(x, s.x + s.w + S.w / 2);
    }
    if (Math.abs(x - this.x) > (S.w - this.w) / 2 + 0.01 || boxHitsSolid(this.room, x, this.y, S.w, S.h)) return false;
    this.x = x; this.w = S.w; this.h = S.h; this.slideDir = dir;
    this.slideCooldown = this.phys.slideCooldown;
    this.slideStrike = S.hit ? { def: S, name: 'slide', t: 0, dir, hit: new Map() } : null;   // feet first = the low kick
    this.setState('slide'); this.emit('slide');
    return true;
  }

  standUp() {                              // back to the standing hurtbox (callers check canStand first)
    if (this.h === this.char.hurtbox.h && this.w === this.char.hurtbox.w) return;
    this.w = this.char.hurtbox.w; this.h = this.char.hurtbox.h; this.slideStrike = null;
  }

  // ---------- ATTACKS (frame data) ----------
  canCancel(into) {                        // is the current attack inside a cancel window for this action?
    const a = this.attack, c = a && a.def.cancel;
    return !!c && a.frame >= c.from && c.into.includes(into);
  }

  tryAttack(button) {                      // button -> which attack, by situation (later: Up / Down + button variants)
    const map = this.char.buttons[button]; if (!map) return false;
    if (this.attack && !this.canCancel('attack')) return false;
    if (this.stateName === 'slide' && !this.canStand()) return false;
    const name = this.grounded ? map.ground : map.air, def = name && this.char.attacks[name];
    if (!def) return false;
    if (def.oncePerAirtime && this.airAttacksUsed[name]) return false;
    if (def.oncePerAirtime) this.airAttacksUsed[name] = true;
    if (def.vyKeep != null) this.vy *= def.vyKeep;
    if (def.momentumKeep != null) this.vx *= def.momentumKeep;   // 'slowed': she keeps part of her run speed and coasts down
    this.wallJumpLock = 0;
    this.setState('attack');               // (leaves a dash / wall slide; exit() of the old attack clears this.attack first)
    this.attack = { def, name, t: 0, frame: 0, dir: this.facing, hit: new Map() };
    this.emit('attack', name);
    return true;
  }

  activeHitboxes() {                       // world rects of the frame on screen (frame data is relative to her feet, facing right)
    const ss = this.slideStrike;
    if (ss) return ss.def.hit.map(b => ({ x: ss.dir > 0 ? this.x + b.x : this.x - b.x - b.w, y: this.y + b.y, w: b.w, h: b.h }));
    const a = this.attack; if (!a) return [];
    const f = a.def.frames[a.frame];
    const boxes = (f.hit || []).map(b => ({ x: a.dir > 0 ? this.x + b.x : this.x - b.x - b.w, y: this.y + b.y, w: b.w, h: b.h }));
    const r = this.beamRay(); if (r) boxes.push({ x: Math.min(r.x0, r.x1), y: r.y - r.h / 2, w: Math.abs(r.x1 - r.x0), h: r.h });
    return boxes;
  }

  // A beam frame: a horizontal ray from her hand to the first solid in the way (or maxLen) -> { x0, x1, y, h, dir, blocked }
  beamRay() {
    const a = this.attack, b = a && a.def.frames[a.frame].beam; if (!b) return null;
    const dir = a.dir, x0 = this.x + dir * b.x, y = this.y + b.y, top = y - b.h / 2, bot = y + b.h / 2;
    const start = a.frame > 0 ? a.def.frames[a.frame - 1].end : 0;           // the beam grows out of her hand over growMs
    const grow = b.growMs ? Math.min(1, (a.t - start) / (b.growMs / 1000)) : 1;
    let len = b.maxLen, blocked = false;
    for (const s of this.room.solids) {
      if (s.y >= bot || s.y + s.h <= top) continue;
      const d = dir > 0 ? s.x - x0 : x0 - (s.x + s.w);                     // distance from the hand to the solid's near face
      if (d < 0 && (dir > 0 ? s.x + s.w > x0 : s.x < x0)) { len = 0; blocked = true; break; }   // hand already inside a wall
      if (d >= 0 && d < len) { len = d; blocked = true; }
    }
    const reach = len * (1 - Math.pow(1 - grow, 3));                          // easeOutCubic
    return { x0, x1: x0 + dir * reach, y, h: b.h, dir, blocked: blocked && reach >= len - 0.5, len };
  }
}
