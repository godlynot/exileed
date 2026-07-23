# Rift Idler — Balance & Tuning Document

The authoritative source for all tuning constants is `src/data/balance.ts`. This document describes the high-level balance intent and the core formulas used by the game.

## Core Loop

- **Tick rate:** 200 ms (5 ticks per second).
- **Autosave:** Every 30 seconds (random chance per tick).
- **Offline progress:** Constants exist (`OFFLINE_PROGRESS_MAX_HOURS`, `OFFLINE_PROGRESS_CHUNK_HOURS`) but the loading-overlay simulation is not yet wired to `loadGame()`.

## Character Progression

- **Max level:** 90.
- **Passive points:** +1 per level up.
- **Level-up bonus:** +6 max Life, +6 max Energy Shield, and +1% increased damage per level.
- Base attributes, life, energy shield, accuracy, and evasion come from `src/data/classes.ts`.

### Attribute-Derived Bonuses

| Attribute | Bonus per point | Bonus per 10 points |
|---|---|---|
| Strength | +2 Life | +0.5% increased melee physical damage |
| Dexterity | +2 Accuracy | +0.5% increased evasion |
| Intelligence | +2 Energy Shield | +0.5% increased spell damage |

### Pools

```
maxLife = (baseLife + levelBonus + strength * 2 + flatLife) * (1 + increasedMaxLife%)
maxEnergyShield = (baseES + levelBonus + intelligence * 2 + flatES) * (1 + increasedES%)
levelBonus = (level - 1) * 6  // for both Life and ES
```

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

Armour is relatively better against small, frequent hits and worse against large, rare hits.

### Evasion

```
evasionChance = evasion / (evasion + attackerAccuracy)  // capped at 95%
hitchance = 1 - evasionChance
```

### Resistances

- Flat, additive, hard-capped at 75%.
- Zealot’s Creed raises the elemental cap to 85%.
- Negative resistances are possible down to -75%.

## Recovery

- **Life regen:** 2% of max life per second (flat per tick).
- **ES recharge:** 25% of max ES per second after 3 seconds without taking damage.
- Energy Shield absorbs damage before Life.

## Death

- Character retreats at 0 life.
- Respawn time: 5 seconds.
- XP penalty: 10% of the current level’s XP-to-next (never de-levels).

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

## Zones

- The campaign is planned for 8 acts.
- Zone kill progress fills until 100%; the next zone unlocks.
- Boss zones currently require a single kill.

### Campaign Acts (Implemented)

| Act | Name | Levels | Damage Identity | Lesson |
|---|---|---|---|---|
| 1 | The Shattered Coast | 1–8 | Physical / Cold | Introduce mitigation & resists |
| 2 | The Cinder Marches | 9–16 | Fire | Cap fire resistance |
| 3 | Fulgurite Spires | 17–24 | Lightning | Lightning resist + accuracy |

### Monster Scaling in `createMonster`

When a monster template is spawned in a zone, its stats are scaled from the template's natural level to the zone's level using the per-level multipliers above. This lets the same Act 1 trash template reappear in later Act 1 zones while remaining threatening.
