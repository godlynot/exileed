# Rift Idler — Balance & Tuning Document

The authoritative source for all tuning constants is `src/data/balance.ts`. This document describes the high-level balance intent and the core formulas used by the game.

## Core Loop

- **Tick rate:** 400 ms (2.5 ticks per second).
- **Autosave:** Every 30 seconds (random chance per tick).
- **Offline progress:** On boot, the loading overlay simulates away-time through the real combat loop, capped at 8 hours and chunked into hourly work before the result is claimed.

## Character Progression

- **Max level:** 90.
- **Passive points:** +1 per level up.
- **Level-up bonus:** +6 max Life, +6 max Energy Shield, and +1% increased damage per level.
- Base attributes, life, energy shield, accuracy, and evasion come from `src/data/classes.ts`.

### Attribute-Derived Bonuses

| Attribute | Bonus per point | Bonus per 10 points |
|---|---|---|---|
| Strength | +2 Life | +0.5% increased melee physical damage |
| Dexterity | +2 Accuracy | +0.5% increased evasion |
| Intelligence | +2 Energy Shield | +0.5% increased spell damage |

### Pools

```
maxLife = (baseLife + levelBonus + strength * 2 + flatLife) * (1 + increasedMaxLife%)
maxEnergyShield = (baseES + levelBonus + intelligence * 2 + flatES) * (1 + increasedES%)
levelBonus = (level - 1) * 6  // for both Life and ES
```

## Itemization

- **Normal items:** 0 affixes.
- **Magic items:** 1–2 affixes.
- **Rare items:** 4–6 affixes.
- Affix generation enforces a maximum of **3 prefixes and 3 suffixes** per item and prevents duplicate affix definitions.
- `Orb of Awakening` and `Orb of Mutation` use the Magic 1–2 range.
- `Orb of Genesis` and `Orb of Entropy` use the Rare 4–6 range.
- `Orb of Sovereignty` fills a Magic item into a valid Rare 4–6 result; `Orb of Triumph` adds one affix while respecting the six-affix and 3/3 prefix/suffix caps.
- `Orb of the Void` can demote a minimum-count item and removes extra affixes only when necessary to skip the intentional 3-affix gap.

### Hand-designed uniques

- The v1 content slice contains six unique equipment bases.
- Unique items have no rolled affixes; their fixed effects are stored as separate implicit mods and are displayed in the item tooltip.
- Named-elite `uniqueChance` rolls draw only from the six unique bases and are never auto-sold by normal/magic filters.
- Drop frequency and power remain a live tuning pass after progression review; no unique is part of starter equipment.

## Damage

### Ordering

1. Sum all flat added damage.
2. Apply the single increased multiplier: `1 + Σ increased%`.
3. Apply each more multiplier separately: `× (1 + more₁) × (1 + more₂) …`.

```
finalDamage = flatDamage * (1 + Σ increased%) * Π (1 + more) * critMultiplier
```

### Critical Strikes

- **Base crit chance:** 5%.
- **Crit chance cap:** 100%.
- **Default crit multiplier:** 1.5x.

## Mitigation

### Armour

```
mitigation = armour / (armour + 5 * incomingHitDamage)
```

Armour is relatively better against small, frequent hits and worse against large, rare hits. Defensive base stats use a `0.75` exponent on the campaign multiplier so armour and evasion remain meaningful without approaching immunity in late acts. High-tier flat defensive affixes are tuned to the same goal. The balance validator applies the repeatable-trash hits-to-die band only to non-boss zones; boss-only zones are endurance encounters and are reviewed through their boss TTK instead.

### Evasion

```
evasionChance = 1 - exp(-evasion / (attackerAccuracy * 0.75))  // capped at 95%
hitchance = 1 - evasionChance
```

Evasion now uses an asymptotic formula so that very high values provide strong but
not automatic avoidance. At `evasion == attackerAccuracy` the chance is ~63%, and
returns diminish as evasion grows, keeping evasion viable alongside armour without
letting it trivialize incoming attacks.

### Resistances

- Flat, additive, hard-capped at 75%.
- Zealot's Creed raises the elemental cap to 85%.
- Negative resistances are possible down to -75%.

## Survivability Bands (hits-to-die)

The balance validator's hits-to-die metric is `(maxLife + maxES) / average incoming hit`
against the highest-average-damage non-boss threat in each zone. There are two explicit
bands, and each gear profile is checked against the band that applies to it:

| Profile | Band | Meaning |
|---|---|---|
| **Baseline** (normal/magic gear, no capped resistance) | **8–20 hits** | Trash pacing target: below 8 is too spiky for an idle game, above 20 the trash is trivial. |
| **Capped/rare** (rare gear, or any profile with a resistance at the 75% cap) | **≤ 45 hits** | The gearing payoff: capping a resistance or stacking armour legitimately multiplies effective health. 45 is the ceiling — above it an encounter has no tension at all. |

The band is two-tier by design, not by accident:

- Several late-campaign threats deal **100% of their damage in a single type**
  (`bloodmire_dredge` is pure physical; `void_touched_scribe` and `toxic_spitter` are
  pure chaos). A single capped layer (75% chaos resistance, or high armour) therefore
  negates the entire hit, pushing capped profiles to roughly 40–45 hits-to-die.
- Raising monster damage to close that gap is not viable: baseline gear already sits at
  6.7–9.8 hits in the sampled late zones, near the 8-hit floor, so higher monster damage
  would push normal gear into the "too spiky" zone.
- The single-type threats are intentional teaching tools (e.g. Cursed Catacombs exists
  to teach chaos resistance). The validator's per-profile bands keep that lesson visible
  without re-flagging the payoff as a mystery.

## Recovery

- **Life regen:** 2% of max life per second (flat per tick).
- **ES recharge:** 25% of max ES per second after 3 seconds without taking damage.
- Energy Shield absorbs damage before Life.

## Death

- Character retreats at 0 life.
- Respawn time: 5 seconds.
- XP penalty: 10% of the current level's XP-to-next (never de-levels).

## Monster Scaling

Per-level multipliers (compounding):

- Life: `1.08 ^ (level - 1)`
- Damage: `1.06 ^ (level - 1)`
- XP reward: `1.05 ^ (level - 1)`
- Gold reward: `1.05 ^ (level - 1)`

## Experience

- XP to next level: `100 * level ^ 1.6`.

## Momentum

Momentum is the Warlord class mechanic (both Vanguard and Marshal ascendancies).

- **Max stacks:** 50
- **Decay:** one stack fades after 3 seconds without a kill
- **Damage bonus:** +1.6% MORE per stack → +80% MORE at 50 stacks (1.8× multiplier)
- **Action speed:** +0.8% per stack → +40% at 50 stacks
- **Life regen (Rallying Presence):** +0.4% of max life per second per stack → +20% at 50 stacks
- **Damage reduction (Rallying Presence):** +0.4% per stack → +20% at 50 stacks

The damage bonus is a **MORE** multiplier, so it multiplies all other damage sources rather than adding to increased-damage bonuses.

## Gem XP & Leveling

- **Max gem level:** 20
- **XP to next level:** `100 * level`
- **XP per skill hit:** 10 (plus 1 XP per 50 damage dealt)
- **XP per support hit:** 5 (plus 1 XP per 100 damage dealt)
- **Skill damage scaling:** +3% more damage per gem level → 1.57× at level 20
- **Support modifier scaling:** +2% per gem level → supports grant ~1.38× their base values at level 20

Gems gain XP on every hit. XP is granted to the skill gem and all linked support gems when the skill lands a hit. Level-up events are emitted to the combat log.

## Support Slot Milestones

Support slot count grows with campaign completion, not trials:

- **Start:** 2 support slots per skill
- **Act 3 complete:** 3 support slots per skill
- **Act 6 complete:** 4 support slots per skill
- **Act 9 complete:** 5 support slots per skill (cap)

## Ascendancy Tuning

### Herald of Gold

Kills while Herald of Gold is active grant bonus item drops:

- **Extra item chance:** +25% for one extra item roll (+50% with Unwavering Declaration)
- **Rarity upgrade bonus:** +5% Rare / +10% Magic find (+10% Rare / +20% Magic with Unwavering Declaration)

These bonuses stack with the existing zone-level drop tables in `src/systems/items.ts`.

### Twin Heralds

- Two auras can be active at once.
- Each aura applies at its normal (non-Unwavering) strength.
- Special effects are disabled for both auras.

## Nexus Stage 3 Milestones

The first completed map at each milestone tier grants a one-time Rift Crystal bonus. Repeat clears of the same tier remain useful for ordinary map sustain but do not repeat the milestone payout.

| Completed tier | First-clear reward |
|---:|---:|
| 5 | +5 Rift Crystals |
| 10 | +10 Rift Crystals |
| 15 | +15 Rift Crystals |
| 16 | +16 Rift Crystals |

Claimed milestone tiers are saved in `NexusState.completedTierRewards` and malformed or legacy saves normalize the list to an empty array.

## Zones

- The campaign is planned for 8 acts.
- Zone kill progress fills until 100%; the next zone unlocks.
- Boss zones currently require a single kill.

### Campaign Acts (Implemented)

| Act | Name | Levels | Damage Identity | Lesson |
|---|---|---|---|---|---|
| 1 | The Shattered Coast | 1–8 | Physical / Cold | Introduce mitigation & resists |
| 2 | The Cinder Marches | 9–16 | Fire | Cap fire resistance |
| 3 | Fulgurite Spires | 17–24 | Lightning | Lightning resist + accuracy |
| 4 | Crimson Swamps | 24–32 | Mixed elemental | Cap all three resists |
| 5 | Cursed Catacombs | 32–40 | Chaos introduced | Chaos resist, ES vs life |
| 6 | Frostbound Peaks | 40–50 | Heavy physical / armour-piercing | Armour + max life scaling |
| 7 | The Rotting Deep | 50–58 | Ailments / DoT | Ailment mitigation, recovery |
| 8 | Halls of Judgment | 58–65 | Everything + high crit | Balanced defense, crit mitigation |

### Defensive Gear Scaling

Armour and evasion base stats use the same campaign curve as monster stats with a defensive exponent of `0.75`. Weapons, life, and energy shield retain their existing scaling. This keeps defensive upgrades relevant while preventing the armour curve from outpacing incoming damage in later acts.

### Monster Scaling in `createMonster`

When a monster template is spawned in a zone, its stats are scaled from the template's natural level to the zone's level using the per-level multipliers above. This lets the same Act 1 trash template reappear in later Act 1 zones while remaining threatening.

The current validator result is intentionally advisory: campaign trash TTK drift is 1.86x, and armour mitigation ranges from 35% to 85% (the drift advisory tracks the armour curve, not a global failure). Hits-to-die is reported per gear profile against its explicit band: baseline profiles range from 6.7–9.8 hits (within the 8–20 band except a handful of act 4–5 entry zones sitting 0.1–1.3 hits under the floor), while capped/rare profiles reach roughly 22–45 hits — inside their ≤ 45 ceiling, with Fungal Caverns at 45.5 flagged as the one zone at the ceiling. The defensive profile sensitivity report lists which resistances reach the 75% cap and marks each profile `ok` / `OVER` / `LOW` against its band. Real combat regression fixtures cover the Bloodmire Oracle elemental threat and Shatter Beast physical outlier, verifying that capped resistances and armour reduce incoming damage in the actual tick simulation. These are model warnings, not automatic balance failures; verify them against live combat before changing global mitigation, resistance, or defensive affix values. The late-game spike tests also include deliberate monster outliers in Frostbound Peaks and Halls of Judgment.
