import type { CharacterClass, ClassId } from '../types/game.ts'

export const CLASSES: Record<ClassId, CharacterClass> = {
  brute: {
    id: 'brute',
    name: 'Brute',
    description: 'A strength-born fighter who relies on raw armour and melee might.',
    baseAttributes: { strength: 20, dexterity: 10, intelligence: 5 },
    baseLife: 60,
    baseEnergyShield: 0,
    baseAccuracy: 100,
    baseEvasion: 40,
  },
  stalker: {
    id: 'stalker',
    name: 'Stalker',
    description: 'A dexterous hunter who strikes from the shadows with speed and precision.',
    baseAttributes: { strength: 10, dexterity: 20, intelligence: 5 },
    baseLife: 45,
    baseEnergyShield: 0,
    baseAccuracy: 120,
    baseEvasion: 70,
  },
  acolyte: {
    id: 'acolyte',
    name: 'Acolyte',
    description: 'An intelligence caster who wields fire, cold, and lightning.',
    baseAttributes: { strength: 5, dexterity: 10, intelligence: 20 },
    baseLife: 40,
    baseEnergyShield: 30,
    baseAccuracy: 90,
    baseEvasion: 45,
  },
  oracle: {
    id: 'oracle',
    name: 'Oracle',
    description: 'An Int/Dex seer who bends combat through determinism — scheduled strikes and declared auras replace chance.',
    baseAttributes: { strength: 5, dexterity: 15, intelligence: 20 },
    baseLife: 40,
    baseEnergyShield: 30,
    baseAccuracy: 100,
    baseEvasion: 50,
  },
  warlord: {
    id: 'warlord',
    name: 'Warlord',
    description: 'A Str/Dex commander whose momentum snowballs with every kill, crushing enemies in an unstoppable advance.',
    baseAttributes: { strength: 20, dexterity: 15, intelligence: 5 },
    baseLife: 60,
    baseEnergyShield: 0,
    baseAccuracy: 110,
    baseEvasion: 40,
  },
  plaguebringer: {
    id: 'plaguebringer',
    name: 'Plaguebringer',
    description: 'A Dex/Int alchemist who stacks ailments and lets disease finish what weapons begin.',
    baseAttributes: { strength: 10, dexterity: 20, intelligence: 15 },
    baseLife: 45,
    baseEnergyShield: 10,
    baseAccuracy: 120,
    baseEvasion: 70,
  },
}

/** Maps every launch class to the passive-tree root region it starts in. */
export const CLASS_ROOT_MAP: Record<ClassId, 'oracle' | 'warlord' | 'plaguebringer'> = {
  brute: 'warlord',
  warlord: 'warlord',
  stalker: 'plaguebringer',
  plaguebringer: 'plaguebringer',
  acolyte: 'oracle',
  oracle: 'oracle',
}
