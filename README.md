# Astral Relicism (working title)

A motion-focused 2D metroidvania. Plain JS + Canvas 2D, no build step, no dependencies.
Design decisions live in [ControllerNotes.md](ControllerNotes.md); art and tools come from Onion Studio Wizard (OSW).

## Run it

The game has to be served over http (ES modules and sprite sheets do not load from `file://`):

```
npm start          # -> http://localhost:5173
```

VS Code Live Server on `index.html` works too.

```
npm test           # headless check of the controller against the numbers in ControllerNotes.md
```

## Controls

Two layouts work at the same time:

| | Arrows layout | WASD layout |
|---|---|---|
| Move | ← → | A / D |
| Up / down (aim, later) | ↑ ↓ | W / S |
| Jump (hold = higher, tap = hop) | Z | Space |
| Attack *(not in yet)* | X | J |
| Dash | C | Shift |
| Kick *(not in yet)* | V | K |

Debug keys: **F1** hitboxes + readout · **F2** squash & stretch · **F3** live tuning panel · **F4** view mode (fit / pixel) ·
**G** grid · **R** respawn · **P** pause · **O** step one frame · **1 / 2 / 3** toggle double jump / wall slide + jump / dash.

Double jump and wall slide/jump start **locked** (as in the notes) - press 1 and 2 in the test room to try them.

## Tuning

All of Nova's numbers are in `data/characters/nova.json` - physics, hurtbox, starting abilities, animation timing. Code never needs editing to tune.

- **F3** opens the tuning panel. Edits apply instantly; changed values turn pink.
- **DOWNLOAD nova.json** saves the current values; replace `data/characters/nova.json` with it to keep them.
- The `"physics"` block also accepts the rows of an OSW `character.json` (`[{ label, value, unit }]`) pasted in as-is.
- The F1 readout shows the peak height, airtime and distance of the last jump, in px and tiles.

## Layout

```
index.html
data/
  characters/nova.json     physics, hurtbox, abilities, sprite sheets + animation data
  rooms/greybox.json       test room (Tile Lab map format: '#' solid, '=' one-way ledge, '.' air)
src/
  main.js                  boot, the per-step and per-frame functions
  config.js                tile size, view size, fixed timestep, colours
  core/      loop.js (fixed step + hitstop)  input.js (actions, buffered per step)  assets.js  math.js
  world/     room.js (map -> collision shapes)  collision.js (AABB, X then Y)  roomRender.js (greybox)
  player/    player.js (controller)  states.js (state machine)  physics.js (schema)  playerView.js (sprites, squash)
  render/    camera.js (follow + vertical dead zone, clamped to the room)
  debug/     debug.js (overlay, tuning panel, debug keys)
tools/serve.mjs            local static server
tests/physics.test.mjs     headless feel check
```

How a step runs (`Player.step`): buffered key presses/releases → the current **state** sets velocities and picks the next state →
refills + coyote time → gravity and collision. States live in `src/player/states.js`; a new ability is a new state plus an unlock flag.
The controller has no DOM or drawing code, which is why it can be tested headless.

## Milestones

- [x] 1. Repo skeleton: fixed-step loop, input, asset loading, physics JSON
- [x] 2. Player controller in a greybox room on the 40 px grid; F1 debug overlay; live tuning
- [x] 3. Animations: idle / run / jump / fall / land / wall slide / dash / double jump
- [ ] 4. Camera + room transitions; rooms exported from Tile Lab *(camera follow and the Tile Lab map format are in; transitions are not)*
- [ ] 5. Attacks with frame data (kick + air kick first)

Later: slide + low kick, grapple, Witch Time, magic beam, down strike, slopes, knockback / i-frames / damage, rebinding / gamepad.

## Differences from OSW PLAY (on purpose)

- **Hurtbox** is 38 × 148 (was 35 × 65), feet-anchored.
- **Jump during a dash**: in PLAY a ground or wall jump pressed mid-dash was swallowed. Here it waits in the jump buffer and fires as the dash ends. A double jump still cuts into an air dash, as before.
- **Up no longer jumps** (it is reserved for Up + attack). Jump is Z or Space.
- **Dash direction** is the held direction (facing if none held; away from the wall when wall sliding).
- **Wall contact only refills** the air dash / double jump once wall slide is unlocked.
- **Idle sprite** is shifted 38 art px (`sheets.idle.offsetX`) so her body sits on the hurtbox centre instead of beside it.
- No cape, particles, afterimages, lighting or critters yet - those were PLAY sandbox extras and come back as separate modules.
