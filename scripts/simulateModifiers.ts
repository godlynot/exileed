import { rollModifiers, rollRarity, MONSTER_MODIFIERS, MONSTER_MODIFIERS_BY_ID } from '../src/data/monsterModifiers.ts'
import type { MonsterModifier, MonsterRarity } from '../src/types/game.ts'

const SAMPLES = 10000
const LEVELS = [1, 4, 7, 9, 12, 15, 17, 20, 23]

interface Report {
  rarity: Record<string, number>
  modifiers: Record<string, number>
  modByRarity: Record<MonsterRarity, Record<string, number>>
  avgLifeMult: number
  avgDamageMult: number
}

function simulate(level: number): Report {
  const rarity: Record<string, number> = { normal: 0, magic: 0, rare: 0 }
  const modifiers: Record<string, number> = {}
  const modByRarity: Record<MonsterRarity, Record<string, number>> = {
    normal: {},
    magic: {},
    rare: {},
    boss: {},
  }
  let totalLifeMult = 0
  let totalDamageMult = 0

  for (let i = 0; i < SAMPLES; i++) {
    const r = rollRarity(level)
    rarity[r]++
    const mods = rollModifiers(r, level)
    const key = r === 'normal' ? 'normal' : r
    for (const mod of mods) {
      modifiers[mod.displayName] = (modifiers[mod.displayName] ?? 0) + 1
      modByRarity[key][mod.displayName] = (modByRarity[key][mod.displayName] ?? 0) + 1
    }

    let lifeMult = 1
    let damageMult = 1
    for (const mod of mods) {
      if (mod.lifeMult) lifeMult *= mod.lifeMult
      if (mod.damageMult) damageMult *= mod.damageMult
    }
    totalLifeMult += lifeMult
    totalDamageMult += damageMult
  }

  return {
    rarity,
    modifiers,
    modByRarity,
    avgLifeMult: totalLifeMult / SAMPLES,
    avgDamageMult: totalDamageMult / SAMPLES,
  }
}

function percent(n: number, total: number): string {
  return `${((n / total) * 100).toFixed(2)}%`
}

for (const level of LEVELS) {
  console.log(`\n=== Level ${level} ===`)
  const report = simulate(level)
  console.log('Rarity:', Object.entries(report.rarity).map(([k, v]) => `${k}: ${percent(v, SAMPLES)}`).join(', '))
  console.log('Avg life mult:', report.avgLifeMult.toFixed(2), 'avg damage mult:', report.avgDamageMult.toFixed(2))
  console.log('Modifiers:')
  const sorted = Object.entries(report.modifiers).sort((a, b) => b[1] - a[1])
  for (const [name, count] of sorted) {
    console.log(`  ${name}: ${count} (${percent(count, SAMPLES)})`)
  }
}
