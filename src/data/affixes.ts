import type { AffixDefinition, ItemSlot } from '../types/item.ts'

function makeAffix(
  id: string,
  type: 'prefix' | 'suffix',
  stat: string,
  name: string,
  allowedSlots: ItemSlot[],
  tiers: { level: number; min: number; max: number }[],
): AffixDefinition {
  return { id, type, stat, name, allowedSlots, tiers }
}

export const PREFIXES: AffixDefinition[] = [
  // Weapon prefixes
  makeAffix('flat_physical_damage', 'prefix', 'flatPhysicalDamage', 'Brutal', ['weapon'], [
    { level: 1, min: 1, max: 3 },
    { level: 10, min: 3, max: 6 },
    { level: 25, min: 6, max: 10 },
    { level: 45, min: 10, max: 16 },
    { level: 70, min: 16, max: 24 },
  ]),
  makeAffix('increased_physical_damage', 'prefix', 'increasedPhysicalDamage', 'Sharpened', ['weapon'], [
    { level: 1, min: 10, max: 20 },
    { level: 15, min: 20, max: 35 },
    { level: 30, min: 35, max: 50 },
    { level: 50, min: 50, max: 70 },
    { level: 75, min: 70, max: 90 },
  ]),
  // Life prefixes
  makeAffix('flat_life', 'prefix', 'flatLife', 'Vital', ['helmet', 'body', 'gloves', 'boots', 'belt', 'amulet', 'ring'], [
    { level: 1, min: 5, max: 10 },
    { level: 10, min: 10, max: 20 },
    { level: 25, min: 20, max: 35 },
    { level: 45, min: 35, max: 55 },
    { level: 70, min: 55, max: 80 },
  ]),
  // ES prefixes
  makeAffix('flat_energy_shield', 'prefix', 'flatEnergyShield', 'Arcane', ['helmet', 'body', 'gloves', 'boots', 'amulet', 'ring'], [
    { level: 1, min: 3, max: 8 },
    { level: 12, min: 8, max: 16 },
    { level: 28, min: 16, max: 28 },
    { level: 48, min: 28, max: 45 },
    { level: 72, min: 45, max: 70 },
  ]),
  // Armour prefixes — flat armour must track monster damage scaling so that
  // armour / (armour + 5 * hit) stays roughly constant across the campaign.
  // Tier magnitudes follow the front-loaded act curve: ~×3.2 per act.
  makeAffix('armour_rating', 'prefix', 'armour', 'Reinforced', ['helmet', 'body', 'gloves', 'boots', 'belt'], [
    { level: 1, min: 5, max: 12 },
    { level: 10, min: 18, max: 45 },
    { level: 25, min: 110, max: 260 },
    { level: 45, min: 650, max: 1500 },
    { level: 70, min: 2000, max: 5000 },
  ]),
  // Attribute prefixes
  makeAffix('strength', 'prefix', 'strength', 'Mighty', ['helmet', 'body', 'gloves', 'boots', 'belt', 'amulet', 'ring'], [
    { level: 1, min: 5, max: 10 },
    { level: 15, min: 10, max: 18 },
    { level: 35, min: 18, max: 28 },
    { level: 55, min: 28, max: 40 },
    { level: 78, min: 40, max: 55 },
  ]),
  makeAffix('intelligence', 'prefix', 'intelligence', 'Scholar\'s', ['helmet', 'body', 'gloves', 'boots', 'belt', 'amulet', 'ring'], [
    { level: 1, min: 5, max: 10 },
    { level: 15, min: 10, max: 18 },
    { level: 35, min: 18, max: 28 },
    { level: 55, min: 28, max: 40 },
    { level: 78, min: 40, max: 55 },
  ]),
  // M2 expanded prefixes
  makeAffix('flat_lightning_damage', 'prefix', 'flatLightningDamage', 'Charged', ['weapon'], [
    { level: 1, min: 1, max: 2 },
    { level: 12, min: 2, max: 4 },
    { level: 28, min: 4, max: 7 },
    { level: 48, min: 7, max: 11 },
    { level: 72, min: 11, max: 16 },
  ]),
  makeAffix('flat_cold_damage', 'prefix', 'flatColdDamage', 'Frostbound', ['weapon'], [
    { level: 1, min: 1, max: 2 },
    { level: 12, min: 2, max: 4 },
    { level: 28, min: 4, max: 7 },
    { level: 48, min: 7, max: 11 },
    { level: 72, min: 11, max: 16 },
  ]),
  makeAffix('chance_to_bleed', 'prefix', 'chanceToBleed', 'Serrated', ['weapon'], [
    { level: 1, min: 5, max: 10 },
    { level: 15, min: 10, max: 18 },
    { level: 32, min: 18, max: 28 },
    { level: 52, min: 28, max: 40 },
    { level: 75, min: 40, max: 55 },
  ]),
  makeAffix('chance_to_shock', 'prefix', 'chanceToShock', 'Voltaic', ['weapon', 'gloves'], [
    { level: 1, min: 5, max: 10 },
    { level: 15, min: 10, max: 18 },
    { level: 32, min: 18, max: 28 },
    { level: 52, min: 28, max: 40 },
    { level: 75, min: 40, max: 55 },
  ]),
  makeAffix('chance_to_inflict_despair', 'prefix', 'chanceToInflictDespair', 'Oppressing', ['weapon'], [
    { level: 1, min: 5, max: 10 },
    { level: 15, min: 10, max: 18 },
    { level: 32, min: 18, max: 28 },
    { level: 52, min: 28, max: 40 },
    { level: 75, min: 40, max: 55 },
  ]),
  makeAffix('accuracy', 'prefix', 'accuracy', 'Precise', ['weapon', 'amulet', 'ring'], [
    { level: 1, min: 10, max: 25 },
    { level: 14, min: 25, max: 50 },
    { level: 30, min: 50, max: 85 },
    { level: 50, min: 85, max: 130 },
    { level: 74, min: 130, max: 190 },
  ]),
  makeAffix('movement_speed', 'prefix', 'movementSpeed', 'Swift', ['boots', 'belt'], [
    { level: 1, min: 3, max: 7 },
    { level: 14, min: 7, max: 12 },
    { level: 30, min: 12, max: 18 },
    { level: 50, min: 18, max: 25 },
    { level: 74, min: 25, max: 35 },
  ]),
  makeAffix('increased_armour', 'prefix', 'increasedArmourPercent', 'Hardened', ['helmet', 'body', 'gloves', 'boots', 'belt'], [
    { level: 1, min: 5, max: 12 },
    { level: 15, min: 12, max: 22 },
    { level: 32, min: 22, max: 36 },
    { level: 52, min: 36, max: 52 },
    { level: 75, min: 52, max: 70 },
  ]),
  makeAffix('increased_maximum_life', 'prefix', 'increasedMaxLifePercent', 'Robust', ['body', 'belt', 'amulet'], [
    { level: 1, min: 5, max: 10 },
    { level: 15, min: 10, max: 18 },
    { level: 32, min: 18, max: 28 },
    { level: 52, min: 28, max: 40 },
    { level: 75, min: 40, max: 55 },
  ]),
  makeAffix('damage_vs_bosses', 'prefix', 'damageVsBossesPercent', 'Ruthless', ['weapon', 'amulet'], [
    { level: 1, min: 5, max: 10 },
    { level: 18, min: 10, max: 20 },
    { level: 38, min: 20, max: 32 },
    { level: 58, min: 32, max: 46 },
    { level: 78, min: 46, max: 60 },
  ]),
]

export const SUFFIXES: AffixDefinition[] = [
  // Offensive suffixes
  makeAffix('attack_speed', 'suffix', 'attackSpeed', 'of the Gale', ['weapon', 'gloves'], [
    { level: 1, min: 3, max: 7 },
    { level: 15, min: 7, max: 12 },
    { level: 30, min: 12, max: 18 },
    { level: 50, min: 18, max: 25 },
    { level: 75, min: 25, max: 35 },
  ]),
  makeAffix('critical_chance', 'suffix', 'criticalChance', 'of Piercing', ['weapon', 'amulet', 'gloves'], [
    { level: 1, min: 5, max: 10 },
    { level: 15, min: 10, max: 18 },
    { level: 30, min: 18, max: 28 },
    { level: 50, min: 28, max: 40 },
    { level: 75, min: 40, max: 55 },
  ]),
  makeAffix('critical_multiplier', 'suffix', 'criticalMultiplier', 'of Devastation', ['weapon', 'amulet'], [
    { level: 1, min: 10, max: 20 },
    { level: 15, min: 20, max: 35 },
    { level: 30, min: 35, max: 50 },
    { level: 50, min: 50, max: 70 },
    { level: 75, min: 70, max: 90 },
  ]),
  // Resistance suffixes
  makeAffix('fire_resistance', 'suffix', 'fireResistance', 'of the Forge', ['helmet', 'body', 'gloves', 'boots', 'belt', 'amulet', 'ring'], [
    { level: 1, min: 5, max: 10 },
    { level: 12, min: 10, max: 20 },
    { level: 28, min: 20, max: 30 },
    { level: 48, min: 30, max: 42 },
    { level: 72, min: 42, max: 56 },
  ]),
  makeAffix('cold_resistance', 'suffix', 'coldResistance', 'of the North', ['helmet', 'body', 'gloves', 'boots', 'belt', 'amulet', 'ring'], [
    { level: 1, min: 5, max: 10 },
    { level: 12, min: 10, max: 20 },
    { level: 28, min: 20, max: 30 },
    { level: 48, min: 30, max: 42 },
    { level: 72, min: 42, max: 56 },
  ]),
  makeAffix('lightning_resistance', 'suffix', 'lightningResistance', 'of the Storm', ['helmet', 'body', 'gloves', 'boots', 'belt', 'amulet', 'ring'], [
    { level: 1, min: 5, max: 10 },
    { level: 12, min: 10, max: 20 },
    { level: 28, min: 20, max: 30 },
    { level: 48, min: 30, max: 42 },
    { level: 72, min: 42, max: 56 },
  ]),
  // Attribute suffixes
  makeAffix('dexterity', 'suffix', 'dexterity', 'of the Wind', ['helmet', 'body', 'gloves', 'boots', 'belt', 'amulet', 'ring'], [
    { level: 1, min: 5, max: 10 },
    { level: 15, min: 10, max: 18 },
    { level: 35, min: 18, max: 28 },
    { level: 55, min: 28, max: 40 },
    { level: 78, min: 40, max: 55 },
  ]),
  // M2 expanded suffixes
  makeAffix('flat_lightning_damage_suf', 'suffix', 'flatLightningDamage', 'of Sparks', ['weapon'], [
    { level: 1, min: 1, max: 2 },
    { level: 12, min: 2, max: 4 },
    { level: 28, min: 4, max: 7 },
    { level: 48, min: 7, max: 11 },
    { level: 72, min: 11, max: 16 },
  ]),
  makeAffix('flat_cold_damage_suf', 'suffix', 'flatColdDamage', 'of Ice', ['weapon'], [
    { level: 1, min: 1, max: 2 },
    { level: 12, min: 2, max: 4 },
    { level: 28, min: 4, max: 7 },
    { level: 48, min: 7, max: 11 },
    { level: 72, min: 11, max: 16 },
  ]),
  makeAffix('chance_to_bleed_suf', 'suffix', 'chanceToBleed', 'of Bleeding', ['weapon'], [
    { level: 1, min: 5, max: 10 },
    { level: 15, min: 10, max: 18 },
    { level: 32, min: 18, max: 28 },
    { level: 52, min: 28, max: 40 },
    { level: 75, min: 40, max: 55 },
  ]),
  makeAffix('chance_to_shock_suf', 'suffix', 'chanceToShock', 'of Shocks', ['weapon', 'gloves'], [
    { level: 1, min: 5, max: 10 },
    { level: 15, min: 10, max: 18 },
    { level: 32, min: 18, max: 28 },
    { level: 52, min: 28, max: 40 },
    { level: 75, min: 40, max: 55 },
  ]),
  makeAffix('chance_to_inflict_despair_suf', 'suffix', 'chanceToInflictDespair', 'of Despair', ['weapon'], [
    { level: 1, min: 5, max: 10 },
    { level: 15, min: 10, max: 18 },
    { level: 32, min: 18, max: 28 },
    { level: 52, min: 28, max: 40 },
    { level: 75, min: 40, max: 55 },
  ]),
  makeAffix('accuracy_suf', 'suffix', 'accuracy', 'of the Hawk', ['weapon', 'amulet', 'ring'], [
    { level: 1, min: 10, max: 25 },
    { level: 14, min: 25, max: 50 },
    { level: 30, min: 50, max: 85 },
    { level: 50, min: 85, max: 130 },
    { level: 74, min: 130, max: 190 },
  ]),
  makeAffix('evasion_suf', 'suffix', 'evasion', 'of the Ghost', ['helmet', 'body', 'gloves', 'boots'], [
    { level: 1, min: 5, max: 12 },
    { level: 12, min: 12, max: 25 },
    { level: 28, min: 25, max: 45 },
    { level: 48, min: 45, max: 70 },
    { level: 72, min: 70, max: 100 },
  ]),
  makeAffix('increased_armour_suf', 'suffix', 'increasedArmourPercent', 'of the Mountain', ['helmet', 'body', 'gloves', 'boots', 'belt'], [
    { level: 1, min: 5, max: 12 },
    { level: 15, min: 12, max: 22 },
    { level: 32, min: 22, max: 36 },
    { level: 52, min: 36, max: 52 },
    { level: 75, min: 52, max: 70 },
  ]),
  makeAffix('increased_maximum_life_suf', 'suffix', 'increasedMaxLifePercent', 'of the Titan', ['body', 'belt'], [
    { level: 1, min: 5, max: 10 },
    { level: 15, min: 10, max: 18 },
    { level: 32, min: 18, max: 28 },
    { level: 52, min: 28, max: 40 },
    { level: 75, min: 40, max: 55 },
  ]),
  makeAffix('gold_find_suf', 'suffix', 'goldFindPercent', 'of Riches', ['belt', 'amulet', 'ring'], [
    { level: 1, min: 5, max: 12 },
    { level: 15, min: 12, max: 22 },
    { level: 32, min: 22, max: 36 },
    { level: 52, min: 36, max: 52 },
    { level: 75, min: 52, max: 70 },
  ]),
]

export const ALL_AFFIXES = [...PREFIXES, ...SUFFIXES]
