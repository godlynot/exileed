import { create } from 'zustand'
import type { Character, CombatState, GameState, Monster, Zone } from '../types/game.ts'
import type { Equipment, InventoryState, Item } from '../types/item.ts'
import { CLASSES, CLASS_ROOT_MAP } from '../data/classes.ts'
import type { ClassId } from '../types/game.ts'
import { ZONES, MONSTERS } from '../data/zones.ts'
import { TICKS_PER_SECOND, experienceForLevel } from '../data/balance.ts'
import { PASSIVE_TREE } from '../data/passiveTree.ts'
import { TRIALS, ASCENDANCIES } from '../data/ascendancies.ts'
import { applyPassiveStats, applyAscendancyStats, allocateNode, refundNode } from '../systems/passives.ts'
import { simulateTick } from '../systems/combat.ts'
import { createMomentumState } from '../systems/momentum.ts'
import { saveGame, loadGame, exportSave as exportSaveString, importSave } from '../systems/save.ts'
import { BASE_ITEMS, STARTER_ITEMS } from '../data/items.ts'
import { createItem, applyOrb, recalculateCharacterFromEquipment } from '../systems/items.ts'

const SAVE_INTERVAL_TICKS = TICKS_PER_SECOND * 30

const STARTER_SKILL_BY_CLASS: Record<ClassId, string> = {
  brute: 'strike',
  stalker: 'poison_strike',
  acolyte: 'firebolt',
  oracle: 'firebolt',
  warlord: 'strike',
  plaguebringer: 'poison_strike',
}

function createDefaultCharacter(classId: ClassId): Character {
  const gameClass = CLASSES[classId]
  const life = gameClass.baseLife
  return {
    id: 'player_1',
    name: 'Exile',
    classId,
    level: 1,
    experience: 0,
    experienceToNext: 100,
    life,
    maxLife: life,
    energyShield: gameClass.baseEnergyShield,
    maxEnergyShield: gameClass.baseEnergyShield,
    attributes: { ...gameClass.baseAttributes },
    resistances: { fire: 0, cold: 0, lightning: 0, chaos: 0 },
    accuracy: gameClass.baseAccuracy,
    evasion: gameClass.baseEvasion,
    armour: gameClass.baseAttributes.strength * 2,
    attackRate: 1.0,
    basePhysicalDamageMin: 2,
    basePhysicalDamageMax: 4,
    criticalChance: 0.05,
    criticalMultiplier: 1.5,
    special: {},
    isAlive: true,
    respawnTimer: 0,
    allocatedNodes: [`root_${CLASS_ROOT_MAP[classId as ClassId]}`],
    passivePoints: 0,
    ascendancyId: null,
    allocatedAscendancyNodes: [],
    keystoneChoices: {},
    ascendancyPoints: 0,
    trial1Completed: false,
    trial2Completed: false,
    trial3Completed: false,
    trial4Completed: false,
    devOverrides: {},
    equippedSkills: [{ skillId: STARTER_SKILL_BY_CLASS[classId], supportIds: [], cooldownRemaining: 0, hitCounter: 0 }],
    ownedGems: [
      STARTER_SKILL_BY_CLASS[classId],
      ...(['brute', 'stalker', 'warlord'].includes(classId) ? ['slash', 'added_physical_damage'] : []),
      ...(['acolyte', 'oracle'].includes(classId) ? ['ice_nova', 'added_fire_damage'] : []),
      ...(['plaguebringer'].includes(classId) ? ['essence_drain', 'ailment_magnitude'] : []),
    ].map(id => ({ id, level: 1, xp: 0 })),
    supportSlotCount: 2,
    increasedPhysicalDamage: 0,
    morePhysicalDamage: 1,
    increasedSpellDamage: 0,
    moreSpellDamage: 1,
    increasedAttackSpeed: 0,
    moreAttackSpeed: 1,
    increasedAccuracy: 0,
    lifeRegen: 0,
    esRecharge: 0,
  }
}

function applyDevOverrides(character: Character): Character {
  if (!character.devOverrides || Object.keys(character.devOverrides).length === 0) {
    return character
  }
  const merged = { ...character, ...character.devOverrides }
  return {
    ...merged,
    life: Math.min(merged.life, merged.maxLife),
    energyShield: Math.min(merged.energyShield, merged.maxEnergyShield),
  }
}

function recalcCharacter(state: GameState, character: Character): Character {
  let c = recalculateCharacterFromEquipment(character, state.equipment)
  c = applyPassiveStats(c, state.passiveTree)
  c = applyAscendancyStats(c)
  c = applyDevOverrides(c)
  return c
}

function createInitialEquipment(): Equipment {
  return {
    weapon: null,
    offhand: null,
    helmet: null,
    body: null,
    gloves: null,
    boots: null,
    belt: null,
    amulet: null,
    ring1: null,
    ring2: null,
  }
}

function createInitialInventory(): InventoryState {
  return {
    items: [],
    maxSize: 60,
    autoSellNormal: true,
    autoSellMagic: true,
    autoSellMaxLevel: 0,
  }
}

function createInitialCurrencies(): Record<string, number> {
  return {
    gold: 0,
    awakening: 5,
    mutation: 5,
    sovereignty: 2,
    genesis: 2,
    entropy: 1,
    triumph: 0,
    void_orb: 0,
    cleansing: 2,
    penance: 0,
  }
}

function createInitialCombat(zone: Zone): CombatState {
  const pool = zone.monsterIds.length > 0 ? zone.monsterIds : zone.monsterId ? [zone.monsterId] : []
  const id = pool[Math.floor(Math.random() * pool.length)]
  const monsterTemplate = MONSTERS[id]
  const monster: Monster = {
    ...monsterTemplate,
    life: monsterTemplate.maxLife,
  }
  return {
    monster,
    monsterLife: monster.maxLife,
    lastDamageDealt: 0,
    lastDamageTaken: 0,
    combatLog: [],
    isRespawning: false,
    respawnTicks: 0,
    events: [],
    ticksSinceDamageTaken: 0,
    playerEvasionStacks: 0,
    monsterEvasionStacks: 0,
    momentum: createMomentumState(),
    herald: { active: [], tideRamp: 0, hitTargets: [] },
    marshal: { army: null, bulwarkFlat: 0, bulwarkTicksRemaining: 0 },
    delayedDamageQueue: [],
    ailments: {},
    virulent: { stacks: {}, septicemiaMultiplier: {}, calcifyAccumulator: {}, slow: {}, patientZeroTarget: null },
    monsterDebuffs: {},
    plaguewindCarryover: [],
  }
}

function createStarterEquipment(classId: string): Equipment {
  const equipment = createInitialEquipment()
  const starterIds = STARTER_ITEMS[classId] ?? STARTER_ITEMS['warlord']
  for (const baseId of starterIds) {
    const base = BASE_ITEMS[baseId]
    const item = createItem(baseId, 1, 'normal')
    if (base.slot === 'ring' && !equipment.ring1) equipment.ring1 = item
    else if (base.slot === 'ring') equipment.ring2 = item
    else (equipment as unknown as Record<string, Item | null>)[base.slot] = item
  }
  return equipment
}

export function createInitialState(classId: ClassId = 'warlord'): GameState {
  const zones = ZONES.map(z => ({ ...z }))
  const activeZoneId = zones[0].id
  const equipment = createStarterEquipment(classId)
  let character = createDefaultCharacter(classId)
  character = recalculateCharacterFromEquipment(character, equipment)
  character = applyPassiveStats(character, PASSIVE_TREE)
  return {
    character: { ...character, life: character.maxLife, energyShield: character.maxEnergyShield },
    zones,
    activeZoneId,
    inventory: createInitialInventory(),
    equipment,
    currencies: createInitialCurrencies(),
    combat: createInitialCombat(zones[0]),
    lastSaveTime: Date.now(),
    saveVersion: 1,
    passiveTree: PASSIVE_TREE,
    gamePhase: 'class-select',
    activeTrial: null,
    tickCounter: 0,
  }
}

interface GameActions {
  tick: () => void
  selectZone: (zoneId: string) => void
  equipItem: (item: Item) => void
  unequipItem: (slot: keyof Equipment) => void
  sellItem: (itemId: string) => void
  useCurrency: (itemId: string, currencyId: string) => void
  toggleAutoSell: (type: 'normal' | 'magic') => void
  allocateNode: (nodeId: string) => void
  refundNode: (nodeId: string) => void
  selectAscendancy: (ascendancyId: string) => void
  allocateAscendancyNode: (nodeId: string) => void
  setAscendancyChoice: (nodeId: string, choiceId: string) => void
  startTrial: (trialId: string) => void
  startGame: (classId: ClassId) => void
  equipSkill: (skillId: string, slotIndex: number) => void
  unequipSkill: (slotIndex: number) => void
  equipSupport: (supportId: string, slotIndex: number) => void
  unequipSupport: (skillSlotIndex: number, supportSlotIndex: number) => void
  exportSave: () => string
  importSave: (data: string) => void
  resetGame: () => void
  devSetLevel: (level: number) => void
  devSetStats: (stats: Partial<Character>) => void
}

function getInitialState(): GameState {
  const loaded = loadGame()
  if (loaded) {
    // Preserve the loaded phase; default to class-select if missing
    return {
      ...loaded,
      gamePhase: loaded.gamePhase ?? 'class-select',
      tickCounter: loaded.tickCounter ?? 0,
    }
  }
  return createInitialState('warlord')
}

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  ...getInitialState(),

  tick: () => {
    set(state => {
      const { state: nextState, events } = simulateTick(state)

      // Rolling combat event buffer for live UI (last 50 events)
      nextState.combat.events = [...state.combat.events, ...events].slice(-50)

      // Periodic auto-save
      const shouldSave = Math.random() < 1 / SAVE_INTERVAL_TICKS
      if (shouldSave) {
        saveGame(nextState)
      }

      return { ...nextState, tickCounter: nextState.tickCounter + 1 }
    })
  },

  selectZone: (zoneId: string) => {
    set(state => {
      const zone = state.zones.find(z => z.id === zoneId)
      if (!zone || !zone.unlocked) return state
      return { ...state, activeZoneId: zoneId, combat: createInitialCombat(zone) }
    })
  },

  equipItem: (item: Item) => {
    set(state => {
      const equipment = { ...state.equipment }
      let existing: Item | null = null
      let targetSlot: keyof Equipment
      if (item.slot === 'ring') {
        targetSlot = equipment.ring1 ? 'ring2' : 'ring1'
      } else {
        targetSlot = item.slot
      }
      existing = equipment[targetSlot]
      ;(equipment as Record<keyof Equipment, Item | null>)[targetSlot] = item
      const inventoryItems = state.inventory.items.filter(i => i.id !== item.id)
      if (existing) {
        inventoryItems.push(existing)
      }
      const character = recalcCharacter({ ...state, equipment } as GameState, state.character)
      return { ...state, equipment, inventory: { ...state.inventory, items: inventoryItems }, character }
    })
  },

  unequipItem: (slot: keyof Equipment) => {
    set(state => {
      const item = state.equipment[slot]
      if (!item) return state
      if (state.inventory.items.length >= state.inventory.maxSize) return state
      const equipment = { ...state.equipment, [slot]: null }
      const inventoryItems = [...state.inventory.items, item]
      const character = recalcCharacter({ ...state, equipment } as GameState, state.character)
      return { ...state, equipment, inventory: { ...state.inventory, items: inventoryItems }, character }
    })
  },

  sellItem: (itemId: string) => {
    set(state => {
      const item = state.inventory.items.find(i => i.id === itemId)
      if (!item) return state
      const inventoryItems = state.inventory.items.filter(i => i.id !== itemId)
      const currencies = { ...state.currencies }
      currencies['gold'] = (currencies['gold'] || 0) + Math.max(1, Math.floor(item.itemLevel * 3)) * (item.rarity === 'rare' ? 3 : item.rarity === 'magic' ? 2 : 1)
      return { ...state, inventory: { ...state.inventory, items: inventoryItems }, currencies }
    })
  },

  useCurrency: (itemId: string, currencyId: string) => {
    set(state => {
      if ((state.currencies[currencyId] || 0) <= 0) return state
      const itemIndex = state.inventory.items.findIndex(i => i.id === itemId)
      if (itemIndex === -1) return state
      const item = state.inventory.items[itemIndex]
      const newItem = applyOrb(item, currencyId)
      if (newItem === item) return state
      const inventoryItems = [...state.inventory.items]
      inventoryItems[itemIndex] = newItem
      const currencies = { ...state.currencies }
      currencies[currencyId] = (currencies[currencyId] || 0) - 1
      return { ...state, inventory: { ...state.inventory, items: inventoryItems }, currencies }
    })
  },

  toggleAutoSell: (type: 'normal' | 'magic') => {
    set(state => ({
      ...state,
      inventory: {
        ...state.inventory,
        [type === 'normal' ? 'autoSellNormal' : 'autoSellMagic']: !state.inventory[type === 'normal' ? 'autoSellNormal' : 'autoSellMagic'],
      },
    }))
  },

  exportSave: () => {
    return exportSaveString(get())
  },

  importSave: (data: string) => {
    const loaded = importSave(data)
    if (loaded) {
      set(loaded)
    }
  },

  resetGame: () => {
    set({ ...createInitialState('warlord'), gamePhase: 'class-select' })
  },

  startGame: (classId: ClassId) => {
    set({ ...createInitialState(classId), gamePhase: 'playing' })
  },

  allocateNode: (nodeId: string) => {
    set(state => {
      const newCharacter = allocateNode(state.character, state.passiveTree, nodeId)
      if (newCharacter === state.character) return state
      const character = recalcCharacter(state, newCharacter)
      return { ...state, character }
    })
  },

  refundNode: (nodeId: string) => {
    set(state => {
      const newCharacter = refundNode(state.character, state.passiveTree, nodeId)
      if (newCharacter === state.character) return state
      const character = recalcCharacter(state, newCharacter)
      return { ...state, character }
    })
  },

  selectAscendancy: (ascendancyId: string) => {
    set(state => {
      const ascendancy = ASCENDANCIES[ascendancyId]
      const freeNodes = ascendancy?.nodes.filter(n => n.free) ?? []
      const nodesToAllocate: Set<string> = new Set()
      for (const free of freeNodes) {
        nodesToAllocate.add(free.id)
        for (const req of free.requires ?? []) {
          nodesToAllocate.add(req)
        }
      }
      const allocatedAscendancyNodes = [...new Set([...state.character.allocatedAscendancyNodes, ...nodesToAllocate])]
      const baseChar = { ...state.character, ascendancyId, allocatedAscendancyNodes }
      const character = recalcCharacter(state, baseChar)
      return { ...state, character, gamePhase: 'playing', activeTrial: null }
    })
  },

  allocateAscendancyNode: (nodeId: string) => {
    set(state => {
      if (!state.character.ascendancyId) return state
      const ascendancy = ASCENDANCIES[state.character.ascendancyId]
      if (!ascendancy) return state
      if (state.character.allocatedAscendancyNodes.includes(nodeId)) return state
      const node = ascendancy.nodes.find(n => n.id === nodeId)
      if (!node) return state
      if (node.free) return state
      const paidAllocated = state.character.allocatedAscendancyNodes.filter(id => !ascendancy.nodes.find(n => n.id === id)?.free).length
      if (paidAllocated >= state.character.ascendancyPoints) return state
      if (node.requires && node.requires.some(req => !state.character.allocatedAscendancyNodes.includes(req))) return state
      // Mutual exclusivity: if this node is mutually exclusive with an currently-allocated node, block
      if (node.mutuallyExclusiveWith && node.mutuallyExclusiveWith.some(id => state.character.allocatedAscendancyNodes.includes(id))) return state
      // For choice keystones, require a choice before allocating (unless already picked)
      if (node.choices && node.choices.length > 0 && !state.character.keystoneChoices[nodeId]) return state
      const withNode = { ...state.character, allocatedAscendancyNodes: [...state.character.allocatedAscendancyNodes, nodeId] }
      const character = recalcCharacter(state, withNode)
      return { ...state, character }
    })
  },

  setAscendancyChoice: (nodeId: string, choiceId: string) => {
    set(state => {
      const baseChar = { ...state.character, keystoneChoices: { ...state.character.keystoneChoices, [nodeId]: choiceId } }
      const character = recalcCharacter(state, baseChar)
      return { ...state, character }
    })
  },

  equipSkill: (skillId: string, slotIndex: number) => {
    set(state => {
      const equippedSkills = [...state.character.equippedSkills]
      if (slotIndex < 0 || slotIndex >= 4) return state
      equippedSkills[slotIndex] = { skillId, supportIds: [], cooldownRemaining: 0, hitCounter: 0 }
      const character = recalcCharacter(state, { ...state.character, equippedSkills })
      return { ...state, character }
    })
  },

  unequipSkill: (slotIndex: number) => {
    set(state => {
      const equippedSkills = [...state.character.equippedSkills]
      if (slotIndex < 0 || slotIndex >= 4) return state
      equippedSkills[slotIndex] = { skillId: '', supportIds: [], cooldownRemaining: 0, hitCounter: 0 }
      const character = recalcCharacter(state, { ...state.character, equippedSkills })
      return { ...state, character }
    })
  },

  equipSupport: (supportId: string, skillSlotIndex: number) => {
    set(state => {
      const equippedSkills = [...state.character.equippedSkills]
      const skill = equippedSkills[skillSlotIndex]
      if (!skill) return state
      if (skill.supportIds.length >= state.character.supportSlotCount) return state
      if (skill.supportIds.includes(supportId)) return state
      equippedSkills[skillSlotIndex] = { ...skill, supportIds: [...skill.supportIds, supportId] }
      const character = recalcCharacter(state, { ...state.character, equippedSkills })
      return { ...state, character }
    })
  },

  unequipSupport: (skillSlotIndex: number, supportSlotIndex: number) => {
    set(state => {
      const equippedSkills = [...state.character.equippedSkills]
      const skill = equippedSkills[skillSlotIndex]
      if (!skill) return state
      const supportIds = [...skill.supportIds]
      supportIds.splice(supportSlotIndex, 1)
      equippedSkills[skillSlotIndex] = { ...skill, supportIds }
      const character = recalcCharacter(state, { ...state.character, equippedSkills })
      return { ...state, character }
    })
  },

  startTrial: (trialId: string) => {
    set(state => {
      const trial = TRIALS.find(t => t.id === trialId)
      if (!trial) return state
      const monsterTemplate = MONSTERS[trial.monsterId]
      const monster: Monster = { ...monsterTemplate, life: monsterTemplate.maxLife }
      const combat: CombatState = {
        monster,
        monsterLife: monster.maxLife,
        lastDamageDealt: 0,
        lastDamageTaken: 0,
        combatLog: [],
        isRespawning: false,
        respawnTicks: 0,
        events: [],
        ticksSinceDamageTaken: 0,
        playerEvasionStacks: 0,
        monsterEvasionStacks: 0,
        momentum: createMomentumState(),
        herald: { active: [], tideRamp: 0, hitTargets: [] },
        marshal: { army: null, bulwarkFlat: 0, bulwarkTicksRemaining: 0 },
        delayedDamageQueue: [],
        ailments: {},
        virulent: { stacks: {}, septicemiaMultiplier: {}, calcifyAccumulator: {}, slow: {}, patientZeroTarget: null },
        monsterDebuffs: {},
        plaguewindCarryover: [],
      }
      return { ...state, activeTrial: trial, combat }
    })
  },

  devSetLevel: (level: number) => {
    set(state => {
      const clampedLevel = Math.max(1, Math.min(level, 90))
      const character = recalcCharacter(state, {
        ...state.character,
        level: clampedLevel,
        experience: 0,
        experienceToNext: experienceForLevel(clampedLevel),
      })
      return { ...state, character: { ...character, life: character.maxLife, energyShield: character.maxEnergyShield } }
    })
  },

  devSetStats: (stats: Partial<Character>) => {
    set(state => {
      const next = { ...state.character, devOverrides: { ...state.character.devOverrides, ...stats } }
      return { ...state, character: recalcCharacter(state, next) }
    })
  },
}))
