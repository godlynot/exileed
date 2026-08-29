import { create } from 'zustand'
import type { Character, CombatState, GameState, Monster, Zone } from '../types/game.ts'
import type { Equipment, InventoryState, Item } from '../types/item.ts'
import { isBlankSupport, isNonEquipmentItem } from '../types/item.ts'
import { CLASSES, CLASS_ROOT_MAP } from '../data/classes.ts'
import type { ClassId } from '../types/game.ts'
import { ZONES, MONSTERS } from '../data/zones.ts'
import { supportSlotCountForCompletedActs, TICKS_PER_SECOND, experienceForLevel } from '../data/balance.ts'
import { PASSIVE_TREE } from '../data/passiveTree.ts'
import { TRIALS, ASCENDANCIES } from '../data/ascendancies.ts'
import { applyPassiveStats, applyAscendancyStats, allocateNode, refundNode } from '../systems/passives.ts'
import { simulateTick, spawnMonster } from '../systems/combat.ts'
import { createMomentumState } from '../systems/momentum.ts'
import { saveGame, loadGame, exportSave as exportSaveString, importSave } from '../systems/save.ts'
import { computeOfflineSeconds } from '../systems/offlineProgress.ts'
import type { OfflineSummary } from '../types/game.ts'
import { createNexusMap, nexusMapCrystalCost, nexusTierCompletionRewardForTier, nexusZoneForMap } from '../systems/nexus.ts'
import { BASE_ITEMS, STARTER_ITEMS } from '../data/items.ts'
import { SUPPORTS } from '../data/supports.ts'
import { SKILLS } from '../data/skills.ts'
import { addProgressionDropsToInventory, consumeGeneratedDrops, createItem, applyOrb, recalculateCharacterFromEquipment, reconcileAutoSellCap } from '../systems/items.ts'

const SAVE_INTERVAL_TICKS = TICKS_PER_SECOND * 30
const INVENTORY_CAPACITY = 30
const MAX_CHARACTER_LEVEL = 90

function normalizeAutoSellMaxLevel(value: unknown): number {
  const configuredMaxLevel = Number(value ?? 0)
  return Number.isFinite(configuredMaxLevel) && configuredMaxLevel > 0
    ? Math.min(MAX_CHARACTER_LEVEL, Math.floor(configuredMaxLevel))
    : 0
}

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
    damageVsBossesPercent: 0,
    goldFindPercent: 0,
    chanceToBleed: 0,
    chanceToShock: 0,
    chanceToInflictDespair: 0,
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
  // Ascendancy can change max life/ES; clamp current pools after all recalculation.
  c = {
    ...c,
    life: Math.min(c.life, c.maxLife),
    energyShield: Math.min(c.energyShield, c.maxEnergyShield),
  }
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
    maxSize: INVENTORY_CAPACITY,
    autoSellNormal: true,
    autoSellMagic: true,
    autoSellMaxLevel: 0,
  }
}

function normalizeInventory(inventory: InventoryState | undefined): InventoryState {
  return {
    ...(inventory ?? createInitialInventory()),
    // The 5 × 6 inventory is the current capacity. Existing items are kept
    // intact so an older save can be inspected and cleared safely.
    maxSize: INVENTORY_CAPACITY,
    autoSellNormal: inventory?.autoSellNormal ?? true,
    autoSellMagic: inventory?.autoSellMagic ?? true,
    autoSellMaxLevel: normalizeAutoSellMaxLevel(inventory?.autoSellMaxLevel),
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
    rift_crystal: 0,
  }
}

function createInitialNexus(): GameState['nexus'] {
  return {
    maps: [],
    activeMapId: null,
    packsCleared: 0,
    completedTierRewards: [],
  }
}

function createInitialCombat(zone: Zone): CombatState {
  const base: CombatState = {
    monster: null as unknown as Monster,
    monsterLife: 0,
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
    packDamageCarryover: 0,
    damageTakenByType: { physical: 0, fire: 0, cold: 0, lightning: 0, chaos: 0 },
    deathSummary: null,
    packSizeRemaining: 0,
    packNamedEliteCount: 0,
    currentPack: [],
  }
  return spawnMonster(zone, base).combat
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
    previousZoneId: null,
    inventory: createInitialInventory(),
    equipment,
    currencies: createInitialCurrencies(),
    nexus: createInitialNexus(),
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
  applyOfflineProgress: (state: GameState, summary: OfflineSummary) => void
  dismissOfflineProgress: () => void
  selectZone: (zoneId: string) => void
  equipItem: (item: Item) => void
  unequipItem: (slot: keyof Equipment) => void
  sellItem: (itemId: string) => void
  discardItem: (itemId: string) => void
  convertBlankSupport: (itemId: string, supportId: string) => void
  claimGemItem: (itemId: string) => void
  useCurrency: (itemId: string, currencyId: string) => void
  craftNexusMap: (tier: number) => void
  openNexusMap: (mapId: string) => void
  toggleAutoSell: (type: 'normal' | 'magic') => void
  setAutoSellMaxLevel: (maxLevel: number) => void
  allocateNode: (nodeId: string) => void
  refundNode: (nodeId: string) => void
  selectAscendancy: (ascendancyId: string) => void
  allocateAscendancyNode: (nodeId: string) => void
  setAscendancyChoice: (nodeId: string, choiceId: string) => void
  startTrial: (trialId: string) => void
  startGame: (classId: ClassId) => void
  equipSkill: (skillId: string, slotIndex: number) => void
  unequipSkill: (slotIndex: number) => void
  equipSupport: (supportId: string, skillSlotIndex: number, supportSlotIndex?: number) => void
  unequipSupport: (skillSlotIndex: number, supportSlotIndex: number) => void
  exportSave: () => string
  importSave: (data: string) => void
  resetGame: () => void
  advanceToNextAct: () => void
  returnToPreviousZone: () => void
  devSetLevel: (level: number) => void
  devSetStats: (stats: Partial<Character>) => void
  devSpawnTestPack: () => void
}

function getInitialState(): GameState {
  const loaded = loadGame()
  if (loaded) {
    // Detect offline time from the last save stamp; the overlay consumes it on boot.
    const offlineSeconds = computeOfflineSeconds(loaded.lastSaveTime ?? 0)
    // Preserve the loaded phase; default to class-select if missing
    return {
      ...loaded,
      gamePhase: loaded.gamePhase ?? 'class-select',
      tickCounter: loaded.tickCounter ?? 0,
      previousZoneId: loaded.previousZoneId ?? null,
      inventory: normalizeInventory(loaded.inventory),
      nexus: loaded.nexus && Array.isArray(loaded.nexus.maps)
        ? {
            maps: loaded.nexus.maps,
            activeMapId: typeof loaded.nexus.activeMapId === 'string' ? loaded.nexus.activeMapId : null,
            packsCleared: typeof loaded.nexus.packsCleared === 'number' && Number.isFinite(loaded.nexus.packsCleared)
              ? Math.max(0, Math.floor(loaded.nexus.packsCleared))
              : 0,
            completedTierRewards: Array.isArray(loaded.nexus.completedTierRewards)
              ? [...new Set(loaded.nexus.completedTierRewards.filter(tier => typeof tier === 'number' && Number.isFinite(tier)).map(tier => Math.floor(tier)))]
              : [],
          }
        : createInitialNexus(),
      currencies: { rift_crystal: 0, ...loaded.currencies },
      offlineSeconds: offlineSeconds > 0 ? offlineSeconds : 0,
      offlineSummary: null,
    }
  }
  return createInitialState('warlord')
}

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  ...getInitialState(),

  tick: () => {
    let shouldPersistReward = false
    set(state => {
      // Drop generation is queued by the item system so the store can describe
      // auto-sold loot without coupling combat to UI formatting. Clear any
      // drops created by an unrelated helper call before starting this tick.
      consumeGeneratedDrops()
      const { state: nextState, events } = simulateTick(state)
      const generatedDrops = consumeGeneratedDrops()
      const { restored: restoredDrops, autoSold: autoSoldByCombat, goldRefund: restoredGold } = reconcileAutoSellCap(
        generatedDrops,
        nextState.inventory,
        nextState.character.level,
        events,
      )
      if (restoredDrops.length > 0) {
        nextState.inventory = { ...nextState.inventory, items: [...nextState.inventory.items, ...restoredDrops] }
        nextState.currencies = { ...nextState.currencies, gold: Math.max(0, (nextState.currencies.gold || 0) - restoredGold) }
      }
      const restoredEvents = restoredDrops.map(dropped => ({
        id: `loot_restored_${dropped.id}`,
        timestamp: Date.now(),
        type: 'itemDropped' as const,
        itemId: dropped.id,
        itemName: dropped.name,
        slot: dropped.slot,
        itemLevel: dropped.itemLevel,
        rarity: dropped.rarity,
        outcome: 'stored' as const,
      }))
      const autoSoldEvents = autoSoldByCombat.map(dropped => ({
        id: `loot_autosell_${dropped.id}`,
        timestamp: Date.now(),
        type: 'itemDropped' as const,
        itemId: dropped.id,
        itemName: dropped.name,
        slot: dropped.slot,
        itemLevel: dropped.itemLevel,
        rarity: dropped.rarity,
        outcome: 'autoSold' as const,
        goldValue: Math.max(1, dropped.itemLevel * 2),
      }))
      const tickEvents = [...events, ...restoredEvents, ...autoSoldEvents].map(event => {
        if (event.type !== 'itemDropped' || event.itemName) return event
        const dropped = nextState.inventory.items.find(item => item.id === event.itemId)
        return dropped
          ? { ...event, itemName: dropped.name, slot: dropped.slot, itemLevel: dropped.itemLevel, outcome: 'stored' as const }
          : event
      })
      const previousRewards = new Set(state.nexus.completedTierRewards ?? [])
      const newlyCompletedTiers = (nextState.nexus.completedTierRewards ?? []).filter(tier => !previousRewards.has(tier))
      if (newlyCompletedTiers.length > 0) {
        let rewardTotal = 0
        for (const tier of newlyCompletedTiers) {
          const amount = nexusTierCompletionRewardForTier(tier)
          if (amount <= 0) continue
          rewardTotal += amount
          tickEvents.push({
            id: `nexus_reward_${nextState.tickCounter}_${tier}`,
            timestamp: Date.now(),
            type: 'nexusTierCompleted',
            tier,
            amount,
          })
        }
        if (rewardTotal > 0) {
          nextState.currencies = {
            ...nextState.currencies,
            rift_crystal: (nextState.currencies.rift_crystal || 0) + rewardTotal,
          }
          tickEvents.push({
            id: `rift_crystal_reward_${nextState.tickCounter}`,
            timestamp: Date.now(),
            type: 'riftCrystalGained',
            amount: rewardTotal,
          })
          shouldPersistReward = true
        }
      }

      // Rolling combat event buffer for live UI (last 50 events)
      nextState.combat.events = [...state.combat.events, ...tickEvents].slice(-50)

      const zone = nextState.zones.find(candidate => candidate.id === nextState.activeZoneId)
      const nexusMap = nextState.nexus.activeMapId
        ? nextState.nexus.maps.find(map => map.id === nextState.nexus.activeMapId)
        : null
      const progressionZone = zone ?? (nexusMap ? nexusZoneForMap(nexusMap) : null)
      const killCount = events.filter(event => event.type === 'monsterDied').length
      if (progressionZone && killCount > 0) {
        const ownedGemIds = [
          ...nextState.character.ownedGems.map(gem => gem.id),
          ...nextState.inventory.items.flatMap(item => item.gemId ? [item.gemId] : []),
        ]
        const progression = addProgressionDropsToInventory(
          nextState.inventory.items,
          nextState.inventory.maxSize,
          progressionZone.level,
          ownedGemIds,
          killCount,
        )
        nextState.inventory = { ...nextState.inventory, items: progression.items }
        const progressionEvents = progression.drops.map(dropped => ({
          id: `progression_${dropped.id}`,
          timestamp: Date.now(),
          type: 'itemDropped' as const,
          itemId: dropped.id,
          itemName: dropped.name,
          slot: dropped.slot,
          itemLevel: dropped.itemLevel,
          rarity: dropped.rarity,
          outcome: 'stored' as const,
        }))
        nextState.combat.events = [...nextState.combat.events, ...progressionEvents].slice(-50)
      }

      const completedActs = nextState.zones.filter(candidate => candidate.killProgress >= 100).map(candidate => candidate.act)
      const supportSlotCount = supportSlotCountForCompletedActs(completedActs)
      if (nextState.character.supportSlotCount !== supportSlotCount) {
        nextState.character = { ...nextState.character, supportSlotCount }
      }

      // Periodic auto-save
      const shouldSave = Math.random() < 1 / SAVE_INTERVAL_TICKS
      if (shouldSave) {
        saveGame(nextState)
      }

      return { ...nextState, tickCounter: nextState.tickCounter + 1 }
    })
    if (shouldPersistReward) saveGame(get())
  },

  craftNexusMap: (tier: number) => {
    set(state => {
      const cost = nexusMapCrystalCost(tier)
      if ((state.currencies.rift_crystal || 0) < cost) return state
      const currencies = { ...state.currencies, rift_crystal: (state.currencies.rift_crystal || 0) - cost }
      const map = createNexusMap(tier)
      return { ...state, currencies, nexus: { ...state.nexus, maps: [...state.nexus.maps, map] } }
    })
  },

  openNexusMap: (mapId: string) => {
    set(state => {
      if (state.nexus.activeMapId || state.activeTrial) return state
      const map = (Array.isArray(state.nexus.maps) ? state.nexus.maps : []).find(candidate => candidate.id === mapId)
      if (!map || map.currentCharges <= 0) return state
      const nexusZone = nexusZoneForMap(map)
      return {
        ...state,
        nexus: { ...state.nexus, activeMapId: mapId, packsCleared: 0 },
        activeZoneId: nexusZone.id,
        previousZoneId: state.activeZoneId,
        combat: createInitialCombat(nexusZone),
      }
    })
  },

  selectZone: (zoneId: string) => {
    set(state => {
      if (state.nexus.activeMapId || state.activeTrial) return state
      const zone = state.zones.find(z => z.id === zoneId)
      if (!zone || !zone.unlocked) return state
      return { ...state, activeZoneId: zoneId, previousZoneId: null, combat: createInitialCombat(zone) }
    })
  },

  equipItem: (item: Item) => {
    set(state => {
      const inventoryItem = state.inventory.items.find(i => i.id === item.id)
      if (!inventoryItem || isNonEquipmentItem(inventoryItem)) return state
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
      if (!item || isNonEquipmentItem(item)) return state
      const inventoryItems = state.inventory.items.filter(i => i.id !== itemId)
      const currencies = { ...state.currencies }
      currencies['gold'] = (currencies['gold'] || 0) + Math.max(1, Math.floor(item.itemLevel * 3)) * (item.rarity === 'rare' ? 3 : item.rarity === 'magic' ? 2 : 1)
      return { ...state, inventory: { ...state.inventory, items: inventoryItems }, currencies }
    })
  },

  convertBlankSupport: (itemId: string, supportId: string) => {
    let persistedState: GameState | null = null
    set(state => {
      const item = state.inventory.items.find(i => i.id === itemId)
      const support = SUPPORTS[supportId]
      if (!item || !isBlankSupport(item) || !support) return state
      if (state.character.ownedGems.some(gem => gem.id === supportId)) return state

      const nextState = {
        ...state,
        inventory: { ...state.inventory, items: state.inventory.items.filter(i => i.id !== itemId) },
        character: {
          ...state.character,
          ownedGems: [...state.character.ownedGems, { id: supportId, level: 1, xp: 0 }],
        },
      }
      persistedState = nextState
      return nextState
    })
    // Converting is an explicit reward claim; persist it immediately rather than
    // waiting for the randomized autosave window.
    if (persistedState) saveGame(persistedState)
  },

  discardItem: (itemId: string) => {
    let persistedState: GameState | null = null
    set(state => {
      const item = state.inventory.items.find(candidate => candidate.id === itemId)
      if (!item || !isNonEquipmentItem(item)) return state
      const nextState = {
        ...state,
        inventory: { ...state.inventory, items: state.inventory.items.filter(candidate => candidate.id !== itemId) },
      }
      persistedState = nextState
      return nextState
    })
    if (persistedState) saveGame(persistedState)
  },

  claimGemItem: (itemId: string) => {
    let persistedState: GameState | null = null
    set(state => {
      const item = state.inventory.items.find(i => i.id === itemId)
      if (!item || (item.kind !== 'skillGem' && item.kind !== 'supportGem') || !item.gemId) return state
      const catalog = item.kind === 'skillGem' ? SKILLS : SUPPORTS
      if (!catalog[item.gemId]) return state

      const nextState = {
        ...state,
        inventory: { ...state.inventory, items: state.inventory.items.filter(i => i.id !== itemId) },
        character: state.character.ownedGems.some(gem => gem.id === item.gemId)
          ? state.character
          : {
              ...state.character,
              ownedGems: [...state.character.ownedGems, { id: item.gemId, level: 1, xp: 0 }],
            },
      }
      persistedState = nextState
      return nextState
    })
    if (persistedState) saveGame(persistedState)
  },

  useCurrency: (itemId: string, currencyId: string) => {
    // Penance is not an item currency — it grants a passive refund point.
    if (currencyId === 'penance') {
      set(state => {
        if ((state.currencies['penance'] || 0) <= 0) return state
        const currencies = { ...state.currencies }
        currencies['penance'] = (currencies['penance'] || 0) - 1
        const character = {
          ...state.character,
          passivePoints: (state.character.passivePoints || 0) + 1,
        }
        return { ...state, currencies, character }
      })
      return
    }

    set(state => {
      if ((state.currencies[currencyId] || 0) <= 0) return state
      const itemIndex = state.inventory.items.findIndex(i => i.id === itemId)
      if (itemIndex === -1) return state
      const item = state.inventory.items[itemIndex]
      if (isNonEquipmentItem(item)) return state
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

  setAutoSellMaxLevel: (maxLevel: number) => {
    set(state => ({
      ...state,
      inventory: {
        ...state.inventory,
        autoSellMaxLevel: normalizeAutoSellMaxLevel(maxLevel),
      },
    }))
  },

  exportSave: () => {
    return exportSaveString(get())
  },

  applyOfflineProgress: (nextState: GameState, summary: OfflineSummary) => {
    const completedActs = nextState.zones.filter(zone => zone.killProgress >= 100).map(zone => zone.act)
    const progressedState = nextState.character.supportSlotCount === supportSlotCountForCompletedActs(completedActs)
      ? nextState
      : {
          ...nextState,
          character: { ...nextState.character, supportSlotCount: supportSlotCountForCompletedActs(completedActs) },
        }
    const stamped = {
      ...progressedState,
      offlineSummary: summary,
      offlineSeconds: 0,
      lastSaveTime: Date.now(),
    }
    set(() => stamped)
    // Persist immediately so the credited offline time is never granted twice
    // if the tab is closed before the next randomized autosave.
    saveGame(stamped)
  },

  dismissOfflineProgress: () => {
    set(state => ({
      ...state,
      offlineSummary: null,
      offlineSeconds: 0,
    }))
  },

  importSave: (data: string) => {
    const loaded = importSave(data)
    if (loaded) {
      set({ ...loaded, inventory: normalizeInventory(loaded.inventory) })
    }
  },

  resetGame: () => {
    set({ ...createInitialState('warlord'), gamePhase: 'class-select' })
  },

  advanceToNextAct: () => {
    set(state => {
      const active = state.zones.find(z => z.id === state.activeZoneId)
      if (!active) return state
      const actZones = state.zones.filter(z => z.act === active.act)
      if (!actZones.every(z => z.killProgress >= 100)) return state
      const nextAct = active.act + 1
      const nextZonesList = state.zones.filter(z => z.act === nextAct).sort((a, b) => a.level - b.level)
      if (nextZonesList.length === 0) return state
      const target = nextZonesList[0]
      const zones = state.zones.map(z => (z.id === target.id ? { ...z, unlocked: true } : z))
      return { ...state, activeZoneId: target.id, zones, combat: createInitialCombat(target) }
    })
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
      if (!ascendancy) return state
      const freeNodes = ascendancy.nodes.filter(n => n.free)
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
      if (!state.character.ascendancyId) return state
      const ascendancy = ASCENDANCIES[state.character.ascendancyId]
      const node = ascendancy?.nodes.find(candidate => candidate.id === nodeId)
      if (!node?.choices?.some(choice => choice.id === choiceId)) return state
      const baseChar = { ...state.character, keystoneChoices: { ...state.character.keystoneChoices, [nodeId]: choiceId } }
      const character = recalcCharacter(state, baseChar)
      return { ...state, character }
    })
  },

  equipSkill: (skillId: string, slotIndex: number) => {
    set(state => {
      const equippedSkills = [...state.character.equippedSkills]
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 4) return state
      if (!SKILLS[skillId] || !state.character.ownedGems.some(gem => gem.id === skillId)) return state
      equippedSkills[slotIndex] = { skillId, supportIds: [], cooldownRemaining: 0, hitCounter: 0 }
      const character = recalcCharacter(state, { ...state.character, equippedSkills })
      return { ...state, character }
    })
  },

  unequipSkill: (slotIndex: number) => {
    set(state => {
      const equippedSkills = [...state.character.equippedSkills]
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 4) return state
      if (!equippedSkills[slotIndex]?.skillId) return state
      equippedSkills[slotIndex] = { skillId: '', supportIds: [], cooldownRemaining: 0, hitCounter: 0 }
      const character = recalcCharacter(state, { ...state.character, equippedSkills })
      return { ...state, character }
    })
  },

  equipSupport: (supportId: string, skillSlotIndex: number, supportSlotIndex?: number) => {
    set(state => {
      const equippedSkills = [...state.character.equippedSkills]
      if (!Number.isInteger(skillSlotIndex) || skillSlotIndex < 0 || skillSlotIndex >= 4) return state
      if (supportSlotIndex !== undefined && (!Number.isInteger(supportSlotIndex) || supportSlotIndex < 0)) return state
      const skill = equippedSkills[skillSlotIndex]
      const skillData = skill ? SKILLS[skill.skillId] : undefined
      const support = SUPPORTS[supportId]
      if (!skill || !skillData || !support) return state
      if (!state.character.ownedGems.some(gem => gem.id === supportId)) return state
      if (!support.allowedTags.some(tag => skillData.tags.includes(tag))) return state

      // A picker opened from an occupied slot replaces that support. Clicking
      // any empty slot appends to the first open position so the compact saved
      // array cannot strand a support behind an earlier empty slot.
      const requestedIndex = supportSlotIndex ?? skill.supportIds.length
      if (requestedIndex < 0 || requestedIndex >= state.character.supportSlotCount) return state
      if (skill.supportIds.includes(supportId)) return state

      const targetIndex = requestedIndex < skill.supportIds.length
        ? requestedIndex
        : skill.supportIds.length
      const supportIds = [...skill.supportIds]
      supportIds[targetIndex] = supportId
      equippedSkills[skillSlotIndex] = { ...skill, supportIds }
      const character = recalcCharacter(state, { ...state.character, equippedSkills })
      return { ...state, character }
    })
  },

  unequipSupport: (skillSlotIndex: number, supportSlotIndex: number) => {
    set(state => {
      const equippedSkills = [...state.character.equippedSkills]
      if (!Number.isInteger(skillSlotIndex) || skillSlotIndex < 0 || skillSlotIndex >= 4) return state
      if (!Number.isInteger(supportSlotIndex) || supportSlotIndex < 0) return state
      const skill = equippedSkills[skillSlotIndex]
      if (!skill || supportSlotIndex >= skill.supportIds.length) return state
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
      const trialMember = {
        id: `${monster.id}_trial_0`,
        monster,
        currentLife: monster.maxLife,
        maxLife: monster.maxLife,
        slot: 0,
      }
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
        packSizeRemaining: 0,
        packNamedEliteCount: 0,
        currentPack: [trialMember],
        delayedDamageQueue: [],
        ailments: {},
        virulent: { stacks: {}, septicemiaMultiplier: {}, calcifyAccumulator: {}, slow: {}, patientZeroTarget: null },
        monsterDebuffs: {},
        plaguewindCarryover: [],
        packDamageCarryover: 0,
        damageTakenByType: { physical: 0, fire: 0, cold: 0, lightning: 0, chaos: 0 },
        deathSummary: null,
      }
      return { ...state, activeTrial: trial, previousZoneId: state.activeZoneId, combat }
    })
  },

  returnToPreviousZone: () => {
    set(state => {
      if (!state.previousZoneId) return state
      const zone = state.zones.find(z => z.id === state.previousZoneId)
      if (!zone) return state
      return {
        ...state,
        nexus: { ...state.nexus, activeMapId: null, packsCleared: 0 },
        activeZoneId: zone.id,
        previousZoneId: null,
        activeTrial: null,
        combat: createInitialCombat(zone),
      }
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

  devSpawnTestPack: () => {
    set(state => {
      const base = MONSTERS['tidecaller'] ?? state.combat.monster
      if (!base) return state
      const makeMember = (slot: number, name: string, rarity: 'normal' | 'magic' | 'rare', isNamedElite = false) => {
        const maxLife = Math.max(50, base.maxLife)
        const monster = { ...base, name, rarity, isNamedElite }
        return {
          id: `test_${slot}_${Date.now()}`,
          slot,
          monster,
          currentLife: maxLife,
          maxLife,
        }
      }
      const pack = [
        makeMember(0, 'Normal Tidecaller', 'normal'),
        makeMember(1, 'Magic Tidecaller', 'magic'),
        makeMember(2, 'Rare Tidecaller', 'rare'),
        makeMember(3, 'Salt-Crowned Revenant', 'magic', true),
      ]
      const combat = {
        ...state.combat,
        currentPack: pack,
        monster: pack[0].monster,
        monsterLife: pack[0].currentLife,
      }
      return { ...state, combat }
    })
  },
}))
