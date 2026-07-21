# Rift Idler — Balance & Tuning Document

This file documents the high-level balance intent. The authoritative source for all tuning constants is `src/data/balance.ts`.

## Core Loop

- **Tick rate:** 100 ms (10 ticks per second).
- **Autosave:** Every 30 seconds and on tab close.
- **Offline progress:** Capped at 8 hours, computed in 1-hour chunks behind a loading overlay.

## Character

- Max level: 90.
- 1 passive point per level + bonus campaign points.
- Base character stats come from `src/data/classes.ts`.
- Derived life: `BASE_LIFE + STRENGTH * 0.5`.
- Derived ES: `BASE_ES + INTELLIGENCE * 0.5`.

## Combat

### Damage

```
DPS = avg_weapon_damage * (1 + increased%) * more_multipliers * attack_rate * crit_adjustment

crit_adjustment = 1 + crit_chance * (crit_multiplier - 1)
```

- Critical chance cap: 75%.
- Default crit multiplier: 1.5x.

### Mitigation

- **Armour mitigation:** `armour / (armour + 5 * damage)`.
- **Evasion chance:** clamped between 5% and 95%.
- **Resistances:** capped at 75%.

### Death

- Character retreats at 0 life.
- Respawn time: 5 seconds.
- XP penalty: 10% toward the next level (never de-levels).

## Monster Scaling

Per-level multipliers (compounding):

- Life: `1.08 ^ (level - 1)`
- Damage: `1.06 ^ (level - 1)`
- XP reward: `1.05 ^ (level - 1)`
- Gold reward: `1.05 ^ (level - 1)`

## Experience

- XP to next level: `100 * level ^ 1.6`.

## Zones

- Campaign: 8 acts in v1.
- Zone kill progress fills until 100%; next zone unlocks.
- Boss zones have a single boss kill requirement.
