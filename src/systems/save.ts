import type { GameState } from '../types/game.ts'

export const SAVE_VERSION = 1
export const SAVE_KEY = 'riftidler_save_v1'

export function serializeSave(state: GameState): string {
  return btoa(JSON.stringify({ ...state, saveVersion: SAVE_VERSION, lastSaveTime: Date.now() }))
}

export function deserializeSave(data: string): GameState | null {
  try {
    const parsed = JSON.parse(atob(data))
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.saveVersion !== SAVE_VERSION) {
      // Migration stub: in the future, transform old versions here.
      if (parsed.saveVersion < SAVE_VERSION) {
        console.warn(`Save version ${parsed.saveVersion} may need migration`)
      }
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
    // Write temp, verify, then swap
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
