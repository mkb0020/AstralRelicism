// HEADLESS FEEL CHECK: runs the real controller (no browser) and compares it with the numbers in ControllerNotes.md.
//   node tests/physics.test.mjs      (or: npm test)
import { readFileSync } from 'node:fs';
import { Player, prepareCharacter } from '../src/player/player.js';
import { buildRoom } from '../src/world/room.js';
import { FIXED_DT, TILE, TRANSITION } from '../src/config.js';
import { createWorld } from '../src/world/world.js';

const char = prepareCharacter(JSON.parse(readFileSync(new URL('../data/characters/nova.json', import.meta.url))));
const greybox = JSON.parse(readFileSync(new URL('../data/rooms/greybox.json', import.meta.url)));

// a fake input device: hold / press / release actions by hand
function fakeInput() {
  const held = new Set(), i = {
    pressed: [], released: [], down: a => held.has(a), axisX: () => (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
    press(a) { held.add(a); i.pressed.push(a); }, release(a) { held.delete(a); i.released.push(a); }, hold(a) { held.add(a); }, let(a) { held.delete(a); },
  };
  return i;
}
function flatRoom(cols = 200, rows = 40, extra = () => {}) {   // open room: floor on the bottom 2 rows
  const g = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => (y >= rows - 2 || x === 0 || x === cols - 1 ? '#' : '.')));
  extra(g);
  return buildRoom({ mask: g.map(r => r.join('')), spawn: [20, rows - 3] }, 'test');
}
function make(room = flatRoom(), abilities = {}) {
  const p = new Player(char, room); Object.assign(p.abilities, abilities);
  const input = fakeInput();
  const step = (n = 1) => { for (let k = 0; k < n; k++) { p.step(FIXED_DT, input); input.pressed.length = input.released.length = 0; } };
  step(5);                                                    // settle onto the floor
  return { p, input, step };
}
function airtime(t, onStep) {                                 // run until she lands again -> { peak, time, dist }
  const { p, step } = t, y0 = p.y, x0 = p.x; let minY = p.y, n = 0;
  do { step(); n++; if (p.y < minY) minY = p.y; if (onStep) onStep(n); } while (!p.grounded && n < 500);
  return { peak: y0 - minY, time: n * FIXED_DT, dist: Math.abs(p.x - x0) };
}

let failed = 0;
function check(name, got, want, tol, unit = 'px') {
  const ok = Math.abs(got - want) <= tol; if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(34)} ${got.toFixed(2).padStart(8)} ${unit}   (expected ${want} ± ${tol})`);
}
function truthy(name, cond, detail = '') { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name.padEnd(34)} ${detail}`); }

// ----- full jump (hold)
{ const t = make(); t.input.press('jump'); const a = airtime(t);
  check('full jump: peak', a.peak, 218, 4); check('full jump: airtime', a.time, 1.08, 0.04, 's'); }
// ----- time to apex
{ const t = make(); t.input.press('jump'); let n = 0; do { t.step(); n++; } while (t.p.vy < 0);
  check('full jump: time to apex', n * FIXED_DT, 0.56, 0.04, 's'); }
// ----- tap hop: a quick tap (key up after 80 ms) and the shortest possible hop (key up after 1 step)
{ const t = make(); t.input.press('jump'); const a = airtime(t, n => { if (n === 4) t.input.release('jump'); });
  check('tap hop (80 ms tap): peak', a.peak, 100, 12); }
{ const t = make(); t.input.press('jump'); const a = airtime(t, n => { if (n === 1) t.input.release('jump'); });
  check('shortest hop: peak', a.peak, 72, 6); }
// ----- releasing near the top changes nothing
{ const t = make(); t.input.press('jump'); const a = airtime(t, () => { if (t.p.vy > -300 && t.p.vy < 0 && t.input.down('jump')) t.input.release('jump'); });
  check('late release: peak unchanged', a.peak, 218, 4); }
// ----- double jump at the apex
{ const t = make(undefined, { doubleJump: true }); t.input.press('jump'); let done = false;
  const a = airtime(t, () => { if (!done && t.p.vy >= 0) { done = true; t.input.release('jump'); t.input.press('jump'); } });
  check('double jump: added height', a.peak - 218, 145, 6); }
// ----- double jump is locked by default
{ const t = make(); t.input.press('jump'); let done = false;
  const a = airtime(t, () => { if (!done && t.p.vy >= 0) { done = true; t.input.release('jump'); t.input.press('jump'); } });
  check('double jump locked: peak', a.peak, 218, 4); }
// ----- ground dash distance (8 steps at 1500) and the slide-out after it
{ const t = make(); const x0 = t.p.x; t.input.press('dash'); t.step(8);
  check('dash: distance', t.p.x - x0, 240, 0.5); truthy('dash: ended after 0.16 s', t.p.stateName !== 'dash', t.p.stateName);
  t.step(20); check('dash: slide-out', t.p.x - x0 - 240, 66, 15); check('dash: stops', t.p.vx, 0, 0.01, 'px/s'); }
// ----- air dash: no gravity, one per airtime
{ const t = make(); t.input.press('jump'); t.step(12); const y0 = t.p.y; t.input.press('dash'); t.step(8);
  check('air dash: height change', t.p.y - y0, 0, 1); t.step(20); t.input.press('dash'); t.step(1);
  truthy('air dash: only one per airtime', !t.p.grounded && t.p.dashCooldown <= 0 && t.p.stateName !== 'dash', t.p.stateName); }
// ----- run: time to full speed, running jump distance
{ const t = make(); t.input.hold('right'); let n = 0; while (t.p.vx < 650 && n < 50) { t.step(); n++; }
  check('run: time to full speed', n * FIXED_DT, 0.065, 0.021, 's');
  t.input.press('jump'); const a = airtime(t); check('running jump: distance', a.dist / TILE, 17.5, 1, 'tiles'); }
// ----- coyote time + jump buffer
{ const room = flatRoom(200, 40, g => { for (let x = 60; x < 199; x++) for (let y = 38; y < 40; y++) g[y][x] = '.'; for (let x = 60; x < 199; x++) g[39][x] = '#'; });
  const t = make(room); t.p.x = 60 * TILE - 30; t.input.hold('right'); let n = 0; while (t.p.grounded && n < 50) { t.step(); n++; }
  t.step(3); t.input.press('jump'); t.step(); truthy('coyote: jump 80 ms after the ledge', t.p.vy < -800, 'vy ' + t.p.vy.toFixed(0)); }
{ const t = make(); t.input.press('jump'); t.step(4); t.input.release('jump'); let n = 0; while (t.p.vy <= 0 || t.p.y < t.p.room.h - 2 * TILE - 30) { t.step(); if (++n > 200) break; }
  t.input.press('jump'); let jumped = false; for (let k = 0; k < 6; k++) { t.step(); if (t.p.vy < -800) jumped = true; }
  truthy('buffer: press just before landing', jumped); }
// ----- wall jump + wall slide (walls 6 tiles apart)
{ const room = flatRoom(60, 60, g => { for (let y = 5; y < 58; y++) { g[y][26] = '#'; g[y][33] = '#'; } });
  const t = make(room, { wallSlide: true }); t.p.x = 33 * TILE - 19; t.input.hold('right'); t.input.press('jump'); t.step(40);
  truthy('wall slide: state', t.p.stateName === 'wallSlide', t.p.stateName); check('wall slide: fall speed', t.p.vy, 150, 30, 'px/s');   // capped at 150 before gravity is added, as in PLAY
  const y0 = t.p.y; t.input.release('jump'); t.step(); t.input.press('jump'); let minY = t.p.y, kicked = false;
  for (let k = 0; k < 40; k++) { t.step(); if (k === 0) kicked = t.p.vx < 0; if (t.p.y < minY) minY = t.p.y; }
  truthy('wall jump: kicks away', kicked); check('wall jump: height', y0 - minY, 176, 8); }
{ const room = flatRoom(60, 60, g => { for (let y = 5; y < 58; y++) g[y][33] = '#'; });
  const t = make(room); t.p.x = 33 * TILE - 19; t.input.hold('right'); t.input.press('jump'); t.step(40);
  truthy('wall slide locked by default', t.p.stateName !== 'wallSlide', t.p.stateName); }
// ----- 148 px hurtbox walks through a 4-tile corridor; greybox room loads
{ const room = flatRoom(80, 40, g => { for (let x = 30; x < 50; x++) for (let y = 0; y < 34; y++) g[y][x] = '#'; });
  const t = make(room); t.input.hold('right'); t.step(120); truthy('4-tile corridor: passes', t.p.x > 50 * TILE, 'x ' + (t.p.x / TILE).toFixed(1) + ' tiles'); }
{ const room = buildRoom(greybox, 'greybox'); const t = make(room); truthy('greybox: spawns on the floor', t.p.grounded, `${room.cols} x ${room.rows} tiles, ${room.solids.length} solids`); }

// ===== ATTACKS (frame data) =====
const kickDef = char.attacks.kick, airDef = char.attacks.airKick;
// ----- ground kick: planted, 0.25 s, phases, hitbox only on the active frame
{ const t = make(); t.input.hold('right'); t.step(10); const x0 = t.p.x; t.input.press('kick'); t.step();
  truthy('kick: enters attack', t.p.stateName === 'attack' && t.p.attack.name === 'kick', t.p.stateName);
  let steps = 1, active = 0, x1 = t.p.x; while (t.p.stateName === 'attack' && steps < 60) { if (t.p.activeHitboxes().length) active++; t.step(); steps++; }
  check('kick: planted (distance moved)', t.p.x - x1, 0, 0.01); check('kick: duration', (steps - 1) * FIXED_DT, kickDef.total, 0.021, 's');
  truthy('kick: hitbox only while active', active >= 2 && active <= 4, active + ' steps');
  truthy('kick: phases', kickDef.frames.map(f => f.phase[0]).join('') === 'ssssar', kickDef.frames.map(f => f.phase).join(' ')); }
// ----- jump pressed mid-kick is buffered, then fires in the cancel window
{ const t = make(); t.input.press('kick'); t.step(2); t.input.press('jump'); t.step();
  truthy('kick: jump waits mid-attack', t.p.stateName === 'attack' && t.p.grounded);
  let jumped = false; for (let k = 0; k < 20; k++) { t.step(); t.input.press('jump'); if (t.p.vy < -800) { jumped = true; break; } }
  truthy('kick: jump cancels the recovery', jumped && t.p.stateName !== 'attack', t.p.stateName); }
// ----- air kick: lunge, reduced gravity, once per airtime, ends on landing
{ const t = make(); t.input.press('jump'); t.step(20); const x0 = t.p.x, vy0 = t.p.vy; t.input.press('kick'); t.step();
  truthy('air kick: enters attack', t.p.attack && t.p.attack.name === 'airKick', t.p.stateName);
  let n = 1; while (t.p.stateName === 'attack' && n < 60) { t.step(); n++; }
  check('air kick: lunge distance', t.p.x - x0, 115, 15); check('air kick: duration', (n - 1) * FIXED_DT, airDef.total, 0.021, 's');
  t.input.press('kick'); t.step(); truthy('air kick: once per airtime', t.p.stateName !== 'attack' && !t.p.grounded, t.p.stateName);
  let m = 0; while (!t.p.grounded && m++ < 200) t.step(); t.step(2); t.input.press('kick'); t.step();
  truthy('air kick: refills on the ground', t.p.attack && t.p.attack.name === 'kick', t.p.stateName); }
{ const t = make(); t.input.press('jump'); t.step(2); t.input.release('jump'); let n = 0; while (t.p.vy < 300 && n++ < 100) t.step();
  t.input.press('kick'); t.step(); let k = 0; while (!t.p.grounded && k++ < 100) t.step(); t.step();
  truthy('air kick: landing ends it', t.p.stateName !== 'attack', t.p.stateName); }
// ----- hitboxes mirror with facing
{ const t = make(); t.input.press('kick'); t.step(9); const r = t.p.activeHitboxes()[0];
  const u = make(); u.input.hold('left'); u.step(3); u.input.let('left'); u.step(10); u.input.press('kick'); u.step(9); const l = u.p.activeHitboxes()[0];
  truthy('hitbox: in front of her, both ways', !!r && !!l && r.x > t.p.x && l.x + l.w < u.p.x, r && l ? `right ${(r.x - t.p.x).toFixed(0)}, left ${(l.x + l.w - u.p.x).toFixed(0)}` : 'no hitbox'); }

// ----- slash: 'slowed' (keeps some run speed, coasts down), hits on frames 2-3, can chain into another slash
{ const slashDef = char.attacks.slash;
  const t = make(); t.input.hold('right'); t.step(10); const x0 = t.p.x; t.input.press('attack'); t.step();
  truthy('slash: enters attack', t.p.attack && t.p.attack.name === 'slash', t.p.stateName);
  let n = 1, active = 0; while (t.p.stateName === 'attack' && n < 60) { if (t.p.activeHitboxes().length) active++; t.step(); n++; }
  const moved = t.p.x - x0;
  truthy('slash: slowed, not planted or full speed', moved > 40 && moved < 650 * slashDef.total * 0.6, moved.toFixed(0) + ' px while holding forward');
  const w = make(); w.input.hold('right'); w.step(10); w.input.let('right'); const wx = w.p.x; w.input.press('attack'); w.step(14);
  truthy('slash: coasts to a stop when not held', w.p.vx === 0 && w.p.x - wx > 10, (w.p.x - wx).toFixed(0) + ' px');
  check('slash: duration', (n - 1) * FIXED_DT, slashDef.total, 0.021, 's'); truthy('slash: hitbox on the swing frames', active >= 4 && active <= 6, active + ' steps');
  const u = make(); u.input.press('attack'); u.step(); let k = 0; while (u.p.attack.frame < 4 && k++ < 30) u.step(); u.input.press('attack'); u.step();
  truthy('slash: chains in the cancel window', u.p.attack && u.p.attack.frame === 0 && u.p.attack.t < 0.05, u.p.attack ? 'frame ' + u.p.attack.frame : u.p.stateName); }
// ----- air slash: reduced gravity, carries on through a landing
{ const t = make(); t.input.press('jump'); t.step(30); t.input.press('attack'); t.step();
  truthy('air slash: in the air', t.p.attack && t.p.attack.name === 'airSlash', t.p.stateName);
  let n = 0; while (t.p.stateName === 'attack' && n++ < 40) t.step(); truthy('air slash: ends', t.p.stateName !== 'attack', t.p.stateName); }

// ===== ROOMS + TRANSITIONS =====
const readJSON = rel => JSON.parse(readFileSync(new URL('../' + rel, import.meta.url)));
const worldJSON = readJSON('data/world.json');
const world = createWorld(worldJSON, Object.fromEntries(Object.entries(worldJSON.rooms).map(([id, r]) => [id, readJSON(r.file)])));
truthy('world: every exit is open and linked both ways', world.problems.length === 0, world.problems.join(' | ') || `${Object.keys(world.rooms).length} rooms`);
function travel(t, steps) {                                   // the game's own hand-over, without the fade: -> list of rooms entered
  const seen = [];
  for (let k = 0; k < steps; k++) {
    t.step(); const left = world.exitAt(t.p.room, t.p); if (!left) continue;
    if (!left.exit) { seen.push('VOID'); break; }
    const a = world.arrival(left.exit, t.p, TRANSITION.upBoost);
    t.p.room = a.room; Object.assign(t.p, { x: a.x, y: a.y, vy: a.vy, touching: 0, grounded: false }); seen.push(a.room.id + '.' + a.exit.name);
  }
  return seen;
}
// ----- walk out of the east door -> standing on the annex's ledge, same height above the door's floor
{ const t = make(world.rooms.greybox); Object.assign(t.p, { x: 147 * TILE, y: 35 * TILE }); t.input.hold('right'); const seen = travel(t, 40);
  truthy('door: greybox east -> annex west', seen.join() === 'annex.west', seen.join() || 'never left');
  truthy('door: lands on the annex floor', t.p.grounded && t.p.y === 12 * TILE && t.p.x > 0, `y ${t.p.y}, x ${t.p.x.toFixed(0)}`); }
// ----- and straight back again
{ const t = make(world.rooms.annex); t.input.hold('left'); const seen = travel(t, 40);
  truthy('door: annex west -> greybox east', seen.join() === 'greybox.east' && t.p.grounded && t.p.y === 35 * TILE, seen.join() + ` y ${t.p.y}`); }
// ----- crossing a door in the air keeps her height above the door's floor
{ const t = make(world.rooms.greybox); Object.assign(t.p, { x: 150 * TILE - 5, y: 35 * TILE - 8, vx: 650, vy: 0, grounded: false }); t.input.hold('right');
  const seen = travel(t, 1); truthy('door: crossed in the air', seen.join() === 'annex.west', seen.join() || 'never left');
  check('door: height carried through', 12 * TILE - t.p.y, 8, 3); }
// ----- fall through the hatch -> cellar ceiling, same sideways position; lands on the cellar floor
{ const t = make(world.rooms.greybox); Object.assign(t.p, { x: 89.5 * TILE, y: 40 * TILE }); const seen = travel(t, 30);
  truthy('hatch: greybox -> cellar', seen.join() === 'cellar.hatch', seen.join() || 'never left'); check('hatch: sideways position kept', t.p.x, 31.5 * TILE, 1);
  travel(t, 120); truthy('hatch: lands on the ledge under it', t.p.grounded && t.p.room.id === 'cellar' && t.p.y === 5 * TILE, `y ${t.p.y}`); }
// ----- jump up through the cellar hatch -> arrives in the pit with enough lift to step onto its floor
{ const t = make(world.rooms.cellar); Object.assign(t.p, { x: 31.5 * TILE, y: 5 * TILE }); t.step(3); t.input.press('jump'); let seen = travel(t, 30);
  truthy('hatch: cellar -> greybox', seen.join() === 'greybox.hatch', seen.join() || 'never left');
  t.input.hold('left'); seen = travel(t, 80);
  truthy('hatch: climbs out onto the pit floor', !seen.length && t.p.grounded && t.p.y === 41 * TILE, `${seen.join()} y ${t.p.y}`); }
// ----- out of bounds where there is no exit
{ const t = make(world.rooms.cellar); Object.assign(t.p, { x: -40, y: 300 }); const left = world.exitAt(t.p.room, t.p);
  truthy('no exit on that side -> respawn', left && left.exit === null); }

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
