# Rift Idler — AI Handoff Document

> **Purpose:** Give any future AI (or human) enough context to continue work without re-explaining the project. Keep this file updated when major systems change.

---

## 1. At a Glance

| | |
|---|---|
| **Game** | *Rift Idler* — an idle/incremental ARPG inspired by Path of Exile systems |
| **Repo** | `godlynot/exileed` |
| **Milestone** | M4.5 complete (skill/ascendancy systems wired); M5 endgame pending |
| **Stack** | React 19, Vite, TypeScript, Tailwind CSS, Zustand, Framer Motion |
| **Persistence** | `localStorage` only (autosave every ~30s) |
| **Entry** | `src/main.tsx` → `src/App.tsx` |
| **State** | Single Zustand store: `src/store/gameStore.ts` |
| **Combat** | Pure function `simulateTick(state) => { state, events }` in `src/systems/combat.ts` |

---

## 2. Project Structure

```
src/
  components/          # React UI panels
  data/                # Static game data (classes, zones, items, skills, passives, ascendancies, balance)
  hooks/               # useGameLoop
  store/               # Zustand game store
  systems/             # Core simulation logic
  types/               # TypeScript types
```

| Directory | What lives there |
|---|---|
| `src/components/` | `App`, `ClassSelection`, `CombatScene`, `CombatLog`, `CombatEffects`, `InventoryPanel`, `EquipmentPanel`, `CraftingPanel`, `PassiveTreePanel`, `AscendancyTree`, `AscendancyWheel`, `SkillsPanel`, `CharacterStats`, `DevTools`, `ErrorBoundary` |
| `src/data/` | `balance.ts`, `classes.ts`, `zones.ts`, `monsters.ts`, `items.ts`, `affixes.ts`, `currencies.ts`, `skills.ts`, `supports.ts`, `passiveTree.ts`, `ascendancies.ts` |
| `src/systems/` | `combat.ts`, `items.ts`, `passives.ts`, `ailments.ts`, `momentum.ts`, `xp.ts`, `save.ts`, `gems.ts`, `characterEffects.ts` |
| `src/store/` | `gameStore.ts` |
| `scripts/` | `validateTree.ts`, `validateAscendancies.ts` |

---

## 3. Tech Stack & Conventions

- **Type checking:** `bun tsc -b --noEmit`
- **Build:** `bun run build`
- **Dev server:** `bun run dev` (binds to `0.0.0.0`)
- **Validators:** `bun run validate:tree` and `bun run validate:ascendancies`
- **Gem XP/leveling:** Implemented in `src/systems/gems.ts`, scaled in combat, displayed in `SkillsPanel.tsx`
- **Imports:** Always use `.ts` extensions (e.g. `import { ... } from './file.ts'`)
- **State mutations:** Zustand store actions return new state objects; combat is a pure function
- **Styling:** Tailwind v4 with `@import "tailwindcss"` in `src/index.css`
- **No backend:** All data is client-side; no env vars or API keys required

---

## 4. Core Systems

### 4.1 Game Loop

- `TICK_RATE = 200ms` (5 ticks/sec) in `src/data/balance.ts`
- `useGameLoop` calls `store.tick()` every tick
- `tick()` runs `simulateTick(state)` and keeps the last 50 combat events in `combat.events`

### 4.2 Character

Character state is recomputed from three sources (in this order):

1. `recalculateCharacterFromEquipment(character, equipment)` — base class + gear
2. `applyPassiveStats(character, passiveTree)` — allocated passive nodes
3. `applyAscendancyStats(character)` — allocated ascendancy nodes

Key stats:

- **Attributes:** STR/DEX/INT
- **Pools:** Life, Energy Shield (ES absorbs damage before life)
- **Offense:** Accuracy, crit chance, crit multiplier, flat/increased/more damage
- **Defense:** Armour, evasion, resistances

Attribute scaling (balance.ts):

- `+2 Life` per Strength
- `+2 ES` per Intelligence
- `+2 Accuracy` per Dexterity
- Every 10 points: `+0.5%` melee phys / evasion / spell damage respectively

### 4.3 Combat

`simulateTick(state)` is a pure function.

Combat flow per tick:

1. Herald periodic effects (storms, marshal DOTs, bulwark decay)
2. Momentum decay (unless Relentless Advance pauses it)
3. Recovery (life regen, ES recharge after 3s without damage)
4. Player skill hits against the current monster
5. DOT/ailment ticks
6. Monster attacks the player
7. Death / respawn / XP / loot / zone progress / trial completion
8. Spawn next monster

Key formulas:

- **Evasion:** `evadeChance = evasion / (evasion + attackerAccuracy)`, capped at 95%
- **Hit chance:** `1 - evadeChance`, minimum 5%
- **Armour mitigation:** `armour / (armour + 5 * incomingHitDamage)`
- **Resistances:** flat additive, cap 75% (Zealot's Creed raises to 85%)
- **Critical:** base 5% chance, 1.5x multiplier; crit chance capped at 100%

### 4.4 Skills & Supports

- Skills are in `src/data/skills.ts`, supports in `src/data/supports.ts`
- Each skill has tags (attack, spell, physical, fire, cold, lightning, chaos, dot, aoe, projectile, melee)
- Supports only apply if their allowed tags overlap with the skill's tags
- Supports add flat/increased/more stat mods, scaled by support gem level
- Player has 4 skill slots; each skill slot has a skill + support slots
- `supportSlotCount` grows with campaign: 2 → 3 → 4 → 5 at acts 3, 6, 9
- **Gem XP/leveling:** Skill and support gems gain XP when the skill fires and hits. They level independently up to level 20. Higher level = higher base skill damage (+3% per level) and stronger support modifiers (+2% per level). XP requirements scale with `GEMS.XP_PER_LEVEL * level`. Levels and XP are shown in `SkillsPanel.tsx` and `gemLeveledUp` events appear in the combat log.

### 4.5 Passive Tree

- 80 nodes: 3 roots, 6 keystones, 15 notables, 56 smalls
- Roots are class-based (`CLASS_ROOT_MAP`)
- Allocation requires adjacency to an already allocated node
- Refunding a node must leave all allocated nodes reachable from the root
- Validation: `bun run validate:tree`

Keystones (hard-coded special hooks):

- `special:juggernauts_stance` — armour/life up, speed down
- `special:perfect_aim` — always hit, cannot crit
- `special:elemental_dominion` — 50% phys → lightning, +25% lightning taken
- `special:iron_reservation` — +50% life/ES, no regen/recharge
- `special:zealots_creed` — 85% res cap, pools halved
- `special:vengeful_resolve` — 35% more damage, 25% more damage taken

### 4.6 Classes & Ascendancies

- **6 launch classes**: Brute, Stalker, Acolyte, Oracle, Warlord, Plaguebringer.
- Each class has **2 ascendancies** (12 total wheels in data, 6 final + 6 placeholders).

| Class | Primary Attributes | Ascendancy A | Ascendancy B | Design Status |
|---|---|---|---|---|
| **Brute** | Strength | Juggernaut | Berserker | **Placeholder — pending redesign** |
| **Stalker** | Dexterity | Deadeye | Assassin | **Placeholder — pending redesign** |
| **Acolyte** | Intelligence | Elementalist | Occultist | **Placeholder — pending redesign** |
| **Oracle** | Int/Dex | **Fateseer** | **Herald** | **Final — per handoff doc** |
| **Warlord** | Str/Dex | **Vanguard** | **Marshal** | **Final — per handoff doc** |
| **Plaguebringer** | Dex/Int | **Virulent** | **Contagion** | **Final — per handoff doc** |

- Each final ascendancy has **12 paid nodes (7 smalls, 5 keystones)** plus optional free auto-selected nodes (e.g., Vanguard/Marshal Momentum).
- Trials at levels 30/50/65/75 award 2 ascendancy points each (8 total)
- Some keystones require choosing from a list (e.g. Herald auras, Marshal armies)
- `keystoneChoices` on `Character` stores `nodeId → choiceId(s)` (comma-separated for multi-choice like Twin Heralds)
- Validation: `bun run validate:ascendancies`

Ascendancy mechanics wired in `combat.ts` / `passives.ts`:

- **Herald of Light:** +10% damage (+18% with Unwavering Declaration)
- **Herald of Gold:** +25% gold, +25% extra item chance, +5% rare / +10% magic rarity bonus (+50%/+10%/+20% with Unwavering)
- **Herald of Tide:** damage ramp while untouched; resets on hit
- **Herald of Silence:** 8% damage reduction (12% with Unwavering)
- **Herald of Storms:** periodic lightning bolt
- **Herald of Judgment:** enemies ≤35% health take +20% damage (+35% with Unwavering)
- **Twin Heralds:** pick 2 auras, no specials, each at normal strength
- **Marshal Bannerman's Resolve:** pick one army (Iron Legion, Skirmishers, Zealots, Wardens, Reapers)
- **Marshal Iron Legion:** flat damage resistance equal to character level
- **Marshal Skirmishers:** kills grant +2 Momentum instead of +1
- **Marshal War of Attrition:** applies poison DOT every second
- **Vanguard / Marshal Momentum:** free auto-selected small node grants the Momentum resource (damage, action speed, life regen, DR per stack). Non-Warlord characters do not have Momentum.

### 4.7 Items & Crafting

- Rarities: `normal`, `magic`, `rare`, `unique`
- Slots: weapon, offhand, helmet, body, gloves, boots, belt, amulet, ring (x2)
- Affixes have tiers and level requirements
- Currencies/orbs:
  - `awakening` — normal → magic
  - `mutation` — reroll magic
  - `sovereignty` — magic → rare
  - `genesis` — normal → rare
  - `entropy` — reroll rare
  - `triumph` — add affix to rare (if < 6)
  - `void_orb` — remove one affix
  - `cleansing` — strip all affixes

### 4.8 Zones & Monsters

- Zones are in `src/data/zones.ts`; monsters in `src/data/monsters.ts`
- Each zone has a pool of monster IDs, pack size, elite chance, kill progress
- Boss zones have a single boss kill
- Progress fills to 100%, unlocking the next zone
- Shattered Coast is the first zone (Act 1), designed to teach cold resistance

### 4.9 Save System

- `SAVE_VERSION = 4` in `src/systems/save.ts`
- Save key: `riftidler_save_v4`
- `serializeSave` base64-encodes the full `GameState`
- `deserializeSave` runs migration for older save versions
- Current migration resets passive allocations to the class root (tree changed), preserves ascendancy points, adds new combat fields
- Not yet called on app boot (`loadGame()` is defined but unused)

---

## 5. Current State (M4.5)

**Done:**

- M1 core loop
- M2 items, crafting, inventory, equipment, tooltips
- M3 passive tree, allocation, keystone hooks
- M4 campaign zones 1–3, combat depth, event system, combat log, stat summary
- M4.5 skills, supports, ascendancy redesign, choice-keystone pickers, skill/ascendancy combat hooks
- Twin Heralds and Herald of Gold item bonuses
- Build/typecheck/validation pass

**Open / next:**

- Complete campaign zones 4–8
- Wire `loadGame()` and offline progress overlay
- Herald/Marshal party-set effects (v1 self-buff limitation documented in `combat.ts`)
- Nexus endgame / Rift Crystals
- 6 unique items
- Full map affix rolling
- Remove unused `konva` / `react-konva` dependencies

---

## 6. How to Build & Validate

```bash
# Install
bun install

# Dev server
bun run dev

# Production build
bun run build

# Type check
bun tsc -b --noEmit

# Validate data
bun run validate:tree
bun run validate:ascendancies
```

---

## 7. Important Notes for Future AIs

- **Do not call hooks conditionally.** All hooks are at the top of components.
- **Do not mutate state directly.** Combat is pure; store uses Zustand's `set` with new objects.
- **Do not hardcode rarity hex values.** Use `RARITY_COLORS` from `src/types/item.ts` and `rarityTextClass`/`rarityBorderClass`.
- **Do not commit `tsconfig.tsbuildinfo`.** It is ignored via `.gitignore` (`*.tsbuildinfo`).
- **Adding a new keystone?**
  1. Add the `special:*` stat key to `STAT_KEYS` in `src/types/game.ts`
  2. Add the node in the appropriate `src/data/ascendancies.ts` section
  3. Implement the effect in `src/systems/combat.ts` or `src/systems/passives.ts`
  4. Add the stat to `VALID_SPECIALS` in `scripts/validateAscendancies.ts`
  5. Run `bun run validate:ascendancies`
- **Adding a new skill or support?** Update `src/data/skills.ts` or `src/data/supports.ts`. Combat auto-picks skills from `character.equippedSkills` and scales damage/mods by gem level.
- **Changing gem balance?** Update `src/data/balance.ts` (`GEMS` constants) and `src/systems/gems.ts`. Test by equipping a skill, killing monsters, and checking `SkillsPanel.tsx` for level/XP changes.
- **Save compatibility:** Bump `SAVE_VERSION` and add migration logic in `src/systems/save.ts` whenever you change `GameState` shape.

---

*Generated: 2026-07-22*
*Last updated: 2026-07-23 (M4.5 gem XP/leveling wired, CombatEffects hover tooltips, delayed damage log entries)*
