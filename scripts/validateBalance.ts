/**
 * scripts/validateBalance.ts
 *
 * Tests the campaign scaling curve against real data in src/data/.
 * Run: bun run validate:balance
 *
 * This does NOT check that numbers match a spec. It checks that the CURVE
 * behaves: that time-to-kill stays roughly flat, that no act trivializes or
 * walls, and that defensive layers stay relevant at every scale.
 */

import { MONSTERS } from '../src/data/monsters.ts'
import { ZONES } from '../src/data/zones.ts'
import { DAMAGE, monsterScalingMultiplier } from '../src/data/balance.ts'
import type { Monster } from '../src/types/game.ts'

// ---------------------------------------------------------------------------
// Player power model — REPLACE these with real calls into your own systems
// once recalculateCharacterFromEquipment / applyPassiveStats can be invoked
// headlessly. Until then this is an estimate and the thresholds are advisory.
// ---------------------------------------------------------------------------

interface PowerEstimate { dps: number; ehp: number; armour: number }

function estimatePlayerPower(level: number): PowerEstimate {
  // Assumes: ~1 passive point/level, gear affix tiers tracking zone level,
  // support slots at 2/3/4/5 by campaign milestone.
  const flatDmg = 4 + level * 1.6
  const treeInc = 1 + 0.10 * 6 * (level / 8)
  const gearInc = 1 + 4 * (0.15 * Math.pow(1.35, level / 8))
  const slots = 2 + (level >= 24 ? 1 : 0) + (level >= 40 ? 1 : 0) + (level >= 56 ? 1 : 0)
  const supportMore = Math.pow(1.25, slots - 2)
  const aps = 1.2 + 0.0025 * level
  const crit = 1.075 + 0.00125 * level
  const dps = flatDmg * treeInc * gearInc * supportMore * aps * crit

  const baseLife = 50 + level * 6
  const gearLife = 40 * Math.pow(1.9, level / 8)
  const lifeInc = 1 + 0.08 * 5 * (level / 8)
  const armour = 20 * Math.pow(2.3, level / 8)
  return { dps, ehp: (baseLife + gearLife) * lifeInc, armour }
}

// ---------------------------------------------------------------------------

type Row = {
  zone: string
  level: number
  ttkTrash: number
  ttkTank: number
  ttkBoss: number
  hitsToDie: number
  mitigation: number
  isBossOnly: boolean
}

const allMonsters = Object.values(MONSTERS)
const rows: Row[] = []
const problems: string[] = []

function avgDamage(m: { damage: { min: number; max: number }[] }): number {
  return m.damage.reduce((sum, d) => sum + (d.min + d.max) / 2, 0) / Math.max(1, m.damage.length)
}

function maxDamage(m: { damage: { min: number; max: number }[] }): number {
  return m.damage.reduce((sum, d) => sum + d.max, 0)
}

function scaleMonsterToZone(monster: Monster, zoneLevel: number): Monster {
  const zoneMult = monsterScalingMultiplier(zoneLevel)
  const monMult = monsterScalingMultiplier(monster.level)
  const combatMult = zoneMult / monMult
  return {
    ...monster,
    level: zoneLevel,
    maxLife: Math.floor(monster.maxLife * combatMult),
    life: Math.floor(monster.maxLife * combatMult),
    damage: monster.damage.map(d => ({
      ...d,
      min: Math.max(1, Math.floor(d.min * combatMult)),
      max: Math.max(1, Math.floor(d.max * combatMult)),
    })),
  }
}

for (const zone of ZONES) {
  const pool = allMonsters
    .filter(m => zone.monsterIds.includes(m.id))
    .map(m => scaleMonsterToZone(m, zone.level))
  if (!pool.length) {
    problems.push(`Zone "${zone.id}" has no monsters in its pool`)
    continue
  }

  const power = estimatePlayerPower(zone.level)

  const nonBoss = pool.filter(m => !m.isBoss)
  // Use median life to avoid outliers like ultra-weak swarms or rare elites.
  const byLife = [...nonBoss].sort((a, b) => a.maxLife - b.maxLife)
  const trash = nonBoss.length > 0 ? byLife[Math.floor(byLife.length / 2)] : undefined
  const tank = nonBoss.length > 0 ? byLife[byLife.length - 1] : undefined
  const boss = pool.find(m => m.isBoss)
  const threat = nonBoss.length > 0 ? nonBoss.reduce((a, b) => (avgDamage(a) > avgDamage(b) ? a : b)) : pool[0]

  const mitigation = power.armour / (power.armour + 5 * maxDamage(threat))
  const effectiveHit = maxDamage(threat) * (1 - mitigation)

  rows.push({
    zone: zone.id,
    level: zone.level,
    ttkTrash: trash ? trash.maxLife / power.dps : -1,
    ttkTank: tank ? tank.maxLife / power.dps : -1,
    ttkBoss: boss ? boss.maxLife / power.dps : 0,
    hitsToDie: power.ehp / Math.max(effectiveHit, 0.01),
    mitigation,
    isBossOnly: nonBoss.length === 0,
  })
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

console.log('\n=== CAMPAIGN PACING ===')
console.log(
  'zone'.padEnd(24) +
    'lvl'.padStart(5) +
    'trash'.padStart(9) +
    'tanky'.padStart(9) +
    'boss'.padStart(9) +
    'hits2die'.padStart(10) +
    'mitig'.padStart(8)
)
for (const r of rows) {
  console.log(
    r.zone.padEnd(24) +
      String(r.level).padStart(5) +
      (r.isBossOnly ? '  n/a' : `${r.ttkTrash.toFixed(2)}s`).padStart(9) +
      (r.isBossOnly ? '  n/a' : `${r.ttkTank.toFixed(1)}s`).padStart(9) +
      `${r.ttkBoss.toFixed(0)}s`.padStart(9) +
      r.hitsToDie.toFixed(1).padStart(10) +
      `${(r.mitigation * 100).toFixed(0)}%`.padStart(8)
  )
}

// 1. TTK drift — the single most important check (exclude boss-only zones).
const trashTTKs = rows.filter(r => !r.isBossOnly).map(r => r.ttkTrash)
const drift = trashTTKs.length > 0 ? Math.max(...trashTTKs) / Math.min(...trashTTKs) : 1
console.log(`\nTTK drift across campaign: ${drift.toFixed(2)}x`)
if (drift > 3) {
  problems.push(
    `TTK drift ${drift.toFixed(2)}x is too high (>3x). Some acts trivialize or wall. ` +
      `Monster life must scale at roughly the same rate as player DPS.`
  )
}

// 2. Absolute TTK windows.
for (const r of rows) {
  if (r.isBossOnly) continue
  if (r.ttkTrash > 4) problems.push(`${r.zone}: trash TTK ${r.ttkTrash.toFixed(1)}s > 4s — grindy`)
  if (r.ttkTrash < 0.4) problems.push(`${r.zone}: trash TTK ${r.ttkTrash.toFixed(2)}s < 0.4s — trivial`)
  if (r.ttkBoss > 0 && r.ttkBoss < 25) {
    problems.push(`${r.zone}: boss TTK ${r.ttkBoss.toFixed(0)}s < 25s — boss life too low (aim 30-40x trash)`)
  }
  if (r.ttkBoss > 120) problems.push(`${r.zone}: boss TTK ${r.ttkBoss.toFixed(0)}s > 120s — slog`)
}

// 3. Survivability window.
for (const r of rows) {
  if (r.hitsToDie < 6) {
    problems.push(`${r.zone}: dies in ${r.hitsToDie.toFixed(1)} hits — too spiky for an idle game (aim 8-20)`)
  }
  if (r.hitsToDie > 40) {
    problems.push(`${r.zone}: dies in ${r.hitsToDie.toFixed(0)} hits — no tension`)
  }
}

// 4. Armour relevance — must stay in band, not creep.
const mits = rows.map(r => r.mitigation)
if (Math.max(...mits) - Math.min(...mits) > 0.20) {
  problems.push(
    `Armour mitigation drifts ${(Math.min(...mits) * 100).toFixed(0)}%-${(Math.max(...mits) * 100).toFixed(0)}%. ` +
      `Armour affix scaling must track monster damage scaling, or armour creeps toward invincibility.`
  )
}

// 5. Resist gap — verify the intended penalty for being uncapped.
console.log('\n=== RESIST GAP ===')
const cap = DAMAGE.RESISTANCE_CAP * 100
for (const r of [0, 25, 40, 60, cap]) {
  console.log(
    `  ${String(Math.round(r)).padStart(3)}% resist takes ${((1 - r / 100) / (1 - cap / 100)).toFixed(2)}x ` +
      `the damage of a capped character`
  )
}
console.log(
  `  Design intent: a partially-resisted player (~25%) takes ~3x. Uncapped (0%) takes ${(1 / (1 - cap / 100)).toFixed(1)}x.`
)

// 6. Act-start trash HP report (front-loaded curve check).
// Report the designated baseline trash monster for each act so the curve can be verified.
console.log('\n=== ACT-START TRASH HP ===')
const actTrash: { act: number; id: string }[] = [
  { act: 1, id: 'drowned_corsair' },
  { act: 2, id: 'ashwalker' },
  { act: 3, id: 'fulgurite_husk' },
]
for (const { act, id } of actTrash) {
  const trash = allMonsters.find(m => m.id === id)
  if (trash) {
    console.log(`  Act ${act} start (level ${trash.level}): ${trash.name} = ${trash.maxLife} HP`)
  }
}

// 7. Per-zone life growth (use non-boss, scaled life averages).
console.log('\n=== PER-ZONE LIFE GROWTH ===')
for (let i = 1; i < ZONES.length; i++) {
  const prevTemplate = allMonsters.filter(m => ZONES[i - 1].monsterIds.includes(m.id))
  const curTemplate = allMonsters.filter(m => ZONES[i].monsterIds.includes(m.id))
  if (!prevTemplate.length || !curTemplate.length) continue
  const prevNonBoss = prevTemplate.filter(m => !m.isBoss).map(m => scaleMonsterToZone(m, ZONES[i - 1].level))
  const curNonBoss = curTemplate.filter(m => !m.isBoss).map(m => scaleMonsterToZone(m, ZONES[i].level))
  if (!prevNonBoss.length || !curNonBoss.length) continue
  const avg = (xs: Monster[]) => xs.reduce((s, m) => s + m.maxLife, 0) / xs.length
  const g = avg(curNonBoss) / avg(prevNonBoss)
  console.log(`  ${ZONES[i - 1].id} -> ${ZONES[i].id}: x${g.toFixed(2)} life`)
}

// ---------------------------------------------------------------------------

console.log('\n=== RESULT ===')
if (problems.length === 0) {
  console.log('  No balance problems detected.\n')
  process.exit(0)
} else {
  for (const p of problems) console.log(`  ✗ ${p}`)
  console.log(
    `\n  ${problems.length} issue(s). These are advisory — the player-power model is an\n` +
      '  estimate. Verify against real character stats before making large changes.\n'
  )
  process.exit(0) // advisory: do not fail CI on balance
}
