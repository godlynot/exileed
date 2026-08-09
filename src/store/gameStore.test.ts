import { describe, it, expect, beforeEach, spyOn } from 'bun:test'
import { useGameStore } from './gameStore.ts'
import { loadGame, serializeSave } from '../systems/save.ts'
import { computeOfflineSeconds } from '../systems/offlineProgress.ts'
import { createBlankSupport, createGemItem, createItem } from '../systems/items.ts'
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

describe('inventory capacity', () => {
  beforeEach(() => {
    storage.clear()
    useGameStore.setState(useGameStore.getState(), true)
    useGameStore.getState().resetGame()
  })

  it('starts with a 5 by 6 inventory capacity', () => {
    expect(useGameStore.getState().inventory.maxSize).toBe(30)
  })

  it('normalizes imported legacy capacity without dropping existing items', () => {
    const item = createItem('rusted_axe', 1, 'normal')
    const legacyState = useGameStore.getState()
    const imported = serializeSave({
      ...legacyState,
      inventory: { ...legacyState.inventory, maxSize: 60, items: [item] },
    })

    useGameStore.getState().importSave(imported)

    expect(useGameStore.getState().inventory.maxSize).toBe(30)
    expect(useGameStore.getState().inventory.items).toHaveLength(1)
    expect(useGameStore.getState().inventory.items[0].id).toBe(item.id)
  })

  it('emits a detailed auto-sold loot event when a drop matches the filter', () => {
    const random = spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      useGameStore.getState().devSpawnTestPack()
      const armed = useGameStore.getState()
      const front = armed.combat.currentPack[0]
      if (!front) throw new Error('Expected the dev pack to contain a front monster')

      useGameStore.setState({
        ...armed,
        inventory: { ...armed.inventory, autoSellNormal: true, autoSellMagic: true },
        character: { ...armed.character, level: 2, special: { ...armed.character.special, alwaysHit: true } },
        combat: {
          ...armed.combat,
          monster: front.monster,
          monsterLife: 1,
          currentPack: [{ ...front, currentLife: 1 }, ...armed.combat.currentPack.slice(1)],
        },
      })

      useGameStore.getState().tick()

      const event = useGameStore.getState().combat.events.find(candidate =>
        candidate.type === 'itemDropped' && candidate.outcome === 'autoSold',
      )
      expect(event?.type).toBe('itemDropped')
      if (event?.type !== 'itemDropped') throw new Error('Expected an auto-sold item event')
      expect(event.itemName).toBeTruthy()
      expect(event.slot).toBeTruthy()
      expect(event.itemLevel).toBeGreaterThan(0)
      expect(event.goldValue).toBeGreaterThan(0)
    } finally {
      random.mockRestore()
    }
  })

  it('emits item name and slot details for a stored equipment drop', () => {
    const random = spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      useGameStore.getState().devSpawnTestPack()
      const armed = useGameStore.getState()
      const front = armed.combat.currentPack[0]
      if (!front) throw new Error('Expected the dev pack to contain a front monster')

      useGameStore.setState({
        ...armed,
        inventory: { ...armed.inventory, autoSellNormal: false, autoSellMagic: false },
        character: { ...armed.character, special: { ...armed.character.special, alwaysHit: true } },
        combat: {
          ...armed.combat,
          monster: front.monster,
          monsterLife: 1,
          currentPack: [{ ...front, currentLife: 1 }, ...armed.combat.currentPack.slice(1)],
        },
      })

      useGameStore.getState().tick()

      const event = useGameStore.getState().combat.events.find(candidate =>
        candidate.type === 'itemDropped' && candidate.outcome === 'stored',
      )
      expect(event?.type).toBe('itemDropped')
      if (event?.type !== 'itemDropped') throw new Error('Expected a stored item event')
      expect(event.itemName).toBeTruthy()
      expect(event.slot).toBeTruthy()
      expect(event.itemLevel).toBeGreaterThan(0)
    } finally {
      random.mockRestore()
    }
  })
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
  it('ignores invalid skill and support slot indices without mutating the loadout', () => {
    useGameStore.getState().resetGame()
    const before = useGameStore.getState().character.equippedSkills

    useGameStore.getState().equipSkill('strike', -1)
    useGameStore.getState().equipSkill('strike', 4)
    useGameStore.getState().equipSupport('missing_support', 0, -1)
    useGameStore.getState().unequipSupport(0, 99)
    useGameStore.getState().unequipSupport(-1, 0)

    expect(useGameStore.getState().character.equippedSkills).toEqual(before)
  })

  it('unequips a skill through its slot guard and clears linked supports', () => {
    useGameStore.getState().resetGame()
    const state = useGameStore.getState()
    const equipped = state.character.equippedSkills[0]
    if (!equipped) throw new Error('Expected the starter skill to be equipped')
    const supportId = Object.keys(SUPPORTS).find(id => SUPPORTS[id].allowedTags.some(tag => SKILLS[equipped.skillId].tags.includes(tag)))
    if (!supportId) throw new Error('Expected a compatible support for the starter skill')

    useGameStore.setState({
      ...state,
      character: {
        ...state.character,
        ownedGems: [...state.character.ownedGems, { id: supportId, level: 1, xp: 0 }],
        equippedSkills: [{ ...equipped, supportIds: [supportId] }, ...state.character.equippedSkills.slice(1)],
      },
    })

    useGameStore.getState().unequipSkill(0)

    expect(useGameStore.getState().character.equippedSkills[0]).toMatchObject({
      skillId: '',
      supportIds: [],
      cooldownRemaining: 0,
      hitCounter: 0,
    })
  })

  it('replaces and removes the support slot selected in the UI', () => {
    useGameStore.getState().resetGame()
    const state = useGameStore.getState()
    const equipped = state.character.equippedSkills[0]
    if (!equipped) throw new Error('Expected the starter skill to be equipped')
    const skill = SKILLS[equipped.skillId]
    const compatibleIds = Object.keys(SUPPORTS).filter(id =>
      SUPPORTS[id].allowedTags.some(tag => skill.tags.includes(tag)),
    )
    if (compatibleIds.length < 2) throw new Error('Expected two compatible supports for the starter skill')

    useGameStore.setState({
      ...state,
      character: {
        ...state.character,
        ownedGems: [
          ...state.character.ownedGems,
          ...compatibleIds.slice(0, 2).map(id => ({ id, level: 1, xp: 0 })),
        ],
        equippedSkills: [{ ...equipped, supportIds: [compatibleIds[0]] }, ...state.character.equippedSkills.slice(1)],
      },
    })

    useGameStore.getState().equipSupport(compatibleIds[1], 0, 0)
    expect(useGameStore.getState().character.equippedSkills[0]?.supportIds).toEqual([compatibleIds[1]])

    useGameStore.getState().unequipSupport(0, 0)
    expect(useGameStore.getState().character.equippedSkills[0]?.supportIds).toEqual([])
  })

  it('fills an empty support slot without requiring earlier slots to be prefilled', () => {
    useGameStore.getState().resetGame()
    const state = useGameStore.getState()
    const equipped = state.character.equippedSkills[0]
    if (!equipped) throw new Error('Expected the starter skill to be equipped')
    const skill = SKILLS[equipped.skillId]
    const supportId = Object.keys(SUPPORTS).find(id =>
      SUPPORTS[id].allowedTags.some(tag => skill.tags.includes(tag)),
    )
    if (!supportId) throw new Error('Expected a compatible support for the starter skill')

    useGameStore.setState({
      ...state,
      character: {
        ...state.character,
        ownedGems: [...state.character.ownedGems, { id: supportId, level: 1, xp: 0 }],
      },
    })

    useGameStore.getState().equipSupport(supportId, 0, state.character.supportSlotCount - 1)

    expect(useGameStore.getState().character.equippedSkills[0]?.supportIds).toEqual([supportId])
  })

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

describe('ascendancy choice validation', () => {
  it('ignores choices that do not belong to the selected keystone', () => {
    useGameStore.getState().resetGame()
    const before = useGameStore.getState().character

    useGameStore.getState().setAscendancyChoice('missing_node', 'missing_choice')

    expect(useGameStore.getState().character.keystoneChoices).toEqual(before.keystoneChoices)
  })
})

describe('crafting currency actions', () => {
  beforeEach(() => {
    storage.clear()
    useGameStore.setState(useGameStore.getState(), true)
    useGameStore.getState().resetGame()
  })

  it('applies a valid orb, updates the inventory item, and consumes one currency', () => {
    const item = createItem('rusted_axe', 1, 'normal')
    const state = useGameStore.getState()
    useGameStore.setState({
      ...state,
      inventory: { ...state.inventory, items: [item] },
      currencies: { ...state.currencies, awakening: 1 },
    })

    useGameStore.getState().useCurrency(item.id, 'awakening')

    const next = useGameStore.getState()
    expect(next.inventory.items[0].rarity).toBe('magic')
    expect(next.inventory.items[0]).not.toBe(item)
    expect(next.currencies.awakening).toBe(0)
  })

  it('does not consume currency or mutate the item when the orb is invalid', () => {
    const item = createItem('rusted_axe', 1, 'normal')
    const state = useGameStore.getState()
    useGameStore.setState({
      ...state,
      inventory: { ...state.inventory, items: [item] },
      currencies: { ...state.currencies, void_orb: 1 },
    })

    useGameStore.getState().useCurrency(item.id, 'void_orb')

    const next = useGameStore.getState()
    expect(next.inventory.items[0]).toBe(item)
    expect(next.currencies.void_orb).toBe(1)
  })
})
