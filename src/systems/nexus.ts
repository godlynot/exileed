import { MONSTERS } from '../data/monsters.ts'
import { ZONES } from '../data/zones.ts'
import { rollMapAffixes } from '../data/mapAffixes.ts'
import type { Monster, NexusMap, NexusState, Zone } from '../types/game.ts'

export const NEXUS_MAX_TIER = 16
export const NEXUS_BASE_LEVEL = 66
export const NEXUS_LEVEL_STEP = 5
export const NEXUS_BASE_PACKS = 3
export const NEXUS_RIFT_CRYSTAL_DROP_CHANCE = 0.1
export const NEXUS_MAP_SUSTAIN_CHANCE = 0.5

// Nexus Stage 4: the Primeval Sovereign — pinnacle boss arena.
export const SOVEREIGN_MONSTER_ID = 'primeval_sovereign'
export const SOVEREIGN_ZONE_ID = 'primeval_sanctum'
export const SOVEREIGN_RIFT_CRYSTAL_REWARD = 25

/**
 * Stage 4: the first T16 map clear grants the Sovereign arena — permanently.
 * Pure helper so the unlock is unit-testable; simulateTick calls this when a
 * map completes and applies the returned nexus + zones.
 */
export function grantSovereignUnlock(
  nexus: NexusState,
  zones: Zone[],
): { nexus: NexusState; zones: Zone[]; unlocked: boolean } {
  if (nexus.sovereignUnlocked) return { nexus, zones, unlocked: false }
  return {
    nexus: { ...nexus, sovereignUnlocked: true },
    zones: zones.map(zone => (zone.id === SOVEREIGN_ZONE_ID ? { ...zone, unlocked: true } : zone)),
    unlocked: true,
  }
}

// Stage 3 milestone rewards: first clear of these high-water tiers grants a
// one-time Rift Crystal bonus. The final tier gets a larger capstone reward.
export const NEXUS_TIER_REWARD_MILESTONES = [
  { tier: 5, amount: 5 },
  { tier: 10, amount: 10 },
  { tier: 15, amount: 15 },
  { tier: 16, amount: 16 },
] as const

let nexusMapIdCounter = 0

export function nexusTierCompletionRewardForTier(tier: number): number {
  const safeTier = clampNexusTier(tier)
  return NEXUS_TIER_REWARD_MILESTONES.find(milestone => milestone.tier === safeTier)?.amount ?? 0
}

export function isNexusZoneId(zoneId: string): boolean {
  return zoneId.startsWith('nexus_map_')
}

export function nexusZoneIdForMap(map: NexusMap): string {
  return `nexus_map_${map.id}`
}

export function clampNexusTier(tier: number): number {
  // Global isNaN coerces, so undefined/malformed values from old saves also
  // resolve to 1 instead of leaking NaN through Math.floor.
  if (isNaN(tier)) return 1
  return Math.max(1, Math.min(NEXUS_MAX_TIER, Math.floor(tier)))
}

/** Stage 1's provisional linear tier curve. */
export function nexusTierLevel(tier: number): number {
  const safeTier = clampNexusTier(tier)
  return NEXUS_BASE_LEVEL + (safeTier - 1) * NEXUS_LEVEL_STEP
}

/** A map starts with one run charge per tier and spends it only after a full clear. */
export function nexusMapChargesForTier(tier: number): number {
  return clampNexusTier(tier)
}

/** Higher tiers take proportionally more packs to fully clear. */
export function nexusMapPacksForTier(tier: number): number {
  return NEXUS_BASE_PACKS + clampNexusTier(tier)
}

/** Rift Crystals are a Stage 1 crafting input, with a provisional linear cost curve. */
export function nexusMapCrystalCost(tier: number): number {
  return clampNexusTier(tier)
}

export function createNexusMap(tier: number): NexusMap {
  const safeTier = clampNexusTier(tier)
  const charges = nexusMapChargesForTier(safeTier)
  return {
    id: `map_${Date.now()}_${nexusMapIdCounter++}`,
    tier: safeTier,
    monsterLevel: nexusTierLevel(safeTier),
    affixes: rollMapAffixes(safeTier),
    maxCharges: charges,
    currentCharges: charges,
    createdAt: Date.now(),
  }
}

/**
 * Stage 1 uses a hybrid pool made from all non-boss campaign monsters.
 * Bosses, named campaign guardians, and trial encounters are not in campaign zone pools.
 */
export const NEXUS_MONSTER_POOL: string[] = [...new Set(
  ZONES.flatMap(zone => zone.monsterIds),
)].filter(monsterId => MONSTERS[monsterId]?.rarity !== 'boss')

export function nexusZoneForMap(map: NexusMap): Zone {
  return {
    id: nexusZoneIdForMap(map),
    name: 'The Nexus',
    act: 9,
    level: map.monsterLevel,
    monsterIds: NEXUS_MONSTER_POOL,
    eliteChance: 0.08,
    killProgress: 0,
    killsRequired: nexusMapPacksForTier(map.tier),
    unlocked: true,
    mapAffixes: map.affixes,
  }
}

/** Act 8's final boss always awards one Rift Crystal. */
export function riftCrystalRewardForBoss(zone: Zone | undefined, monster: Monster): number {
  return zone?.act === 8 && monster.rarity === 'boss' ? 1 : 0
}

export interface NexusPackClearResult {
  nexus: NexusState
  mapCompleted: boolean
  riftCrystalReward: number
  completedTier: number | null
}

/**
 * Records exactly one cleared pack for the active map. A charge is spent only when
 * the map's required pack count is reached; exhausted maps leave the stash.
 */
export function recordNexusPackClear(nexus: NexusState): NexusPackClearResult {
  const completedTierRewards = [...new Set(
    (nexus.completedTierRewards ?? []).filter(tier => Number.isFinite(tier)).map(tier => clampNexusTier(tier))
  )]
  const unchanged = (nextNexus: NexusState, mapCompleted: boolean): NexusPackClearResult => ({
    nexus: nextNexus,
    mapCompleted,
    riftCrystalReward: 0,
    completedTier: null,
  })

  if (!nexus.activeMapId) return unchanged(nexus, false)

  const map = nexus.maps.find(candidate => candidate.id === nexus.activeMapId)
  if (!map || map.currentCharges <= 0) {
    return unchanged({ ...nexus, activeMapId: null, packsCleared: 0, completedTierRewards }, false)
  }

  const packsCleared = nexus.packsCleared + 1
  if (packsCleared < nexusMapPacksForTier(map.tier)) {
    return unchanged({ ...nexus, packsCleared, completedTierRewards }, false)
  }

  const currentCharges = Math.max(0, map.currentCharges - 1)
  const maps = currentCharges > 0
    ? nexus.maps.map(candidate => candidate.id === map.id ? { ...candidate, currentCharges } : candidate)
    : nexus.maps.filter(candidate => candidate.id !== map.id)
  const tierReward = nexusTierCompletionRewardForTier(map.tier)
  const alreadyClaimed = completedTierRewards.includes(map.tier)
  const riftCrystalReward = alreadyClaimed ? 0 : tierReward
  const nextCompletedTierRewards = riftCrystalReward > 0
    ? [...completedTierRewards, map.tier].sort((a, b) => a - b)
    : completedTierRewards

  return {
    nexus: {
      ...nexus,
      maps,
      activeMapId: null,
      packsCleared: 0,
      completedTierRewards: nextCompletedTierRewards,
    },
    mapCompleted: true,
    riftCrystalReward,
    completedTier: riftCrystalReward > 0 ? map.tier : null,
  }
}
