import type { MonsterModifier, MonsterRarity } from '../types/game.ts'
import { monsterScalingMultiplier } from './balance.ts'

// Stage 1 modifier pool. All numbers are base multipliers/additive values for zone level 1.
// Additive values (armourAdd/evasionAdd/accuracyAdd) are scaled by monsterScalingMultiplier
// at spawn time so they remain relevant across the campaign.
export const MONSTER_MODIFIERS: MonsterModifier[] = [
  // --- Defense ---
  {
    id: 'hulking',
    displayName: 'Hulking',
    affixType: 'prefix',
    group: 'life',
    category: 'defense',
    weight: 60,
    minAreaLevel: 1,
    lifeMult: 2.2,
  },
  {
    id: 'bloated',
    displayName: 'Bloated',
    affixType: 'prefix',
    group: 'life',
    category: 'defense',
    weight: 60,
    minAreaLevel: 1,
    lifeMult: 1.6,
  },
  {
    id: 'armoured',
    displayName: 'Armoured',
    affixType: 'prefix',
    group: 'armour',
    category: 'defense',
    weight: 80,
    minAreaLevel: 1,
    armourAdd: 10,
  },
  {
    id: 'evasive',
    displayName: 'Evasive',
    affixType: 'suffix',
    group: 'evasion',
    category: 'defense',
    weight: 80,
    minAreaLevel: 1,
    evasionAdd: 10,
  },
  // --- Offense ---
  {
    id: 'ferocious',
    displayName: 'Ferocious',
    affixType: 'prefix',
    group: 'damage',
    category: 'offense',
    weight: 80,
    minAreaLevel: 3,
    damageMult: 2.5,
  },
  {
    id: 'vicious',
    displayName: 'Vicious',
    affixType: 'prefix',
    group: 'damage',
    category: 'offense',
    weight: 90,
    minAreaLevel: 1,
    damageMult: 1.8,
  },
  {
    id: 'quick',
    displayName: 'Quick',
    affixType: 'suffix',
    group: 'speed',
    category: 'offense',
    weight: 70,
    minAreaLevel: 1,
    attackRateMult: 1.4,
  },
  {
    id: 'frenzied',
    displayName: 'Frenzied',
    affixType: 'suffix',
    group: 'speed',
    category: 'offense',
    weight: 60,
    minAreaLevel: 6,
    attackRateMult: 1.25,
    damageMult: 1.2,
  },
  {
    id: 'deadeye',
    displayName: 'Deadeye',
    affixType: 'suffix',
    group: 'accuracy',
    category: 'offense',
    weight: 50,
    minAreaLevel: 3,
    accuracyAdd: 15,
    damageMult: 1.15,
  },
  {
    id: 'relentless',
    displayName: 'Relentless',
    affixType: 'prefix',
    group: 'brute',
    category: 'offense',
    weight: 55,
    minAreaLevel: 8,
    lifeMult: 1.5,
    damageMult: 1.4,
  },
  // --- Utility (auras etc.) ---
  {
    id: 'warleader_i',
    displayName: 'Warleader',
    affixType: 'prefix',
    group: 'aura',
    category: 'utility',
    weight: 50,
    minAreaLevel: 1,
    aura: { nearbyAlliesDamagePercent: 15 },
  },
  {
    id: 'warleader_ii',
    displayName: 'Mighty Warleader',
    affixType: 'prefix',
    group: 'aura',
    category: 'utility',
    weight: 30,
    minAreaLevel: 8,
    aura: { nearbyAlliesDamagePercent: 20 },
  },
  {
    id: 'warleader_iii',
    displayName: 'Grand Warleader',
    affixType: 'prefix',
    group: 'aura',
    category: 'utility',
    weight: 15,
    minAreaLevel: 15,
    aura: { nearbyAlliesDamagePercent: 25 },
  },
  // --- Hybrid ---
  {
    id: 'resilient',
    displayName: 'Resilient',
    affixType: 'suffix',
    group: 'brute',
    category: 'defense',
    weight: 45,
    minAreaLevel: 1,
    lifeMult: 1.4,
    armourAdd: 8,
  },
  {
    id: 'savage',
    displayName: 'Savage',
    affixType: 'prefix',
    group: 'damage',
    category: 'offense',
    weight: 70,
    minAreaLevel: 3,
    damageMult: 2.0,
    attackRateMult: 0.85,
  },
  {
    id: 'towering',
    displayName: 'Towering',
    affixType: 'prefix',
    group: 'brute',
    category: 'defense',
    weight: 55,
    minAreaLevel: 1,
    lifeMult: 1.8,
    attackRateMult: 0.9,
  },
]

export const MONSTER_MODIFIERS_BY_ID: Record<string, MonsterModifier> = Object.fromEntries(
  MONSTER_MODIFIERS.map(m => [m.id, m])
)

// Rarity spawn probabilities. The zone's eliteChance is split into magic/rare.
export const RARITY_PROBABILITIES: Record<Exclude<MonsterRarity, 'boss'>, number> = {
  normal: 0.81,
  magic: 0.15,
  rare: 0.04,
}

// Flat reward multipliers for Stage 1.
export const REWARD_MULTIPLIERS: Record<MonsterRarity, number> = {
  normal: 1.0,
  magic: 1.5,
  rare: 2.5,
  boss: 1.0,
}

// Magic = 1 mod, rare = 3 mods.
export function modifierCountForRarity(rarity: MonsterRarity): number {
  switch (rarity) {
    case 'magic':
      return 1
    case 'rare':
      return 3
    case 'normal':
    case 'boss':
      return 0
  }
}

// Roll a rarity from the three-way weighted pool. Bosses are never rolled here.
export function rollRarity(zoneLevel: number): Exclude<MonsterRarity, 'boss'> {
  const areaMult = monsterScalingMultiplier(zoneLevel)
  // Slightly bias toward magic/rare at higher area levels: cap at +8% rare weight.
  const extraRareChance = Math.min(0.08, (areaMult - 1) * 0.02)
  const rare = RARITY_PROBABILITIES.rare + extraRareChance
  const magic = RARITY_PROBABILITIES.magic
  const roll = Math.random()
  if (roll < rare) return 'rare'
  if (roll < rare + magic) return 'magic'
  return 'normal'
}

// Roll a weighted modifier from the pool, respecting level gate and group collisions.
export function rollModifier(
  pool: MonsterModifier[],
  areaLevel: number,
  usedGroups: Set<string>,
): MonsterModifier | null {
  const candidates = pool.filter(
    m => m.minAreaLevel <= areaLevel && !usedGroups.has(m.group)
  )
  if (candidates.length === 0) return null
  const total = candidates.reduce((a, m) => a + m.weight, 0)
  let r = Math.random() * total
  for (const mod of candidates) {
    r -= mod.weight
    if (r <= 0) return mod
  }
  return candidates[candidates.length - 1]
}

// Roll the full set of modifiers for a rarity + area level.
export function rollModifiers(
  rarity: MonsterRarity,
  areaLevel: number,
): MonsterModifier[] {
  const count = modifierCountForRarity(rarity)
  if (count === 0) return []
  const chosen: MonsterModifier[] = []
  const usedGroups = new Set<string>()
  for (let i = 0; i < count; i++) {
    const mod = rollModifier(MONSTER_MODIFIERS, areaLevel, usedGroups)
    if (!mod) break
    chosen.push(mod)
    usedGroups.add(mod.group)
  }
  return chosen
}

// Scale additive modifier values to the current area level.
export function scaleModifierValue(base: number, areaLevel: number): number {
  return Math.floor(base * monsterScalingMultiplier(areaLevel))
}
