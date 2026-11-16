// THE WORLD: rooms + the exits that join them (data/world.json). No DOM - testable headless.
//   "rooms": { "<id>": { "file": "<Tile Lab map>", "exits": { "<name>": { "side", "from", "to", "leadsTo": "<room>.<exit>" } } } }
//   side = left | right | top | bottom.  from..to = the opening, in tiles along that edge (rows for left / right, columns for top / bottom), inclusive.
// The opening itself must be air in the room's mask - the exit only says where it leads.
// Exits live here (not in the room files) so re-exporting a room from Tile Lab never wipes them.
import { TILE } from '../config.js';
import { buildRoom } from './room.js';
import { clamp } from '../core/math.js';

const SIDES = ['left', 'right', 'top', 'bottom'];
const isSideDoor = side => side === 'left' || side === 'right';
const gap = (e, v) => (v < e.lo ? e.lo - v : v > e.hi ? v - e.hi : 0);

export function createWorld(worldJSON, roomMaps) {   // roomMaps: { id: Tile Lab map JSON }
  const world = { rooms: {}, start: worldJSON.start, problems: [] };

  for (const [id, def] of Object.entries(worldJSON.rooms || {})) {
    const room = buildRoom(roomMaps[id], id);
    room.id = id; room.exits = [];
    for (const [name, e] of Object.entries(def.exits || {})) {
      const from = Math.min(e.from, e.to), to = Math.max(e.from, e.to);
      room.exits.push({ name, side: e.side, from, to, lo: from * TILE, hi: (to + 1) * TILE, leadsTo: e.leadsTo });   // lo..hi = the opening in world px along its edge
    }
    world.rooms[id] = room;
  }

  // "room.exit" -> { room, exit }
  world.find = ref => {
    const [roomId, exitName] = String(ref || '').split('.'), room = world.rooms[roomId];
    const exit = room && room.exits.find(x => x.name === exitName);
    return exit ? { room, exit } : null;
  };

  // Has the body left the room? -> null (still inside) | { exit } (through a linked opening) | { exit: null } (out of bounds, nothing there)
  // The test point is the body's centre, so she is halfway through the opening when the room changes.
  world.exitAt = (room, b) => {
    const cx = b.x, cy = b.y - b.h / 2;
    const side = cx < 0 ? 'left' : cx > room.w ? 'right' : cy < 0 ? 'top' : cy > room.h ? 'bottom' : null;
    if (!side) return null;
    const along = isSideDoor(side) ? cy : cx;
    const exit = room.exits.filter(e => e.side === side && world.find(e.leadsTo)).sort((a, c) => gap(a, along) - gap(c, along))[0] || null;
    return { exit };
  };

  // Where she appears in the next room: just inside the target opening. Through a side door she keeps her height above
  // the door's floor; through a hatch she keeps her sideways position - so the hand-over is seamless.
  world.arrival = (exit, b, upBoost = 0) => {
    const t = world.find(exit.leadsTo); if (!t) return null;
    const T = t.exit, room = t.room, hw = b.w / 2, sameKind = isSideDoor(exit.side) === isSideDoor(T.side), mid = (T.lo + T.hi) / 2;
    const out = { room, exit: T, x: 0, y: 0, vy: b.vy };
    if (isSideDoor(T.side)) {
      out.x = T.side === 'left' ? hw + 1 : room.w - hw - 1;
      out.y = clamp(sameKind ? T.hi - (exit.hi - b.y) : T.hi, Math.min(T.lo + b.h, T.hi), T.hi);
    } else {
      out.x = clamp(sameKind ? T.lo + (b.x - exit.lo) : mid, Math.min(T.lo + hw, mid), Math.max(T.hi - hw, mid));
      if (T.side === 'top') out.y = b.h + 1;
      else { out.y = room.h - 1; out.vy = Math.min(b.vy, -upBoost); }   // coming up through the floor: make sure she clears the lip
    }
    return out;
  };

  // check everything up front, so a typo shows at boot and not mid-game
  if (!world.rooms[world.start]) world.problems.push(`start room "${world.start}" does not exist`);
  for (const room of Object.values(world.rooms)) for (const e of room.exits) {
    const at = `${room.id}.${e.name}`;
    if (!SIDES.includes(e.side)) { world.problems.push(`${at}: unknown side "${e.side}"`); continue; }
    for (let i = e.from; i <= e.to; i++) {
      const [x, y] = e.side === 'left' ? [0, i] : e.side === 'right' ? [room.cols - 1, i] : e.side === 'top' ? [i, 0] : [i, room.rows - 1];
      if (room.kind(x, y) !== '.') { world.problems.push(`${at}: the opening is blocked at tile ${x},${y} (it must be air in the room's mask)`); break; }
    }
    const t = world.find(e.leadsTo);
    if (!t) world.problems.push(`${at}: leads to "${e.leadsTo}", which does not exist`);
    else if (t.exit.leadsTo !== at) world.problems.push(`${at} leads to ${e.leadsTo}, but that exit leads back to "${t.exit.leadsTo}"`);
  }
  return world;
}
