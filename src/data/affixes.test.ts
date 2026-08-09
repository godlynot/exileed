import { describe, expect, it } from 'bun:test'
import { ALL_AFFIXES } from './affixes.ts'

describe('affix data coverage', () => {
  it('defines chaos resistance for every defensive equipment slot', () => {
    const chaosResistance = ALL_AFFIXES.find(affix => affix.id === 'chaos_resistance')

    expect(chaosResistance).toBeDefined()
    expect(chaosResistance).toMatchObject({
      type: 'suffix',
      stat: 'chaosResistance',
      name: 'of the Void',
    })
    expect(chaosResistance?.allowedSlots).toEqual([
      'helmet',
      'body',
      'gloves',
      'boots',
      'belt',
      'amulet',
      'ring',
      'offhand',
    ])
    expect(chaosResistance?.tiers).toHaveLength(5)
    expect(chaosResistance?.tiers.at(-1)).toEqual({ level: 72, min: 42, max: 56 })
  })
})
