// COMBAT: the player's active hitboxes vs anything hittable. One attack hits each target once.
// A hit triggers the attack's hitstop (a brief freeze) and camera shake - a whiff does neither.
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function resolveHits(player, targets, fx) {
  const a = player.attack; if (!a) return;
  const boxes = player.activeHitboxes(); if (!boxes.length) return;
  for (const t of targets) {
    if (a.hit.has(t) || !boxes.some(b => overlap(b, t.box()))) continue;
    a.hit.add(t);
    t.onHit(a, player);
    player.emit('hit', a.name);
    if (a.def.hitstopMs) fx.hitStop(a.def.hitstopMs / 1000);
    if (a.def.shake) fx.shake(a.def.shake.ms / 1000, a.def.shake.strength);
  }
}
