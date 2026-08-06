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

let nexusMapIdCounter = 0

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
}

/**
 * Records exactly one cleared pack for the active map. A charge is spent only when
 * the map's required pack count is reached; exhausted maps leave the stash.
 */
export function recordNexusPackClear(nexus: NexusState): NexusPackClearResult {
  if (!nexus.activeMapId) return { nexus, mapCompleted: false }

  const map = nexus.maps.find(candidate => candidate.id === nexus.activeMapId)
  if (!map || map.currentCharges <= 0) {
    return {
      nexus: { ...nexus, activeMapId: null, packsCleared: 0 },
      mapCompleted: false,
    }
  }

  const packsCleared = nexus.packsCleared + 1
  if (packsCleared < nexusMapPacksForTier(map.tier)) {
    return { nexus: { ...nexus, packsCleared }, mapCompleted: false }
  }

  const currentCharges = Math.max(0, map.currentCharges - 1)
  const maps = currentCharges > 0
    ? nexus.maps.map(candidate => candidate.id === map.id ? { ...candidate, currentCharges } : candidate)
    : nexus.maps.filter(candidate => candidate.id !== map.id)

  return {
    nexus: {
      ...nexus,
      maps,
      activeMapId: null,
      packsCleared: 0,
    },
    mapCompleted: true,
  }
}
