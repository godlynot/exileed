# Exile Idle — Project Context & Planning Document

This file captures the full game spec, confirmed decisions, proposed original names, revised simplifications, integrations, milestones, and open questions. It is a living document to be updated as decisions are made.

---

## Project Overview

- **Working title:** *Rift Idler*
- **Genre:** Idle / incremental ARPG inspired by Path of Exile systems
- **Target:** Single-page React 18 + Vite + TypeScript app, client-side only, static deploy
- **Repo:** `godlynot/exileed`
- **Current state:** M2 complete. Items, affixes, equipment, and crafting orbs are implemented. Typecheck and build pass.

---

## 1. Confirmed Decisions

| Topic | Decision |
|---|---|
| Game title | **Rift Idler** (and names in this document) |
| Elemental resistances | **Keep Fire / Cold / Lightning separate** (load-bearing gearing loop) |
| Passive tree rendering | **Canvas-based** (Konva or equivalent) |
| Offline progress | **Loading overlay**, calculated in 1-hour chunks |
| Integrations | **None** — strictly client-side as specified |
| ES recharge simplification | **Accepted**: passive flat regen per tick |
| Ascendancies | **Keep 2 per class** (core build-variety system) |

---

## 2. Tech Stack (MVP)

| Layer | Choice |
|---|---|
| Framework | React 18 + Vite |
| Language | TypeScript |
| State | Zustand (single store, sliced) |
| Styling | Tailwind CSS |
| Persistence | localStorage (autosave every 30s + on tab close) |
| Tree pan/zoom | Canvas library (Konva / `react-konva`) |
| Animation | Framer Motion |
| Number formatting | `Intl.NumberFormat` |
| Deploy target | Vercel static |

No backend required for MVP. No environment variables required. No third-party integrations required.

---

## 3. Revised v1 Cuts (Content Volume, Not Systems)

The user explicitly rejected cutting load-bearing systems. The following reduce **content quantity** while preserving mechanics depth.

| Full Spec | Revised v1 | Reason |
|---|---|---|
| 12 uniques | **6 uniques** | Fewer hand-designed items, still enough to enable builds |
| 120 passive nodes | **80 passive nodes** | Smaller tree, faster to lay out and balance |
| 10 acts | **8 acts** | Shorter campaign, Trials still land at appropriate levels |
| Ascendancies | **Keep 2 per class** | Core to build variety; not touched |
| Separate elemental resists | **Keep separate** | Load-bearing for gearing loop |
| Full map affix rolling | **Keep full system** | Load-bearing for endgame loop |
| Passive ES regen | **Keep simplified** | Accepted to reduce tick-complexity and offline-calc edge cases |

---

## 4. Original Naming Table

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
| Base Class | Primary Stat | Ascendancy 1 | Ascendancy 2 |
|---|---|---|---|
| Brute | Strength | **Titan** (Defense/Regen) | **Bloodrager** (Offense/Life Spend) |
| Stalker | Dexterity | **Shadowblade** (Crit/Poison) | **Marksman** (Speed/Hits) |
| Acolyte | Intelligence | **Archmage** (Raw Spell Damage) | **Spellbinder** (Shield/Wards) |

### Crafting Currencies (Orbs)
| PoE-like Function | Proposed Original Name |
|---|---|
| Transmute | **Orb of Awakening** |
| Alteration | **Orb of Mutation** |
| Regal | **Orb of Sovereignty** |
| Alchemy | **Orb of Genesis** |
| Chaos | **Orb of Entropy** |
| Exalt | **Orb of Triumph** |
| Annul | **Orb of the Void** |
| Scour | **Orb of Cleansing** |
| Regret | **Orb of Penance** |

### Unique Items (v1 — 6 total)
1. Doombringer’s Edge
2. Veil of the Night
3. Stormcaller’s Stride
4. Heart of Flame
5. Crown of the Fallen
6. Void Gaze

### Campaign Zones (8 Acts)
1. The Shattered Coast
2. Desolate Wastes
3. Ruined Bastion
4. Crimson Swamps
5. Frostbound Peaks
6. Cursed Catacombs
7. Halls of Judgment
8. Elysian Threshold

### Trial Placement (with 8 acts)
- **Trial of the Forge** — Act 3 (level ~30): unlocks first ascendancy choice
- **Trial of the Void** — Act 6 (level ~60): unlocks second ascendancy choice
- Two additional endgame Crucible trials (in maps) unlock the remaining ascendancy passives

---

## 5. Simplifications Retained / Rejected

| Proposal | Status |
|---|---|
| Single "Elemental Resistance" stat | **Rejected** — keep Fire/Cold/Lightning separate |
| Rift Hazard Level instead of rolled affixes | **Rejected** — keep full map affix rolling |
| ES recharges after 4s without hit | **Accepted simplification** — passive flat regen per tick |
| Reduce to 1 ascendancy per class | **Rejected** — keep 2 per class |

---

## 6. Third-Party Integrations / Services

### Required for MVP
_None — the spec is explicitly client-side only._

### Optional Future Integrations
| Service Category | Options | Why Optional |
|---|---|---|
| Cloud saves | Supabase, Firebase | Solve localStorage wipe / cross-device sync |
| Analytics | PostHog, Google Analytics | Track progression drop-offs |
| Monetization | Ko-fi, Stripe, Patreon | Player support without affecting gameplay |

**Decision:** No integrations for v1.

---

## 7. Revised Milestone Breakdown

| Milestone | Scope |
|---|---|
| **M1** | Scaffold project. Brute class only. Tick loop (10/sec). Damage/XP/level formulas. One zone. Auto-fighting. Save/load hooks. |
| **M2** | Item slots, rarities, affix pools with tiers, drops, equipment affecting stats, all 9 orbs, crafting UI. |
| **M3** | Passive tree with **80 nodes**, interactive Konva render, allocation/respec, all **3 classes + 2 ascendancies each**. |
| **M4** | **8-act** campaign config, act bosses, **2 Trials** (Acts 3 and 6), **6 ascendancies** unlocked progressively. |
| **M5** | Nexus endgame (Rift Crystals with **full affix rolling**), pinnacle boss, **6 uniques**, offline progress loading overlay, tooltips, number formatting, auto-sell filters. |

---

## 8. Engineering Requirements

- All content lives in `src/data/` as JSON/TS data files.
- Combat must be deterministic pure functions of `(state, ticks)`.
- Save schema must be versioned with migration stub.
- Autosave must use temp-key + verify + swap pattern.
- `npm run dev` and `npm run build` must work out of the box.
- Include `BALANCE.md` and `src/data/balance.ts` for tuning constants.
- No environment variables.
- Offline progress computed in 1-hour chunks behind a loading overlay.

---

## 9. M2 Deviations & Notes

M2 is functionally complete. The following are intentional deviations from the full spec to keep scope manageable:

| Spec Item | Implemented | Deviation / Note |
|---|---|---|
| 6 affixes per rare (3 prefix / 3 suffix) | 4 affixes on rare genesis/entropy rolls | v1 keeps rare rolls to 4 affixes to limit complexity; exalt/triumph can still add more |
| Full affix pool | 7 prefixes, 7 suffixes | Smaller initial pool covering damage, life, ES, armour, attributes, resistances, attack speed, crit |
| Currency drops | Only common orbs drop from monsters | `awakening`, `mutation`, `cleansing` can drop; rarer orbs reserved for bosses/M5 |
| Unique items | Not yet | Uniques are an M5 deliverable |
| Crafting UI animations | Basic apply only | No special result animation in v1 |
| Auto-sell filters | Normal + Magic toggle only | Filter by character level threshold exists but UI threshold input not exposed |
| Two ring slots | `ring1` / `ring2` in equipment | UI handles ring assignment automatically |
| Item tooltip | Stats + affixes shown | All base and most affix-derived stats are now displayed |

### M2 Expanded Affix Pool (34 total)

**Prefixes (17):** Brutal, Sharpened, Vital, Arcane, Reinforced, Mighty, Scholar's, Charged, Frostbound, Serrated, Voltaic, Oppressing, Precise, Swift, Hardened, Robust, Ruthless

**Suffixes (17):** of the Gale, of Piercing, of Devastation, of the Forge, of the North, of the Storm, of the Wind, of Sparks, of Ice, of Bleeding, of Shocks, of Despair, of the Hawk, of the Ghost, of the Mountain, of the Titan, of Riches

## 10. Open Questions Remaining

1. Should I proceed to **M3: Passive Tree** next?
2. Any adjustments to M2 balance (drop rate, affix values, currency supply) before moving on?

---

*Last updated: 2026-07-21*
