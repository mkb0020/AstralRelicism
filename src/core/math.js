export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
export const smoothstep = u => u * u * (3 - 2 * u);   // u in 0..1
