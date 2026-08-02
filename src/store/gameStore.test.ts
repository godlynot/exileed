import { describe, it, expect, beforeEach } from 'bun:test'
import { useGameStore } from './gameStore.ts'
import { loadGame } from '../systems/save.ts'
import { computeOfflineSeconds } from '../systems/offlineProgress.ts'
import { createBlankSupport, createGemItem } from '../systems/items.ts'
import { SKILLS } from '../data/skills.ts'
import { SUPPORTS } from '../data/supports.ts'

// bun's test runtime has no localStorage; provide an in-memory shim so
// saveGame/loadGame actually persist during tests.
const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(),
  },
  configurable: true,
})

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

describe('support acquisition', () => {
  it('converts a blank support into an owned support and persists the result', () => {
    const state = useGameStore.getState()
    const blank = createBlankSupport(5)
    const supportId = Object.keys(SUPPORTS).find(id => !state.character.ownedGems.some(gem => gem.id === id)) ?? Object.keys(SUPPORTS)[0]
    useGameStore.setState({
      ...state,
      inventory: { ...state.inventory, items: [blank] },
    })

    useGameStore.getState().convertBlankSupport(blank.id, supportId)

    const next = useGameStore.getState()
    expect(next.inventory.items).toHaveLength(0)
    expect(next.character.ownedGems.some(gem => gem.id === supportId)).toBe(true)
    expect(loadGame()?.character.ownedGems.some(gem => gem.id === supportId)).toBe(true)
  })

  it('does not consume a blank support when the selected support is already owned', () => {
    const state = useGameStore.getState()
    const blank = createBlankSupport(5)
    const supportId = Object.keys(SUPPORTS)[0]
    useGameStore.setState({
      ...state,
      inventory: { ...state.inventory, items: [blank] },
      character: {
        ...state.character,
        ownedGems: [...state.character.ownedGems, { id: supportId, level: 1, xp: 0 }],
      },
    })

    useGameStore.getState().convertBlankSupport(blank.id, supportId)

    const next = useGameStore.getState()
    expect(next.inventory.items).toHaveLength(1)
    expect(next.inventory.items[0].id).toBe(blank.id)
  })

  it('removes a duplicate gem drop without adding duplicate ownership', () => {
    const state = useGameStore.getState()
    const skillId = state.character.ownedGems.find(gem => SKILLS[gem.id])?.id ?? Object.keys(SKILLS)[0]
    const duplicate = createGemItem('skillGem', skillId, 5)
    expect(duplicate).not.toBeNull()
    useGameStore.setState({
      ...state,
      inventory: { ...state.inventory, items: [duplicate!] },
      character: {
        ...state.character,
        ownedGems: [
          ...state.character.ownedGems.filter(gem => gem.id !== skillId),
          { id: skillId, level: 3, xp: 12 },
        ],
      },
    })

    useGameStore.getState().claimGemItem(duplicate!.id)

    const next = useGameStore.getState()
    expect(next.inventory.items).toHaveLength(0)
    expect(next.character.ownedGems.filter(gem => gem.id === skillId)).toHaveLength(1)
    expect(next.character.ownedGems.find(gem => gem.id === skillId)?.level).toBe(3)
  })

  it('discards progression items that can no longer be converted', () => {
    const state = useGameStore.getState()
    const blank = createBlankSupport(5)
    useGameStore.setState({
      ...state,
      inventory: { ...state.inventory, items: [blank] },
      character: {
        ...state.character,
        ownedGems: [
          ...state.character.ownedGems,
          ...Object.keys(SUPPORTS)
            .filter(id => !state.character.ownedGems.some(gem => gem.id === id))
            .map(id => ({ id, level: 1, xp: 0 })),
        ],
      },
    })

    useGameStore.getState().discardItem(blank.id)

    expect(useGameStore.getState().inventory.items).toHaveLength(0)
  })
})

describe('offline progress double-claim guard', () => {
  beforeEach(() => {
    storage.clear()
    useGameStore.setState(useGameStore.getState(), true)
    useGameStore.getState().resetGame()
  })

  it('applyOfflineProgress persists a fresh lastSaveTime immediately', () => {
    // Simulate a pending offline grant with an old save stamp
    const before = Date.now()
    useGameStore.setState({ offlineSeconds: 7200, lastSaveTime: before - 7200_000 })

    const summary = {
      seconds: 7200,
      xpGained: 100,
      goldGained: 50,
      kills: 20,
      levelsGained: 1,
      itemsFound: 0,
    }
    useGameStore.getState().applyOfflineProgress(useGameStore.getState(), summary)

    // In-memory state is stamped and the overlay flag cleared
    expect(useGameStore.getState().offlineSummary).toEqual(summary)
    expect(useGameStore.getState().offlineSeconds).toBe(0)
    expect(useGameStore.getState().lastSaveTime).toBeGreaterThanOrEqual(before)

    // The persisted save now carries the fresh lastSaveTime, so the same
    // offline gap can never be re-credited on the next boot (double-claim guard)
    const reloaded = loadGame()
    expect(reloaded).not.toBeNull()
    expect(reloaded!.lastSaveTime).toBeGreaterThanOrEqual(before)
    expect(computeOfflineSeconds(reloaded!.lastSaveTime, Date.now())).toBe(0)

    // Runtime-only offline fields are stripped from the persisted save
    expect((reloaded as unknown as Record<string, unknown>).offlineSeconds).toBeUndefined()
    expect((reloaded as unknown as Record<string, unknown>).offlineSummary).toBeUndefined()
  })
})
