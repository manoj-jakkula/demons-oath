# DEMON'S OATH

A browser-based 3D medieval hack-and-slash action RPG (Iron Blade-style), built with **Three.js + Vite**. All audio is synthesized with the Web Audio API — zero external asset files.

## Play instantly

**Double-click `Demons-Oath.html`** in this folder. That's the whole game bundled into a single file — no server, no install needed.

## Development

```bash
npm install
npm run dev       # dev server with hot reload
npm run build     # rebuilds dist/ AND regenerates Demons-Oath.html
```

## Controls

| Input | Action |
|---|---|
| **WASD** | Move |
| **Mouse** | Camera (click the game to capture the pointer) |
| **LMB** | Light attack — 3-hit combo chain |
| **RMB** | Heavy attack (breaks shield guards) |
| **Space** | Dodge roll (0.3s invincibility) |
| **Shift (hold)** | Block — block within 150ms of an incoming hit to **parry** |
| **Q** | Rage special (AoE blast when the orange bar is full) |
| **E** | Execute finisher (on weakened enemies) / interact |
| **Tab** | Lock-on / cycle targets |
| **K** | Skill tree |
| **1 / 2** | Health potion / rage elixir |
| **Esc** | Pause |

**Touch devices:** virtual joystick on the left, action buttons on the right, auto lock-on.

## How to fight

- **White flash** above an enemy = blockable attack. **Red flash** = unblockable — dodge it.
- Parrying staggers the attacker and opens a **riposte** window (your next light attack is a guaranteed-crit counter).
- Enemies below 15% HP can be **executed** with E — slow-mo kill that restores HP.
- **Ghouls** swarm — keep moving. **Shield Knights** block frontal hits — parry, heavy-attack, or flank. **Cultists** snipe and teleport — close fast. **Brutes** hit unblockably — dodge only. **Wraiths** vanish and ambush from behind.

## Structure

3 chapters (Cursed Village → Blackroot Forest → Demon Citadel), each: 3 waves → champion mini-boss → sanctuary (chest + shrine checkpoint) → boss. Bosses: **Plague Abbot**, **Wraith Queen** (summons adds in phase 2), **Demon Lord** (3 phases, arena fire hazards).

Between chapters the **blacksmith** sells weapon upgrades and potions. Loot drops in Common/Rare/Epic/Legendary tiers and auto-equips when better (worse drops smelt into gold). Level-ups grant skill points for 3 talent branches (Warrior / Guardian / Slayer).

Progress auto-saves to localStorage at checkpoints; the pause menu can download a save file, loadable from the title screen. Dying respawns you at the chapter checkpoint with gear and XP intact.

## Code map

| File | Role |
|---|---|
| `src/config.js` | **Every** tunable: damage, cooldowns, waves, loot tables, boss patterns |
| `src/main.js` | Game loop (fixed timestep), camera, input, state transitions |
| `src/player.js` | Player state machine, combos, parry, finishers |
| `src/combat.js` | All damage resolution, crits, hit-stop, parry rules |
| `src/enemy.js` | 5 enemy AIs + pooling + attack-token coordination |
| `src/boss.js` | 3 multi-phase bosses + pattern engine |
| `src/level.js` | Chapter arenas, wave flow, hazards, chest/shrine |
| `src/loot.js`, `src/skills.js`, `src/save.js` | Gear rolls, skill tree, save system |
| `src/ui.js`, `src/vfx.js`, `src/audio.js` | HUD/menus, pooled particles, synthesized audio |
