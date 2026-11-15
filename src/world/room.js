// ROOMS. A room file is a Tile Lab map (Onion Studio Wizard):
//   { format: 'osw-tilemap', version: 1, cols, rows, mask: [strings], spawn?: [col, row], labels?: [{ col, row, text }] }
//   mask chars: '#' solid, '.' air, '=' thin ledge (one-way platform).
// Room math is in tiles; the collision shapes it produces are in world px.
import { TILE } from '../config.js';

export function buildRoom(map, name = '') {
  const mask = map && map.mask;
  if (!Array.isArray(mask) || !mask.length || mask.some(r => typeof r !== 'string' || r.length !== mask[0].length || /[^#.=]/.test(r))) throw new Error('not a Tile Lab map: ' + name);
  const rows = mask.length, cols = mask[0].length;
  const kind = (x, y) => (x < 0 || x >= cols || y < 0 || y >= rows) ? '#' : mask[y][x];
  const room = {
    name, cols, rows, kind,
    w: cols * TILE, h: rows * TILE,
    solids: mergeSolids(kind, cols, rows),      // { x, y, w, h } block from every side. Every solid can be clung to.
    oneWays: [],                                // { x, y, w, h } solid only when landing from above
    labels: Array.isArray(map.labels) ? map.labels : [],
    fallY: rows * TILE + 400,                   // falling below this respawns
  };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols;) {
    if (kind(x, y) !== '=') { x++; continue; }
    let x2 = x; while (x2 < cols && kind(x2, y) === '=') x2++;
    room.oneWays.push({ x: x * TILE, y: y * TILE, w: (x2 - x) * TILE, h: TILE }); x = x2;
  }
  const sp = (Array.isArray(map.spawn) && kind(map.spawn[0], map.spawn[1]) !== '#') ? map.spawn : defaultSpawn(kind, cols, rows);
  room.spawn = { x: (sp[0] + 0.5) * TILE, y: (sp[1] + 1) * TILE };   // feet on the bottom of the spawn cell
  return room;
}

function defaultSpawn(kind, cols, rows) {   // first floor with headroom, left to right
  for (let x = 0; x < cols; x++) for (let y = 4; y < rows - 1; y++) {
    if (kind(x, y + 1) !== '#') continue;
    let clear = true; for (let k = 0; k < 4; k++) if (kind(x, y - k) !== '.') clear = false;
    if (clear) return [x, y];
  }
  return [1, 1];
}

function mergeSolids(kind, cols, rows) {   // runs of '#' per row, then equal runs stacked vertically -> few big rects
  const out = [], open = new Map();
  for (let y = 0; y <= rows; y++) {
    const seen = new Set();
    for (let x = 0; x < cols && y < rows;) {
      if (kind(x, y) !== '#') { x++; continue; }
      let x2 = x; while (x2 < cols && kind(x2, y) === '#') x2++;
      const key = x + ':' + (x2 - x), r = open.get(key);
      if (r) r.h += TILE; else { const n = { x: x * TILE, y: y * TILE, w: (x2 - x) * TILE, h: TILE }; open.set(key, n); out.push(n); }
      seen.add(key); x = x2;
    }
    for (const k of [...open.keys()]) if (!seen.has(k)) open.delete(k);
  }
  return out;
}
