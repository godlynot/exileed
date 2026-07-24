/**
 * scripts/listAffixScaling.ts
 *
 * Prints the interpolated roll range for every affix at levels 1, 10, and 20.
 * Uses the same tier-interpolation logic as rollAffixValue().
 * Run: bun run scripts/listAffixScaling.ts
 */

import { ALL_AFFIXES } from '../src/data/affixes.ts'
import type { AffixDefinition } from '../src/types/item.ts'

function getTierWindow(def: AffixDefinition) {
  return { lower: 0, upper: Math.min(1, def.tiers.length - 1) }
}

function interpolatedRange(def: AffixDefinition, itemLevel: number) {
  // Find the highest unlocked tier index
  let lowerIndex = 0
  for (let i = def.tiers.length - 1; i >= 0; i--) {
    if (itemLevel >= def.tiers[i].level) {
      lowerIndex = i
      break
    }
  }
  const upperIndex = Math.min(lowerIndex + 1, def.tiers.length - 1)
  const lower = def.tiers[lowerIndex]
  const upper = def.tiers[upperIndex]

  if (lowerIndex === upperIndex) {
    return { min: lower.min, max: lower.max }
  }

  let progress = 0
  if (upper.level > lower.level) {
    progress = (itemLevel - lower.level) / (upper.level - lower.level)
  }
  progress = Math.pow(progress, 0.7)

  const min = Math.floor(lower.min + (upper.min - lower.min) * progress)
  const max = Math.floor(lower.max + (upper.max - lower.max) * progress)
  return { min, max }
}

const LEVELS = [1, 10, 20, 68]

for (const affix of ALL_AFFIXES) {
  const ranges = LEVELS.map(level => {
    const { min, max } = interpolatedRange(affix, level)
    return `lvl ${level.toString().padStart(2)}: ${String(min).padStart(4)}–${String(max).padEnd(4)}`
  }).join(' | ')
  console.log(`${affix.name.padEnd(30)} (${affix.stat}) ${ranges}`)
}
