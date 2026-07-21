import { create } from 'zustand'
import type { Character, CombatState, GameState, Monster, Zone } from '../types/game.ts'
import type { Equipment, InventoryState, Item } from '../types/item.ts'
import { CLASSES } from '../data/classes.ts'
import { ZONES, MONSTERS } from '../data/zones.ts'
import { TICKS_PER_SECOND } from '../data/balance.ts'
import { processCombatTick } from '../systems/combat.ts'
import { addExperience } from '../systems/xp.ts'
import { saveGame, exportSave as exportSaveString, importSave } from '../systems/save.ts'
import { BASE_ITEMS, STARTER_ITEMS } from '../data/items.ts'
import { createItem, dropItem, applyOrb, recalculateCharacterFromEquipment } from '../systems/items.ts'

const SAVE_INTERVAL_TICKS = TICKS_PER_SECOND * 30

function createDefaultCharacter(classId: string): Character {
  const gameClass = CLASSES[classId]
  const life = gameClass.baseLife
  return {
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
    attackRate: 1.0,
    basePhysicalDamageMin: 2,
    basePhysicalDamageMax: 4,
    criticalChance: 0.05,
    criticalMultiplier: 1.5,
    isAlive: true,
    respawnTimer: 0,
    allocatedNodes: [],
  }
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
  const monsterTemplate = MONSTERS[zone.monsterId]
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
  }
}

function createStarterEquipment(): Equipment {
  const equipment = createInitialEquipment()
  for (const baseId of STARTER_ITEMS) {
    const base = BASE_ITEMS[baseId]
    const item = createItem(baseId, 1, 'normal')
    if (base.slot === 'ring' && !equipment.ring1) equipment.ring1 = item
    else if (base.slot === 'ring') equipment.ring2 = item
    else (equipment as unknown as Record<string, Item | null>)[base.slot] = item
  }
  return equipment
}

export function createInitialState(): GameState {
  const zones = ZONES.map(z => ({ ...z }))
  const activeZoneId = zones[0].id
  const equipment = createStarterEquipment()
  const character = createDefaultCharacter('brute')
  const recalculated = recalculateCharacterFromEquipment(character, equipment)
  return {
    character: { ...recalculated, life: recalculated.maxLife, energyShield: recalculated.maxEnergyShield },
    zones,
    activeZoneId,
    inventory: createInitialInventory(),
    equipment,
    currencies: createInitialCurrencies(),
    combat: createInitialCombat(zones[0]),
    lastSaveTime: Date.now(),
    saveVersion: 1,
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
  exportSave: () => string
  importSave: (data: string) => void
  resetGame: () => void
}

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  ...createInitialState(),

  tick: () => {
    set(state => {
      const zone = state.zones.find(z => z.id === state.activeZoneId)
      if (!zone) return state

      const result = processCombatTick(state.character, state.combat)
      let character = result.character
      let combat = result.combat
      let currencies = { ...state.currencies }
      let zones = state.zones
      let inventory = { ...state.inventory }
      let equipment = state.equipment

      if (result.goldEarned > 0) {
        currencies['gold'] = (currencies['gold'] || 0) + result.goldEarned
      }

      if (result.xpEarned > 0) {
        character = addExperience(character, result.xpEarned)

        // Drop item on kill
        const dropped = dropItem(zone.level)
        if (dropped) {
          const isAutoSell =
            (dropped.rarity === 'normal' && inventory.autoSellNormal && dropped.itemLevel <= character.level) ||
            (dropped.rarity === 'magic' && inventory.autoSellMagic && dropped.itemLevel <= character.level)

          if (isAutoSell) {
            currencies['gold'] = (currencies['gold'] || 0) + Math.max(1, dropped.itemLevel * 2)
          } else if (inventory.items.length < inventory.maxSize) {
            inventory.items = [...inventory.items, dropped]
          }
        }

        // Currency drop chance
        if (Math.random() < 0.1) {
          const currencyPool = ['awakening', 'mutation', 'cleansing']
          const currencyId = currencyPool[Math.floor(Math.random() * currencyPool.length)]
          currencies[currencyId] = (currencies[currencyId] || 0) + 1
        }
      }

      // Update zone progress on monster kill
      if (result.xpEarned > 0 && zone.killProgress < 100) {
        zones = zones.map(w => {
          if (w.id !== zone.id) return w
          const newProgress = Math.min(100, w.killProgress + 100 / w.killsRequired)
          return { ...w, killProgress: newProgress }
        })

        const currentIndex = zones.findIndex(w => w.id === zone.id)
        if (zones[currentIndex].killProgress >= 100 && currentIndex < zones.length - 1) {
          zones = zones.map((w, idx) => (idx === currentIndex + 1 ? { ...w, unlocked: true } : w))
        }
      }

      // Recalculate character from equipment
      character = recalculateCharacterFromEquipment(character, equipment)
      character = { ...character, life: Math.min(character.life, character.maxLife), energyShield: Math.min(character.energyShield, character.maxEnergyShield) }

      const shouldSave = Math.random() < 1 / SAVE_INTERVAL_TICKS
      if (shouldSave) {
        saveGame({ ...state, character, combat, currencies, zones, inventory })
      }

      return { ...state, character, combat, currencies, zones, inventory }
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
      const character = recalculateCharacterFromEquipment(state.character, equipment)
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
      const character = recalculateCharacterFromEquipment(state.character, equipment)
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
    set(createInitialState())
  },
}))
