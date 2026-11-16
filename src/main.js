// ASTRAL RELICISM - BOOT + FRAME.
import { VIEW_W, VIEW_H, FIXED_DT, MAX_STEPS_PER_FRAME, PATHS, COLORS } from './config.js';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { loadJSON } from './core/assets.js';
import { buildRoom } from './world/room.js';
import { drawRoom } from './world/roomRender.js';
import { Player, prepareCharacter } from './player/player.js';
import { PlayerView } from './player/playerView.js';
import { createCamera } from './render/camera.js';
import { createDebug } from './debug/debug.js';
import { resolveHits } from './combat/combat.js';
import { Dummy } from './world/dummy.js';

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
  const [charJSON, roomJSON] = await Promise.all([loadJSON(PATHS.character), loadJSON(PATHS.room)]);
  const char = prepareCharacter(charJSON);
  const room = buildRoom(roomJSON, PATHS.room);
  const player = new Player(char, room);
  const dummies = (roomJSON.dummies || []).map(d => new Dummy(d.col, d.row));
  const view = new PlayerView(char);
  await view.load();
  try { await document.fonts.load('14px "Share Tech Mono"'); } catch (e) { /* falls back to Consolas */ }

  const input = createInput();
  const cam = createCamera();
  resize();
  cam.viewW = screen.viewW; cam.viewH = screen.viewH;
  cam.snapTo(player.x, player.y, room);

  const loop = createLoop({ step, render, fixedDt: FIXED_DT, maxSteps: MAX_STEPS_PER_FRAME });
  const debug = createDebug({
    player, view, loop, char,
    toggleViewMode: () => { screen.mode = screen.mode === 'fit' ? 'pixel' : 'fit'; resize(); },
    viewModeName: () => screen.mode,
  });

  function step(dt) {
    input.poll();
    player.step(dt, input);
    if (player.events.some(e => e.type === 'spawn')) { cam.viewW = screen.viewW; cam.viewH = screen.viewH; cam.snapTo(player.x, player.y, room); }
    resolveHits(player, dummies, { hitStop: sec => loop.hitStop(sec), shake: (dur, str) => { if (view.fxOn) cam.shake(dur, str); } });
    for (const d of dummies) d.update(dt);
    view.update(player, dt);
    debug.afterStep(dt);
  }

  function render(alpha, frameDt, frozen) {
    const x = player.px + (player.x - player.px) * alpha, y = player.py + (player.y - player.py) * alpha;
    cam.viewW = screen.viewW; cam.viewH = screen.viewH;
    cam.follow(x, y, player.grounded, room, frameDt, frozen);

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
    for (const d of dummies) d.draw(ctx);
    view.draw(ctx, x, y, player.facing);
    debug.drawWorld(ctx, x, y);
    ctx.restore();

    debug.drawHud(ctx, screen.W, screen.H, frameDt);
  }

  loop.start();
  window.AR = { player, room, cam, loop, view, input, screen, dummies };   // for poking around in the console
}

boot().catch(e => {
  console.error(e);
  const d = document.createElement('div'); d.id = 'err';
  d.textContent = 'Load error: ' + e.message + '. The game must be served over http (npm start, or VS Code Live Server) - opening index.html as a file:// page cannot load modules or sprite sheets.';
  document.body.appendChild(d);
});
