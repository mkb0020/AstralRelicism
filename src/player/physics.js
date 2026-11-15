// CHARACTER PHYSICS: DATA-DRIVEN. The numbers live in data/characters/<id>.json ("physics"),
// this file only describes them (label / unit / step for the tuning panel) and converts ms -> seconds.
export const PHYSICS_FIELDS = [
  // key,              label,               unit,     step, default
  ['moveSpeed',        'Move speed',        'px/s',   10,   650],
  ['jumpForce',        'Jump force',        'px/s',   20,   960],
  ['gravity',          'Gravity',           'px/s²',  50,   2100],
  ['apexHang',         'Apex hang',         '×',      0.05, 0.45],
  ['apexBand',         'Apex band',         'px/s',   20,   400],
  ['fallGravity',      'Fall gravity',      '×',      0.05, 1],
  ['maxFallSpeed',     'Max fall speed',    'px/s',   50,   1100],
  ['jumpCut',          'Jump cut',          '×',      0.05, 0.5],
  ['jumpBufferMs',     'Jump buffer',       'ms',     10,   100],
  ['coyoteMs',         'Coyote time',       'ms',     10,   100],
  ['groundAccel',      'Ground accel',      'px/s²',  500,  10000],
  ['groundDecel',      'Ground decel',      'px/s²',  500,  14000],
  ['airAccel',         'Air accel',         'px/s²',  500,  8000],
  ['airDecel',         'Air decel',         'px/s²',  500,  5000],
  ['airControl',       'Air control',       '×',      0.05, 1],
  ['doubleJumpForce',  'Double jump force', 'px/s',   20,   780],
  ['wallJumpForce',    'Wall jump force',   'px/s',   20,   860],
  ['wallJumpPush',     'Wall jump push',    'px/s',   20,   480],
  ['wallJumpLockMs',   'Wall jump lock',    'ms',     10,   180],
  ['wallSlideSpeed',   'Wall slide speed',  'px/s',   10,   150],
  ['dashSpeed',        'Dash speed',        'px/s',   50,   1500],
  ['dashTimeMs',       'Dash time',         'ms',     10,   160],
  ['dashCooldownMs',   'Dash cooldown',     'ms',     10,   450],
];
export const PHYSICS_DEFAULTS = Object.fromEntries(PHYSICS_FIELDS.map(f => [f[0], f[4]]));

const labelKey = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
const BY_LABEL = Object.fromEntries(PHYSICS_FIELDS.map(f => [labelKey(f[1]), f[0]]));

// Accepts the game's own { key: value } object, OR the "physics" rows of an OSW character.json
// ([{ label, value, unit }], matched by label) so a sheet exported from Onion Studio Wizard drops straight in.
export function readPhysics(src) {
  const raw = Object.assign({}, PHYSICS_DEFAULTS);
  if (Array.isArray(src)) {
    for (const row of src) { const k = row && BY_LABEL[labelKey(row.label)]; if (k && Number.isFinite(+row.value)) raw[k] = +row.value; }
  } else if (src && typeof src === 'object') {
    for (const k of Object.keys(PHYSICS_DEFAULTS)) if (Number.isFinite(+src[k])) raw[k] = +src[k];
  }
  return raw;
}

// raw (file units) -> what the controller uses (seconds everywhere)
export function normalizePhysics(raw) {
  const p = Object.assign({}, raw);
  p.jumpBuffer = raw.jumpBufferMs / 1000;
  p.coyote = raw.coyoteMs / 1000;
  p.wallJumpLock = raw.wallJumpLockMs / 1000;
  p.dashTime = raw.dashTimeMs / 1000;
  p.dashCooldown = raw.dashCooldownMs / 1000;
  return p;
}
