# Exile Idle — Project Context & Planning Document

This file captures the full game spec, confirmed decisions, proposed original names, revised simplifications, integrations, milestones, and open questions. It is a living document to be updated as decisions are made.

---

## Project Overview

- **Working title:** *Rift Idler*
- **Genre:** Idle / incremental ARPG inspired by Path of Exile systems
- **Target:** Single-page React 19 + Vite + TypeScript app, client-side only, static deploy
- **Repo:** `godlynot/exileed`
- **Current state:** M4.5 skill/ascendancy systems are in place. Class selection, passive tree, ascendancies, items, crafting, skills, supports, and an event-driven combat loop are functional. Typecheck and tree/ascendancy validation pass.

---

## 1. Confirmed Decisions

| Topic | Decision |
|---|---|
| Game title | **Rift Idler** |
| Elemental resistances | **Keep Fire / Cold / Lightning / Chaos separate** (load-bearing gearing loop) |
| Passive tree rendering | **SVG-based**. Konva/react-konva are pending removal. |
| Offline progress | **Constants defined** but loading-overlay simulation not wired yet |
| Integrations | **None** — strictly client-side as specified |
| ES recharge | **Delay-based**: 3 seconds without damage, then 25% ES per second |
| Ascendancies | **Keep 2 per class** (core build-variety system) |
| Passive tree size | **80 nodes** (3 roots, 6 keystones, 15 notables, 56 smalls) |

---

## 2. Tech Stack (MVP)

| Layer | Choice |
|---|---|
| Framework | React 19 + Vite |
| Language | TypeScript |
| State | Zustand (single store) |
| Styling | Tailwind CSS |
| Persistence | localStorage (autosave every 30s) |
| Tree rendering | SVG with pan/zoom/click |
| Animation | Framer Motion |
| Number formatting | Inline (no external library yet) |
| Deploy target | Vercel static |

No backend required for MVP. No environment variables required. No third-party integrations required.

---

## 3. Revised v1 Cuts

The user explicitly rejected cutting load-bearing systems. The following reduce **content quantity** while preserving mechanics depth.

| Full Spec | Revised v1 | Reason |
|---|---|---|
| 12 uniques | **6 uniques** | Fewer hand-designed items, still enough to enable builds |
| 120 passive nodes | **80 passive nodes** | Smaller tree, faster to lay out and balance |
| 10 acts | **8 acts** | Shorter campaign, Trials still land at appropriate levels |
| Ascendancies | **Keep 2 per class** | Core to build variety; not touched |
| Separate elemental resists | **Keep separate** | Load-bearing for gearing loop |
| Full affix rolling | **Keep full system** | Load-bearing for endgame loop |
| Passive ES regen | **Keep delay-based recharge** | Accepted to reduce tick-complexity and offline-calc edge cases |

---

## 4. Milestone Breakdown

### M1 — Core Loop ✅
- [x] Project scaffold (React + Vite + TypeScript + Tailwind + Zustand)
- [x] Tick loop at 5 ticks/sec (`TICK_RATE = 200ms` in `src/data/balance.ts`)
- [x] Three classes with unique base stats and starter gear
- [x] Auto-combat (player vs. monster)
- [x] XP, leveling, passive points
- [x] Death and respawn
- [x] Save/load with versioning and migration
- [x] Zone selection and progression (3 zones implemented)

### M2 — Items & Crafting ✅
- [x] 9 equipment slots
- [x] Item rarities (normal/magic/rare) with rarity colors
- [x] Base items and affix pools with tiers
- [x] 9 crafting orbs/currencies
- [x] Inventory with equip/unequip/sell/auto-sell
- [x] Equipment panel with stat summary
- [x] Item tooltips
- [x] Currency system

### M3 — Passive Tree & Ascendancies ✅
- [x] 80-node passive tree (3 roots, 6 keystones, 15 notables, 56 smalls)
- [x] SVG renderer with pan/zoom/click
- [x] Allocation and refund with connectivity validation
- [x] 6 keystones with special hooks
- [x] Ascendancies: 2 per class (6 total)
- [x] Trials at levels 30/50/65/75 (8 ascendancy points total)
- [x] Passive points from level-ups

### M4 — Campaign & Combat Depth ✅
- [x] Shattered Coast zone with 8+ monster types
- [x] Acts 2–3 campaign zones added (Cinder Marches, Fulgurite Spires)
- [x] Zone-level monster scaling via `createMonster` (`monsterLife`/`monsterDamage`)
- [x] Monster damage components (physical/cold/lightning/fire/chaos)
- [x] Resistance system with caps
- [x] Armour mitigation and evasion formulas
- [x] Energy Shield before Life
- [x] Life regen and ES recharge delay
- [x] Elite monsters with auras
- [x] Boss phases (Storm-Wrecked Warden, Cinder Throne Warden, Spire Crown)
- [x] Combat event system
- [x] Toggle-able combat log
- [x] Floating combat text with scatter
- [x] Character stat summary with mitigation/evasion estimates

### M4.5 — Skills & Ascendancy Redesign ✅
- [x] Core skill/support types and data files
- [x] Skill panel (4 skill slots, support slots per skill)
- [x] Gem XP/leveling (skills/supports level with use, max level 20)
- [x] Combat integration: `simulateTick` iterates equipped skills, scales skill/support damage by gem level, grants gem XP on hit, emits `gemLeveledUp` events
- [x] 6-class roster restored/added: Brute, Stalker, Acolyte, Oracle, Warlord, Plaguebringer
- [x] Ascendancy data replaced with Fateseer, Herald, Contagion, Virulent, Vanguard, Marshal
- [x] Ascendancy wheel renderer with 12-node layout (5 keystones + 7 smalls)  - [x] Choice-keystone pickers: Heralds (6 auras) and Marshal armies (5 armies)
  - [x] Twin Heralds (`herald_k3`) supports picking two auras via a dual-choice picker
  - [x] Herald of Gold grants +% item rarity and +% extra item chance on kills; +50% stronger with Unwavering Declaration
  - [x] Keystone special hooks and `validate:ascendancies` (Judgment, Gold, Iron Legion, Skirmishers now wired)
  - [x] Save schema migration for skills/equipped supports/ascendancy choices

### Remaining for full M4 / M5
- [ ] Complete 8-act campaign zones 4–8
- [ ] Wire offline progress on startup
- [x] Call `loadGame()` on app boot
- [ ] Implement party/minion system so Herald auras and Marshal armies target the whole party set
- [ ] Nexus endgame / Rift Crystals
- [ ] 6 unique items
- [ ] Full map affix rolling
- [ ] Remove or use `konva` / `react-konva` dependencies

---

## 5. Original Naming Table

Avoid all Path of Exile trademarked terms.

### Game / World
| Concept | Proposed Name |
|---|---|
| Game title | **Rift Idler** |
| World | **Aethelgard** |
| Endgame system | **The Nexus** |
| Endgame keys | **Rift Crystals** |
| Trials | **Crucibles of Mastery** |
| Pinnacle boss | **The Primeval Sovereign** |

### Classes & Ascendancies (2 per class)
| Base Class | Primary Stat | Passive Root | Ascendancy A | Ascendancy B |
|---|---|---|---|---|
| Brute | Strength | Warlord region | **Juggernaut** (Armour/Life) — *placeholder, pending redesign* | **Berserker** (Physical Damage/Attack Speed) — *placeholder, pending redesign* |
| Warlord | Strength | Warlord region | **Vanguard** (Momentum Offense) — *FINAL* | **Marshal** (Momentum Defense) — *FINAL* |
| Stalker | Dexterity | Plaguebringer region | **Deadeye** (Accuracy/Crit) — *placeholder, pending redesign* | **Assassin** (Evasion/Crit) — *placeholder, pending redesign* |
| Plaguebringer | Dexterity | Plaguebringer region | **Virulent** (Single-target DOT) — *FINAL* | **Contagion** (Pack-spreading DOT) — *FINAL* |
| Acolyte | Intelligence | Oracle region | **Elementalist** (Spell Damage/Resistances) — *placeholder, pending redesign* | **Occultist** (Energy Shield/Chaos) — *placeholder, pending redesign* |
| Oracle | Intelligence | Oracle region | **Fateseer** (Deterministic hits) — *FINAL* | **Herald** (Standing auras) — *FINAL* |

**Note:** The passive tree retains its three original roots (Warlord, Plaguebringer, Oracle regions). Old and new classes share roots by stat focus; a full six-root redesign is on hold for v1.

### Crafting Currencies (Orbs)
| Function | Name |
|---|---|
| Normal → Magic | **Orb of Awakening** |
| Reroll Magic | **Orb of Mutation** |
| Magic → Rare | **Orb of Sovereignty** |
| Normal → Rare | **Orb of Genesis** |
| Reroll Rare | **Orb of Entropy** |
| Add affix to Rare | **Orb of Triumph** |
| Remove one affix | **Orb of the Void** |
| Remove all affixes | **Orb of Cleansing** |
| Refund passive point | **Orb of Penance** |

### Campaign Zones (8 Acts)
1. The Shattered Coast ✅ (levels 1–8)
2. The Cinder Marches ✅ (levels 9–16, fire identity)
3. Fulgurite Spires ✅ (levels 17–24, lightning identity)
4. Crimson Swamps
5. Frostbound Peaks
6. Cursed Catacombs
7. Halls of Judgment
8. Elysian Threshold

### Trial Placement
- **Trial of Ascension** — Act 3 (level ~30): unlocks first ascendancy choice, 2 points
- **Trial of Mastery** — Act 6 (level ~50): unlocks second ascendancy choice, 2 points
- **Crucible of Valor** — Act 7 (level ~65): 2 points
- **Crucible of Legends** — Act 8 (level ~75): 2 points
- 8 ascendancy points total; trials grant ascendancy points ONLY, never support slots.

---

## 6. Simplifications Retained / Rejected

| Proposal | Status |
|---|---|
| Single "Elemental Resistance" stat | **Rejected** — keep Fire/Cold/Lightning separate |
| Rift Hazard Level instead of rolled affixes | **Rejected** — keep full map affix rolling |
| ES recharges after 4s without hit | **Accepted** — 3 seconds without damage |
| Reduce to 1 ascendancy per class | **Rejected** — keep 2 per class |
| Passive tree renderer | **SVG** accepted over Konva |

---

## 7. Engineering Requirements

- All content lives in `src/data/` as TypeScript data files.
- Combat is a deterministic pure function: `simulateTick(state) => { state, events }`.
- Save schema is versioned with migration stub.
- Autosave uses temp-key + verify + swap pattern.
- `bun run dev` and `bun run build` must work out of the box.
- `BALANCE.md` and `src/data/balance.ts` document tuning constants.
- No environment variables.
- Offline progress constants exist but the loading overlay is not yet implemented.

---

## 8. Open Questions Remaining

1. Should we complete zones 4–8 next, or move to the Nexus endgame first?
2. Should we wire the offline progress overlay now, or after the campaign is complete?
3. Should we remove the unused `konva` and `react-konva` dependencies?

---

*Last updated: 2026-07-23 (Acts 2–3 campaign implemented; Cinder Marches and Fulgurite Spires zones, monsters, and bosses added)*
