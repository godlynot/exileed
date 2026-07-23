# Handoff: Skill System (M4.5) + Ascendancy System (M4.5)

Schedule: build AFTER M4 (campaign + trials exist) and BEFORE M5 (endgame). The ascendancy system depends on the skill system (several keystones operate on skills/DOTs), so build skills first, ascendancies second, in the same milestone.

This document is the complete, approved design. Do not redesign mechanics, node counts, gating, or names. Where a number says "(tune)", the mechanic is fixed but the value is yours to balance. Ask before any structural deviation.

Companion files in this handoff:
- `skill-system-spec.md` — the full skill/support system (already written, unchanged)
- `ascendancy-wheels/` — one PNG layout reference per ascendancy
- This file — ascendancy rules, all 72 nodes, implementation notes, balance caps

---

# PART 1: ASCENDANCY SYSTEM RULES

## Structure

- 3 launch classes: **Oracle**, **Warlord**, **Plaguebringer**. Each has **2 ascendancies** (6 total).
- A character picks ONE ascendancy at their first Trial and keeps it (respec of nodes is allowed; changing ascendancy is not, in v1).
- Each ascendancy is a mini-tree of exactly **12 nodes: 5 keystones + 7 smalls**.
- **Points:** trials grant 2 ascendancy points each; the player earns **8 points total** across the game's trials. 8 points cannot buy all 12 nodes — reaching a keystone always costs its gate small(s) + itself, so a player realistically allocates ~2-3 keystones plus supporting smalls. This squeeze is intentional; do not add more points.
- Trials grant ascendancy points ONLY. Support-slot growth comes from campaign milestones (see skill spec), never from trials.

## Gating rules (enforce in data validation)

1. Every keystone must be gated: at least one small node sits strictly between the entry and the keystone on every path. A keystone is never adjacent to the entry node.
2. No keystone is ever adjacent to another keystone.
3. Allocation requires adjacency to an already-allocated node (entry auto-allocates free when the ascendancy is chosen).
4. Refund requires the remaining allocated set to stay connected to the entry (BFS check, same as the main passive tree).
5. Write `validate:ascendancies` (extend the existing validate:tree script) checking: 12 nodes per wheel, 5K+7S split, no orphans, no ungated keystones, no keystone-keystone adjacency, and that every `special:` key has a calculator hook. CI-fail on any violation.

## Smalls vs keystones — content rule

- **Smalls** grant generic stats, but only stats that ascendancy actually wants (a Fateseer small gives crit multiplier, never evasion). Values marked (tune).
- **Keystones** carry the signature mechanics. Every keystone is a `special:` hook requiring explicit implementation in the calculator/combat sim. A keystone whose text implies a mechanic the sim doesn't implement is a shipped lie — the validator must catch unimplemented hooks.

## Choose-an-option keystones (special UI)

Two keystones open a picker when allocated instead of just applying stats:
- **Herald's "Proclaim a Herald"** — choose 1 of 6 auras
- **Marshal's "Bannerman's Resolve"** — choose 1 of 5 armies

The options are NOT separate allocatable nodes and do NOT count toward the 12. Render them as a fan/crown of choices attached to the keystone (see layout PNGs — dashed connectors mean "pick one", solid mean "allocate through"). The chosen option can be re-picked whenever the keystone is refunded and re-allocated.

## Layout identity

Each wheel has a unique layout and palette (see PNGs). These are deliberate, approved geometry — implement positions from the reference images, don't re-derive:

| Ascendancy | Layout | Palette | Keystone shape |
|---|---|---|---|
| Fateseer | radial, 3 branches | indigo + gold | hexagon |
| Herald | crown (aura fan) + banner | indigo + warm gold, aura diamonds in blue | hexagon |
| Contagion | radial, 3 branches | plague purple + bile yellow | octagon |
| Virulent | anatomical body (organs placed as in a torso, spine motif) | toxic green + black | heptagon |
| Vanguard | arrowhead/chevron pointing forward | blood red + iron | triangle |
| Marshal | banner on a pole + army crown below | crimson + bronze | hexagon |

## Interaction with the skill system

- **Hit-counting keystones are PER-SKILL** (each skill instance carries its own counter). Kill/crit-triggered keystones are GLOBAL (a kill is a kill).
- **"DOT" means any damage-over-time from any source**: skill innate ailments, supports, auras (Marshal's War of Attrition), Herald burst DOTs. All DOTs route through one shared tick pipeline so system-level keystones (Plaguewind) apply uniformly.
- **"Pack" and "nearby"** mean the current pack set the combat sim already tracks. There is no positioning; do not build spatial logic.
- **"Allies"** means the party target-set, which currently contains only the player. Write all aura/army buffs as set-wide effects applied to that set, NOT as player-stat mutations, so a future minion system joins the set with zero rework. Do not build minions now.

---

# PART 2: CLASS + ASCENDANCY OVERVIEW

| Class | Attributes | Identity | Ascendancy A | Ascendancy B |
|---|---|---|---|---|
| **Oracle** | Int/Dex | determinism — removes randomness | **Fateseer**: scheduled hits, delayed damage | **Herald**: declared standing auras |
| **Warlord** | Str/Dex | Momentum — kill-velocity snowball | **Vanguard**: offensive snowball, never stops | **Marshal**: defensive Momentum, holds the line |
| **Plaguebringer** | Dex/Int | damage over time | **Virulent**: single-target organ-rot boss-killer | **Contagion**: pack-spreading plague |

**Warlord base mechanic (both ascendancies):** each kill grants a stack of Momentum (+attack speed, +damage per stack, values tune). Stacks decay a few seconds after the last kill. Implement Momentum in the base class so both ascendancies modify one shared system.

**Plaguebringer base mechanic:** hits apply stacking ailments (DOTs) whose magnitude/duration scale with the character's DOT stats. Both ascendancies modify this shared ailment engine.

**Oracle base mechanic:** none shared — Fateseer and Herald are independent; Oracle's class identity lives in its tree position and starting stats.
# PART 3: THE SIX WHEELS — ALL 72 NODES

Effects marked (tune) have approved mechanics with placeholder values. Smalls list their stat category; exact numbers are yours within the stated intent.

---

## ORACLE — FATESEER (radial, indigo/gold, hexagons)
*Fantasy: combat on rails. No RNG. Random crit chance is replaced by scheduled crits.*

### Keystones (5)
| Node | Effect | Implementation |
|---|---|---|
| **Measured Strikes** | Every 3rd hit of each skill deals double damage | per-skill hit counter; on 3rd, damage ×2, reset counter |
| **Crescendo** | Every 4th hit of each skill is a guaranteed critical strike. Your random crit chance is set to 0 (this is your only crit source) | per-skill counter; forced crit on 4th; globally zero critChance while allocated |
| **Foreseen Doom** | 40% of incoming damage is recorded and dealt to you evenly over the next 3s; this delayed portion cannot drop you below 1 life | maintain a pending-damage queue drained per tick; clamp delayed ticks at life=1 |
| **Inevitability** | Killing an enemy cancels a portion (tune, ~25%) of your pending delayed damage | on monsterDied event, reduce pending queue |
| **Perfect Calculation** | Your hits always deal their maximum damage (no damage range roll) | skip min-max roll; use max |

### Smalls (7)
Clockwork (entry). Tempo (+attack speed — advances cadence faster). Sharpened Fate (+crit multiplier). Foresight (enables 40% delay — NOTE: this small carries the base delayed-damage mechanic; Foreseen Doom upgrades it with the can't-kill clamp). Premonition (+recovery/smoothing of delayed ticks). Precision (+crit multiplier). Converging Lines (grants a bonus scaling with number of keystones allocated, tune).

### Notes
- Crescendo makes crit multiplier the entire offensive scaling stat and crit chance worthless for this build — intended.
- Foreseen Doom must NOT be immortality: the immediate 60% of any hit can still kill, and pending damage overwhelms recovery if you stop killing. It smooths spikes; it does not remove death.

---

## ORACLE — HERALD (crown+banner, indigo/warm gold, hexagons; aura choices are blue diamonds)
*Fantasy: determinism as proclamation — declare a standing truth (aura) and it persists. Auras buff the party set ("you and your allies"), currently just the player.*

### Keystones (5)
| Node | Effect | Implementation |
|---|---|---|
| **Proclaim a Herald** | CHOICE KEYSTONE: pick 1 of 6 auras (below). One active at a time; re-pick on refund+reallocate | picker UI; store chosen aura id |
| **Unwavering Declaration** | Your active Herald is significantly stronger (tune, ~+50% effect) AND unlocks its unique special (table below). You cannot switch Heralds without a full ascendancy respec | flag: locked=true; apply special |
| **Twin Heralds** | Proclaim two Heralds at once; each at reduced effect (tune, ~60%). No specials | two aura ids; multiply effects; specials disabled |
| **Resonant Truth** | A portion (tune) of damage you deal returns as energy shield while a Herald is active | on hitLanded, grant ES |
| **Foretold End** | While a Herald is active, your first hit against each enemy is empowered (tune, ~+40%) | per-target first-hit flag |

Unwavering and Twin Heralds are mutually exclusive by design intent (one locks a single stronger Herald, the other splits) — enforce mutual exclusivity in allocation.

### The 6 Heralds (base effect / Unwavering special)
| Herald | Base | Unwavering special |
|---|---|---|
| **Light** | increased damage + hits can blind (enemy accuracy down) | blinded enemies cannot crit you and take further increased damage from you |
| **Gold** | increased gold, item quantity, rarity from kills | rare/unique kills have a chance to drop an extra currency item |
| **Tide** | your damage ramps while the Herald is active and you are untouched; fully resets when hit | being hit halves the ramp instead of resetting it |
| **Silence** | enemies deal reduced damage; ailments/debuffs on you are weakened | enemies near you are periodically silenced (cannot use special attacks) and their attack rate is slowed |
| **Storms** | every few seconds a bolt automatically strikes a random enemy in the pack (lightning) | bolts ALSO fire whenever you land a killing blow, not just on the timer |
| **Judgment** | enemies below a health threshold (tune, ~20%) take increased damage from you | executing an enemy detonates it, dealing a portion of its remaining damage-dealt-so-far as pack splash (do NOT use % max HP — base the detonation on your own damage stats, tune) |

### Smalls (7)
Devotion, Fervor (aura effect magnitude). Standard (buff duration/refresh). Conviction (ES). Division (elemental damage). Communion, Litany (aura magnitude / chaos damage). All "while a Herald is active" flavored.

### Notes
- Auras are set-wide effects on the party set (currently [player]) — never player-stat mutations.
- Storms+Judgment synergy under Unwavering is intentional (detonation kills → bolts) but only reachable single-Herald; Twin Heralds disables specials so the combo can't double-dip.

---

## PLAGUEBRINGER — CONTAGION (radial, plague purple/bile, octagons)
*Fantasy: the pack-spreader. One infection becomes everyone's problem.*

### Keystones (5)
| Node | Effect | Implementation |
|---|---|---|
| **Plaguewind** | When an afflicted enemy dies, ALL damage-over-time effects on it (any source) spread to the rest of its pack | on monsterDied, copy the DOT list to pack members |
| **Pandemic** | Your ailments also spread on application: each hit can seed a weaker (tune, ~50%) ailment onto other pack members | on ailment application, roll seed to pack |
| **Plague Chorus** | The more enemies in the pack are afflicted, the faster ALL their ailments tick (tune, ~+8%/afflicted) | per-tick multiplier = f(afflicted count) |
| **Patient Zero** | The first enemy you afflict in each pack becomes a super-spreader: its ailments are stronger and spread to more targets | flag first afflicted per pack |
| **Malignant** | Afflicted enemies take increased damage from ALL sources (tune, ~15%) | damage-taken multiplier while afflicted |

### Smalls (7)
Seedborne (entry). Carrier (+ailment duration). Withering Reach (+spread targets). Sympathetic Decay (+ailment magnitude). Shared Rot (+duration when multiple afflicted). Creeping Virulence (+application speed). Hivemind (bonus scaling with % of pack afflicted, tune).

---

## PLAGUEBRINGER — VIRULENT (anatomical body, toxic green, heptagons)
*Fantasy: the single-target boss-killer. Five organ keystones placed anatomically: blood upper chest, heart center, lungs left flank, liver right side, marrow at spine base. No % max HP mechanics anywhere.*

### Keystones (5)
| Organ | Node | Effect | Implementation |
|---|---|---|---|
| Blood | **Septicemia** | Applying an ailment stack causes existing stacks on that target to tick faster (compounding, tune per-stack %) | per-target tick-rate multiplier that grows on application |
| Heart | **Cardiac Arrest** | At a stack threshold (tune), ailments flare: burst of accumulated damage, consuming half the stacks; target cannot heal/regen for a few seconds | threshold check per tick; sawtooth is the balance valve — the flare MUST consume stacks |
| Lungs | **Asphyxiation** | Afflicted enemies' attack/action speed slows the longer ailments persist on them (tune, floor-capped) | per-target slow scaling with ailment age |
| Liver | **Cirrhosis** | The target cannot cleanse or reduce your ailments; healing it receives is reversed into damage for a few seconds after you hit it | cleanse-immunity flag; heal-inversion window on hit |
| Marrow | **Calcify** | Each time your DOT damage on a target crosses a damage threshold (tune), a bone spike erupts: FULL damage to the target itself, REDUCED splash (tune, ~40%) to nearby pack | per-target DOT-damage accumulator; on threshold, burst + reset accumulator |

### Smalls (7)
Infest (entry). Sepsis, Palpitation, Wheeze, Bile, Ossify (gates: ailment magnitude, duration, DOT damage). Miasma (connective: +magnitude per existing stack on target).

### Notes
- Calcify's self-damage is the point; the splash is seasoning. If splash makes Virulent a pack-clearer in testing, cut the splash %, not the self-hit.
- Septicemia's compounding needs a rate cap so a long boss fight can't runaway — Cardiac Arrest's stack consumption is the designed valve; verify the two together produce a sawtooth, not an exponential.

---

## WARLORD — VANGUARD (arrowhead, red/iron, triangles)
*Fantasy: the steamroller. Build Momentum and never lose it; carry max stacks into the boss.*

### Keystones (5)
| Node | Effect | Implementation |
|---|---|---|
| **Relentless Advance** | Momentum no longer decays while in combat; it resets only when a fight fully ends | decay paused while combat active |
| **Overrun** | At maximum Momentum, a portion (tune, ~20%) of your damage becomes an unavoidable flat hit that ignores armour and cannot be evaded | split damage at max stacks; cap the flat portion relative to your stats |
| **Breakneck** | Each Momentum stack grants movement/action speed; while you keep killing, each stack slightly raises the stack cap itself (hard limit, tune ~+50% over base cap) | dynamic cap with absolute ceiling |
| **War Machine** | Momentum's damage-per-stack is significantly increased, but the maximum stack count is lowered | fewer/stronger stacks |
| **Blitz** | While at maximum Momentum, every kill echoes: a portion of the killing blow is dealt to the rest of the pack | on monsterDied at max stacks, splash |

**Breakneck and War Machine are MUTUALLY EXCLUSIVE** (one raises the cap, one lowers it — allocating both is contradictory). Enforce in allocation; grey the other out with a tooltip explaining why.

### Smalls (7)
Advance (entry). Charge, Fury, Momentum, Press, Rout, Drive — attack speed, on-kill damage, Momentum stack duration, flat damage. All feed the snowball.

---

## WARLORD — MARSHAL (banner+army crown, crimson/bronze, hexagons; armies are red pennant triangles)
*Fantasy: Momentum as defense. Hold the line, outlast, and let your durability kill them.*

### Keystones (5)
| Node | Effect | Implementation |
|---|---|---|
| **Rallying Presence** | Each Momentum stack grants life regeneration and a small amount of damage reduction (tune; cap total DR) | per-stack defensive bonuses, capped |
| **Hold the Line** | **12%** of your armour also acts as flat damage resistance (every hit reduced by that flat amount) | flat reduction = 0.12 × armour, applied after armour mitigation |
| **Bannerman's Resolve** | CHOICE KEYSTONE: pick 1 of 5 armies (below). Optional — the wheel must remain fully viable without it | picker UI; store army id |
| **Bulwark's Wrath** | 10% of damage taken is added as flat physical damage to your hits for the next 3-5 seconds (rolling window, refreshes on being hit) | rolling buffer of recent damage taken; add 10% as flat phys |
| **War of Attrition** | Aura: every second, applies a DOT to nearby enemies dealing flat damage equal to **5% of your maximum life**, base duration **3 seconds**. Stacks overlap (≈3 concurrent at steady state ≈ 15%/sec sustained — INTENDED). Scales with increased-damage-over-time and general damage modifiers | aura tick applies a DOT instance through the shared DOT pipeline; the 5% coefficient is the tuning lever if clear proves too strong — never change the mechanic |

### The 5 Armies (Bannerman's Resolve)
| Army | Effect (applies to the party set) |
|---|---|
| **Iron Legion** | bonus armour and flat damage resistance — the pure-defense army |
| **Skirmishers** | bonus attack/move speed and evasion; Momentum builds faster — the tempo army |
| **Zealots** | bonus damage scaling with current Momentum stacks — the offense army |
| **Wardens** | a portion of your Momentum's defensive bonuses applies to the whole party set (near-no-op solo; scales when minions exist) — the support army |
| **Reapers** | enemies near you are slowly worn down: reduced healing and a minor DOT — the attrition army |

### Smalls (7)
Rally (entry). Standard, Shieldwall, Vengeance, Endure, Muster, Colors — life, armour, Momentum duration, damage reduction, plus flat damage and damage-per-stack so the offense keystones have support.

### Notes
- Marshal's War of Attrition DOT routes through the SAME DOT pipeline as ailments so Plaguewind-style system rules and DOT scaling behave consistently.
- Design intent for enemy HP scale: late-stage rare mobs ~100k HP. The aura is meant to be a meaningful supplement at that scale, not the primary killer.
# PART 4: IMPLEMENTATION ORDER & DELIVERABLES

## Build order within M4.5

1. **Skill system first** (per `skill-system-spec.md`): skills, supports, tag compatibility, gem leveling, the Skills panel, support-slot growth at campaign milestones (2 base → 3 at Act 3 → 4 at Act 6 → 5 at Act 9). The shared DOT pipeline gets built here — every DOT from any source (skill ailment, support, aura) is an instance in one system.
2. **Warlord Momentum base mechanic** in the class layer (both ascendancies modify it).
3. **Ascendancy data files**: one file per wheel under `src/data/ascendancies/`, same schema as the main passive tree plus `special:` keys and the choice-keystone option lists. Positions from the reference PNGs.
4. **Keystone hooks** in `src/systems/ascendancies.ts` — all 30 keystones (5 × 6) plus the 6 Herald auras (base + special each) and 5 Marshal armies. Every `special:` key must have an implementation; the validator fails otherwise.
5. **Trial integration**: first trial (Act 3) → choose ascendancy + 2 points; each subsequent trial → 2 points; 8 total.
6. **Wheel UI**: renders each ascendancy's unique layout (positions/palette/keystone shape per wheel from the PNGs), allocation with gating + connectivity-refund (reuse the main tree's logic), the choice-keystone picker for Proclaim a Herald and Bannerman's Resolve, and hover tooltips showing full effect text (for choice keystones: the currently-chosen option plus a "change" affordance).
7. **validate:ascendancies** — extend validate:tree: per-wheel 12-node/5K+7S counts, gating rules, orphans, unimplemented `special:` keys, and the two mutual-exclusivity pairs (Unwavering↔Twin Heralds, Breakneck↔War Machine).

## Save schema

Add: `ascendancy` (id or null), `ascendancyPoints` (earned, spent), `allocatedAscendancyNodes` (string[]), `heraldChoice` (aura id or null), `twinHeraldChoices` ([id,id] or null), `armyChoice` (army id or null). Version + migrate.

## Events

Ascendancy mechanics consume the M4 combat events (monsterDied, hitLanded, etc.). New events to emit: `ailmentApplied`, `ailmentExpired`, `dotTick` (source-tagged), `momentumChanged`, `auraApplied` — needed by keystone hooks and by any future combat view.

## Balance caps (non-negotiable mechanics, tunable values)

| Mechanic | Cap / valve |
|---|---|
| Virulent Septicemia compounding | Cardiac Arrest's flare CONSUMES half the stacks — verify sawtooth, never exponential |
| Calcify splash | reduced % to pack; if Virulent starts pack-clearing, cut splash not self-hit |
| War of Attrition aura | the 5%-of-max-life coefficient is the lever; mechanic (per-second application, 3s duration, overlapping) never changes |
| Overrun flat hit | capped relative to the character's own damage stats |
| Breakneck rising cap | hard absolute ceiling (~+50% over base cap) |
| Foreseen Doom | delayed portion can't kill, but the immediate 60% can — never full immortality |
| Rallying Presence DR | total damage reduction from stacks is capped |
| Judgment detonation | scales off your damage stats, NEVER % of enemy max HP |

## Explicit non-goals (do not build)

- No minion/ally system — auras/armies apply to the party set of [player]; the set abstraction is the only future-proofing required.
- No gear sockets/links (skill spec §10).
- No ascendancy switching post-choice.
- No spatial/positioning logic — "pack" and "nearby" are the existing pack set.
- No additional ascendancy points beyond 8.

## Handoff checklist (what you deliver back)

1. `validate:ascendancies` output pasted, clean.
2. One screenshot per wheel at default zoom with a few nodes allocated (show gating: an unreachable keystone visibly locked).
3. Screenshot of the Herald picker open and the Marshal army picker open.
4. A character sheet screenshot showing an active Herald aura's effect applied.
5. List of every deviation from this document and why.
