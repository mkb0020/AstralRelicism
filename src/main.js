// ASTRAL RELICISM - BOOT + FRAME.
import { VIEW_W, VIEW_H, FIXED_DT, MAX_STEPS_PER_FRAME, PATHS, COLORS, TRANSITION } from './config.js';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { loadJSON } from './core/assets.js';
import { createWorld } from './world/world.js';
import { drawRoom, drawExits } from './world/roomRender.js';
import { Dummy } from './world/dummy.js';
import { Player, prepareCharacter } from './player/player.js';
import { PlayerView } from './player/playerView.js';
import { createCamera } from './render/camera.js';
import { createDebug } from './debug/debug.js';
import { resolveHits } from './combat/combat.js';
import { BeamFx } from './fx/beamFx.js';

const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');

// THE VIEW. 'fit'  = always show the 48 x 27 tile design view, scaled to the window (letterboxed).
//           'pixel' = 1 world px = 1 screen px; a smaller window just shows less of the room.
const screen = { mode: 'fit', W: 0, H: 0, dpr: 1, scale: 1, offX: 0, offY: 0, viewW: VIEW_W, viewH: VIEW_H };
function resize() {
  screen.dpr = Math.min(window.devicePixelRatio || 1, 2); screen.W = innerWidth; screen.H = innerHeight;
  canvas.width = Math.round(screen.W * screen.dpr); canvas.height = Math.round(screen.H * screen.dpr);
  if (screen.mode === 'fit') {
    screen.scale = Math.min(screen.W / VIEW_W, screen.H / VIEW_H); screen.viewW = VIEW_W; screen.viewH = VIEW_H;
    screen.offX = (screen.W - VIEW_W * screen.scale) / 2; screen.offY = (screen.H - VIEW_H * screen.scale) / 2;
  } else { screen.scale = 1; screen.viewW = screen.W; screen.viewH = screen.H; screen.offX = screen.offY = 0; }
}
addEventListener('resize', resize);

async function boot() {
  // ----- load: character, world, every room the world lists
  const [charJSON, worldJSON] = await Promise.all([loadJSON(PATHS.character), loadJSON(PATHS.world)]);
  const ids = Object.keys(worldJSON.rooms || {}), maps = {};
  await Promise.all(ids.map(async id => { maps[id] = await loadJSON(worldJSON.rooms[id].file); }));
  const world = createWorld(worldJSON, maps);
  for (const p of world.problems) console.warn('[world] ' + p);
  for (const id of ids) world.rooms[id].dummies = (maps[id].dummies || []).map(d => new Dummy(d.col, d.row));

  const char = prepareCharacter(charJSON);
  let room = world.rooms[world.start];
  const player = new Player(char, room);
  const view = new PlayerView(char);
  const beamFx = new BeamFx(char.fx && char.fx.beam);
  await view.load();
  try { await document.fonts.load('14px "Share Tech Mono"'); } catch (e) { /* falls back to Consolas */ }

  const input = createInput();
  const cam = createCamera();
  resize();
  const snapCamera = () => { cam.viewW = screen.viewW; cam.viewH = screen.viewH; cam.snapTo(player.x, player.y, room); };
  snapCamera();

  // ----- rooms: where she respawns, and the fade between rooms
  let checkpoint = { room, x: room.spawn.x, y: room.spawn.y };   // the last door she walked through (or the room's spawn)
  let transition = null;                                         // { phase: 'out' | 'in', t, arrive }
  function setRoom(next) { room = next; player.room = next; }
  function respawn() { setRoom(checkpoint.room); player.spawn(checkpoint.x, checkpoint.y); view.reset(); beamFx.reset(); transition = null; snapCamera(); }
  function leaveThrough(exit) {
    if (!exit) { respawn(); return; }                            // out of bounds with no exit there
    player.px = player.x; player.py = player.y;                  // hold her still while the screen fades
    transition = { phase: 'out', t: 0, exit };
  }
  function arrive(exit) {
    const a = world.arrival(exit, player, TRANSITION.upBoost);
    setRoom(a.room); beamFx.reset();
    Object.assign(player, { x: a.x, y: a.y, px: a.x, py: a.y, vy: a.vy, touching: 0, grounded: false });
    if (a.exit.side === 'left' || a.exit.side === 'right') checkpoint = { room: a.room, x: a.x, y: a.exit.hi };   // side doors have a floor to stand on
    snapCamera();
  }

  const loop = createLoop({ step, render, fixedDt: FIXED_DT, maxSteps: MAX_STEPS_PER_FRAME });
  const debug = createDebug({
    player, view, loop, char,
    toggleViewMode: () => { screen.mode = screen.mode === 'fit' ? 'pixel' : 'fit'; resize(); },
    viewModeName: () => screen.mode,
    respawn,
    nextRoom: () => { const next = world.rooms[ids[(ids.indexOf(room.id) + 1) % ids.length]]; checkpoint = { room: next, x: next.spawn.x, y: next.spawn.y }; respawn(); },
  });

  function step(dt) {
    if (transition) {
      transition.t += dt;
      if (transition.phase === 'out') {                          // fading out: the game holds still
        if (transition.t < TRANSITION.fadeOut) return;
        arrive(transition.exit); transition = { phase: 'in', t: 0 };
      } else if (transition.t >= TRANSITION.fadeIn) transition = null;
    }
    input.poll();
    player.step(dt, input);
    if (player.events.some(e => e.type === 'spawn')) snapCamera();
    const left = world.exitAt(room, player);
    if (left && !(transition && transition.phase === 'out')) leaveThrough(left.exit);
    resolveHits(player, room.dummies, { hitStop: sec => loop.hitStop(sec), shake: (dur, str) => { if (view.fxOn) cam.shake(dur, str); } });
    for (const d of room.dummies) d.update(dt);
    view.update(player, dt);
    beamFx.update(player, dt);
    debug.afterStep(dt);
  }

  function render(alpha, frameDt, frozen) {
    const holding = frozen || (transition && transition.phase === 'out');
    const x = player.px + (player.x - player.px) * alpha, y = player.py + (player.y - player.py) * alpha;
    cam.viewW = screen.viewW; cam.viewH = screen.viewH;
    cam.follow(x, y, player.grounded, room, frameDt, holding);

    const d = screen.dpr, s = screen.scale;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = COLORS.bars; ctx.fillRect(0, 0, screen.W, screen.H);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';

    ctx.save();
    ctx.beginPath(); ctx.rect(screen.offX, screen.offY, screen.viewW * s, screen.viewH * s); ctx.clip();
    ctx.fillStyle = COLORS.bg; ctx.fillRect(screen.offX, screen.offY, screen.viewW * s, screen.viewH * s);
    ctx.translate(screen.offX, screen.offY); ctx.scale(s, s);
    ctx.translate(Math.round(screen.viewW / 2 - cam.x - cam.shakeX), Math.round(screen.viewH / 2 - cam.y - cam.shakeY));
    drawRoom(ctx, room, cam, debug.grid);
    if (debug.overlay) drawExits(ctx, room);
    for (const dm of room.dummies) dm.draw(ctx);
    view.draw(ctx, x, y, player.facing);
    beamFx.draw(ctx, performance.now() / 1000);
    debug.drawWorld(ctx, x, y);
    ctx.restore();

    if (transition) {                                            // the fade, over the game view only
      const k = transition.phase === 'out' ? Math.min(1, transition.t / TRANSITION.fadeOut) : 1 - Math.min(1, transition.t / TRANSITION.fadeIn);
      ctx.fillStyle = COLORS.bars; ctx.globalAlpha = k; ctx.fillRect(screen.offX, screen.offY, screen.viewW * s, screen.viewH * s); ctx.globalAlpha = 1;
    }
    debug.drawHud(ctx, screen.W, screen.H, frameDt);
  }

  loop.start();
  window.AR = { player, beamFx, world, cam, loop, view, input, screen, get room() { return room; } };   // for poking around in the console
}

boot().catch(e => {
  console.error(e);
  const d = document.createElement('div'); d.id = 'err';
  d.textContent = 'Load error: ' + e.message + '. The game must be served over http (npm start, or VS Code Live Server) - opening index.html as a file:// page cannot load modules or sprite sheets.';
  document.body.appendChild(d);
});
