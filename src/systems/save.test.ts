import { describe, expect, it } from 'bun:test'
import { createInitialState } from '../store/gameStore.ts'
import { deserializeSave, serializeSave, SAVE_VERSION } from './save.ts'

function encode(value: unknown): string {
  return btoa(JSON.stringify(value))
}

describe('save normalization', () => {
  it('rejects malformed and future save payloads instead of loading them', () => {
    expect(deserializeSave(encode('not-a-save-object'))).toBeNull()
    expect(deserializeSave(encode({ saveVersion: SAVE_VERSION + 1 }))).toBeNull()
  })

  it('falls back to an empty Nexus state when a current save omits it', () => {
    const loaded = deserializeSave(encode({ saveVersion: SAVE_VERSION, nexus: undefined })) as unknown as {
      nexus: { maps: unknown[]; activeMapId: string | null; packsCleared: number }
    }

    expect(loaded.nexus).toEqual({ maps: [], activeMapId: null, packsCleared: 0 })
  })

  it('does not persist runtime-only offline fields', () => {
    const state = createInitialState('warlord')
    const serialized = serializeSave({
      ...state,
      offlineSeconds: 3600,
      offlineSummary: {
        seconds: 3600,
        xpGained: 10,
        goldGained: 20,
        kills: 3,
        levelsGained: 1,
        itemsFound: 2,
      },
    })
    const parsed = JSON.parse(atob(serialized)) as Record<string, unknown>

    expect(parsed.saveVersion).toBe(SAVE_VERSION)
    expect(parsed.offlineSeconds).toBeUndefined()
    expect(parsed.offlineSummary).toBeUndefined()
  })

  it('normalizes malformed Nexus data in a current-version save', () => {
    const loaded = deserializeSave(encode({
      saveVersion: SAVE_VERSION,
      nexus: {
        maps: [
          null,
          { id: '', tier: 99 },
          { id: 'map_valid', tier: 2.8, currentCharges: 99, affixes: [
            { id: 'fortified', tier: 2, value: 20 },
            { id: 'unknown', tier: 1, value: 999 },
            { id: 'bloodied', tier: 1, value: 'bad' },
          ] },
        ],
        activeMapId: 'missing-map',
        packsCleared: -4.7,
      },
    })) as unknown as { nexus: {
      maps: Array<{ id: string; tier: number; maxCharges: number; currentCharges: number; affixes: unknown[] }>
      activeMapId: string | null
      packsCleared: number
    } }

    expect(loaded.nexus.maps).toHaveLength(1)
    expect(loaded.nexus.maps[0]).toMatchObject({
      id: 'map_valid',
      tier: 2,
      maxCharges: 2,
      currentCharges: 2,
      affixes: [{ id: 'fortified', tier: 2, value: 20 }],
    })
    expect(loaded.nexus.activeMapId).toBeNull()
    expect(loaded.nexus.packsCleared).toBe(0)
  })
})
