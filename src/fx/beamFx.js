// MAGIC BEAM - VECTOR EFFECT (from the Vector Spell Lab beam).
// Nothing is stored as frames: every frame the beam is redrawn from math - the same line stroked 4 times,
// thick + dark to thin + white, with additive blending ('lighter') doing the glow. Two rippling strands
// twist around it, and where it hits a wall there is an impact flash + sparks.
// PERFORMANCE: no shadowBlur anywhere; strands are one path each; sparks are batched into 4 strokes.
// The hitbox lives in the player (beamRay); this file only draws what that ray says.

const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const rand = (a, b) => a + Math.random() * (b - a);
const SPARK_BUCKETS = 4, MAX_SPARKS = 160;

export class BeamFx {
  constructor(cfg) {
    this.cfg = Object.assign({ width: 26, fadeMs: 180, sparksPerSec: 160 }, cfg);
    this.c = Object.assign({ dark: '#450080', mid: '#830cde', bright: '#dc4ce8', accent: '#00ffff', core: '#ffffff' }, this.cfg.colors);
    this.ray = null; this.fade = 0; this.t = 0; this.impactT = 0;
    this.sparks = []; this.spawnAcc = 0;
  }

  reset() { this.ray = null; this.fade = 0; this.sparks = []; this.spawnAcc = 0; }

  // once per fixed step, after the player moved: follow the ray, spawn / move sparks
  update(player, dt) {
    const r = player.beamRay();
    this.t += dt;
    if (r) { if (!this.ray) { this.t = 0; this.impactT = 0; } this.ray = r; this.fade = 1; }
    else if (this.ray) { this.fade -= dt / (this.cfg.fadeMs / 1000); if (this.fade <= 0) { this.ray = null; this.fade = 0; } }
    const live = r && r.blocked;
    if (live) {
      this.impactT += dt; this.spawnAcc += this.cfg.sparksPerSec * dt;
      const back = r.dir > 0 ? Math.PI : 0;                                   // sparks spray back toward her
      while (this.spawnAcc >= 1 && this.sparks.length < MAX_SPARKS) {
        this.spawnAcc -= 1; const a = back + rand(-1.2, 1.2), sp = rand(120, 520);
        this.sparks.push({ x: r.x1, y: r.y + rand(-r.h * 0.3, r.h * 0.3), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.4, 1) });
      }
    } else this.spawnAcc = 0;
    for (const s of this.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.96; s.vy *= 0.96; s.life -= dt * 1.4; }
    if (this.sparks.length) this.sparks = this.sparks.filter(s => s.life > 0);
  }

  // world space (inside the camera transform). time = seconds, for the ripple / flicker (real time, so it shimmers during hitstop too)
  draw(ctx, time) {
    if (!this.ray && !this.sparks.length) return;
    const C = this.c;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (this.ray) {
      const r = this.ray, fade = Math.max(0, this.fade), reach = Math.abs(r.x1 - r.x0);
      const grow = r.len > 0 ? Math.min(1, reach / r.len) : 1;
      const w = this.cfg.width * easeOutCubic(Math.min(1, grow * 1.5)) * fade * (1 + Math.sin(time * 60) * 0.08);
      ctx.save();
      ctx.translate(r.x0, r.y); ctx.scale(r.dir, 1);

      // glow at her hand
      const orbR = (10 + w * 0.9) * 1.6;
      const og = ctx.createRadialGradient(0, 0, 0, 0, 0, orbR);
      og.addColorStop(0, C.core); og.addColorStop(0.3, C.bright); og.addColorStop(1, C.dark + '00');
      ctx.globalAlpha = fade; ctx.fillStyle = og; ctx.beginPath(); ctx.arc(0, 0, orbR, 0, Math.PI * 2); ctx.fill();

      if (reach > 1 && w > 0.2) {
        // the core beam: 4 layers, thick + dark -> thin + white
        for (const [col, lw, al] of [[C.dark, w * 1.6, 0.55], [C.mid, w, 0.8], [C.bright, w * 0.55, 1], [C.core, w * 0.22, 1]]) {
          ctx.globalAlpha = al * fade; ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.1, lw);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(reach, 0); ctx.stroke();
        }
        // two rippling strands twisting around it, pinched at both ends
        ctx.globalAlpha = fade; ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
        const step = 14;
        for (const side of [1, -1]) {
          ctx.beginPath();
          for (let x = 0; x <= reach + step - 1; x += step) {
            const xx = Math.min(x, reach), env = Math.sin((xx / reach) * Math.PI);
            const y = Math.sin(xx * 0.06 - time * 28) * w * 0.9 * side * env;
            x === 0 ? ctx.moveTo(xx, y) : ctx.lineTo(xx, y);
          }
          ctx.stroke();
        }
      }
      ctx.restore();

      // impact on the wall: flash + a ring that keeps pulsing outward
      if (r.blocked) {
        const k = (this.impactT % 0.35) / 0.35, R = 70;
        ctx.save(); ctx.translate(r.x1, r.y);
        const ig = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        ig.addColorStop(0, C.core); ig.addColorStop(0.3, C.bright); ig.addColorStop(1, C.dark + '00');
        ctx.globalAlpha = 0.85 * fade; ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = (1 - k) * fade; ctx.strokeStyle = C.accent; ctx.lineWidth = 5 - 4 * k;
        ctx.beginPath(); ctx.arc(0, 0, 18 + easeOutCubic(k) * 70, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    // sparks, bucketed by life into 4 strokes (one stroke per alpha level instead of one per spark)
    if (this.sparks.length) {
      ctx.strokeStyle = C.bright; ctx.lineWidth = 2;
      for (let b = 0; b < SPARK_BUCKETS; b++) {
        ctx.beginPath(); let any = false;
        for (const s of this.sparks) {
          if (Math.min(SPARK_BUCKETS - 1, Math.floor(Math.min(1, s.life) * SPARK_BUCKETS)) !== b) continue;
          ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.04, s.y - s.vy * 0.04); any = true;
        }
        if (!any) continue;
        ctx.globalAlpha = (b + 0.5) / SPARK_BUCKETS; ctx.stroke();
      }
    }
    ctx.restore();
  }
}
