import { PASSIVE_TREE } from '../data/passiveTree.ts'
import type { GameState } from '../types/game.ts'

export const SAVE_VERSION = 4
export const SAVE_KEY = 'riftidler_save_v4'

export function serializeSave(state: GameState): string {
  return btoa(JSON.stringify({ ...state, saveVersion: SAVE_VERSION, lastSaveTime: Date.now() }))
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
  }

  // Refund passive points from any old tree data and reset to the class root.
  // Node IDs from prior passive tree versions do not map to the new 80-node graph.
  const oldAllocated = character.allocatedNodes ?? []
  const refundedPoints = Math.max(0, oldAllocated.filter(id => !id.startsWith('root_')).length)
  character.allocatedNodes = [`root_${classId}`]
  character.passivePoints = (character.passivePoints ?? 0) + refundedPoints

  return {
    ...state,
    character,
    passiveTree: PASSIVE_TREE,
    saveVersion: SAVE_VERSION,
  } as Partial<GameState>
}

export function deserializeSave(data: string): GameState | null {
  try {
    const parsed = JSON.parse(atob(data))
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.saveVersion !== SAVE_VERSION) {
      if (parsed.saveVersion < SAVE_VERSION) {
        console.warn(`Migrating save from version ${parsed.saveVersion}`)
        return migrateSave(parsed) as GameState
      }
      return null
    }
    return parsed as GameState
  } catch (e) {
    console.error('Failed to deserialize save', e)
    return null
  }
}

export function saveGame(state: GameState): void {
  try {
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
