// All tuning constants live here so designers can tweak without touching logic.

export const TICK_RATE = 100 // ms per tick (10 ticks/sec)
export const TICKS_PER_SECOND = 10
export const OFFLINE_PROGRESS_MAX_HOURS = 8
export const OFFLINE_PROGRESS_CHUNK_HOURS = 1

export const CHARACTER = {
  MAX_LEVEL: 90,
  BASE_LIFE: 50,
  LIFE_PER_STRENGTH: 0.5,
  BASE_ENERGY_SHIELD: 0,
  ES_PER_INTELLIGENCE: 0.5,
  BASE_ACCURACY: 100,
  BASE_EVASION: 50,
  RESPAWN_TIME_SECONDS: 5,
  XP_DEATH_PENALTY: 0.1,
  ATTRIBUTE_BONUS: {
    STR_MELEE_DAMAGE_PERCENT: 2, // +2% melee damage per 10 str
    DEX_ATTACK_SPEED_PERCENT: 2,   // +2% attack speed per 10 dex
    INT_SPELL_DAMAGE_PERCENT: 2,   // +2% spell damage per 10 int
  },
} as const

export const DAMAGE = {
  CRITICAL_CHANCE_CAP: 0.75, // 75%
  DEFAULT_CRIT_MULTIPLIER: 1.5,
  EVASION_CAP: 0.75,
  RESISTANCE_CAP: 0.75,
  ARMOUR_MITIGATION_DENOMINATOR: 5,
} as const

export const EXPERIENCE = {
  BASE_XP: 100,
  XP_EXPONENT: 1.6,
  XP_PENALTY_PER_LEVEL_ABOVE: 0.05,
} as const

export const MONSTER = {
  LIFE_MULTIPLIER_PER_LEVEL: 1.08,
  DAMAGE_MULTIPLIER_PER_LEVEL: 1.06,
  XP_MULTIPLIER_PER_LEVEL: 1.05,
  GOLD_MULTIPLIER_PER_LEVEL: 1.05,
} as const

export function experienceForLevel(level: number): number {
  return Math.floor(EXPERIENCE.BASE_XP * Math.pow(level, EXPERIENCE.XP_EXPONENT))
}

export function monsterLife(level: number, base: number): number {
  return Math.floor(base * Math.pow(MONSTER.LIFE_MULTIPLIER_PER_LEVEL, level - 1))
}

export function monsterDamage(level: number, base: number): number {
  return Math.floor(base * Math.pow(MONSTER.DAMAGE_MULTIPLIER_PER_LEVEL, level - 1))
}

export function monsterExperience(level: number, base: number): number {
  return Math.floor(base * Math.pow(MONSTER.XP_MULTIPLIER_PER_LEVEL, level - 1))
}

export function monsterGold(level: number, base: number): number {
  return Math.floor(base * Math.pow(MONSTER.GOLD_MULTIPLIER_PER_LEVEL, level - 1))
}
