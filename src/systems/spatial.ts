// Stage 1 spatial combat helpers.
//
// Architecture rule (spec §3): the simulation owns time, the renderer owns
// pixels. Everything here is pure state math used by simulateTick; the
// renderer interpolates between these sim values for smooth motion and never
// writes back.
import { MOVEMENT, effectiveMovementSpeed } from '../data/balance.ts'
import { momentumActionSpeed } from './momentum.ts'
import type { Character, CombatState, PackMember } from '../types/game.ts'

export interface Vec2 {
  x: number
  y: number
}

/**
 * Pick the next pack waypoint: base distance with ±jitter randomization,
 * biased "forward" (upward on the world plane) with a limited lateral spread
 * (±~25°). Returns the distance too so the caller doesn't re-derive it.
 */
export function nextWaypoint(from: Vec2): { waypoint: Vec2; distance: number } {
  const jitter = 1 + (Math.random() * 2 - 1) * MOVEMENT.TRAVEL_DISTANCE_JITTER
  const distance = Math.max(1, Math.round(MOVEMENT.BASE_TRAVEL_DISTANCE * jitter))
  const angle = -Math.PI / 2 + (Math.random() * 2 - 1) * 0.44
  return {
    waypoint: {
      x: Math.round((from.x + Math.cos(angle) * distance) * 100) / 100,
      y: Math.round((from.y + Math.sin(angle) * distance) * 100) / 100,
    },
    distance,
  }
}

/**
 * Loose cluster of pack member offsets around a waypoint. Deterministic per
 * slot so the renderer can rely on ordering; the first member sits closest to
 * the approach path (front of pack). The party approaches from the south
 * (nextWaypoint biases travel toward -y), so the cluster spreads NORTH of the
 * waypoint and the front monster stands just past the player's arrival spot —
 * the player never renders on top of an enemy. Purely cosmetic spread — band
 * targeting (slot indices) is untouched.
 */
export function packMemberOffsets(slot: number): Vec2 {
  // Ring-ish scatter: spread by slot with a fixed pattern, no randomness so
  // seeding stays deterministic apart from the existing pack rolls.
  const pattern: Vec2[] = [
    { x: 0, y: -3.2 },
    { x: 2.2, y: -4.3 },
    { x: -2.2, y: -4.2 },
    { x: 1.4, y: -6.2 },
    { x: -1.6, y: -6.1 },
    { x: 3.1, y: -5.4 },
    { x: -3.0, y: -5.2 },
    { x: 0.3, y: -7.6 },
    { x: 2.4, y: -8.2 },
    { x: -2.6, y: -8.0 },
  ]
  return pattern[slot % pattern.length]
}

/**
 * Stage 2 boss arenas: a solo boss stands centered on the approach axis this
 * far north of the waypoint (the party arrives AT the waypoint from the
 * south). Deliberately inside the partyBottomGap projection budget of the
 * renderer (56px / scale 3.2 ≈ 17.5 units) so the boss never clamps off-panel.
 */
export const BOSS_ARENA_OFFSET_Y = 6

/**
 * Stage 4 swarm formation: swarm packs (4-8 members, per the spec's
 * "swarm-tagged monsters") engage in a WEDGE rather than the regular loose
 * scatter — rows of 3/2/1/1... front-to-back, packed tighter and wider than
 * the standard offsets so the crowd reads as a swarm without markers
 * stacking. Row spacing matches packMemberOffsets' depth so wedge rows
 * interleave visually with regular-pack rows.
 */
export function swarmWedgeOffsets(slot: number): Vec2 {
  const row = Math.floor(slot / 3)
  const col = slot % 3
  const lateral = 3.4
  const depth = 2.1
  const x = (col - 1) * lateral
  const y = -(3.2 + row * depth)
  return { x, y }
}

/**
 * Stage 3 elite-lead formation: a pack with a named elite engages them FIRST —
 * move the elite to the front of the array (front = currentPack[0], what band
 * targeting and pack advancement hit) and renumber slots so the display sort
 * in PackMap matches engagement order. Non-elites keep their relative order.
 * Pure; returns the input array untouched when there is no elite to promote.
 */
export function leadWithElite(pack: PackMember[]): PackMember[] {
  const eliteIdx = pack.findIndex(member => member.monster.isNamedElite)
  if (eliteIdx <= 0) return pack
  const ordered = [pack[eliteIdx], ...pack.slice(0, eliteIdx), ...pack.slice(eliteIdx + 1)]
  return ordered.map((member, idx) => ({ ...member, slot: idx }))
}

/**
 * Place a seeded pack around the waypoint and set it as the engagement point.
 * Swarm packs use the tighter wedge formation (swarmWedgeOffsets); regular
 * packs use the loose scatter (packMemberOffsets).
 */
export function placePackAtWaypoint(pack: PackMember[], waypoint: Vec2, swarm = false): PackMember[] {
  const offsets = swarm ? swarmWedgeOffsets : packMemberOffsets
  return pack.map(member => ({
    ...member,
    position: {
      x: Math.round((waypoint.x + offsets(member.slot).x) * 100) / 100,
      y: Math.round((waypoint.y + offsets(member.slot).y) * 100) / 100,
    },
  }))
}

/** Speed in world units per tick for the current character + momentum. */
export function playerSpeed(character: Character, combat: CombatState): number {
  return effectiveMovementSpeed(character, momentumActionSpeed(combat.momentum, character))
}

/**
 * Player world position interpolated between ticks for the renderer.
 * 'engaged': stands just south of the pack front line.
 * 'traveling': linear position along the straight-line path. Fraction of the
 * journey is (duration - remaining) / duration.
 */
export function playerWorldPosition(combat: CombatState): Vec2 {
  if (combat.phase === 'engaged') return combat.partyPosition
  if (combat.travelDurationTicks <= 0) return combat.waypoint
  const progress = 1 - combat.travelTicksRemaining / combat.travelDurationTicks
  return {
    x: combat.partyPosition.x + (combat.waypoint.x - combat.partyPosition.x) * progress,
    y: combat.partyPosition.y + (combat.waypoint.y - combat.partyPosition.y) * progress,
  }
}
