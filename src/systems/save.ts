import { PASSIVE_TREE } from '../data/passiveTree.ts'
import type { GameState, MapAffix, NexusMap } from '../types/game.ts'
import { MAP_AFFIXES_BY_ID } from '../data/mapAffixes.ts'
import { SKILLS } from '../data/skills.ts'
import { SUPPORTS } from '../data/supports.ts'
import { clampNexusTier, nexusMapChargesForTier, nexusTierLevel } from './nexus.ts'

export const SAVE_VERSION = 5
export const SAVE_KEY = 'riftidler_save_v4'

const MAX_SKILL_SLOTS = 4
const MAX_SUPPORT_SLOTS = 5

function normalizeGemProgress(value: unknown): GameState['character']['ownedGems'] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  return value.flatMap(candidate => {
    if (!candidate || typeof candidate !== 'object') return []
    const gem = candidate as { id?: unknown; level?: unknown; xp?: unknown }
    if (typeof gem.id !== 'string' || (!SKILLS[gem.id] && !SUPPORTS[gem.id]) || seen.has(gem.id)) return []
    seen.add(gem.id)
    const level = typeof gem.level === 'number' && Number.isFinite(gem.level)
      ? Math.max(1, Math.min(20, Math.floor(gem.level)))
      : 1
    const xp = typeof gem.xp === 'number' && Number.isFinite(gem.xp)
      ? Math.max(0, Math.floor(gem.xp))
      : 0
    return [{ id: gem.id, level, xp }]
  })
}

function normalizeEquippedSkills(value: unknown, supportSlotCount: number): GameState['character']['equippedSkills'] {
  if (!Array.isArray(value)) return []

  return value.slice(0, MAX_SKILL_SLOTS).map(candidate => {
    if (!candidate || typeof candidate !== 'object') {
      return { skillId: '', supportIds: [], cooldownRemaining: 0, hitCounter: 0 }
    }
    const equipped = candidate as { skillId?: unknown; supportIds?: unknown; cooldownRemaining?: unknown; hitCounter?: unknown }
    const skillId = typeof equipped.skillId === 'string' && SKILLS[equipped.skillId] ? equipped.skillId : ''
    const supportIds = Array.isArray(equipped.supportIds)
      ? equipped.supportIds.slice(0, supportSlotCount).filter((supportId, index, ids): supportId is string =>
          typeof supportId === 'string' &&
          !!SUPPORTS[supportId] &&
          ids.indexOf(supportId) === index &&
          !!skillId &&
          SUPPORTS[supportId].allowedTags.some(tag => SKILLS[skillId].tags.includes(tag)),
        )
      : []
    const cooldownRemaining = typeof equipped.cooldownRemaining === 'number' && Number.isFinite(equipped.cooldownRemaining)
      ? Math.max(0, Math.floor(equipped.cooldownRemaining))
      : 0
    const hitCounter = typeof equipped.hitCounter === 'number' && Number.isFinite(equipped.hitCounter)
      ? Math.max(0, Math.floor(equipped.hitCounter))
      : 0
    return { skillId, supportIds, cooldownRemaining, hitCounter }
  })
}

function normalizeCharacterData(value: unknown): GameState['character'] | null {
  if (!value || typeof value !== 'object') return null
  const character = value as GameState['character']
  const supportSlotCount = typeof character.supportSlotCount === 'number' && Number.isFinite(character.supportSlotCount)
    ? Math.max(2, Math.min(MAX_SUPPORT_SLOTS, Math.floor(character.supportSlotCount)))
    : 2
  return {
    ...character,
    supportSlotCount,
    ownedGems: normalizeGemProgress(character.ownedGems),
    equippedSkills: normalizeEquippedSkills(character.equippedSkills, supportSlotCount),
    keystoneChoices: character.keystoneChoices && typeof character.keystoneChoices === 'object'
      ? character.keystoneChoices
      : {},
  }
}

function normalizeNexusState(value: unknown): GameState['nexus'] {
  if (!value || typeof value !== 'object') {
    return { maps: [], activeMapId: null, packsCleared: 0, completedTierRewards: [] }
  }

  const raw = value as { maps?: unknown; activeMapId?: unknown; packsCleared?: unknown; completedTierRewards?: unknown }
  const maps: NexusMap[] = Array.isArray(raw.maps)
    ? raw.maps.flatMap(candidate => {
        if (!candidate || typeof candidate !== 'object') return []
        const map = candidate as Partial<NexusMap>
        if (typeof map.id !== 'string' || map.id.length === 0) return []
        const tier = clampNexusTier(typeof map.tier === 'number' ? map.tier : 1)
        const maxCharges = nexusMapChargesForTier(tier)
        const currentCharges = typeof map.currentCharges === 'number' && Number.isFinite(map.currentCharges)
          ? Math.max(0, Math.min(maxCharges, Math.floor(map.currentCharges)))
          : maxCharges
        const affixes: MapAffix[] = Array.isArray(map.affixes)
          ? map.affixes.flatMap(candidate => {
              if (!candidate || typeof candidate !== 'object') return []
              const rawAffix = candidate as Partial<MapAffix>
              if (typeof rawAffix.id !== 'string' || !MAP_AFFIXES_BY_ID[rawAffix.id]) return []
              if (typeof rawAffix.value !== 'number' || !Number.isFinite(rawAffix.value)) return []
              const tierValue = typeof rawAffix.tier === 'number' && Number.isFinite(rawAffix.tier)
                ? Math.max(1, Math.min(4, Math.floor(rawAffix.tier)))
                : 1
              return [{ id: rawAffix.id, tier: tierValue, value: Math.max(0, Math.floor(rawAffix.value)) }]
            })
          : []
        return [{
          id: map.id,
          tier,
          monsterLevel: typeof map.monsterLevel === 'number' && Number.isFinite(map.monsterLevel)
            ? map.monsterLevel
            : nexusTierLevel(tier),
          affixes,
          maxCharges,
          currentCharges,
          createdAt: typeof map.createdAt === 'number' && Number.isFinite(map.createdAt) ? map.createdAt : 0,
        }]
      })
    : []

  const completedTierRewards = Array.isArray(raw.completedTierRewards)
    ? [...new Set(raw.completedTierRewards.flatMap(tier => typeof tier === 'number' && Number.isFinite(tier) ? [clampNexusTier(tier)] : []))].sort((a, b) => a - b)
    : []

  return {
    maps,
    activeMapId: typeof raw.activeMapId === 'string' && maps.some(map => map.id === raw.activeMapId)
      ? raw.activeMapId
      : null,
    packsCleared: typeof raw.packsCleared === 'number' && Number.isFinite(raw.packsCleared)
      ? Math.max(0, Math.floor(raw.packsCleared))
      : 0,
    completedTierRewards,
  }
}

export function serializeSave(state: GameState): string {
  // Offline progress fields are runtime-only (computed on boot), never persisted.
  const { offlineSeconds: _offlineSeconds, offlineSummary: _offlineSummary, ...persistable } = state
  return btoa(JSON.stringify({ ...persistable, saveVersion: SAVE_VERSION, lastSaveTime: Date.now() }))
}

function migrateSave(parsed: Record<string, unknown>): Partial<GameState> {
  const state = parsed as Partial<GameState>

  if (!state.character) {
    return state
  }

  const classId = state.character.classId ?? 'brute'
  const character = { ...state.character }

  // Ensure fields added by the StatMod / special refactor exist
  if (character.armour === undefined) character.armour = 0
  if (character.special === undefined) character.special = {}

  // M4.5: skills / supports / ascendancy points
  if (character.equippedSkills === undefined) {
    character.equippedSkills = [{ skillId: 'strike', supportIds: [], cooldownRemaining: 0, hitCounter: 0 }]
  }
  if (character.ownedGems === undefined) character.ownedGems = []
  if (character.supportSlotCount === undefined) character.supportSlotCount = 2
  if (character.keystoneChoices === undefined) character.keystoneChoices = {}
  if (character.ascendancyPoints === undefined) {
    // derive from legacy trial flags
    character.ascendancyPoints =
      (character.trial1Completed ? 2 : 0) +
      (character.trial2Completed ? 2 : 0) +
      (character.trial3Completed ? 2 : 0) +
      (character.trial4Completed ? 2 : 0)
  }

  // M4.5: combat state may be missing new fields on old saves
  if (state.combat) {
    const combat = state.combat as unknown as Record<string, unknown>
    if (combat.momentum === undefined) combat.momentum = { stacks: 0, decayTicks: 0, baseCap: 10, capBonus: 0 }
    if (combat.herald === undefined) combat.herald = { active: [], tideRamp: 0, hitTargets: [] }
    if (combat.marshal === undefined) combat.marshal = { army: null, bulwarkFlat: 0, bulwarkTicksRemaining: 0 }
    if (combat.delayedDamageQueue === undefined) combat.delayedDamageQueue = []
    if (combat.ailments === undefined) combat.ailments = {}
    if (combat.virulent === undefined) combat.virulent = { stacks: {}, septicemiaMultiplier: {}, calcifyAccumulator: {}, slow: {}, patientZeroTarget: null }
    if (combat.monsterDebuffs === undefined) combat.monsterDebuffs = {}
    if (combat.plaguewindCarryover === undefined) combat.plaguewindCarryover = []
    // Pack lane / named-elite system: ensure pack arrays exist on old saves
    if (combat.currentPack === undefined) combat.currentPack = []
    if (combat.packSizeRemaining === undefined) combat.packSizeRemaining = 0
    if (combat.packNamedEliteCount === undefined) combat.packNamedEliteCount = 0
  }

  // Nexus: ensure the nexus state and rift_crystal currency exist on old saves.
  if (!state.nexus) {
    state.nexus = { maps: [], activeMapId: null, packsCleared: 0, completedTierRewards: [] }
  }
  if (state.currencies) {
    const currencies = state.currencies as Record<string, unknown>
    if (currencies.rift_crystal === undefined) currencies.rift_crystal = 0
  }

  // Refund passive points from any old tree data and reset to the class root.
  // Node IDs from prior passive tree versions do not map to the new 80-node graph.
  const oldAllocated = character.allocatedNodes ?? []
  const refundedPoints = Math.max(0, oldAllocated.filter(id => !id.startsWith('root_')).length)
  character.allocatedNodes = [`root_${classId}`]
  character.passivePoints = (character.passivePoints ?? 0) + refundedPoints

  const normalizedCharacter = normalizeCharacterData(character)

  return {
    ...state,
    character: normalizedCharacter ?? character,
    nexus: normalizeNexusState(state.nexus),
    passiveTree: PASSIVE_TREE,
    saveVersion: SAVE_VERSION,
    tickCounter: state.tickCounter ?? 0,
  } as Partial<GameState>
}

export function deserializeSave(data: string): GameState | null {
  try {
    const parsed = JSON.parse(atob(data))
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.saveVersion !== SAVE_VERSION) {
      if (parsed.saveVersion < SAVE_VERSION) {
        console.warn(`Migrating save from version ${parsed.saveVersion}`)
        const migrated = migrateSave(parsed)
        const character = normalizeCharacterData(migrated.character)
        if (!character) return null
        return {
          ...migrated,
          character,
          nexus: normalizeNexusState(migrated.nexus),
        } as GameState
      }
      return null
    }
    const character = normalizeCharacterData(parsed.character)
    if (!character) return null
    return {
      ...parsed,
      character,
      nexus: normalizeNexusState(parsed.nexus),
    } as GameState
  } catch (e) {
    console.error('Failed to deserialize save', e)
    return null
  }
}

export function saveGame(state: GameState): void {
  try {
    if (typeof localStorage === 'undefined') return
    const tempKey = `${SAVE_KEY}_temp`
    const serialized = serializeSave(state)
    localStorage.setItem(tempKey, serialized)
    const verify = localStorage.getItem(tempKey)
    if (verify === serialized) {
      localStorage.setItem(SAVE_KEY, serialized)
      localStorage.removeItem(tempKey)
    }
  } catch (e) {
    console.error('Failed to save game', e)
  }
}

export function loadGame(): GameState | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const data = localStorage.getItem(SAVE_KEY)
    if (!data) return null
    return deserializeSave(data)
  } catch (e) {
    console.error('Failed to load game', e)
    return null
  }
}

export function exportSave(state: GameState): string {
  return serializeSave(state)
}

export function importSave(data: string): GameState | null {
  return deserializeSave(data)
}
