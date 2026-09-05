// All tuning constants live here so designers can tweak without touching logic.

export const TICK_RATE = 400 // ms per tick (2.5 ticks/sec)
export const TICKS_PER_SECOND = 2.5
export const OFFLINE_PROGRESS_MAX_HOURS = 8
export const OFFLINE_PROGRESS_CHUNK_HOURS = 1
// Don't show the offline overlay for gaps under this threshold (e.g. quick reloads)
export const OFFLINE_PROGRESS_MIN_SECONDS = 60

export const CHARACTER = {
  MAX_LEVEL: 90,
  BASE_LIFE: 50,
  LIFE_PER_STRENGTH: 2,          // +2 life per point of strength
  ES_PER_INTELLIGENCE: 2,         // +2 energy shield per point of intelligence
  ACCURACY_PER_DEXTERITY: 2,      // +2 accuracy per point of dexterity
  BASE_ACCURACY: 200,
  BASE_EVASION: 50,
  RESPAWN_TIME_SECONDS: 5,
  XP_DEATH_PENALTY: 0.1,
  ATTRIBUTE_BONUS: {
    STR_MELEE_DAMAGE_PERCENT: 0.5, // +0.5% increased melee physical damage per 10 str
    DEX_EVASION_PERCENT: 0.5,      // +0.5% increased evasion per 10 dex
    INT_SPELL_DAMAGE_PERCENT: 0.5, // +0.5% increased spell damage per 10 int
  },
} as const

export const DAMAGE = {
  CRITICAL_CHANCE_CAP: 1.0, // 100%
  DEFAULT_CRIT_MULTIPLIER: 1.5,
  EVASION_CAP: 0.95,
  EVASION_STREAK_BONUS_PER_STACK: 0.10, // +10% flat hit chance per consecutive dodge
  EVASION_STREAK_BONUS_MAX: 0.50,       // capped at +50% flat hit chance
  RESISTANCE_CAP: 0.75,
  ARMOUR_MITIGATION_DENOMINATOR: 5,
} as const

// Defensive base stats should remain valuable without scaling into near-immunity
// when the campaign's front-loaded monster curve reaches its later acts.
export const DEFENSIVE_GEAR_SCALING_EXPONENT = 0.75

export const EXPERIENCE = {
  BASE_XP: 100,
  XP_EXPONENT: 1.6,
  XP_PENALTY_PER_LEVEL_ABOVE: 0.05,
} as const

export const RECOVERY = {
  LIFE_REGEN_PERCENT_PER_SECOND: 0.02, // 2% life per second
  ES_RECHARGE_PERCENT_PER_SECOND: 0.25, // 25% ES per second
  ES_RECHARGE_DELAY_SECONDS: 3,          // 3 seconds before ES recharges
} as const

export const MONSTER = {
  // XP/Gold still use a flat per-level curve (rewards are intentionally front-loaded
  // by zone design rather than by this multiplier).
  XP_MULTIPLIER_PER_LEVEL: 1.05,
  GOLD_MULTIPLIER_PER_LEVEL: 1.05,
} as const

// Front-loaded per-act scaling curve (8 levels per act, as spec'd):
// 1→2: ×3.2, 2→3: ×2.8, 3→4: ×2.4, 4→5: ×2.2, 5→6: ×2.0, 6→7: ×1.9, 7→8: ×1.8
export const ACT_JUMPS = [3.2, 2.8, 2.4, 2.2, 2.0, 1.9, 1.8] as const

export function monsterScalingMultiplier(level: number): number {
  let mult = 1
  let currentLevel = 1
  let actIdx = 0
  while (level > currentLevel) {
    const nextActStart = currentLevel + 8
    const jump = ACT_JUMPS[actIdx] ?? 1.8
    if (level >= nextActStart) {
      mult *= jump
      currentLevel = nextActStart
      actIdx++
    } else {
      mult *= Math.pow(jump, (level - currentLevel) / 8)
      currentLevel = level
    }
  }
  return mult
}

export function experienceForLevel(level: number): number {
  return Math.floor(EXPERIENCE.BASE_XP * Math.pow(level, EXPERIENCE.XP_EXPONENT))
}

export function monsterLife(level: number, base: number): number {
  return Math.floor(base * monsterScalingMultiplier(level))
}

export function monsterDamage(level: number, base: number): number {
  return Math.floor(base * monsterScalingMultiplier(level))
}

export function monsterExperience(level: number, base: number): number {
  return Math.floor(base * Math.pow(MONSTER.XP_MULTIPLIER_PER_LEVEL, level - 1))
}

export function monsterGold(level: number, base: number): number {
  return Math.floor(base * Math.pow(MONSTER.GOLD_MULTIPLIER_PER_LEVEL, level - 1))
}

// Gem leveling: skills and supports level independently up to GEM_LEVEL_MAX.
export const GEMS = {
  MAX_LEVEL: 20,
  // XP required to reach the next level (flat curve).
  XP_PER_LEVEL: 100,
  XP_PER_SKILL_HIT: 10,
  XP_PER_SUPPORT_HIT: 5,
  // Per-level scaling of base values.
  SKILL_DAMAGE_PER_LEVEL: 0.03, // +3% per level
  SUPPORT_MOD_PER_LEVEL: 0.02,  // +2% per level
  BLANK_SUPPORT_DROP_CHANCE: 0.08, // Blank supports are the gateway to support-gem ownership.
  GEM_DROP_CHANCE: 0.08, // Unowned skill/support gems enter inventory and must be claimed.
} as const

// Stage 1 spatial travel tuning. World units are abstract; the renderer maps
// them to screen. Travel beat target: 1.5-3s at baseline (chosen mid-band for
// readability): BASE_TRAVEL_DISTANCE (±20% jitter) / BASE_SPEED = 20/4 to
// 16/4..24/4 ticks → ceil(16/4)=4 to ceil(24/4)=6 ticks = 1.6-2.4s at 2.5 t/s.
export const MOVEMENT = {
  // World units per tick at baseline (no increased movement speed).
  BASE_SPEED: 4,
  // Base distance between pack waypoints, with ±20% randomization.
  BASE_TRAVEL_DISTANCE: 20,
  TRAVEL_DISTANCE_JITTER: 0.2,
  // Hard cap on the TOTAL increased movement speed pool (gear + passives),
  // expressed as a fraction: 1.0 = +100%. Movement speed raises packs/hour
  // directly (a clear-rate stat), so the pool is capped; Momentum/Breakneck
  // action-speed multiplies AFTER the cap (existing action-speed math, not
  // part of the increased pool).
  INCREASED_CAP: 1.0,
} as const

/**
 * Effective movement speed in world units per tick. `character.movementSpeed`
 * holds the total increased pool as a fraction (gear rolls + passive %),
 * capped here at MOVEMENT.INCREASED_CAP. `momentumMult` is the party's
 * Momentum action-speed multiplier (Breakneck feeds it) applied after the cap.
 */
export function effectiveMovementSpeed(character: { movementSpeed: number }, momentumMult = 1): number {
  const increased = Math.min(Math.max(0, character.movementSpeed), MOVEMENT.INCREASED_CAP)
  return MOVEMENT.BASE_SPEED * (1 + increased) * momentumMult
}

// Minion army tuning (minion-system-spec.md §8.1). Stats are
// minionBase × monsterScalingMultiplier(level)^LEVEL_SCALING_EXPONENT (defensive)
// and × monsterScalingMultiplier(level) (offensive flat), mirroring item scaling
// so minions stay relevant without outscaling the player.
export const MINION = {
  // Percent of the player's own stat at the same level (per-def multipliers in src/data/minions.ts)
  LIFE_PERCENT: 0.8,
  ES_PERCENT: 0.5,
  ARMOUR_PERCENT: 0.6,
  EVASION_PERCENT: 0.5,
  ACCURACY_PERCENT: 1.0,
  // Damage share: a full army should add ~20-40% player DPS
  DPS_SHARE_TARGET_MIN: 0.2,
  DPS_SHARE_TARGET_MAX: 0.4,
  // Same defensive curve family as gear (BALANCE.md defensive scaling)
  LEVEL_SCALING_EXPONENT: 0.75,
  // Army cap across all defs (minion spec §8.1)
  MAX_SUMMONS_TOTAL: 4,
} as const

export function gemXpForNextLevel(currentLevel: number): number {
  return GEMS.XP_PER_LEVEL * currentLevel
}

export function supportSlotCountForCompletedActs(completedActs: Iterable<number>): number {
  const acts = new Set(completedActs)
  if (acts.has(8)) return 5
  if (acts.has(6)) return 4
  if (acts.has(3)) return 3
  return 2
}

export function gemLevelProgress(xp: number, level: number): { nextLevelXp: number; currentLevelXp: number; progress: number } {
  const currentLevelXp = level > 1 ? GEMS.XP_PER_LEVEL * (level - 1) : 0
  const nextLevelXp = GEMS.XP_PER_LEVEL * level
  const progress = Math.min(1, Math.max(0, (xp - currentLevelXp) / nextLevelXp))
  return { nextLevelXp, currentLevelXp, progress }
}
