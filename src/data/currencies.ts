import type { Currency } from '../types/item.ts'

export const CURRENCIES: Record<string, Currency> = {
  awakening: {
    id: 'awakening',
    name: 'Orb of Awakening',
    description: 'Transforms a Normal item into a Magic item with 1-2 random affixes.',
    color: '#3498db',
  },
  mutation: {
    id: 'mutation',
    name: 'Orb of Mutation',
    description: 'Rerolls the affixes on a Magic item.',
    color: '#9b59b6',
  },
  sovereignty: {
    id: 'sovereignty',
    name: 'Orb of Sovereignty',
    description: 'Upgrades a Magic item to a Rare item, adding one affix.',
    color: '#f1c40f',
  },
  genesis: {
    id: 'genesis',
    name: 'Orb of Genesis',
    description: 'Transforms a Normal item into a Rare item with 4 random affixes.',
    color: '#e67e22',
  },
  entropy: {
    id: 'entropy',
    name: 'Orb of Entropy',
    description: 'Rerolls all affixes on a Rare item.',
    color: '#e74c3c',
  },
  triumph: {
    id: 'triumph',
    name: 'Orb of Triumph',
    description: 'Adds one random affix to a Rare item with an open slot.',
    color: '#f39c12',
  },
  void_orb: {
    id: 'void_orb',
    name: 'Orb of the Void',
    description: 'Removes one random affix from a Magic or Rare item.',
    color: '#8e44ad',
  },
  cleansing: {
    id: 'cleansing',
    name: 'Orb of Cleansing',
    description: 'Removes all affixes from an item, reverting it to Normal.',
    color: '#7f8c8d',
  },
  penance: {
    id: 'penance',
    name: 'Orb of Penance',
    description: 'Refunds one allocated passive skill point.',
    color: '#2ecc71',
  },
}
