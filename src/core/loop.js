// FIXED-TIMESTEP GAME LOOP.
// step(dt) runs zero or more times per frame at exactly fixedDt; render(alpha, frameDt, frozen) runs once per frame.
// alpha (0..1) = how far we are between the last two steps, for interpolated drawing.
// hitStop(sec) freezes the simulation (not the render) - any attack can use it.
export function createLoop({ step, render, fixedDt, maxSteps = 8 }) {
  let last = 0, acc = 0, hitStopT = 0, running = false;
  const loop = {
    paused: false,
    hitStop(sec) { hitStopT = Math.max(hitStopT, sec); },
    stepOnce() { step(fixedDt); acc = 0; },          // debug: advance exactly one step while paused
    start() { if (running) return; running = true; requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); }); },
  };
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const frozen = hitStopT > 0;
    if (frozen) { hitStopT -= dt; acc = 0; }
    if (!loop.paused && !frozen) {
      acc += dt; let n = 0;
      while (acc >= fixedDt && n++ < maxSteps) {
        step(fixedDt); acc -= fixedDt;
        if (hitStopT > 0) { acc = 0; break; }
      }
      if (n >= maxSteps) acc = 0;
    }
    render(loop.paused ? 1 : acc / fixedDt, dt, frozen || loop.paused);
    requestAnimationFrame(frame);
  }
  return loop;
}
