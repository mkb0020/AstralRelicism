// DEBUG: F1 overlay (hitboxes + readout), live tuning panel (F3), ability toggles, pause / frame-step.
// Dev tool only - the game never depends on anything in here.
import { TILE, COLORS } from '../config.js';
import { PHYSICS_FIELDS } from '../player/physics.js';

const FONT = '"Share Tech Mono", Consolas, monospace';

export function createDebug({ player, view, loop, char, toggleViewMode, viewModeName }) {
  const dbg = { overlay: true, grid: true, jump: null, lastJump: null, fps: 0 };
  let fpsAcc = 0, fpsN = 0;
  const defaults = Object.assign({}, player.rawPhysics);

  // ---------- keys ----------
  const ABILITY_KEYS = { Digit1: 'doubleJump', Digit2: 'wallSlide', Digit3: 'dash' };
  addEventListener('keydown', e => {
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    let used = true;
    if (e.code === 'F1') dbg.overlay = !dbg.overlay;
    else if (e.code === 'F2') view.fxOn = !view.fxOn;
    else if (e.code === 'F3') panel.hidden = !panel.hidden;
    else if (e.code === 'F4') toggleViewMode();
    else if (e.code === 'KeyG') dbg.grid = !dbg.grid;
    else if (e.code === 'KeyR') player.spawn(player.room.spawn.x, player.room.spawn.y);
    else if (e.code === 'KeyP') loop.paused = !loop.paused;
    else if (e.code === 'KeyO') { loop.paused = true; loop.stepOnce(); }
    else if (ABILITY_KEYS[e.code]) { const a = ABILITY_KEYS[e.code]; player.abilities[a] = !player.abilities[a]; }
    else used = false;
    if (used) e.preventDefault();
  });

  // ---------- jump measuring (handy while tuning): peak height, airtime, distance of the last airtime ----------
  dbg.afterStep = dt => {
    const j = dbg.jump;
    if (!player.grounded) {
      if (!j) dbg.jump = { y0: player.py, x0: player.px, minY: player.y, t: dt };
      else { j.t += dt; if (player.y < j.minY) j.minY = player.y; }
    } else if (j) { dbg.lastJump = { peak: j.y0 - j.minY, t: j.t, dist: Math.abs(player.x - j.x0) }; dbg.jump = null; }
  };

  // ---------- world-space overlay (called inside the camera transform) ----------
  dbg.drawWorld = (ctx, x, y) => {
    if (!dbg.overlay) return;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COLORS.hurtbox; ctx.strokeRect(x - player.w / 2, y - player.h, player.w, player.h);
    ctx.fillStyle = COLORS.accent; ctx.fillRect(x - 3, y - 3, 6, 6);                        // the anchor: feet, bottom-centre
    ctx.strokeStyle = '#ff6200'; ctx.fillStyle = 'rgba(255, 98, 0, 0.25)';                  // active hitboxes of the attack frame on screen
    for (const b of player.activeHitboxes()) { ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h); }
    if (player.touching) { ctx.fillStyle = COLORS.wallTouch; ctx.fillRect(x + player.touching * (player.w / 2 + 2) - 2, y - player.h, 4, player.h); }
  };

  // ---------- screen-space readout ----------
  dbg.drawHud = (ctx, W, H, frameDt) => {
    fpsAcc += frameDt; fpsN++; if (fpsAcc >= 0.5) { dbg.fps = Math.round(fpsN / fpsAcc); fpsAcc = fpsN = 0; }
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    const ab = player.abilities, on = v => (v ? 'ON ' : 'off');
    ctx.font = '13px ' + FONT;
    ctx.fillStyle = 'rgba(23, 0, 50, 0.72)'; ctx.fillRect(8, H - 52, 700, 44);
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText('F1 debug   F2 squash + shake   F3 tuning   F4 view: ' + viewModeName() + '   G grid   R respawn   P pause   O step', 14, H - 24);
    ctx.fillText(`1 double jump ${on(ab.doubleJump)}   2 wall slide/jump ${on(ab.wallSlide)}   3 dash ${on(ab.dash)}`, 14, H - 44);
    if (!dbg.overlay) return;
    const lj = dbg.lastJump, f = (n, d = 0) => n.toFixed(d);
    const lines = [
      `${dbg.fps} fps${loop.paused ? '   PAUSED' : ''}`,
      `state     ${player.stateName}` + (player.attack ? `   ${player.attack.name}  frame ${player.attack.frame}  ${player.attack.def.frames[player.attack.frame].phase}${player.canCancel('jump') ? '  (cancel window)' : ''}` : ''),
      `pos       ${f(player.x)}, ${f(player.y)}   (tile ${f(player.x / TILE, 1)}, ${f(player.y / TILE, 1)})`,
      `vel       ${f(player.vx)}, ${f(player.vy)}`,
      `grounded  ${player.grounded ? 'yes' : 'no'}   wall ${player.touching === 1 ? 'right' : player.touching === -1 ? 'left' : '-'}   facing ${player.facing > 0 ? 'right' : 'left'}`,
      `air dash  ${player.airDashReady ? 'ready' : 'used'}   air jump ${player.airJumpReady ? 'ready' : 'used'}   dash cd ${f(Math.max(0, player.dashCooldown), 2)}`,
      lj ? `last air  peak ${f(lj.peak)} px (${f(lj.peak / TILE, 2)} tiles)   ${f(lj.t, 2)} s   ${f(lj.dist)} px (${f(lj.dist / TILE, 1)} tiles) across` : 'last air  -',
    ];
    ctx.font = '14px ' + FONT;
    ctx.fillStyle = 'rgba(23, 0, 50, 0.72)'; ctx.fillRect(8, 8, 560, lines.length * 19 + 12);
    lines.forEach((s, i) => { ctx.fillStyle = i === 1 ? COLORS.hurtbox : COLORS.hud; ctx.fillText(s, 16, 15 + i * 19); });
  };

  // ---------- live tuning panel ----------
  const panel = document.createElement('div'); panel.id = 'tuning'; panel.hidden = true;
  const inputs = {};
  const apply = () => {
    const raw = Object.assign({}, player.rawPhysics);
    for (const [k, el] of Object.entries(inputs)) { const v = parseFloat(el.value); if (Number.isFinite(v)) raw[k] = v; el.classList.toggle('changed', raw[k] !== defaults[k]); }
    player.setPhysics(raw);
  };
  const currentJSON = () => JSON.stringify(Object.assign({}, char, { physics: player.rawPhysics, timing: (({ doubleJumpTime, ...t }) => t)(char.timing) }), null, 2);
  const h = document.createElement('h2'); h.textContent = 'NOVA // PHYSICS'; panel.appendChild(h);
  const note = document.createElement('p'); note.textContent = 'Edits apply instantly. Tune one value at a time. Nothing is saved until you download.'; panel.appendChild(note);
  for (const [key, label, unit, step] of PHYSICS_FIELDS) {
    const row = document.createElement('label');
    const name = document.createElement('span'); name.textContent = label;
    const el = document.createElement('input'); el.type = 'number'; el.step = step; el.value = player.rawPhysics[key];
    el.addEventListener('input', apply);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') el.blur(); });
    const u = document.createElement('em'); u.textContent = unit;
    row.append(name, el, u); panel.appendChild(row); inputs[key] = el;
  }
  const btns = document.createElement('div'); btns.className = 'btns';
  const button = (text, fn) => { const b = document.createElement('button'); b.textContent = text; b.addEventListener('click', () => { fn(b); b.blur(); }); btns.appendChild(b); };
  button('RESET', () => { for (const [k, el] of Object.entries(inputs)) el.value = defaults[k]; apply(); });
  button('COPY JSON', b => { navigator.clipboard.writeText(currentJSON()).then(() => { b.textContent = 'COPIED'; setTimeout(() => (b.textContent = 'COPY JSON'), 1200); }).catch(() => { b.textContent = 'COPY FAILED'; }); });
  button('DOWNLOAD nova.json', () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([currentJSON() + '\n'], { type: 'application/json' }));
    a.download = (char.id || 'character') + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  panel.appendChild(btns);
  document.body.appendChild(panel);
  return dbg;
}
