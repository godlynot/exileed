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
import { DAMAGE, TICKS_PER_SECOND, monsterScalingMultiplier } from '../src/data/balance.ts'
import { createItem, recalculateCharacterFromEquipment } from '../src/systems/items.ts'
import { applyPassiveStats, applyAscendancyStats, allocateNode, getAdjacency, getNode } from '../src/systems/passives.ts'
import { PASSIVE_TREE } from '../src/data/passiveTree.ts'
import { CLASSES, CLASS_ROOT_MAP } from '../src/data/classes.ts'
import { SKILLS } from '../src/data/skills.ts'
import type { Character, ClassId, EquippedSkill, Monster } from '../src/types/game.ts'
import type { Equipment, Item, ItemRarity } from '../src/types/item.ts'

// ---------------------------------------------------------------------------
// Player power model — REPLACE these with real calls into your own systems
// once recalculateCharacterFromEquipment / applyPassiveStats can be invoked
// headlessly. Until then this is an estimate and the thresholds are advisory.
// ---------------------------------------------------------------------------

interface PowerEstimate {
  dps: number
  ehp: number
  armour: number
  effectiveHit: number
  resistances: Character['resistances']
}

const SLOT_BASES: Record<keyof Equipment, string> = {
  weapon: 'rusted_axe',
  offhand: 'worn_shield',
  helmet: 'tattered_hood',
  body: 'battered_chest',
  gloves: 'fingerless_gloves',
  boots: 'worn_boots',
  belt: 'rope_belt',
  amulet: 'seashell_amulet',
  ring1: 'iron_ring',
  ring2: 'iron_ring',
}

function buildEquipment(level: number, rarity: ItemRarity = 'rare'): Equipment {
  // Gear rarity gives extra mods; item level controls tier magnitude. The main
  // campaign table uses rare gear, while the sensitivity report below compares
  // it against normal and magic gear without changing the gameplay model.
  const equipment: Equipment = {
    weapon: null,
    offhand: null,
    helmet: null,
    body: null,
    gloves: null,
    boots: null,
    belt: null,
    amulet: null,
    ring1: null,
    ring2: null,
  }
  for (const slot of Object.keys(equipment) as (keyof Equipment)[]) {
    const baseId = SLOT_BASES[slot]
    if (!baseId) continue
    equipment[slot] = createItem(baseId, level, rarity)
  }
  return equipment
}

function allocatePassivesBFS(character: Character, points: number): Character {
  const adj = getAdjacency(PASSIVE_TREE)
  const allocated = new Set(character.allocatedNodes)
  const queue = [...character.allocatedNodes]
  let c = { ...character }
  c.passivePoints = points

  while (points > 0 && queue.length > 0) {
    const current = queue.shift()!
    const neighbors = adj.get(current) ?? []
    for (const neighbor of neighbors) {
      if (!allocated.has(neighbor)) {
        const node = getNode(PASSIVE_TREE, neighbor)
        if (!node || node.type === 'root') continue
        const before = c.allocatedNodes.length
        c = allocateNode(c, PASSIVE_TREE, neighbor)
        if (c.allocatedNodes.length > before) {
          allocated.add(neighbor)
          queue.push(neighbor)
          points--
          if (points <= 0) break
        }
      }
    }
  }
  return c
}

function createDefaultCharacter(classId: ClassId): Character {
  const gameClass = CLASSES[classId]
  return {
    id: 'player_1',
    name: 'Exile',
    classId,
    level: 1,
    experience: 0,
    experienceToNext: 100,
    life: gameClass.baseLife,
    maxLife: gameClass.baseLife,
    energyShield: gameClass.baseEnergyShield,
    maxEnergyShield: gameClass.baseEnergyShield,
    attributes: { ...gameClass.baseAttributes },
    resistances: { fire: 0, cold: 0, lightning: 0, chaos: 0 },
    accuracy: gameClass.baseAccuracy,
    evasion: gameClass.baseEvasion,
    armour: gameClass.baseAttributes.strength * 2,
    attackRate: 1.0,
    basePhysicalDamageMin: 2,
    basePhysicalDamageMax: 4,
    criticalChance: 0.05,
    criticalMultiplier: 1.5,
    damageVsBossesPercent: 0,
    goldFindPercent: 0,
    chanceToBleed: 0,
    chanceToShock: 0,
    chanceToInflictDespair: 0,
    special: {},
    isAlive: true,
    respawnTimer: 0,
    allocatedNodes: [`root_${CLASS_ROOT_MAP[classId]}`],
    passivePoints: 0,
    equippedSkills: [{ skillId: 'strike', supportIds: [], cooldownRemaining: 0, hitCounter: 0 }],
    ascendancyId: null,
    allocatedAscendancyNodes: [],
    keystoneChoices: {},
    ascendancyPoints: 0,
    trial1Completed: false,
    trial2Completed: false,
    trial3Completed: false,
    trial4Completed: false,
    devOverrides: {},
    ownedGems: [],
    supportSlotCount: 2,
    increasedPhysicalDamage: 0,
    morePhysicalDamage: 1,
    increasedSpellDamage: 0,
    moreSpellDamage: 1,
    increasedAttackSpeed: 0,
    moreAttackSpeed: 1,
    increasedAccuracy: 0,
    lifeRegen: 0,
    esRecharge: 0,
  }
}

function armourMitigation(armour: number, damage: number): number {
  return armour / (armour + 5 * damage)
}

function estimatePlayerPower(level: number, threat: Monster, gearRarity: ItemRarity = 'rare'): PowerEstimate {
  const originalRandom = Math.random
  Math.random = () => 0.5
  try {
    let character = createDefaultCharacter('warlord')
    character.level = level
    character.passivePoints = level - 1
    character.allocatedNodes = ['root_warlord']

    const equipment = buildEquipment(level, gearRarity)

    character = allocatePassivesBFS(character, level - 1)
    character = recalculateCharacterFromEquipment(character, equipment)
    character = applyPassiveStats(character, PASSIVE_TREE)
    character = applyAscendancyStats(character)

    // --- DPS: faithful mirror of skillDamage() for a default Heavy Strike ---
    const skill = SKILLS.strike
    const weaponMin = character.basePhysicalDamageMin ?? 0
    const weaponMax = character.basePhysicalDamageMax ?? 0
    const levelMultiplier = 1 + (level - 1) * 0.05
    const gemMultiplier = 1.0 // validator assumes level-1 gem

    // Average roll (deterministic).
    const rawBaseRoll = (skill.baseDamageMin + weaponMin + skill.baseDamageMax + weaponMax) / 2
    const rawBase = Math.floor(rawBaseRoll * levelMultiplier * gemMultiplier)

    // Armour mitigation against the threat's armour.
    const monsterArmour = (threat.armour ?? 0) + threat.level * 2
    const mitigation = armourMitigation(monsterArmour, rawBase)

    const incPhys = character.increasedPhysicalDamage ?? 0
    const morePhys = character.morePhysicalDamage ?? 1
    const damagePerHit = rawBase * (1 + incPhys) * morePhys * (1 - mitigation)

    // Average crit multiplier.
    const critMult = 1 + character.criticalChance * (character.criticalMultiplier - 1)
    const avgDamagePerHit = damagePerHit * critMult

    // Cooldown in seconds (combat.ts uses ticks / TICKS_PER_SECOND).
    const cooldownSeconds = skill.cooldownTicks / TICKS_PER_SECOND
    const dps = avgDamagePerHit / cooldownSeconds

    // --- EHP: raw life pool, and the real average incoming hit vs this threat ---
    const ehp = character.maxLife + character.maxEnergyShield

    const totalWeight = threat.damage.reduce((sum, d) => sum + (d.min + d.max) / 2, 0)
    const effectiveHit =
      totalWeight === 0
        ? 1
        : threat.damage.reduce((sum, d) => {
            const avg = (d.min + d.max) / 2
            if (d.type === 'physical') {
              const mit = armourMitigation(character.armour, d.max)
              return sum + avg * (1 - mit)
            }
            const resist = character.resistances[d.type] ?? 0
            return sum + avg * (1 - Math.min(resist, DAMAGE.RESISTANCE_CAP))
          }, 0)

    return { dps, ehp, armour: character.armour, effectiveHit, resistances: character.resistances }
  } finally {
    Math.random = originalRandom
  }
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

  const nonBoss = pool.filter(m => m.rarity !== 'boss')
  // Use median life to avoid outliers like ultra-weak swarms or rare elites.
  const byLife = [...nonBoss].sort((a, b) => a.maxLife - b.maxLife)
  const trash = nonBoss.length > 0 ? byLife[Math.floor(byLife.length / 2)] : undefined
  const tank = nonBoss.length > 0 ? byLife[byLife.length - 1] : undefined
  const boss = pool.find(m => m.rarity === 'boss')
  const threat = nonBoss.length > 0 ? nonBoss.reduce((a, b) => (avgDamage(a) > avgDamage(b) ? a : b)) : pool[0]

  const power = estimatePlayerPower(zone.level, threat)

  // Mitigation shown in the table is a physical-only estimate for readability.
  const mitigation = power.armour / (power.armour + 5 * maxDamage(threat))

  rows.push({
    zone: zone.id,
    level: zone.level,
    ttkTrash: trash ? trash.maxLife / power.dps : -1,
    ttkTank: tank ? tank.maxLife / power.dps : -1,
    ttkBoss: boss ? boss.maxLife / power.dps : 0,
    hitsToDie: power.ehp / Math.max(power.effectiveHit, 0.01),
    mitigation,
    isBossOnly: nonBoss.length === 0,
  })
}

// ---------------------------------------------------------------------------
// Survivability bands (see BALANCE.md "Survivability bands")
//
// - Baseline gear (normal/magic, uncapped): 8-20 hits-to-die is the pacing
//   target for repeatable trash.
// - Capped/rare profiles: capping a resistance (or stacking armour) is the
//   intended gearing payoff, so those profiles may reach ~45 hits before an
//   encounter has "no tension" at all. 45 is the ceiling, not the target.
// ---------------------------------------------------------------------------
const HITS_BAND = {
  BASELINE_MIN: 8,
  BASELINE_MAX: 20,
  CAPPED_MAX: 45,
} as const

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

// Compare the same late-campaign threats across gear tiers before changing a
// global defensive constant. A warning isolated to rare gear is an itemization
// issue; a warning present in normal gear points toward monster tuning instead.
const sensitivityZones = ZONES.filter(zone => zone.level >= 25 && zone.monsterIds.some(id => MONSTERS[id]?.rarity !== 'boss'))
console.log('\n=== DEFENSIVE PROFILE SENSITIVITY ===')
console.log(
  `  Bands: baseline ${HITS_BAND.BASELINE_MIN}-${HITS_BAND.BASELINE_MAX} hits | capped/rare ≤ ${HITS_BAND.CAPPED_MAX} hits (gearing payoff)`
)
for (const zone of sensitivityZones) {
  const pool = zone.monsterIds
    .map(id => MONSTERS[id])
    .filter((monster): monster is Monster => Boolean(monster))
    .map(monster => scaleMonsterToZone(monster, zone.level))
  const nonBoss = pool.filter(monster => monster.rarity !== 'boss')
  if (nonBoss.length === 0) continue
  const threat = nonBoss.reduce((a, b) => (avgDamage(a) > avgDamage(b) ? a : b))
  const profiles = (['normal', 'magic', 'rare'] as const).map(rarity => {
    const power = estimatePlayerPower(zone.level, threat, rarity)
    const hitsToDie = power.ehp / Math.max(power.effectiveHit, 0.01)
    const mitigation = power.armour / (power.armour + 5 * maxDamage(threat))
    const cappedResistances = Object.entries(power.resistances)
      .filter(([, value]) => value >= DAMAGE.RESISTANCE_CAP)
      .map(([type]) => type)
    const resistanceLabel = cappedResistances.length > 0 ? `cap:${cappedResistances.join('/')}` : 'cap:none'
    // A profile enters the capped band once it caps any resistance (or is rare).
    const capped = rarity === 'rare' || cappedResistances.length > 0
    const maxHits = capped ? HITS_BAND.CAPPED_MAX : HITS_BAND.BASELINE_MAX
    const minHits = capped ? 0 : HITS_BAND.BASELINE_MIN
    const verdict = hitsToDie > maxHits ? 'OVER' : hitsToDie < minHits ? 'LOW' : 'ok'
    return `${rarity} ${hitsToDie.toFixed(1)}h/${(mitigation * 100).toFixed(0)}%a/${resistanceLabel} ${verdict}`
  })
  console.log(`  ${zone.id.padEnd(24)} ${profiles.join(' | ')}`)
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

// 3. Survivability window. The main table below uses the rare-gear reference
// profile, so it is checked against the capped band: capped resistances and
// stacked armour are the intended gearing payoff and may reach ~45 hits.
// Baseline profiles (normal/magic, uncapped) are checked against 8-20 in the
// sensitivity report above. Boss-only zones are endurance encounters rather
// than repeatable trash pacing, so neither band applies to them.
for (const r of rows) {
  if (r.hitsToDie < HITS_BAND.BASELINE_MIN && !r.isBossOnly) {
    problems.push(`${r.zone}: dies in ${r.hitsToDie.toFixed(1)} hits — too spiky for an idle game (baseline aim ${HITS_BAND.BASELINE_MIN}-${HITS_BAND.BASELINE_MAX})`)
  }
  if (r.hitsToDie > HITS_BAND.CAPPED_MAX && !r.isBossOnly) {
    problems.push(`${r.zone}: dies in ${r.hitsToDie.toFixed(0)} hits — no tension (capped/rare ceiling is ${HITS_BAND.CAPPED_MAX})`)
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
  const prevNonBoss = prevTemplate.filter(m => m.rarity !== 'boss').map(m => scaleMonsterToZone(m, ZONES[i - 1].level))
  const curNonBoss = curTemplate.filter(m => m.rarity !== 'boss').map(m => scaleMonsterToZone(m, ZONES[i].level))
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
