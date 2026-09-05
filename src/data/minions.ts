import type { DamageType, Resistances } from '../types/game.ts'

/**
 * Minion definitions (minion-system-spec.md §3.1). Base stats are level-1
 * values, scaled by the same curve family as gear/monsters (see
 * minionLevelScaling in src/systems/minions.ts). Values are (tune) per the spec.
 */
export interface MinionDef {
  id: string
  name: string
  description: string
  baseLife: number
  baseEnergyShield: number
  baseArmour: number
  baseEvasion: number
  baseAccuracy: number
  baseResistances: Partial<Resistances>
  // Per-def life multiplier applied on top of the global MINION.LIFE_PERCENT
  // (spec §8.1: sentinel 1.4, wisp 0.4).
  lifeMultiplier?: number
  attack: {
    // A real SKILLS entry; carries tags/band/ailment (minion spec §5).
    skillId: string
    damageEffectiveness: number
    flatMin: number
    flatMax: number
    damageType: DamageType
    attackRate: number // attacks per second
  }
  // How many of this def may exist at once.
  minionCap: number
  summonCooldownSeconds: number
  // v1: only 'melee-attacker' behavior is implemented; guardian/taunt is
  // deferred behind spec decision D2 (§11).
  behavior: 'melee-attacker' | 'ranged-attacker' | 'guardian'
  taunts?: boolean
}

export const MINIONS: Record<string, MinionDef> = {
  bone_sentinel: {
    id: 'bone_sentinel',
    name: 'Bone Sentinel',
    description: 'A towering sentry of stitched bone. Thick, slow, and hard to put down.',
    baseLife: 90,
    baseEnergyShield: 0,
    baseArmour: 60,
    baseEvasion: 20,
    baseAccuracy: 200,
    baseResistances: {},
    lifeMultiplier: 1.4,
    attack: {
      skillId: 'sentinel_smash',
      damageEffectiveness: 1.0,
      flatMin: 1,
      flatMax: 3,
      damageType: 'physical',
      attackRate: 0.5,
    },
    minionCap: 1,
    summonCooldownSeconds: 16,
    behavior: 'guardian',
  },

  plague_wretch: {
    id: 'plague_wretch',
    name: 'Plague Wretch',
    description: 'A shambling mass of rot that bites enemies and leaves festering wounds.',
    baseLife: 60,
    baseEnergyShield: 0,
    baseArmour: 20,
    baseEvasion: 40,
    baseAccuracy: 200,
    baseResistances: { chaos: 0.3 },
    attack: {
      skillId: 'wretch_bite',
      damageEffectiveness: 1.0,
      flatMin: 1,
      flatMax: 2,
      damageType: 'chaos',
      attackRate: 0.8,
    },
    minionCap: 2,
    summonCooldownSeconds: 16,
    behavior: 'melee-attacker',
  },

  rift_wisp: {
    id: 'rift_wisp',
    name: 'Rift Wisp',
    description: 'A fragile mote of rift-light that pelts enemies from afar with searing arcs.',
    baseLife: 35,
    baseEnergyShield: 20,
    baseArmour: 0,
    baseEvasion: 30,
    baseAccuracy: 240,
    baseResistances: { lightning: 0.3 },
    lifeMultiplier: 0.5,
    attack: {
      skillId: 'wisp_bolt',
      damageEffectiveness: 1.0,
      flatMin: 2,
      flatMax: 4,
      damageType: 'lightning',
      attackRate: 0.75,
    },
    minionCap: 3,
    summonCooldownSeconds: 16,
    behavior: 'ranged-attacker',
  },
}
