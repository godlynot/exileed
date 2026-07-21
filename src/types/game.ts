import type { Equipment, InventoryState, Item } from './item.ts'

export interface Attributes {
  strength: number
  dexterity: number
  intelligence: number
}

export interface Resistances {
  fire: number
  cold: number
  lightning: number
  chaos: number
}

export interface CharacterClass {
  id: string
  name: string
  description: string
  baseAttributes: Attributes
  baseLife: number
  baseEnergyShield: number
  baseAccuracy: number
  baseEvasion: number
}

export interface Character {
  name: string
  classId: string
  level: number
  experience: number
  experienceToNext: number
  life: number
  maxLife: number
  energyShield: number
  maxEnergyShield: number
  attributes: Attributes
  resistances: Resistances
  accuracy: number
  evasion: number
  // Offense
  attackRate: number // attacks per second
  basePhysicalDamageMin: number
  basePhysicalDamageMax: number
  criticalChance: number
  criticalMultiplier: number
  // State
  isAlive: boolean
  respawnTimer: number // ticks remaining
  allocatedNodes: string[]
}

export interface Monster {
  id: string
  name: string
  level: number
  life: number
  maxLife: number
  physicalDamageMin: number
  physicalDamageMax: number
  attackRate: number
  accuracy: number
  evasion: number
  experienceReward: number
  goldReward: number
  isBoss: boolean
}

export interface Zone {
  id: string
  name: string
  act: number
  level: number
  monsterId: string
  packSize: number
  killProgress: number // 0-100%
  killsRequired: number
  unlocked: boolean
}

export interface CombatState {
  monster: Monster | null
  monsterLife: number
  lastDamageDealt: number
  lastDamageTaken: number
  combatLog: string[]
  isRespawning: boolean
  respawnTicks: number
}

export interface GameState {
  character: Character
  zones: Zone[]
  activeZoneId: string
  inventory: InventoryState
  equipment: Equipment
  currencies: Record<string, number>
  combat: CombatState
  lastSaveTime: number
  saveVersion: number
}

export interface DroppedItem {
  item: Item
  currency: { type: string; amount: number }
}
