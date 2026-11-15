# Astral Relicism (working title)

## GAME CONTROLLER NOTES


### Overall feel:
Nova has a short, athletic build and is quick and snappy but fluid at the same time - think like a dancer.  However, prior to unlocking abilities (double jump, glide/slow fall), she can't jump super high or far yet
- Ground traction: high
- Air control: high
- Gravity: lower (floaty feel) but balance jump force so she doesn't launch too high

### Starting moveset vs. unlockable abilities: (Anything marked with "Y" means I do have a sprite sheet and "N" means no sprite sheet)

**Basic (Eventually, I would like to do all of the expected abilities.  For starters, lets do these):**
- Double Jump (unlocked) (Y)
- Dash (starting) (Y - same as run)
- Wall Slide/jump (unlocked) (Y - partially)
- Slide (starting) (N)
- Grapple (unlocked) (N)

**Magic abilities:**
- Witch Time slow-mo 
- Projectile spell / magic beam (Y - partially)

**Attacks:**
- Kick (Y)
- Mid-air kick (Y)
- Low kick (this could be the same as the slide - the animation can be similar to a slide tackle in soccer)(N)
- Slash (sword) (Y-partially)

### Does the cape do anything in gameplay?
- At this time, I am leaning towards no - I want the cape to primarily serve as a visual to make movements feel more fluid and dramatic


### Spiral shaft and slopes. Does the spiral section need Nova to run on sloped or curved ground, or can it be staged with flat steps plus a visual trick? This one has a big effect on the code.
The spiral shaft can use flat steps - I imagined that to be a spiral staircase so that works perfectly.  But I would like to include some slops in the game.  Not a first pass priority though.

### Animation-driven or code-driven movement:
- Normal movement (run, jump, fall, dash, slide, wall slide): code-driven
- Attacks and special moves: animation-driven using frame data (startup / active / recovery, per-frame movement, per-frame hitboxes, cancel windows)
- Animation movement still goes through collision, so she never clips through walls
- Per attack, decide: momentum carry-over (keep / reduce / ignore), gravity during aerials (normal / reduced / hang), landing behavior mid-attack
- Tool idea: root point per frame in OSW, exported with the sprite sheet

### Movement:
- Movement varies per attack. Each attack has a movement type: planted / slowed / momentum kept / lunge
- Magic beam: planted. Strong payoff because she’s vulnerable while casting. Air version TBD (hang / fall / not allowed)
- Sword slash: slowed. Keeps some momentum, speed reduced
- Kick: quick, with a short freeze. Use hitstop (a brief freeze on impact)
- Hitstop is a separate setting that any attack can use
- Can she attack in the air? Yes
- Is Down+A a downward strike or a pogo bounce like Hollow Knight’s? Down strike

### Scale:
- Draw on 1000×1000 → export 400×400 → render at 0.5 = 200px frame on screen
- Keep full frame size, don’t crop per frame; fixed ground line / anchor (feet, bottom-center), e.g. y=950 on the 1000px canvas
- Later: trim on export, saving how much was trimmed
- Nova: 160px tall in-game = 4 tiles, about 15% of a 1080p screen
- Tiles: 40px on screen (draw/export at 80px, render at 0.5)
- Screen = 48×27 tiles at 1920×1080 (32×18 at 1280×720)
- Hurtbox separate from the art, slightly under 4 tiles (about 145–150px), so she clears 4-tile corridors cleanly
- Room math is done in tiles, not pixels
### Physics (tuned in OSW PLAY, Nov 15 2026 — "felt really good", small fine-tuning possible)
Units: world px (= screen px at 1920×1080), seconds. 40px = 1 tile. Fixed timestep 1/50 s, semi-implicit Euler (velocity updated before position).

| Setting | Value | Notes |
|---|---|---|
| Move speed | 650 px/s | ~16 tiles/s. Tied to the run cycle so feet don't skate |
| Jump force | 960 px/s | Fast takeoff |
| Gravity | 2100 px/s² | High; the float comes from apex hang, not low gravity |
| Apex hang | 0.45 | × gravity at the very top of a jump |
| Apex band | 400 px/s | \|vy\| range treated as "the top"; gravity blends smoothly across it |
| Fall gravity | 1.0 | × gravity while falling (>1 = snappier fall) |
| Max fall speed | 1100 px/s | |
| Jump cut | 0.5 | × upward speed on early release (tap = short hop) |
| Jump buffer | 100 ms | Jump pressed just before landing still fires |
| Coyote time | 100 ms | Jump still allowed just after leaving a ledge |
| Ground accel / decel | 10000 / 14000 px/s² | ~0.065 s to full speed = high traction |
| Air accel / decel | 8000 / 5000 px/s² | Slightly softer than ground = flowing arcs |
| Air control | 1.0 | × move speed while airborne |
| Double jump force | 780 px/s | Adds ~145px (3.5 tiles) |
| Wall jump force / push | 860 / 480 px/s | ~176px up; sideways lock 0.18 s after the kick |
| Wall slide speed | 150 px/s | Max fall while clinging (holding into the wall) |
| Dash | 1500 px/s for 0.16 s, 0.45 s cooldown | ~6 tiles; one air dash per airtime; no gravity during dash; decels out afterward (short slide-out) |

Resulting jump (full hold): peak ~218px (~5.5 tiles, ~1.4× Nova's height), ~0.56 s to apex, ~1.08 s total airtime. Tap hop: ~100px.

**How the feel mechanics work (keep these exact behaviors — they fixed real problems):**
- **Smooth apex hang:** gravity multiplier = `apexHang + (target − apexHang) × smoothstep(|vy| / APEX_BAND)`, where target = `fallGravity` when falling and 1 when rising. A hard on/off switch caused a visible lurch.
- **Jump cut guard:** only cut while clearly rising (`vy < −APEX_BAND`), and never below `−APEX_BAND`: `vy = min(vy × jumpCut, −APEX_BAND)`. Releasing near the top changes nothing (no hitch). Applies to normal, wall and double jumps; not during a dash.
- **Jump buffer:** a press that can't jump yet (or happens mid-attack) is remembered for `jumpBuffer`; it fires the moment she's grounded / in coyote time / touching a wall. If the key is already released by then, it's immediately a short hop.
- **Acceleration:** move actual horizontal speed toward the target speed. Speeding up uses accel; stopping or turning uses decel. Dash and wall-jump lock set speed directly, so she decelerates out of them naturally. Hitting a wall zeroes horizontal speed.
- **Tuning history (for context):** low gravity + low jump force felt draggy on takeoff → fixed with high jump force + high gravity, moving the float into apex hang. Too much hang felt unbalanced → apex hang 0.45 + jump force 960 was the sweet spot. Tune one value at a time (apex hang ±0.05, jump force ±20).

### Notes for building the controller (new repo: AstralRelicism)
**Reference implementation:** `src/tools/play.html` in `mkb0020/OnionStudioWizard` (commit `ccb0031`). It has everything above working: run, jump, fall, wall slide / wall jump, dash, double jump, spell, kick, air kick, camera, AABB collision with solids + one-way platforms, hitstop, squash & stretch, cape. Use it for formulas and feel, but build the game's controller fresh and clean rather than copying the playground wholesale (PLAY is a sprite/feel sandbox with lots of extras: critters, head pats, lighting, cape modes).

**Physics source:** in OSW, PLAY reads these numbers from `library/characters/nova/character.json` ("physics" rows matched by label). Keep physics data-driven in the game too (a JSON per character), so tuning never means editing code.

**Architecture plan:**
- Plain JS + Canvas 2D, fixed timestep (keep 1/50 s unless there's a reason to change — changing dt slightly changes jump heights, so retune if you do).
- Player as a **state machine**: idle, run, jumpStart, rise, fall, land, wallSlide, dash, doubleJump, slide, attack states. Abilities are new states, not if/else piles.
- **Ability unlock flags:** double jump, wall slide/jump and grapple start locked; dash and slide start unlocked.
- **Attacks via frame data** (see "Animation-driven or code-driven" above): startup / active / recovery, per-frame movement, per-frame hitboxes, cancel windows, movement type (planted / slowed / momentum kept / lunge), hitstop, gravity during aerials. Attack movement still goes through collision.
- Input: buffered key presses and releases processed at the start of each fixed step.

**Fix in the new build:**
- **Hurtbox:** PLAY still uses 35×65 from the old Kaplay build; Nova's idle body measures ~153px tall on screen. New hurtbox ≈ 35–40 wide × 145–150 tall, feet-anchored (bottom-center).
- Sprite frames: 400×400 sheets, one row each, rendered at 0.5. Anchor = feet, bottom-center.

**Current PLAY controls (keyboard):** ←/→ or A/D move · ↑ / W / Space jump · Shift dash · Z attack · X kick (air kick when airborne).

**First milestones:**
1. Repo skeleton: game loop (fixed step), input, asset loading, physics JSON.
2. Player controller with the values above in a greybox test room on the 40px grid; debug overlay (F1 hitboxes) and live tuning.
3. Port idle / run / jump / fall / land / wall slide / dash / double jump animations.
4. Camera + room transitions; room format that Tile Lab (OSW) can export.
5. Attacks with frame data (kick + air kick first, since sheets exist).

**Still open / later:** slide + low kick (no sheet yet), grapple, Witch Time, magic beam air version (hang / fall / not allowed), Down+A down strike, slopes (not first pass), knockback / i-frames / damage, rebinding / gamepad.
