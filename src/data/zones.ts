import type { Zone } from '../types/game.ts'

export { MONSTERS } from './monsters.ts'

export const ZONES: Zone[] = [
  {
    id: 'shattered_coast',
    name: 'The Shattered Coast',
    act: 1,
    level: 1,
    monsterIds: [
      'drowned_corsair',
      'brinewretch',
      'tidecaller',
      'reefstalker',
      'gale_torn_shade',
      'wreck_scavenger',
      'salt_crowned_revenant',
    ],
    packSize: 1,
    eliteChance: 0.08,
    killProgress: 0,
    killsRequired: 10,
    unlocked: true,
  },
  {
    id: 'desolate_wastes',
    name: 'Desolate Wastes',
    act: 1,
    level: 2,
    monsterIds: ['scavenger_hound'],
    packSize: 1,
    eliteChance: 0.05,
    killProgress: 0,
    killsRequired: 10,
    unlocked: false,
  },
  {
    id: 'ruined_bastion',
    name: 'Ruined Bastion',
    act: 1,
    level: 3,
    monsterIds: ['shore_warden'],
    packSize: 1,
    eliteChance: 0.0,
    killProgress: 0,
    killsRequired: 1,
    unlocked: false,
  },
]
