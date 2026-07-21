import type { Affix, AffixDefinition, Equipment, EquipmentBonus, Item, ItemRarity, ItemSlot } from '../types/item.ts'
import type { Attributes, Character } from '../types/game.ts'
import { BASE_ITEMS } from '../data/items.ts'
import { ALL_AFFIXES } from '../data/affixes.ts'
import { CLASSES } from '../data/classes.ts'
import { CHARACTER } from '../data/balance.ts'

let itemIdCounter = 0

export function generateItemId(): string {
  return `item_${Date.now()}_${itemIdCounter++}`
}

export function getAvailableTier(def: AffixDefinition, itemLevel: number): number | null {
  // tiers array is T5..T1, find the highest unlocked tier
  for (let i = def.tiers.length - 1; i >= 0; i--) {
    if (itemLevel >= def.tiers[i].level) {
      return i
    }
  }
  return null
}

export function rollAffixValue(def: AffixDefinition, itemLevel: number): Affix | null {
  const tierIndex = getAvailableTier(def, itemLevel)
  if (tierIndex === null) return null
  const tier = def.tiers[tierIndex]
  const value = Math.floor(Math.random() * (tier.max - tier.min + 1)) + tier.min
  return {
    id: `${def.id}_t${tierIndex + 1}`,
    type: def.type,
    name: def.name,
    tier: tierIndex + 1,
    stat: def.stat,
    minValue: tier.min,
    maxValue: tier.max,
    value,
  }
}

export function rollAffixes(slot: ItemSlot, itemLevel: number, count: number): Affix[] {
  const pool = [...ALL_AFFIXES].filter(a => a.allowedSlots.includes(slot))
  if (pool.length === 0) return []

  const prefixes = pool.filter(a => a.type === 'prefix')
  const suffixes = pool.filter(a => a.type === 'suffix')
  const affixes: Affix[] = []

  for (let i = 0; i < count; i++) {
    const isPrefix = i % 2 === 0
    const source = isPrefix ? prefixes : suffixes
    if (source.length === 0) continue
    const def = source[Math.floor(Math.random() * source.length)]
    const affix = rollAffixValue(def, itemLevel)
    if (affix) affixes.push(affix)
  }

  return affixes
}

export function recalculateItem(item: Item): Item {
  const base = BASE_ITEMS[item.baseId]
  if (!base) return item

  const recalculated: Item = {
    ...item,
    physicalDamageMin: base.physicalDamageMin || 0,
    physicalDamageMax: base.physicalDamageMax || 0,
    flatLightningDamageMin: 0,
    flatLightningDamageMax: 0,
    flatColdDamageMin: 0,
    flatColdDamageMax: 0,
    attackRate: base.attackRate || 0,
    armour: base.armour || 0,
    evasion: base.evasion || 0,
    energyShield: base.energyShield || 0,
    life: base.life || 0,
    chanceToBleed: 0,
    chanceToShock: 0,
    chanceToInflictDespair: 0,
    movementSpeed: 0,
    increasedArmourPercent: 0,
    increasedMaxLifePercent: 0,
    damageVsBossesPercent: 0,
    goldFindPercent: 0,
  }

  for (const affix of recalculated.affixes) {
    const value = affix.value
    switch (affix.stat) {
      case 'flatPhysicalDamage':
        recalculated.physicalDamageMin += value
        recalculated.physicalDamageMax += value
        break
      case 'flatLightningDamage':
        recalculated.flatLightningDamageMin += value
        recalculated.flatLightningDamageMax += value
        break
      case 'flatColdDamage':
        recalculated.flatColdDamageMin += value
        recalculated.flatColdDamageMax += value
        break
      case 'flatLife':
        recalculated.life += value
        break
      case 'flatEnergyShield':
        recalculated.energyShield += value
        break
      case 'armour':
        recalculated.armour += value
        break
      case 'evasion':
        recalculated.evasion += value
        break
      case 'attackSpeed':
        recalculated.attackRate += value / 100
        break
      case 'criticalChance':
        // stored as raw chance on item, not used directly
        break
      case 'criticalMultiplier':
        break
      case 'chanceToBleed':
        recalculated.chanceToBleed += value / 100
        break
      case 'chanceToShock':
        recalculated.chanceToShock += value / 100
        break
      case 'chanceToInflictDespair':
        recalculated.chanceToInflictDespair += value / 100
        break
      case 'accuracy':
        // accuracy is a character-only bonus
        break
      case 'movementSpeed':
        recalculated.movementSpeed += value / 100
        break
      case 'increasedArmourPercent':
        recalculated.increasedArmourPercent += value
        break
      case 'increasedMaxLifePercent':
        recalculated.increasedMaxLifePercent += value
        break
      case 'damageVsBossesPercent':
        recalculated.damageVsBossesPercent += value
        break
      case 'goldFindPercent':
        recalculated.goldFindPercent += value
        break
    }
  }

  return recalculated
}

export function createItem(baseId: string, itemLevel: number, rarity: ItemRarity): Item {
  const base = BASE_ITEMS[baseId]
  if (!base) throw new Error(`Unknown base item ${baseId}`)

  let affixCount = 0
  if (rarity === 'magic') affixCount = Math.random() < 0.5 ? 1 : 2
  if (rarity === 'rare') affixCount = 4

  const affixes = rarity === 'normal' ? [] : rollAffixes(base.slot, itemLevel, affixCount)

  const item: Item = {
    id: generateItemId(),
    baseId,
    name: base.name,
    slot: base.slot,
    rarity,
    itemLevel,
    affixes,
    physicalDamageMin: base.physicalDamageMin || 0,
    physicalDamageMax: base.physicalDamageMax || 0,
    flatLightningDamageMin: 0,
    flatLightningDamageMax: 0,
    flatColdDamageMin: 0,
    flatColdDamageMax: 0,
    attackRate: base.attackRate || 0,
    armour: base.armour || 0,
    evasion: base.evasion || 0,
    energyShield: base.energyShield || 0,
    life: base.life || 0,
    chanceToBleed: 0,
    chanceToShock: 0,
    chanceToInflictDespair: 0,
    movementSpeed: 0,
    increasedArmourPercent: 0,
    increasedMaxLifePercent: 0,
    damageVsBossesPercent: 0,
    goldFindPercent: 0,
  }

  return recalculateItem(item)
}

export function getItemDisplayName(item: Item): string {
  if (item.rarity === 'normal') return item.name
  return `${rarityPrefix(item.rarity)} ${item.name}`
}

function rarityPrefix(rarity: ItemRarity): string {
  switch (rarity) {
    case 'magic': return 'Enchanted'
    case 'rare': return 'King'
    case 'unique': return 'Legendary'
    default: return ''
  }
}

export function calculateEquipmentBonus(equipment: Equipment): EquipmentBonus {
  const bonus: EquipmentBonus = {
    attributes: { strength: 0, dexterity: 0, intelligence: 0 },
    life: 0,
    energyShield: 0,
    armour: 0,
    evasion: 0,
    accuracy: 0,
    attackRate: 0,
    physicalDamageMin: 0,
    physicalDamageMax: 0,
    flatLightningDamageMin: 0,
    flatLightningDamageMax: 0,
    flatColdDamageMin: 0,
    flatColdDamageMax: 0,
    criticalChance: 0,
    criticalMultiplier: 0,
    chanceToBleed: 0,
    chanceToShock: 0,
    chanceToInflictDespair: 0,
    movementSpeed: 0,
    increasedArmourPercent: 0,
    increasedMaxLifePercent: 0,
    damageVsBossesPercent: 0,
    goldFindPercent: 0,
    resistances: { fire: 0, cold: 0, lightning: 0, chaos: 0 },
  }

  const items = Object.values(equipment).filter((item): item is Item => item !== null)

  for (const item of items) {
    bonus.physicalDamageMin += item.physicalDamageMin
    bonus.physicalDamageMax += item.physicalDamageMax
    bonus.attackRate += item.attackRate
    bonus.armour += item.armour
    bonus.evasion += item.evasion
    bonus.energyShield += item.energyShield
    bonus.life += item.life

    for (const affix of item.affixes) {
      const stat = affix.stat
      const value = affix.value

      switch (stat) {
        case 'flatPhysicalDamage':
          bonus.physicalDamageMin += value
          bonus.physicalDamageMax += value
          break
        case 'flatLightningDamage':
          bonus.flatLightningDamageMin += value
          bonus.flatLightningDamageMax += value
          break
        case 'flatColdDamage':
          bonus.flatColdDamageMin += value
          bonus.flatColdDamageMax += value
          break
        case 'increasedPhysicalDamage':
          // M3/M4: handle increased modifiers multiplicatively
          break
        case 'flatLife':
          bonus.life += value
          break
        case 'flatEnergyShield':
          bonus.energyShield += value
          break
        case 'armour':
          bonus.armour += value
          break
        case 'strength':
          bonus.attributes.strength += value
          break
        case 'dexterity':
          bonus.attributes.dexterity += value
          break
        case 'intelligence':
          bonus.attributes.intelligence += value
          break
        case 'attackSpeed':
          bonus.attackRate += value / 100
          break
        case 'criticalChance':
          bonus.criticalChance += value / 100
          break
        case 'criticalMultiplier':
          bonus.criticalMultiplier += value / 100
          break
        case 'fireResistance':
          bonus.resistances.fire += value / 100
          break
        case 'coldResistance':
          bonus.resistances.cold += value / 100
          break
        case 'lightningResistance':
          bonus.resistances.lightning += value / 100
          break
        case 'chanceToBleed':
          bonus.chanceToBleed += value / 100
          break
        case 'chanceToShock':
          bonus.chanceToShock += value / 100
          break
        case 'chanceToInflictDespair':
          bonus.chanceToInflictDespair += value / 100
          break
        case 'accuracy':
          bonus.accuracy += value
          break
        case 'movementSpeed':
          bonus.movementSpeed += value / 100
          break
        case 'increasedArmourPercent':
          bonus.increasedArmourPercent += value
          break
        case 'increasedMaxLifePercent':
          bonus.increasedMaxLifePercent += value
          break
        case 'damageVsBossesPercent':
          bonus.damageVsBossesPercent += value
          break
        case 'goldFindPercent':
          bonus.goldFindPercent += value
          break
      }
    }
  }

  return bonus
}

export function recalculateCharacterFromEquipment(character: Character, equipment: Equipment): Character {
  const gameClass = CLASSES[character.classId]
  const bonus = calculateEquipmentBonus(equipment)

  const attributes: Attributes = {
    strength: gameClass.baseAttributes.strength + bonus.attributes.strength,
    dexterity: gameClass.baseAttributes.dexterity + bonus.attributes.dexterity,
    intelligence: gameClass.baseAttributes.intelligence + bonus.attributes.intelligence,
  }

  const flatMaxLife = gameClass.baseLife + attributes.strength * CHARACTER.LIFE_PER_STRENGTH + bonus.life
  const maxLife = Math.floor(flatMaxLife * (1 + bonus.increasedMaxLifePercent / 100))
  const maxEnergyShield = Math.floor(
    gameClass.baseEnergyShield + attributes.intelligence * CHARACTER.ES_PER_INTELLIGENCE + bonus.energyShield,
  )

  const weapon = equipment.weapon
  const baseWeaponMin = weapon ? weapon.physicalDamageMin : 0
  const baseWeaponMax = weapon ? weapon.physicalDamageMax : 0

  const attackRate = (weapon ? weapon.attackRate : 1.0) + bonus.attackRate

  return {
    ...character,
    attributes,
    maxLife,
    maxEnergyShield,
    life: Math.min(character.life, maxLife),
    energyShield: Math.min(character.energyShield, maxEnergyShield),
    accuracy: gameClass.baseAccuracy + bonus.accuracy,
    evasion: gameClass.baseEvasion + bonus.evasion + bonus.armour, // simple armour adds evasion for now
    attackRate: Math.max(0.2, attackRate),
    basePhysicalDamageMin: baseWeaponMin + bonus.physicalDamageMin,
    basePhysicalDamageMax: baseWeaponMax + bonus.physicalDamageMax,
    criticalChance: clamp(character.criticalChance + bonus.criticalChance, 0, 0.75),
    criticalMultiplier: character.criticalMultiplier + bonus.criticalMultiplier,
    resistances: {
      fire: clamp(character.resistances.fire + bonus.resistances.fire, -0.75, 0.75),
      cold: clamp(character.resistances.cold + bonus.resistances.cold, -0.75, 0.75),
      lightning: clamp(character.resistances.lightning + bonus.resistances.lightning, -0.75, 0.75),
      chaos: character.resistances.chaos,
    },
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// Crafting orb behaviors
export function applyOrb(item: Item, currencyId: string): Item {
  let result = item
  switch (currencyId) {
    case 'awakening':
      if (item.rarity !== 'normal') return item
      result = { ...item, rarity: 'magic', affixes: rollAffixes(item.slot, item.itemLevel, Math.random() < 0.5 ? 1 : 2) }
      break
    case 'mutation':
      if (item.rarity !== 'magic') return item
      result = { ...item, affixes: rollAffixes(item.slot, item.itemLevel, Math.random() < 0.5 ? 1 : 2) }
      break
    case 'sovereignty':
      if (item.rarity !== 'magic') return item
      result = { ...item, rarity: 'rare', affixes: [...item.affixes, ...rollAffixes(item.slot, item.itemLevel, 1)] }
      break
    case 'genesis':
      if (item.rarity !== 'normal') return item
      result = { ...item, rarity: 'rare', affixes: rollAffixes(item.slot, item.itemLevel, 4) }
      break
    case 'entropy':
      if (item.rarity !== 'rare') return item
      result = { ...item, affixes: rollAffixes(item.slot, item.itemLevel, 4) }
      break
    case 'triumph':
      if (item.rarity !== 'rare' || item.affixes.length >= 6) return item
      result = { ...item, affixes: [...item.affixes, ...rollAffixes(item.slot, item.itemLevel, 1)] }
      break
    case 'void_orb':
      if (item.affixes.length === 0) return item
      result = { ...item, affixes: item.affixes.filter((_, i) => i !== Math.floor(Math.random() * item.affixes.length)) }
      break
    case 'cleansing':
      result = { ...item, rarity: 'normal', affixes: [] }
      break
    default:
      return item
  }
  return recalculateItem(result)
}

export function determineDropRarity(zoneLevel: number): ItemRarity {
  const roll = Math.random()
  const rareChance = 0.03 + zoneLevel * 0.002
  const magicChance = 0.15 + zoneLevel * 0.005
  if (roll < rareChance) return 'rare'
  if (roll < rareChance + magicChance) return 'magic'
  return 'normal'
}

export function dropItem(zoneLevel: number): Item | null {
  const baseIds = Object.keys(BASE_ITEMS)
  if (baseIds.length === 0) return null
  const baseId = baseIds[Math.floor(Math.random() * baseIds.length)]
  const rarity = determineDropRarity(zoneLevel)
  return createItem(baseId, zoneLevel, rarity)
}
