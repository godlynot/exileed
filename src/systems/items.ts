import type { Affix, AffixDefinition, Equipment, EquipmentBonus, Item, ItemRarity, ItemSlot } from '../types/item.ts'
import type { Attributes, Character, ClassId } from '../types/game.ts'
import { BASE_ITEMS } from '../data/items.ts'
import { ALL_AFFIXES } from '../data/affixes.ts'
import { CLASSES } from '../data/classes.ts'
import { CHARACTER, DAMAGE, RECOVERY, monsterScalingMultiplier } from '../data/balance.ts'

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

function getTierWindow(def: AffixDefinition, itemLevel: number): { lower: number; upper: number } {
  let lower = 0
  for (let i = def.tiers.length - 1; i >= 0; i--) {
    if (itemLevel >= def.tiers[i].level) {
      lower = i
      break
    }
  }
  return { lower, upper: Math.min(lower + 1, def.tiers.length - 1) }
}

export function rollAffixValue(def: AffixDefinition, itemLevel: number): Affix | null {
  if (def.tiers.length === 0) return null

  const { lower: lowerIndex, upper: upperIndex } = getTierWindow(def, itemLevel)
  const lower = def.tiers[lowerIndex]
  const upper = def.tiers[upperIndex]

  // If we're at the top tier, roll within it directly.
  if (lowerIndex === upperIndex) {
    const value = Math.floor(Math.random() * (upper.max - upper.min + 1)) + upper.min
    return {
      id: `${def.id}_t${upperIndex + 1}`,
      type: def.type,
      name: def.name,
      tier: upperIndex + 1,
      stat: def.stat,
      minValue: upper.min,
      maxValue: upper.max,
      value,
    }
  }

  // Normalized progress through the tier window, eased so values accelerate as
  // they approach the next act breakpoint (bigger per-act jumps).
  let progress = 0
  if (upper.level > lower.level) {
    progress = (itemLevel - lower.level) / (upper.level - lower.level)
  }
  progress = Math.pow(progress, 0.7)

  const min = Math.floor(lower.min + (upper.min - lower.min) * progress)
  const max = Math.floor(lower.max + (upper.max - lower.max) * progress)
  const value = Math.floor(Math.random() * (max - min + 1)) + min

  return {
    id: `${def.id}_t${lowerIndex + 1}`,
    type: def.type,
    name: def.name,
    tier: lowerIndex + 1,
    stat: def.stat,
    minValue: min,
    maxValue: max,
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
  // Gear base stats scale with the same act curve as monsters so a level 90
  // weapon/armour is meaningfully better than a level 1 weapon/armour.
  const levelMultiplier = monsterScalingMultiplier(item.itemLevel)

  const recalculated: Item = {
    ...item,
    physicalDamageMin: Math.floor((base.physicalDamageMin || 0) * levelMultiplier),
    physicalDamageMax: Math.floor((base.physicalDamageMax || 0) * levelMultiplier),
    flatLightningDamageMin: 0,
    flatLightningDamageMax: 0,
    flatColdDamageMin: 0,
    flatColdDamageMax: 0,
    attackRate: base.attackRate || 0,
    armour: Math.floor((base.armour || 0) * levelMultiplier),
    evasion: Math.floor((base.evasion || 0) * levelMultiplier),
    energyShield: Math.floor((base.energyShield || 0) * levelMultiplier),
    life: Math.floor((base.life || 0) * levelMultiplier),
    chanceToBleed: 0,
    chanceToShock: 0,
    chanceToInflictDespair: 0,
    movementSpeed: 0,
    increasedArmourPercent: 0,
    increasedEvasionPercent: 0,
    increasedAccuracyPercent: 0,
    increasedEsPercent: 0,
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
    increasedEvasionPercent: 0,
    increasedAccuracyPercent: 0,
    increasedEsPercent: 0,
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
    increasedEvasionPercent: 0,
    increasedAccuracyPercent: 0,
    increasedEsPercent: 0,
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
      case 'increasedEvasionPercent':
        bonus.increasedEvasionPercent += value
        break
      case 'increasedAccuracyPercent':
        bonus.increasedAccuracyPercent += value
        break
      case 'increasedEsPercent':
        bonus.increasedEsPercent += value
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
  const gameClass = CLASSES[character.classId as ClassId]
  const bonus = calculateEquipmentBonus(equipment)
  // Character base power scales gently with level. Gear power scales with item
  // level via recalculateItem, so finding higher-level gear is what matters.
  const characterLevelMult = 1 + (character.level - 1) * 0.05

  const attributes: Attributes = {
    strength: gameClass.baseAttributes.strength + bonus.attributes.strength,
    dexterity: gameClass.baseAttributes.dexterity + bonus.attributes.dexterity,
    intelligence: gameClass.baseAttributes.intelligence + bonus.attributes.intelligence,
  }

  const levelBonusLife = (character.level - 1) * 6
  const levelBonusES = (character.level - 1) * 6
  // Gear life/ES values now scale with their own item level, so we no longer
  // multiply them by the character-level monster curve.
  const flatMaxLife = gameClass.baseLife + attributes.strength * CHARACTER.LIFE_PER_STRENGTH + bonus.life + levelBonusLife
  const maxLife = Math.floor(flatMaxLife * (1 + bonus.increasedMaxLifePercent / 100))
  const maxEnergyShield = Math.floor(
    (gameClass.baseEnergyShield + attributes.intelligence * CHARACTER.ES_PER_INTELLIGENCE + bonus.energyShield + levelBonusES) *
    (1 + bonus.increasedEsPercent / 100),
  )

  const weapon = equipment.weapon
  const baseWeaponMin = weapon ? weapon.physicalDamageMin : 0
  const baseWeaponMax = weapon ? weapon.physicalDamageMax : 0

  // Attribute-derived bonuses
  const strBuckets = Math.floor(attributes.strength / 10)
  const dexBuckets = Math.floor(attributes.dexterity / 10)
  const intBuckets = Math.floor(attributes.intelligence / 10)

  const increasedMeleeDamage = strBuckets * CHARACTER.ATTRIBUTE_BONUS.STR_MELEE_DAMAGE_PERCENT / 100
  const increasedEvasion = dexBuckets * CHARACTER.ATTRIBUTE_BONUS.DEX_EVASION_PERCENT / 100
  const increasedSpellDamage = intBuckets * CHARACTER.ATTRIBUTE_BONUS.INT_SPELL_DAMAGE_PERCENT / 100

  const accuracy = (gameClass.baseAccuracy + character.level * 15 + attributes.dexterity * CHARACTER.ACCURACY_PER_DEXTERITY + bonus.accuracy) *
    (1 + bonus.increasedAccuracyPercent / 100)

  const armour = Math.floor(bonus.armour * (1 + bonus.increasedArmourPercent / 100))
  const evasion = Math.floor((gameClass.baseEvasion + bonus.evasion) *
    (1 + bonus.increasedEvasionPercent / 100 + increasedEvasion))

  const increasedAttackSpeed = bonus.attackRate // already in attacks/sec from affixes
  const attackRate = (weapon ? weapon.attackRate : 1.0) * (1 + increasedAttackSpeed)

  // Weapon damage from gear scales with item level. Naked/starter-gear damage
  // gets only a gentle per-level scaling so the character isn't helpless without
  // upgrading equipment.
  const basePhysicalDamageMin = Math.floor((baseWeaponMin + bonus.physicalDamageMin) * characterLevelMult)
  const basePhysicalDamageMax = Math.floor((baseWeaponMax + bonus.physicalDamageMax) * characterLevelMult)

  // Recovery per tick (5 ticks per second)
  const ticksPerSecond = 5
  const lifeRegen = Math.max(0, maxLife * RECOVERY.LIFE_REGEN_PERCENT_PER_SECOND / ticksPerSecond)
  const esRecharge = Math.max(0, maxEnergyShield * RECOVERY.ES_RECHARGE_PERCENT_PER_SECOND / ticksPerSecond)

  return {
    ...character,
    attributes,
    maxLife,
    maxEnergyShield,
    life: Math.min(character.life, maxLife),
    energyShield: Math.min(character.energyShield, maxEnergyShield),
    accuracy,
    evasion,
    armour,
    attackRate: Math.max(0.2, attackRate),
    basePhysicalDamageMin,
    basePhysicalDamageMax,
    criticalChance: clamp(character.criticalChance + bonus.criticalChance, 0, DAMAGE.CRITICAL_CHANCE_CAP),
    criticalMultiplier: character.criticalMultiplier + bonus.criticalMultiplier,
    increasedPhysicalDamage: increasedMeleeDamage,
    morePhysicalDamage: 1,
    increasedSpellDamage: increasedSpellDamage,
    moreSpellDamage: 1,
    increasedAttackSpeed: 0,
    moreAttackSpeed: 1,
    increasedAccuracy: 0,
    lifeRegen,
    esRecharge,
    special: {},
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

export interface DropModifiers {
  rarityBonus?: { rare: number; magic: number }
  extraDropChance?: number
}

export function determineDropRarity(zoneLevel: number, modifiers: DropModifiers = {}): ItemRarity {
  const roll = Math.random()
  const bonus = modifiers.rarityBonus ?? { rare: 0, magic: 0 }
  const rareChance = 0.03 + zoneLevel * 0.002 + bonus.rare
  const magicChance = 0.15 + zoneLevel * 0.005 + bonus.magic
  if (roll < rareChance) return 'rare'
  if (roll < rareChance + magicChance) return 'magic'
  return 'normal'
}

export function dropItem(zoneLevel: number, modifiers: DropModifiers = {}): Item | null {
  const baseIds = Object.keys(BASE_ITEMS)
  if (baseIds.length === 0) return null
  const baseId = baseIds[Math.floor(Math.random() * baseIds.length)]
  const rarity = determineDropRarity(zoneLevel, modifiers)
  return createItem(baseId, zoneLevel, rarity)
}
