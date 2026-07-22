import type { Attributes, Resistances } from './game.ts'

export type ItemSlot =
  | 'weapon'
  | 'offhand'
  | 'helmet'
  | 'body'
  | 'gloves'
  | 'boots'
  | 'belt'
  | 'amulet'
  | 'ring'

export type ItemRarity = 'normal' | 'magic' | 'rare' | 'unique'

export const RARITY_COLORS: Record<ItemRarity, string> = {
  normal: '#c8c8c8',
  magic: '#6a8fd8',
  rare: '#d9c95a',
  unique: '#c96a2e',
}

export function rarityTextClass(rarity: ItemRarity): string {
  switch (rarity) {
    case 'magic': return 'text-blue-400'
    case 'rare': return 'text-yellow-400'
    case 'unique': return 'text-orange-400'
    default: return 'text-gray-300'
  }
}

export function rarityBorderClass(rarity: ItemRarity): string {
  switch (rarity) {
    case 'magic': return 'border-blue-500/50'
    case 'rare': return 'border-yellow-500/50'
    case 'unique': return 'border-orange-500/50'
    default: return 'border-gray-600'
  }
}


export interface Affix {
  id: string
  type: 'prefix' | 'suffix'
  name: string
  tier: number
  stat: string
  minValue: number
  maxValue: number
  value: number
}

export interface BaseItem {
  id: string
  name: string
  slot: ItemSlot
  baseLevel: number
  // Offensive (weapons)
  physicalDamageMin?: number
  physicalDamageMax?: number
  attackRate?: number
  // Defensive (armour)
  armour?: number
  evasion?: number
  energyShield?: number
  // Life / mana
  life?: number
  // Implicit mods (unique items later)
  implicit?: Affix[]
}

export interface Item {
  id: string
  baseId: string
  name: string
  slot: ItemSlot
  rarity: ItemRarity
  itemLevel: number
  affixes: Affix[]
  // Computed from base + affixes
  physicalDamageMin: number
  physicalDamageMax: number
  flatLightningDamageMin: number
  flatLightningDamageMax: number
  flatColdDamageMin: number
  flatColdDamageMax: number
  attackRate: number
  armour: number
  evasion: number
  energyShield: number
  life: number
  // Ailment / proc chances (combat effects implemented later)
  chanceToBleed: number
  chanceToShock: number
  chanceToInflictDespair: number
  // Utility
  movementSpeed: number
  increasedArmourPercent: number
  increasedEvasionPercent: number
  increasedAccuracyPercent: number
  increasedEsPercent: number
  increasedMaxLifePercent: number
  damageVsBossesPercent: number
  goldFindPercent: number
}

export interface Equipment {
  weapon: Item | null
  offhand: Item | null
  helmet: Item | null
  body: Item | null
  gloves: Item | null
  boots: Item | null
  belt: Item | null
  amulet: Item | null
  ring1: Item | null
  ring2: Item | null
}

export interface AffixDefinition {
  id: string
  type: 'prefix' | 'suffix'
  name: string
  stat: string
  // Which slots this affix can roll on
  allowedSlots: ItemSlot[]
  // Required item level for each tier (T5 to T1)
  tiers: { level: number; min: number; max: number }[]
}

export interface Currency {
  id: string
  name: string
  description: string
  color: string
}

export interface InventoryState {
  items: Item[]
  maxSize: number
  autoSellNormal: boolean
  autoSellMagic: boolean
  autoSellMaxLevel: number
}

export interface EquipmentBonus {
  attributes: Attributes
  life: number
  energyShield: number
  armour: number
  evasion: number
  accuracy: number
  attackRate: number
  physicalDamageMin: number
  physicalDamageMax: number
  flatLightningDamageMin: number
  flatLightningDamageMax: number
  flatColdDamageMin: number
  flatColdDamageMax: number
  criticalChance: number
  criticalMultiplier: number
  chanceToBleed: number
  chanceToShock: number
  chanceToInflictDespair: number
  movementSpeed: number
  increasedArmourPercent: number
  increasedEvasionPercent: number
  increasedAccuracyPercent: number
  increasedEsPercent: number
  increasedMaxLifePercent: number
  damageVsBossesPercent: number
  goldFindPercent: number
  resistances: Resistances
}
