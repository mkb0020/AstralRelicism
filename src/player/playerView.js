// HOW THE PLAYER LOOKS: picks the sprite frame for the controller's state, plus squash & stretch.
// VISUAL ONLY - nothing in here touches position, velocity or the hurtbox.
import { loadImage } from '../core/assets.js';

const FOOT_ALPHA_MIN = 24;

export class PlayerView {
  constructor(char) {
    this.sprite = char.sprite;
    this.images = {};        // sheet name -> image
    this.footGaps = {};      // sheet name -> per-frame px between the lowest visible pixel and the cell bottom
    this.fxOn = true;
    this.reset();
  }

  async load() {
    for (const [key, sh] of Object.entries(this.sprite.sheets)) {
      const im = await loadImage(this.sprite.dir + sh.src); this.images[key] = im;
      if (sh.snapFeet || (sh.snapFrames && sh.snapFrames.length)) this.footGaps[key] = measureFootGaps(im, sh.frames);
    }
  }

  reset() {
    this.sheet = 'idle'; this.frame = 0; this.animT = 0; this.lift = 0; this.spin = 0; this.offsetX = 0;
    this.runIdx = 0; this.runT = 0; this.lastState = ''; this.spinDir = 1; this.pivotY = 0;
    this.squash = { x: 1, y: 1, vx: 0, vy: 0 };
  }

  kick(pair) { if (this.fxOn) Object.assign(this.squash, { x: pair[0], y: pair[1], vx: 0, vy: 0 }); }

  // once per fixed step, after player.step()
  update(p, dt) {
    const A = this.sprite.anims, S = this.sprite.squash;
    for (const e of p.events) {
      if (e.type === 'spawn') this.reset();
      else if (e.type === 'jump' || e.type === 'wallJump') this.kick(S.jump);
      else if (e.type === 'doubleJump') this.kick(S.doubleJump);
      else if (e.type === 'dash') this.kick(S.dash);
      else if (e.type === 'land' && e.value >= S.landMinImpact) {
        const t = Math.min(1, (e.value - S.landMinImpact) / (S.landFullImpact - S.landMinImpact));
        this.kick([1 + (S.landMax[0] - 1) * t, 1 + (S.landMax[1] - 1) * t]);
      }
    }
    // which animation does this state show? (dash = run on the ground, the rise pose in the air)
    let name = p.stateName;
    if (name === 'dash') name = p.grounded ? 'run' : 'rise';
    if (!A[name]) name = 'idle';
    const fresh = name !== this.lastState;
    if (fresh) { this.lastState = name; this.animT = 0; this.runIdx = 0; this.runT = 0; this.spinDir = p.facing < 0 ? -1 : 1; } else this.animT += dt;
    const a = A[name];
    this.sheet = a.sheet; this.lift = 0; this.spin = 0;
    this.offsetX = (this.sprite.sheets[a.sheet].offsetX || 0) * (p.facing < 0 ? -1 : 1);

    if (a.cycle) {                                         // run: per-frame holds + a small lift so the feet don't skate
      const hold = i => a.cycle[i].hold / a.baseFps;
      if (!fresh) this.runT += dt;
      while (this.runT >= hold(this.runIdx)) { this.runT -= hold(this.runIdx); this.runIdx = (this.runIdx + 1) % a.cycle.length; }
      this.frame = a.cycle[this.runIdx].frame; this.lift = a.cycle[this.runIdx].lift;
    } else if (a.flip != null) {                           // double jump: tuck -> spinning ball -> untuck
      const t = this.animT;
      if (t < a.inTime) this.frame = a.flipIn;
      else if (t < a.inTime + a.spinTime) {
        const u = (t - a.inTime + dt) / a.spinTime, ease = 1 - (1 - Math.min(1, u)) * (1 - Math.min(1, u));   // easeOutQuad: fast out of the launch, ends exactly upright
        this.frame = a.flip; this.spin = 360 * a.turns * ease * this.spinDir; this.pivotY = a.pivotY;
      } else this.frame = a.flipOut;
    } else if (a.from != null) {                           // simple fps loop
      const n = a.to - a.from + 1; this.frame = a.from + Math.floor(this.animT * a.fps) % n;
    } else this.frame = a.frame;

    this.updateSquash(p, dt);
  }

  updateSquash(p, dt) {                                    // a damped spring per axis toward the target pose
    const S = this.sprite.squash, q = this.squash;
    if (!this.fxOn) { q.x = q.y = 1; q.vx = q.vy = 0; return; }
    let tx = 1, ty = 1;
    if (p.stateName === 'dash') { tx = S.dash[0]; ty = S.dash[1]; }
    else if (!p.grounded && p.stateName !== 'wallSlide' && p.stateName !== 'doubleJump') {   // stretch with vertical speed
      const s = Math.min(1, Math.abs(p.vy) / S.airStretchVel); ty = 1 + S.airStretch * s; tx = 1 - S.airStretch * s * 0.6;
    }
    const h = Math.min(dt, 1 / 30);
    q.vx += (-S.stiffness * (q.x - tx) - S.damping * q.vx) * h; q.vy += (-S.stiffness * (q.y - ty) - S.damping * q.vy) * h;
    q.x += q.vx * h; q.y += q.vy * h;
  }

  // x, y = interpolated feet position (world px)
  draw(ctx, x, y, facing) {
    const im = this.images[this.sheet]; if (!im) return;
    const sp = this.sprite, sh = sp.sheets[this.sheet], q = this.squash;
    const fit = sp.frame / im.naturalHeight;               // 1 when the sheet is already `frame` px tall
    const snap = sh.snapFeet || (sh.snapFrames && sh.snapFrames.includes(this.frame));
    const oy = snap ? ((this.footGaps[this.sheet] || [])[this.frame] || 0) * fit : 0;   // drop the frame by its foot gap
    const cw = Math.floor(im.naturalWidth / sh.frames), sz = sp.frame;
    ctx.save();
    ctx.translate(x, y); ctx.scale(sp.scale * q.x, sp.scale * q.y); ctx.translate(this.offsetX, -this.lift);   // local space: 1 unit = 1 art px
    if (this.spin) { const cy = oy - this.pivotY; ctx.translate(0, cy); ctx.rotate(this.spin * Math.PI / 180); ctx.translate(0, -cy); }
    ctx.translate(0, oy); if (facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(im, this.frame * cw, 0, cw, im.naturalHeight, -sz / 2, -sz, sz, sz);   // anchor = feet, bottom-centre of the cell
    ctx.restore();
  }
}

function measureFootGaps(img, frames) {   // scans the sheet once; fails soft (no snapping)
  try {
    const cw = Math.floor(img.width / frames), ch = img.height, cv = document.createElement('canvas'); cv.width = img.width; cv.height = ch;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
    const px = cx.getImageData(0, 0, img.width, ch).data, gaps = [];
    for (let f = 0; f < frames; f++) {
      let bottom = -1;
      for (let y = ch - 1; y >= 0 && bottom < 0; y--) for (let x = f * cw; x < (f + 1) * cw; x++) if (px[(y * img.width + x) * 4 + 3] > FOOT_ALPHA_MIN) { bottom = y; break; }
      gaps.push(bottom < 0 ? 0 : ch - 1 - bottom);
    }
    return gaps;
  } catch (e) { console.warn('[view] could not measure foot gaps: ' + e.message); return []; }
}
