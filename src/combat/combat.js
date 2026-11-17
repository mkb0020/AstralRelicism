// COMBAT: the player's active hitboxes vs anything hittable. One attack hits each target once,
// unless the attack has "rehitMs" (a beam): then it hits again every rehitMs while touching.
// A hit triggers camera shake; the hitstop (a brief freeze) only on an attack's first hit - a whiff does neither.
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function resolveHits(player, targets, fx) {
  const a = player.attack || player.slideStrike; if (!a) return;   // an attack, or the slide's low kick
  const boxes = player.activeHitboxes(); if (!boxes.length) return;
  for (const t of targets) {
    const last = a.hit.get(t);
    if (last != null && (!a.def.rehitMs || a.t - last < a.def.rehitMs / 1000 - 1e-6)) continue;
    if (!boxes.some(b => overlap(b, t.box()))) continue;
    const first = a.hit.size === 0;
    a.hit.set(t, a.t);
    t.onHit(a, player);
    player.emit('hit', a.name);
    if (a.def.hitstopMs && first) fx.hitStop(a.def.hitstopMs / 1000);
    if (a.def.shake) fx.shake(a.def.shake.ms / 1000, a.def.shake.strength);
  }
}
