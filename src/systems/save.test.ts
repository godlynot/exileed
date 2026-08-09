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
    const loaded = deserializeSave(encode({
      saveVersion: SAVE_VERSION,
      character: createInitialState('warlord').character,
      nexus: undefined,
    })) as unknown as {
      nexus: { maps: unknown[]; activeMapId: string | null; packsCleared: number; completedTierRewards: number[] }
    }

    expect(loaded.nexus).toEqual({ maps: [], activeMapId: null, packsCleared: 0, completedTierRewards: [] })
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

  it('migrates a legacy Nexus state without milestone tracking', () => {
    const legacy = deserializeSave(encode({
      saveVersion: SAVE_VERSION - 1,
      character: createInitialState('warlord').character,
      nexus: { maps: [], activeMapId: null, packsCleared: 2 },
      currencies: { gold: 10 },
    }))

    expect(legacy?.nexus).toEqual({ maps: [], activeMapId: null, packsCleared: 2, completedTierRewards: [] })
    expect(legacy?.currencies.rift_crystal).toBe(0)
  })

  it('filters invalid gem references and clamps loadout runtime fields in a current save', () => {
    const base = createInitialState('warlord').character
    const loaded = deserializeSave(encode({
      saveVersion: SAVE_VERSION,
      character: {
        ...base,
        supportSlotCount: 99,
        ownedGems: [
          { id: 'strike', level: 99, xp: -10 },
          { id: 'strike', level: 3, xp: 12 },
          { id: 'not_a_gem', level: 4, xp: 10 },
          null,
        ],
        equippedSkills: [
          { skillId: 'strike', supportIds: ['added_physical_damage', 'missing_support', 'added_physical_damage'], cooldownRemaining: -4, hitCounter: 2.8 },
          { skillId: 'missing_skill', supportIds: ['added_physical_damage'], cooldownRemaining: 0, hitCounter: 0 },
          null,
          { skillId: 'slash', supportIds: [], cooldownRemaining: 0, hitCounter: 0 },
          { skillId: 'firebolt', supportIds: [], cooldownRemaining: 0, hitCounter: 0 },
        ],
      },
    }))

    expect(loaded).not.toBeNull()
    expect(loaded?.character.supportSlotCount).toBe(5)
    expect(loaded?.character.ownedGems).toEqual([{ id: 'strike', level: 20, xp: 0 }])
    expect(loaded?.character.equippedSkills).toHaveLength(4)
    expect(loaded?.character.equippedSkills[0]).toMatchObject({
      skillId: 'strike',
      supportIds: ['added_physical_damage'],
      cooldownRemaining: 0,
      hitCounter: 2,
    })
    expect(loaded?.character.equippedSkills[1]?.skillId).toBe('')
  })

  it('normalizes malformed Nexus data in a current-version save', () => {
    const loaded = deserializeSave(encode({
      saveVersion: SAVE_VERSION,
      character: createInitialState('warlord').character,
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
