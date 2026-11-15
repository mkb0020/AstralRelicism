// AABB COLLISION, X THEN Y. The body's position is its FEET (bottom-centre): x = centre, y = bottom.
// body: { x, y, vx, vy, w, h, grounded, touching }
// Everything that moves the player (code-driven or animation-driven) goes through here, so she never clips through walls.
const ONE_WAY_TOLERANCE = 4;

export function moveBody(b, room, dt) {
  const hw = b.w / 2;
  // ----- X: only solids block; one-way platforms ignore the sides
  b.x += b.vx * dt;
  if (b.vx !== 0) for (const s of room.solids) {
    if (b.y - b.h < s.y + s.h && b.y > s.y && b.x - hw < s.x + s.w && b.x + hw > s.x) {
      b.x = b.vx > 0 ? s.x - hw : s.x + s.w + hw;
      b.vx = 0;                                   // hitting a wall zeroes horizontal speed
    }
  }
  // ----- Y
  const prevBottom = b.y;
  b.y += b.vy * dt; b.grounded = false;
  const l = b.x - hw, r = b.x + hw;
  for (const s of room.solids) {
    if (!(l < s.x + s.w && r > s.x && b.y - b.h < s.y + s.h && b.y > s.y)) continue;
    if (b.vy >= 0) { b.y = s.y; b.vy = 0; b.grounded = true; }   // land on top
    else { b.y = s.y + s.h + b.h; b.vy = 0; }                    // bump the underside
  }
  if (b.vy >= 0) for (const o of room.oneWays) {   // one-way: solid only if not rising and the feet were at / above its top a step ago
    if (l < o.x + o.w && r > o.x && b.y - b.h < o.y + o.h && b.y > o.y && prevBottom <= o.y + ONE_WAY_TOLERANCE) { b.y = o.y; b.vy = 0; b.grounded = true; }
  }
  // ----- wall contact for the next step: the box grown by 1 px overlaps a solid. 1 = wall on the right, -1 = left, 0 = none
  b.touching = 0;
  for (const s of room.solids) if (b.x - hw - 1 < s.x + s.w && b.x + hw + 1 > s.x && b.y - b.h < s.y + s.h && b.y > s.y) b.touching = b.x < s.x + s.w / 2 ? 1 : -1;
}
