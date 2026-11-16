// GAME-WIDE CONSTANTS. WORLD UNITS = SCREEN PX AT 1920x1080.
export const TILE = 40;                 // 1 tile = 40 world px
export const VIEW_W = 1920;             // design view = 48 x 27 tiles
export const VIEW_H = 1080;
export const FIXED_DT = 1 / 50;         // physics step. Changing this slightly changes jump heights -> retune if you do.
export const MAX_STEPS_PER_FRAME = 8;   // after a long stall (tab switch) drop the backlog instead of spiralling

export const PATHS = {
  character: 'data/characters/nova.json',
  world: 'data/world.json',
};

// Room transitions: fade out (the game holds still), swap rooms, fade in (the game is already running again)
export const TRANSITION = { fadeOut: 0.12, fadeIn: 0.2, upBoost: 860 };   // upBoost = minimum upward speed when arriving through a floor hatch (px/s)

// Greybox / debug colours (studio palette)
export const COLORS = {
  bg: '#170032',
  bars: '#0b0018',
  grid: 'rgba(131, 12, 222, 0.16)',
  gridMajor: 'rgba(165, 90, 255, 0.30)',
  solid: '#37025a',
  solidEdge: '#A55AFF',
  exit: '#58e84c',
  oneWay: '#67FEBD',
  label: '#C4C3D0',
  hurtbox: '#00ffff',
  wallTouch: '#fecd39',
  hud: '#c4b5fd',
  hudDim: '#9090C0',
  accent: '#ff69b4',
};
