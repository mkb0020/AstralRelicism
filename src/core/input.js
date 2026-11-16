// INPUT: ACTIONS, NOT KEYS. Key events are queued as they arrive and handed to the game
// at the start of each fixed step (input.poll()), so nothing is lost or doubled between frames.
// Rebinding / gamepad later = edit BINDINGS or feed the same queue from another source.
// TWO LAYOUTS AT ONCE, NO OVERLAP:
//   arrows + Z X C V   (the Hollow Knight / Celeste style most metroidvania players expect)
//   WASD + Space, J K, Shift
// Up is NOT jump: it stays free for Up + attack, looking up, ladders.
export const BINDINGS = {
  left:   ['ArrowLeft', 'KeyA'],
  right:  ['ArrowRight', 'KeyD'],
  up:     ['ArrowUp', 'KeyW'],
  down:   ['ArrowDown', 'KeyS'],
  jump:   ['KeyZ', 'Space'],
  attack: ['KeyX', 'KeyJ'],
  dash:   ['KeyC', 'ShiftLeft', 'ShiftRight'],
  kick:   ['KeyV', 'KeyK'],
};

export function createInput(target = window, bindings = BINDINGS) {
  const byCode = new Map();                       // key code -> [actions]
  for (const [action, codes] of Object.entries(bindings)) for (const c of codes) (byCode.get(c) || byCode.set(c, []).get(c)).push(action);
  const heldCodes = new Set();
  const held = new Map();                         // action -> number of its keys currently down
  const queue = [];                               // { type: 'press' | 'release', action }
  const input = {
    pressed: [],                                  // actions pressed since the last step (in order)
    released: [],                                 // actions fully released since the last step
    down: action => (held.get(action) || 0) > 0 || input.pressed.includes(action),   // a tap shorter than one step still counts for that step
    axisX: () => (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0),
    poll() {                                      // call once at the start of each fixed step
      input.pressed.length = input.released.length = 0;
      for (const e of queue) (e.type === 'press' ? input.pressed : input.released).push(e.action);
      queue.length = 0;
    },
  };
  const typing = e => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
  const releaseCode = code => {
    if (!heldCodes.delete(code)) return;
    for (const a of byCode.get(code) || []) { const n = (held.get(a) || 1) - 1; held.set(a, n); if (n === 0) queue.push({ type: 'release', action: a }); }
  };
  target.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
    const actions = byCode.get(e.code); if (!actions) return;
    e.preventDefault();
    if (e.repeat || heldCodes.has(e.code)) return;
    heldCodes.add(e.code);
    for (const a of actions) { held.set(a, (held.get(a) || 0) + 1); queue.push({ type: 'press', action: a }); }
  });
  target.addEventListener('keyup', e => releaseCode(e.code));
  target.addEventListener('blur', () => { for (const c of [...heldCodes]) releaseCode(c); });
  return input;
}
