// Stage 1 spatial smoke run (scripts/spatialSmoke.ts)
// Drives the REAL simulateTick from a real initial state and verifies the
// travel loop: fight -> travel phase -> arrival seed -> pack cycling.
// Run: bun scripts/spatialSmoke.ts
import { createInitialState } from '../src/store/gameStore.ts'
import { simulateTick, spawnMonster } from '../src/systems/combat.ts'
import { TICKS_PER_SECOND } from '../src/data/balance.ts'
import { ZONES, MONSTERS } from '../src/data/zones.ts'
import { isSwarmTemplate } from '../src/data/swarmMonsters.ts'
import { BOSS_ARENA_OFFSET_Y } from '../src/systems/spatial.ts'
import type { GameState } from '../src/types/game.ts'

const has = (events: GameState['combat']['events'], type: string) =>
  events.some(e => e.type === type)

// God-stats dev overrides so kills are guaranteed and we exercise the loop.
function boosted(state: GameState): GameState {
  return {
    ...state,
    character: {
      ...state.character,
      devOverrides: {
        attackRate: 6,
        basePhysicalDamageMin: 500,
        basePhysicalDamageMax: 900,
        criticalChance: 1,
      },
    },
  }
}

// ── 1. Fresh game: starts engaged with the first pack north of the party ─────
let state = createInitialState('warlord')
const initialPack = state.combat.currentPack
const partyPos = state.combat.partyPosition
const sameSpot = initialPack.some(m => m.position.x === partyPos.x && m.position.y === partyPos.y)
const northOfParty = initialPack.every(m => m.position.y < partyPos.y)
console.log('1. Fresh-game placement:', {
  phase: state.combat.phase,
  packSize: initialPack.length,
  partyPos,
  sameSpot,
  northOfParty,
})
if (state.combat.phase !== 'engaged' || initialPack.length === 0) {
  console.error('FAIL: fresh game should start engaged with a seeded pack')
  process.exit(1)
}
if (sameSpot || !northOfParty) {
  console.error('FAIL: initial pack must sit north of the party, never on its spot')
  process.exit(1)
}

// ── 2. Fight -> travel -> fight cycling over several packs ────────────────────
state = boosted(createInitialState('warlord'))
let packsCleared = 0
let travelBeats = 0
let totalTicks = 0
let invariantsHold = true

while (packsCleared < 6 && totalTicks < 4000) {
  const { state: next, events } = simulateTick(state)
  state = next
  totalTicks++
  if (has(events, 'packCleared')) packsCleared++
  if (has(events, 'travelStarted')) travelBeats++
  if (has(events, 'packCleared') && !has(events, 'travelStarted')) {
    invariantsHold = false // spec: clearing a pack MUST start a travel beat
  }
  if (state.combat.phase === 'traveling' && state.combat.currentPack.length > 0) {
    invariantsHold = false // spec: no pack exists during travel
  }
}

const travelSeconds = state.combat.travelDurationTicks / TICKS_PER_SECOND
console.log('2. Fight/travel cycling:', { packsCleared, travelBeats, totalTicks, invariantsHold, travelSeconds })
if (packsCleared < 6) {
  console.error('FAIL: could not clear 6 packs within the tick budget')
  process.exit(1)
}
if (travelBeats < packsCleared) {
  console.error('FAIL: every pack clear must begin a travel beat')
  process.exit(1)
}
if (!invariantsHold) {
  console.error('FAIL: sim state violated the travel-phase invariants')
  process.exit(1)
}

// ── 3. Waypoints advance NORTH across successive seeded packs ────────────────
// The waypoint is set when travel STARTS, so the honest invariant is that the
// waypoint at each packSeeded differs from the previous one and moves north
// (y strictly decreases in world space; the renderer maps north to -y).
const seededWaypoints: { x: number; y: number }[] = []
let seededTicks = 0
while (seededWaypoints.length < 4 && seededTicks < 4000) {
  const { state: next, events } = simulateTick(state)
  state = next
  seededTicks++
  if (has(events, 'packSeeded')) seededWaypoints.push({ ...state.combat.waypoint })
}
console.log('3. Waypoint march:', { seededCount: seededWaypoints.length, waypoints: seededWaypoints })
if (seededWaypoints.length < 4) {
  console.error('FAIL: could not observe 4 successive pack seeds within the tick budget')
  process.exit(1)
}
for (let i = 1; i < seededWaypoints.length; i++) {
  const prev = seededWaypoints[i - 1]
  const curr = seededWaypoints[i]
  if (prev.x === curr.x && prev.y === curr.y) {
    console.error(`FAIL: waypoints ${i - 1} and ${i} are identical — travel did not advance the march`)
    process.exit(1)
  }
  if (curr.y >= prev.y) {
    console.error(`FAIL: waypoint ${i} did not move north (y ${prev.y} -> ${curr.y})`)
    process.exit(1)
  }
}
const pack = state.combat.currentPack
const engagedNow = state.combat.phase === 'engaged' && pack.length > 0
if (!engagedNow) {
  console.error('FAIL: after a seed the sim must be engaged with a live pack')
  process.exit(1)
}
if (pack.some(m => m.position.x === state.combat.partyPosition.x && m.position.y === state.combat.partyPosition.y)) {
  console.error('FAIL: arrival pack must not overlap the party position')
  process.exit(1)
}

// ── 4. Boss arenas (Stage 2): boss-only zones seed a solo encounter ──────────
// Use a REAL act-end boss zone from campaign data.
const bossZone = ZONES.find(
  z => z.killsRequired === 1 && z.monsterIds.length > 0 && z.monsterIds.every(id => MONSTERS[id]?.rarity === 'boss'),
)
if (!bossZone) {
  console.error('FAIL: no boss-only campaign zone found to smoke-test')
  process.exit(1)
}
const origRandom = Math.random
Math.random = () => 0.99 // would force rollPackSize -> 1 only for NON-boss logic; proves solo sizing is explicit
try {
  const bossSeed = spawnMonster(bossZone, { ...state.combat, phase: 'engaged' })
  Math.random = origRandom
  const boss = bossSeed.combat.currentPack[0]
  const bossOk =
    bossSeed.combat.packSizeRemaining === 1 &&
    bossSeed.combat.currentPack.length === 1 &&
    boss.monster.rarity === 'boss' &&
    boss.position.x === bossSeed.combat.waypoint.x &&
    boss.position.y === bossSeed.combat.waypoint.y - BOSS_ARENA_OFFSET_Y
  console.log('4. Boss arena:', {
    zone: bossZone.id,
    soloSized: bossSeed.combat.packSizeRemaining === 1,
    isBoss: boss.monster.rarity === 'boss',
    arenaPlacement: boss.position,
    waypoint: bossSeed.combat.waypoint,
  })
  if (!bossOk) {
    console.error('FAIL: boss-only zone must seed a solo boss centered north of the waypoint')
    process.exit(1)
  }
} finally {
  Math.random = origRandom
}

// ── 5. Elite-lead formation (Stage 3): seeded elites engage first ────────────
// Use a REAL elite zone from campaign data (eliteChance > 0 + elite templates).
const eliteZone = ZONES.find(
  z => (z.eliteChance ?? 0) > 0 && (z.eliteTemplateIds?.length ?? 0) > 0,
)
if (!eliteZone) {
  console.error('FAIL: no elite campaign zone found to smoke-test')
  process.exit(1)
}
let eliteLeadSeen = false
for (let attempt = 0; attempt < 40 && !eliteLeadSeen; attempt++) {
  Math.random = () => 0 // pack size 4; first slot rolls the named-elite template
  try {
    const eliteSeed = spawnMonster(eliteZone, { ...state.combat, phase: 'engaged' })
    const front = eliteSeed.combat.currentPack[0]
    if (front.monster.isNamedElite) {
      eliteLeadSeen = true
      const slotsOk = eliteSeed.combat.currentPack.every((m, i) => m.slot === i)
      const axisOk =
        front.position.x === eliteSeed.combat.waypoint.x &&
        front.position.y < eliteSeed.combat.waypoint.y
      console.log('5. Elite-lead formation:', {
        zone: eliteZone.id,
        packSize: eliteSeed.combat.currentPack.length,
        frontName: front.monster.name,
        frontIsElite: front.monster.isNamedElite,
        slotsRenumbered: slotsOk,
        frontOnAxis: axisOk,
      })
      if (!slotsOk || !axisOk) {
        console.error('FAIL: elite-lead formation must renumber slots and hold the waypoint axis')
        process.exit(1)
      }
    }
  } finally {
    Math.random = origRandom
  }
}
if (!eliteLeadSeen) {
  console.error('FAIL: elite zone never produced an elite-led pack in 40 seeds')
  process.exit(1)
}

// ── 6. Swarm packs (Stage 4): swarm-tagged zones engage 4-8 in a wedge ───────
const swarmZone = ZONES.find(z => z.monsterIds.some(id => isSwarmTemplate(id)))
if (!swarmZone) {
  console.error('FAIL: no swarm campaign zone found to smoke-test')
  process.exit(1)
}
const swarmSizes = new Set<number>()
let wedgeVerified = false
for (let attempt = 0; attempt < 30; attempt++) {
  Math.random = () => origRandom() // real rolls for organic size variety
  try {
    const swarmSeed = spawnMonster(swarmZone, { ...state.combat, phase: 'engaged' })
    const pack = swarmSeed.combat.currentPack
    swarmSizes.add(swarmSeed.combat.packSizeRemaining)
    if (!wedgeVerified && pack.length >= 4) {
      const row0 = pack.slice(0, 3)
      const wedgeOk =
        row0.every(m => m.position.y === row0[0].position.y) &&
        pack.every(m => m.position.y < swarmSeed.combat.waypoint.y)
      if (wedgeVerified) continue
      console.log('6. Swarm pack:', {
        zone: swarmZone.id,
        packSize: pack.length,
        wedgeRows: wedgeOk,
        northOfWaypoint: pack.every(m => m.position.y < swarmSeed.combat.waypoint.y),
      })
      if (!wedgeOk) {
        console.error('FAIL: swarm pack must form a wedge north of the waypoint')
        process.exit(1)
      }
      wedgeVerified = true
    }
  } finally {
    Math.random = origRandom
  }
}
const sizesOk = [...swarmSizes].every(s => s >= 4 && s <= 8)
console.log('6b. Swarm size spread over 30 seeds:', [...swarmSizes].sort())
if (!sizesOk || swarmSizes.size < 2 || !wedgeVerified) {
  console.error('FAIL: swarm packs must vary within 4-8 and the wedge must be verified')
  process.exit(1)
}

console.log('\nSPATIAL SMOKE OK — placement, travel loop, arrival re-seed, boss arenas, elite formation, and swarms all verified.')
