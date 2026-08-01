import { describe, it, expect, beforeEach } from 'bun:test'
import { useGameStore } from './gameStore.ts'

describe('game store dev helpers', () => {
  beforeEach(() => {
    // Reset to a fresh initial state before each test
    useGameStore.setState(useGameStore.getState(), true)
    useGameStore.getState().resetGame()
  })

  it('devSpawnTestPack creates a 4-member pack with expected rarities and elite', () => {
    const store = useGameStore.getState()

    store.devSpawnTestPack()

    const pack = useGameStore.getState().combat.currentPack
    expect(pack).toHaveLength(4)

    const [normal, magic, rare, elite] = pack

    expect(normal.monster.rarity).toBe('normal')
    expect(normal.monster.isNamedElite).toBeFalsy()

    expect(magic.monster.rarity).toBe('magic')
    expect(magic.monster.isNamedElite).toBeFalsy()

    expect(rare.monster.rarity).toBe('rare')
    expect(rare.monster.isNamedElite).toBeFalsy()

    expect(elite.monster.rarity).toBe('magic')
    expect(elite.monster.isNamedElite).toBe(true)

    // Combat should point at the first member as the active target
    expect(useGameStore.getState().combat.monster).toBe(pack[0].monster)
    expect(useGameStore.getState().combat.monsterLife).toBe(pack[0].currentLife)
  })
})
