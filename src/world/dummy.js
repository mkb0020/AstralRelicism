// TRAINING DUMMY: something to hit while there are no enemies. Not solid. Room JSON: "dummies": [{ "col", "row" }].
import { TILE, COLORS } from '../config.js';

export class Dummy {
  constructor(col, row) { this.x = (col + 0.5) * TILE; this.y = (row + 1) * TILE; this.w = 60; this.h = 150; this.flash = 0; this.hits = 0; this.last = ''; this.lean = 0; }
  box() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
  onHit(attack, player) { this.flash = 0.25; this.hits++; this.last = attack.name; this.lean = attack.dir * 0.22; }
  update(dt) { if (this.flash > 0) this.flash -= dt; this.lean *= Math.exp(-9 * dt); }
  draw(ctx) {
    const hot = this.flash > 0;
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.lean);
    ctx.fillStyle = hot ? 'rgba(255, 105, 180, 0.55)' : 'rgba(101, 115, 131, 0.28)'; ctx.fillRect(-this.w / 2, -this.h, this.w, this.h);
    ctx.lineWidth = 2; ctx.strokeStyle = hot ? '#FFC7FF' : COLORS.hudDim; ctx.strokeRect(-this.w / 2, -this.h, this.w, this.h);
    ctx.fillStyle = COLORS.label; ctx.font = '14px "Share Tech Mono", Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(this.hits ? `${this.hits}  ${this.last}` : 'DUMMY', 0, -this.h - 6);
    ctx.restore();
  }
}
