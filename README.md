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
| Slash (air slash while airborne) | X | J |
| Dash | C | Shift |
| Kick (air kick while airborne) | V | K |

Debug keys: **F1** hitboxes + readout · **F2** squash, stretch + camera shake · **F3** live tuning panel · **F4** view mode (fit / pixel) ·
**G** grid · **R** respawn at the last door · **N** jump to the next room · **P** pause · **O** step one frame · **1 / 2 / 3** toggle double jump / wall slide + jump / dash.

Double jump and wall slide/jump start **locked** (as in the notes) - press 1 and 2 in the test room to try them.

## Tuning

All of Nova's numbers are in `data/characters/nova.json` - physics, hurtbox, starting abilities, animation timing. Code never needs editing to tune.

- **F3** opens the tuning panel. Edits apply instantly; changed values turn pink.
- **DOWNLOAD nova.json** saves the current values; replace `data/characters/nova.json` with it to keep them.
- The `"physics"` block also accepts the rows of an OSW `character.json` (`[{ label, value, unit }]`) pasted in as-is.
- The F1 readout shows the peak height, airtime and distance of the last jump, in px and tiles.

## Attacks (frame data)

Attacks are animation-driven and live in `data/characters/nova.json` under `"attacks"`; `"buttons"` says which attack a button starts on the ground and in the air.

```json
"kick": {
  "sheet": "kick",
  "movement": "planted",                        // planted | slowed | momentum | lunge
  "hitstopMs": 90,                              // freeze when it connects (a whiff does not freeze)
  "shake": { "ms": 180, "strength": 10 },
  "cancel": { "from": 5, "into": ["jump", "dash"] },   // from frame 5 on, jump or dash cuts it short
  "frames": [
    { "ms": 36 }, { "ms": 36 }, { "ms": 48 }, { "ms": 36 },
    { "ms": 56, "hit": [{ "x": 15, "y": -150, "w": 95, "h": 60 }] },
    { "ms": 38 }
  ]
}
```

- One entry per sprite frame. `ms` = how long it shows. Frames before the first `hit` are **startup**, frames with a `hit` are **active**, the rest are **recovery**.
- `hit` boxes are in world px relative to her feet, drawn facing right (they mirror automatically). `y` is negative going up.
- `"slowed"` attacks keep `momentumKeep` × her speed when they start, then ease toward `slowFactor` × run speed while forward is held (to a stop if not) at `decelScale` × her normal decel.
- `vx` on a frame = forward speed while that frame shows (the air kick's lunge). It goes through collision like all movement.
- Aerials: `"air": true`, `"gravity"` (1 normal, 0.3 floaty, 0 hang), `"vyKeep"` (how much vertical speed survives the start), `"onLand"` (`"cancel"` or `"continue"`), `"oncePerAirtime"`.
- A jump pressed mid-attack waits in the jump buffer and fires at the cancel window or when the attack ends.
- With **F1** on, active hitboxes draw in orange and the readout shows the attack's frame and phase. **P** then **O** steps through an attack one frame at a time. The test room has two training dummies.

## Rooms and transitions

`data/world.json` lists the rooms and how they join. Room files stay plain Tile Lab maps, so re-exporting a room never wipes its exits.

```json
"greybox": {
  "file": "data/rooms/greybox.json",
  "exits": {
    "east":  { "side": "right",  "from": 31, "to": 34, "leadsTo": "annex.west" },
    "hatch": { "side": "bottom", "from": 88, "to": 91, "leadsTo": "cellar.hatch" }
  }
}
```

- An exit is a gap in the room's outer edge. `side` is `left` / `right` / `top` / `bottom`; `from`..`to` are the tiles of the gap along that edge (rows for side doors, columns for hatches), counted from 0.
- The gap itself must be air (`.`) in the room's mask; the exit only says where it leads. Each exit names its partner as `room.exit`, and the partner must point back.
- Walking through a side door keeps her height above the door's floor; a hatch keeps her sideways position. Speed and state carry over. Arriving up through a floor hatch gives her at least `TRANSITION.upBoost` of upward speed so she clears the lip.
- The room changes with a short fade (`TRANSITION` in `src/config.js`).
- Mistakes (blocked opening, missing or one-way link) are printed as `[world]` warnings in the browser console at boot, and `npm test` fails on them.
- With **F1** on, exits show as green bars labelled with where they lead.
- To add a room: export it from Tile Lab into `data/rooms/`, add it to `world.json`, and give both sides an exit.

Test rooms: `greybox` → east door → `annex` → lower west door → `cellar` → ceiling hatch → back into the greybox's wide pit.

## Layout

```
index.html
data/
  characters/nova.json     physics, hurtbox, abilities, sprite sheets + animation data
  world.json               which rooms exist and how their exits join
  rooms/*.json             test rooms (Tile Lab map format: '#' solid, '=' one-way ledge, '.' air)
src/
  main.js                  boot, the per-step and per-frame functions
  config.js                tile size, view size, fixed timestep, colours
  core/      loop.js (fixed step + hitstop)  input.js (actions, buffered per step)  assets.js  math.js
  world/     world.js (rooms + exits)  room.js (map -> collision shapes)  collision.js (AABB, X then Y)  roomRender.js (greybox)  dummy.js
  combat/    combat.js (hitboxes vs targets, hitstop + shake on a hit)
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
- [x] 4. Camera + room transitions; rooms in Tile Lab's map format
- [x] 5. Attacks with frame data: kick, air kick, slash, air slash *(beam, down strike still to come)*

Later: slide + low kick, grapple, Witch Time, magic beam, down strike, slopes, knockback / i-frames / damage, rebinding / gamepad.

## Differences from OSW PLAY (on purpose)

- **Hurtbox** is 38 × 148 (was 35 × 65), feet-anchored.
- **Jump during a dash**: in PLAY a ground or wall jump pressed mid-dash was swallowed. Here it waits in the jump buffer and fires as the dash ends. A double jump still cuts into an air dash, as before.
- **Up no longer jumps** (it is reserved for Up + attack). Jump is Z or Space.
- **Dash direction** is the held direction (facing if none held; away from the wall when wall sliding).
- **Wall contact only refills** the air dash / double jump once wall slide is unlocked.
- **Hitstop and shake only happen when a kick connects.** PLAY froze on every kick because there was nothing to hit.
- **Kick recovery can be cancelled** into a jump or dash on its last frame.
- The swoosh effect is not drawn separately (the new kick sheets have it in the art).
- No cape, particles, afterimages, lighting or critters yet - those were PLAY sandbox extras and come back as separate modules.
