import type { CharacterClass } from '../types/game.ts'

export const CLASSES: Record<string, CharacterClass> = {
  brute: {
    id: 'brute',
    name: 'Brute',
    description: 'A strength-bound warrior who trades blows with heavy armour and raw physical power.',
    baseAttributes: { strength: 20, dexterity: 10, intelligence: 5 },
    baseLife: 60,
    baseEnergyShield: 0,
    baseAccuracy: 100,
    baseEvasion: 30,
  },
  stalker: {
    id: 'stalker',
    name: 'Stalker',
    description: 'A dexterous hunter who strikes fast, dodges often, and crits hard.',
    baseAttributes: { strength: 10, dexterity: 20, intelligence: 5 },
    baseLife: 45,
    baseEnergyShield: 10,
    baseAccuracy: 120,
    baseEvasion: 70,
  },
  acolyte: {
    id: 'acolyte',
    name: 'Acolyte',
    description: 'An intelligence-driven caster who wields elemental energy and wards.',
    baseAttributes: { strength: 5, dexterity: 10, intelligence: 20 },
    baseLife: 40,
    baseEnergyShield: 30,
    baseAccuracy: 90,
    baseEvasion: 40,
  },
}
