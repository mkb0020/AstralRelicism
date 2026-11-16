// GREYBOX ROOM DRAWING (no art yet): flat solids, thin ledges, a tile grid and the room's test labels.
import { TILE, COLORS } from '../config.js';

export function drawRoom(ctx, room, cam, showGrid) {
  const x0 = cam.x - cam.viewW / 2, y0 = cam.y - cam.viewH / 2, x1 = x0 + cam.viewW, y1 = y0 + cam.viewH;
  const seen = r => r.x < x1 && r.x + r.w > x0 && r.y < y1 && r.y + r.h > y0;
  if (showGrid) {
    const gx0 = Math.max(0, Math.floor(x0 / TILE)), gx1 = Math.min(room.cols, Math.ceil(x1 / TILE));
    const gy0 = Math.max(0, Math.floor(y0 / TILE)), gy1 = Math.min(room.rows, Math.ceil(y1 / TILE));
    ctx.lineWidth = 1;
    for (const major of [false, true]) {                    // every 4th line is brighter (4 tiles = Nova's height)
      ctx.strokeStyle = major ? COLORS.gridMajor : COLORS.grid; ctx.beginPath();
      for (let x = gx0; x <= gx1; x++) if ((x % 4 === 0) === major) { ctx.moveTo(x * TILE + 0.5, gy0 * TILE); ctx.lineTo(x * TILE + 0.5, gy1 * TILE); }
      for (let y = gy0; y <= gy1; y++) if ((y % 4 === 0) === major) { ctx.moveTo(gx0 * TILE, y * TILE + 0.5); ctx.lineTo(gx1 * TILE, y * TILE + 0.5); }
      ctx.stroke();
    }
  }
  ctx.fillStyle = COLORS.solid; ctx.strokeStyle = COLORS.solidEdge; ctx.lineWidth = 2;
  for (const s of room.solids) if (seen(s)) ctx.fillRect(s.x, s.y, s.w, s.h);
  for (const s of room.solids) if (seen(s)) ctx.strokeRect(s.x + 1, s.y + 1, s.w - 2, s.h - 2);
  ctx.fillStyle = COLORS.oneWay;
  for (const o of room.oneWays) if (seen(o)) { ctx.globalAlpha = 0.9; ctx.fillRect(o.x, o.y, o.w, 6); ctx.globalAlpha = 0.12; ctx.fillRect(o.x, o.y + 6, o.w, o.h - 6); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.label; ctx.font = '16px "Share Tech Mono", Consolas, monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  for (const l of room.labels) { const x = l.col * TILE, y = (l.row + 0.5) * TILE; if (x < x1 && x + 600 > x0 && y > y0 - 20 && y < y1 + 20) ctx.fillText(l.text, x, y); }
}

// debug: where the room's exits are and where they lead
export function drawExits(ctx, room) {
  ctx.font = '14px "Share Tech Mono", Consolas, monospace'; ctx.textBaseline = 'middle';
  for (const e of room.exits || []) {
    const side = e.side, len = e.hi - e.lo, t = 10;
    const r = side === 'left' ? [0, e.lo, t, len] : side === 'right' ? [room.w - t, e.lo, t, len] : side === 'top' ? [e.lo, 0, len, t] : [e.lo, room.h - t, len, t];
    ctx.fillStyle = COLORS.exit; ctx.globalAlpha = 0.8; ctx.fillRect(...r); ctx.globalAlpha = 1;
    ctx.textAlign = side === 'right' ? 'right' : side === 'left' ? 'left' : 'center';
    const tx = side === 'left' ? 18 : side === 'right' ? room.w - 18 : e.lo + len / 2, ty = side === 'top' ? 26 : side === 'bottom' ? room.h - 26 : e.lo + len / 2;
    ctx.fillText(e.name + ' -> ' + e.leadsTo, tx, ty);
  }
  ctx.textAlign = 'left';
}
