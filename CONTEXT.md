# Exile Idle — Project Context & Planning Document

This file captures the full game spec, confirmed decisions, proposed original names, revised simplifications, integrations, milestones, and open questions. It is a living document to be updated as decisions are made.

---

## Project Overview

- **Working title:** *Rift Idler*
- **Genre:** Idle / incremental ARPG inspired by Path of Exile systems
- **Target:** Single-page React 19 + Vite + TypeScript app, client-side only, static deploy
- **Repo:** `godlynot/exileed`
- **Current state:** M4.5 skill/ascendancy systems are in place. Class selection, passive tree, ascendancies, items, crafting, skills, supports, and an event-driven combat loop are functional. Typecheck and tree/ascendancy validation pass. Campaign Acts 1-8 are implemented.

---

## 1. Confirmed Decisions

| Topic | Decision |
|---|---|
| Game title | **Rift Idler** |
| Elemental resistances | **Keep Fire / Cold / Lightning / Chaos separate** (load-bearing gearing loop) |
| Passive tree rendering | **SVG-based**. No Konva dependency is used. |
| Offline progress | **Wired**: boot overlay simulates away-time (capped 8h, chunked hourly) via real combat ticks |
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
- [x] Tick loop at 2.5 ticks/sec (`TICK_RATE = 400ms` in `src/data/balance.ts`)
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
- [x] Affix count bands: Magic 1–2, Rare 4–6; 3-prefix/3-suffix caps and duplicate prevention
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
- [x] Ascendancy wheel renderer with 12-node layout (5 keystones + 7 smalls)
- [x] Choice-keystone pickers: Heralds (6 auras) and Marshal armies (5 armies)
- [x] Twin Heralds (`herald_k3`) supports picking two auras via a dual-choice picker
- [x] Herald of Gold grants +% item rarity and +% extra item chance on kills; +50% stronger with Unwavering Declaration
- [x] Keystone special hooks and `validate:ascendancies` (Judgment, Gold, Iron Legion, Skirmishers now wired)
- [x] Save schema migration for skills/equipped supports/ascendancy choices

### M5 — Complete Campaign ✅
- [x] Complete campaign zones 4–5 (Crimson Swamps, Cursed Catacombs)
- [x] Complete campaign zones 6–8 (Frostbound Peaks, The Rotting Deep, Halls of Judgment)
- [x] Wire offline progress on startup (offline overlay simulates away-time capped at 8h, chunked by hour)
- [x] Call `loadGame()` on app boot
- [ ] Implement party/minion system so Herald auras and Marshal armies target the whole party set
- [x] Nexus Stage 1: Rift Crystals, tiered maps, charges, entry, and completion return
- [x] Nexus Stage 2: rolled map affixes and map-modified monster/reward effects
- [x] Nexus Stage 3: first-clear tier milestones award Rift Crystals at T5 (+5), T10 (+10), T15 (+15), and T16 (+16); claimed tiers persist and the active-run UI/combat log show feedback.
- [ ] Nexus Stage 4: pinnacle encounter, The Primeval Sovereign (design not yet approved)
- [x] 6 unique items with hand-designed bases, unique effects, and named-elite drops
- [x] Confirm unused `konva` / `react-konva` dependencies are absent; passive tree uses SVG

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
|---|---|---|---|---|---|
| Brute | Strength | Warlord region | **Juggernaut** (Armour/Life) — *placeholder, pending redesign* | **Berserker** (Physical Damage/Attack Speed) — *placeholder, pending redesign* |
| Warlord | Strength | Warlord region | **Vanguard** (Momentum Offense) — *FINAL* | **Marshal** (Momentum Defense) — *FINAL* |
| Stalker | Dexterity | Plaguebringer region | **Deadeye** (Accuracy/Crit) — *placeholder, pending redesign* | **Assassin** (Evasion/Crit) — *placeholder, pending redesign* |
| Plaguebringer | Dexterity | Plaguebringer region | **Virulent** (Single-target DOT) — *FINAL* | **Contagion** (Pack-spreading DOT) — *FINAL* |
| Acolyte | Intelligence | Oracle region | **Elementalist** (Spell Damage/Resistances) — *placeholder, pending redesign* | **Occultist** (Energy Shield/Chaos) — *placeholder, pending redesign* |
| Oracle | Intelligence | Oracle region | **Fateseer** (Deterministic hits) — *FINAL* | **Herald** (Standing auras) — *FINAL* |

**Note:** The passive tree retains its three original roots (Warlord, Plaguebringer, Oracle regions). Old and new class shares roots by stat focus; a full six-root redesign is on hold for v1.

### Crafting Currencies (Orbs)
| Function | Name |
|---|---|
| Normal → Magic | **Orb of Awakening** |
| Reroll Magic | **Orb of Mutation** |
| Magic → Rare (fills to 4–6 affixes) | **Orb of Sovereignty** |
| Normal → Rare (4–6 affixes) | **Orb of Genesis** |
| Reroll Rare (4–6 affixes) | **Orb of Entropy** |
| Add affix to Rare (up to 6) | **Orb of Triumph** |
| Remove one affix | **Orb of the Void** |
| Remove all affixes | **Orb of Cleansing** |
| Refund passive point | **Orb of Penance** |

### Campaign Zones (8 Acts)
1. The Shattered Coast ✅ (levels 1–8)
2. The Cinder Marches ✅ (levels 9–16, fire identity)
3. Fulgurite Spires ✅ (levels 17–24, lightning identity)
4. Crimson Swamps ✅ (levels 24–32, mixed elemental)
5. Cursed Catacombs ✅ (levels 32–40, chaos identity)
6. Frostbound Peaks ✅ (levels 40–50, physical/armour-pierce)
7. The Rotting Deep ✅ (levels 50–58, ailments/DoT)
8. Halls of Judgment ✅ (levels 58–65, everything/crit)

> Note: support slots grow at Acts 3 / 6 / **8** (cap 5), matching this 8-act campaign. Docs or code claiming an Act 9 milestone predate the 8-act campaign.

### Trial Placement
- **Trial of Ascension** — Act 3 (level ~30): unlocks first ascendancy choice, 2 points
- **Trial of Mastery** — Act 6 (level ~50): unlocks second ascendancy choice, 2 points
- **Crucible of Valor** — Act 7 (level ~65): 2 points
- **Crucible of Legends** — Act 8 (level ~75): 2 points
- 8 ascendancy points total; trials grant ascendancy points ONLY, never support slots.

---

## 6. Itemization Rules

- **Normal:** 0 affixes.
- **Magic:** 1–2 affixes.
- **Rare:** 4–6 affixes.
- Every item may have at most **3 prefixes and 3 suffixes**, and an affix definition cannot appear more than once on the same item.
- Orb of the Void removes one affix normally; if that would leave the count in the 3-affix gap, it removes additional random affixes until the item lands in a valid lower rarity band.
- Existing saves are diagnosed in Dev Tools but are not silently rewritten; the current migration policy is to preserve affected items until a deliberate cleanup is chosen.

---

## 7. Simplifications Retained / Rejected

| Proposal | Status |
|---|---|
| Single "Elemental Resistance" stat | **Rejected** — keep Fire/Cold/Lightning separate |
| Rift Hazard Level instead of rolled affixes | **Rejected** — keep full map affix rolling |
| ES recharges after 4s without hit | **Accepted** — 3 seconds without damage |
| Reduce to 1 ascendancy per class | **Rejected** — keep 2 per class |
| Passive tree renderer | **SVG** accepted; Konva is not used |

---

## 8. Engineering Requirements

- All content lives in `src/data/` as TypeScript data files.
- Combat is a deterministic pure function: `simulateTick(state) => { state, events }`.
- Save schema is versioned with migration stub.
- Autosave uses temp-key + verify + swap pattern.
- `bun run dev` and `bun run build` must work out of the box.
- `BALANCE.md` and `src/data/balance.ts` document tuning constants.
- No environment variables.
- Offline progress is wired through the startup overlay and chunked simulation; balance tuning remains separate from system implementation.

---

## 9. Open Questions Remaining

1. Nexus Stage 3 is implemented; tune milestone amounts only after live progression review.
2. The six unique items are implemented; tune their drop frequency and power only after live progression review.
3. What are the approved mechanics, access condition, phases, and rewards for Stage 4's Primeval Sovereign encounter?
4. Should we implement the party/minion target-set abstraction before adding more aura/army effects?

---

## 10. Deferred / Accepted Issues

### Armour mitigation drift (reviewed)

**Current status:** Tuned alongside the completed campaign review. Defensive base gear stats now use a `0.75` exponent on `monsterScalingMultiplier`, and the level 25+ flat armour/evasion affix tiers were reduced to keep defensive growth meaningful without approaching immunity.

**Why it happened:** The full front-loaded campaign curve was applied to defensive base stats while high-tier flat defensive affixes also grew sharply. The combination made armour outpace late-campaign incoming damage in the validator's rare-gear model.

**What remains:** The validator still intentionally selects the highest-average-damage nonboss threat in each zone. The Frostbound and Judgment pools contain deliberate physical outliers (`Shatter Beast` and `Executioner`), so those zones remain useful spike tests rather than evidence of a global scaling failure.

**Future tuning options:** If live combat confirms those spikes are too punishing, tune the individual monster templates or add defensive counterplay; do not raise the global mitigation denominator without first checking armour-focused builds.

---

*Last updated: 2026-09-04 (Spatial combat Stages 1–4 complete — travel phase, pack map, boss arenas, elite-led formations, swarm encounters; support-slot milestones corrected to Acts 3/6/8)*
