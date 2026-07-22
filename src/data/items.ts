import type { BaseItem } from '../types/item.ts'

export const BASE_ITEMS: Record<string, BaseItem> = {
  // Weapons
  rusted_axe: {
    id: 'rusted_axe',
    name: 'Rusted Axe',
    slot: 'weapon',
    baseLevel: 1,
    physicalDamageMin: 3,
    physicalDamageMax: 6,
    attackRate: 1.0,
  },
  crude_dagger: {
    id: 'crude_dagger',
    name: 'Crude Dagger',
    slot: 'weapon',
    baseLevel: 1,
    physicalDamageMin: 2,
    physicalDamageMax: 5,
    attackRate: 1.2,
  },
  splintered_wand: {
    id: 'splintered_wand',
    name: 'Splintered Wand',
    slot: 'weapon',
    baseLevel: 1,
    physicalDamageMin: 1,
    physicalDamageMax: 3,
    attackRate: 1.1,
  },
  // Offhand
  worn_shield: {
    id: 'worn_shield',
    name: 'Worn Shield',
    slot: 'offhand',
    baseLevel: 1,
    armour: 5,
    energyShield: 3,
  },
  // Armour
  tattered_hood: {
    id: 'tattered_hood',
    name: 'Tattered Hood',
    slot: 'helmet',
    baseLevel: 1,
    armour: 3,
    energyShield: 2,
  },
  battered_chest: {
    id: 'battered_chest',
    name: 'Battered Chest',
    slot: 'body',
    baseLevel: 1,
    armour: 8,
    energyShield: 4,
  },
  fingerless_gloves: {
    id: 'fingerless_gloves',
    name: 'Fingerless Gloves',
    slot: 'gloves',
    baseLevel: 1,
    armour: 2,
    energyShield: 2,
  },
  worn_boots: {
    id: 'worn_boots',
    name: 'Worn Boots',
    slot: 'boots',
    baseLevel: 1,
    armour: 2,
    evasion: 5,
  },
  rope_belt: {
    id: 'rope_belt',
    name: 'Rope Belt',
    slot: 'belt',
    baseLevel: 1,
    armour: 3,
    life: 5,
  },
  // Accessories
  seashell_amulet: {
    id: 'seashell_amulet',
    name: 'Seashell Amulet',
    slot: 'amulet',
    baseLevel: 1,
    life: 3,
    energyShield: 3,
  },
  iron_ring: {
    id: 'iron_ring',
    name: 'Iron Ring',
    slot: 'ring',
    baseLevel: 1,
    life: 3,
    energyShield: 2,
  },
}

export const STARTER_ITEMS: Record<string, string[]> = {
  brute: ['rusted_axe', 'worn_shield', 'tattered_hood', 'battered_chest', 'fingerless_gloves', 'worn_boots', 'rope_belt', 'seashell_amulet', 'iron_ring'],
  stalker: ['crude_dagger', 'worn_shield', 'tattered_hood', 'battered_chest', 'fingerless_gloves', 'worn_boots', 'rope_belt', 'seashell_amulet', 'iron_ring'],
  acolyte: ['splintered_wand', 'worn_shield', 'tattered_hood', 'battered_chest', 'fingerless_gloves', 'worn_boots', 'rope_belt', 'seashell_amulet', 'iron_ring'],
  warlord: ['rusted_axe', 'worn_shield', 'tattered_hood', 'battered_chest', 'fingerless_gloves', 'worn_boots', 'rope_belt', 'seashell_amulet', 'iron_ring'],
  plaguebringer: ['crude_dagger', 'worn_shield', 'tattered_hood', 'battered_chest', 'fingerless_gloves', 'worn_boots', 'rope_belt', 'seashell_amulet', 'iron_ring'],
  oracle: ['splintered_wand', 'worn_shield', 'tattered_hood', 'battered_chest', 'fingerless_gloves', 'worn_boots', 'rope_belt', 'seashell_amulet', 'iron_ring'],
}
