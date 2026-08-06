import type { MapAffix } from '../types/game.ts'

export type MapAffixEffect =
  | 'monsterLife'
  | 'monsterDamage'
  | 'monsterAttackRate'
  | 'monsterEvasion'
  | 'extraDropChance'
  | 'riftCrystalChance'

export interface MapAffixDefinition {
  id: string
  displayName: string
  description: string
  effect: MapAffixEffect
  group: string
  weight: number
  tiers: { min: number; max: number }[]
}

/**
 * Stage 2 map modifiers. Values are percentage points: a value of 20 means
 * +20% to the associated stat, while drop/crystal chances are +20 percentage
 * points. Each map can roll at most one affix from a group.
 */
export const MAP_AFFIXES: MapAffixDefinition[] = [
  {
    id: 'fortified',
    displayName: 'Fortified',
    description: 'Monsters have {value}% more Life.',
    effect: 'monsterLife',
    group: 'defense',
    weight: 100,
    tiers: [
      { min: 10, max: 14 },
      { min: 15, max: 20 },
      { min: 21, max: 27 },
      { min: 28, max: 35 },
    ],
  },
  {
    id: 'bloodied',
    displayName: 'Bloodied',
    description: 'Monsters deal {value}% more Damage.',
    effect: 'monsterDamage',
    group: 'offense',
    weight: 100,
    tiers: [
      { min: 8, max: 12 },
      { min: 13, max: 17 },
      { min: 18, max: 24 },
      { min: 25, max: 32 },
    ],
  },
  {
    id: 'quickened',
    displayName: 'Quickened',
    description: 'Monsters have {value}% increased Attack Speed.',
    effect: 'monsterAttackRate',
    group: 'speed',
    weight: 90,
    tiers: [
      { min: 8, max: 12 },
      { min: 13, max: 17 },
      { min: 18, max: 23 },
      { min: 24, max: 30 },
    ],
  },
  {
    id: 'shrouded',
    displayName: 'Shrouded',
    description: 'Monsters have {value}% increased Evasion.',
    effect: 'monsterEvasion',
    group: 'evasion',
    weight: 90,
    tiers: [
      { min: 12, max: 18 },
      { min: 19, max: 26 },
      { min: 27, max: 35 },
      { min: 36, max: 45 },
    ],
  },
  {
    id: 'overflowing',
    displayName: 'Overflowing',
    description: 'Monsters have a {value}% chance to drop an extra item.',
    effect: 'extraDropChance',
    group: 'rewards',
    weight: 80,
    tiers: [
      { min: 8, max: 12 },
      { min: 13, max: 18 },
      { min: 19, max: 25 },
      { min: 26, max: 35 },
    ],
  },
  {
    id: 'resonant',
    displayName: 'Resonant',
    description: 'Rift Crystal drops have {value}% increased chance.',
    effect: 'riftCrystalChance',
    group: 'rewards',
    weight: 60,
    tiers: [
      { min: 10, max: 15 },
      { min: 16, max: 22 },
      { min: 23, max: 30 },
      { min: 31, max: 40 },
    ],
  },
]

export const MAP_AFFIXES_BY_ID: Record<string, MapAffixDefinition> = Object.fromEntries(
  MAP_AFFIXES.map(affix => [affix.id, affix]),
)

export interface MapAffixEffects {
  monsterLifeMultiplier: number
  monsterDamageMultiplier: number
  monsterAttackRateMultiplier: number
  monsterEvasionMultiplier: number
  extraDropChance: number
  riftCrystalChance: number
}

export const EMPTY_MAP_AFFIX_EFFECTS: MapAffixEffects = {
  monsterLifeMultiplier: 1,
  monsterDamageMultiplier: 1,
  monsterAttackRateMultiplier: 1,
  monsterEvasionMultiplier: 1,
  extraDropChance: 0,
  riftCrystalChance: 0,
}

export function mapAffixCountForTier(mapTier: number): number {
  if (mapTier >= 13) return 4
  if (mapTier >= 9) return 3
  if (mapTier >= 5) return 2
  return 1
}

export function mapAffixTierForMapTier(mapTier: number): number {
  return Math.max(1, Math.min(4, Math.ceil(mapTier / 4)))
}

export function rollMapAffixes(mapTier: number, rng: () => number = Math.random): MapAffix[] {
  const count = mapAffixCountForTier(mapTier)
  const affixTier = mapAffixTierForMapTier(mapTier)
  const chosen: MapAffix[] = []
  const usedGroups = new Set<string>()

  for (let index = 0; index < count; index++) {
    const candidates = MAP_AFFIXES.filter(affix => !usedGroups.has(affix.group))
    if (candidates.length === 0) break

    const totalWeight = candidates.reduce((total, affix) => total + affix.weight, 0)
    let roll = Math.max(0, Math.min(0.999999999, rng())) * totalWeight
    let selected = candidates[candidates.length - 1]
    for (const candidate of candidates) {
      roll -= candidate.weight
      if (roll < 0) {
        selected = candidate
        break
      }
    }

    const range = selected.tiers[affixTier - 1] ?? selected.tiers[selected.tiers.length - 1]
    const value = range.min + Math.floor(Math.max(0, Math.min(0.999999999, rng())) * (range.max - range.min + 1))
    chosen.push({ id: selected.id, tier: affixTier, value })
    usedGroups.add(selected.group)
  }

  return chosen
}

export function aggregateMapAffixEffects(affixes: MapAffix[] | undefined): MapAffixEffects {
  const effects: MapAffixEffects = { ...EMPTY_MAP_AFFIX_EFFECTS }
  for (const affix of affixes ?? []) {
    if (!Number.isFinite(affix.value)) continue
    const definition = MAP_AFFIXES_BY_ID[affix.id]
    if (!definition) continue
    const percent = Math.max(0, affix.value) / 100
    switch (definition.effect) {
      case 'monsterLife':
        effects.monsterLifeMultiplier *= 1 + percent
        break
      case 'monsterDamage':
        effects.monsterDamageMultiplier *= 1 + percent
        break
      case 'monsterAttackRate':
        effects.monsterAttackRateMultiplier *= 1 + percent
        break
      case 'monsterEvasion':
        effects.monsterEvasionMultiplier *= 1 + percent
        break
      case 'extraDropChance':
        effects.extraDropChance += percent
        break
      case 'riftCrystalChance':
        effects.riftCrystalChance += percent
        break
    }
  }
  return effects
}

export function mapAffixDescription(affix: MapAffix): string {
  const definition = MAP_AFFIXES_BY_ID[affix.id]
  if (!definition) return `Unknown map modifier (${affix.value}%)`
  return definition.description.replace('{value}', String(affix.value))
}
