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
  normal: '#b7c0cb',
  magic: '#79a9e8',
  rare: '#e6c15b',
  unique: '#e89054',
}

export function rarityTextClass(rarity: ItemRarity): string {
  switch (rarity) {
    case 'magic': return 'text-blue-300'
    case 'rare': return 'text-[var(--accent-gold)]'
    case 'unique': return 'text-orange-300'
    default: return 'text-[var(--text-secondary)]'
  }
}

export function rarityBorderClass(rarity: ItemRarity): string {
  switch (rarity) {
    case 'magic': return 'border-blue-400/60'
    case 'rare': return 'border-[var(--accent-gold)]/60'
    case 'unique': return 'border-orange-400/60'
    default: return 'border-[var(--border-strong)]'
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
  // Implicit mods used by unique bases.
  implicit?: Affix[]
  isUniqueBase?: boolean
  uniqueDescription?: string
  uniqueName?: string
}

export type ItemKind = 'equipment' | 'blankSupport' | 'skillGem' | 'supportGem'

export function isGemItem(item: Item): boolean {
  return item.kind === 'skillGem' || item.kind === 'supportGem'
}

export function isNonEquipmentItem(item: Item): boolean {
  return item.kind !== undefined && item.kind !== 'equipment'
}

export interface Item {
  id: string
  baseId: string
  name: string
  // Blank supports use the normal inventory/save path but are never equippable gear.
  // Older saves omit this field, which means equipment.
  kind?: ItemKind
  // Gem drops carry the catalog id until the player converts them into owned progress.
  gemId?: string
  slot: ItemSlot
  rarity: ItemRarity
  itemLevel: number
  affixes: Affix[]
  // Unique effects are separate from rolled affixes and do not affect rarity bands.
  implicit?: Affix[]
  uniqueDescription?: string
  // Computed from base + affixes + implicit unique effects
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

export function isBlankSupport(item: Item): boolean {
  return item.kind === 'blankSupport'
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
