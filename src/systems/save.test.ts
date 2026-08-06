import { describe, expect, it } from 'bun:test'
import { deserializeSave, SAVE_VERSION } from './save.ts'

function encode(value: unknown): string {
  return btoa(JSON.stringify(value))
}

describe('save normalization', () => {
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
