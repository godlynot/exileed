import { describe, it, expect } from 'bun:test'
import { leadWithElite, swarmWedgeOffsets, placePackAtWaypoint } from './spatial.ts'
import type { Monster, PackMember } from '../types/game.ts'

// ── Fixtures ─────────────────────────────────────────────────────────────────

let memberCounter = 0

function makeMember(slot: number, monster: Monster): PackMember {
  return {
    id: `${monster.id}_${slot}_${memberCounter++}`,
    monster,
    currentLife: monster.maxLife,
    maxLife: monster.maxLife,
    slot,
    position: { x: 0, y: 0 },
  }
}

function norm(slot: number): PackMember {
  return makeMember(slot, {
    id: `m${slot}`,
    name: `Trash ${slot}`,
    rarity: 'normal',
    isNamedElite: false,
  } as Monster)
}

function elite(slot: number): PackMember {
  return makeMember(slot, {
    id: `e${slot}`,
    name: `Named Elite ${slot}`,
    rarity: 'rare',
    isNamedElite: true,
  } as Monster)
}

// ── swarmWedgeOffsets (Stage 4 swarm formation) ─────────────────────────────

describe('swarmWedgeOffsets (Stage 4 swarm formation)', () => {
  it('builds rows of 3: slots 0-2 share a row, slot 3 starts row 2', () => {
    expect(swarmWedgeOffsets(0).y).toBe(swarmWedgeOffsets(1).y)
    expect(swarmWedgeOffsets(1).y).toBe(swarmWedgeOffsets(2).y)
    expect(swarmWedgeOffsets(3).y).toBeLessThan(swarmWedgeOffsets(0).y)
  })

  it('spreads columns left-center-right and centers the middle', () => {
    const { x: leftX } = swarmWedgeOffsets(0)
    const { x: centerX } = swarmWedgeOffsets(1)
    const { x: rightX } = swarmWedgeOffsets(2)
    expect(leftX).toBeLessThan(centerX)
    expect(centerX).toBeLessThan(rightX)
    expect(centerX).toBe(0)
  })

  it('deeps rows northward (y decreases) as slots advance', () => {
    for (let slot = 3; slot < 8; slot++) {
      expect(swarmWedgeOffsets(slot).y).toBeLessThan(swarmWedgeOffsets(slot - 3).y)
    }
  })

  it('covers 8 slots with strictly unique lateral positions within a row', () => {
    const xs = Array.from({ length: 8 }, (_, slot) => swarmWedgeOffsets(slot).x)
    // Within each row of 3, all three x values differ.
    for (let row = 0; row < 3; row++) {
      const rowXs = xs.slice(row * 3, row * 3 + 3).filter(x => Number.isFinite(x))
      expect(new Set(rowXs).size).toBe(rowXs.length)
    }
  })

  it('places swarm packs via placePackAtWaypoint with the wedge flag', () => {
    const waypoint = { x: 10, y: -50 }
    const placed = placePackAtWaypoint([norm(0), norm(1), norm(2), norm(3)], waypoint, true)
    // Row 0 slots share the row line; all north of the waypoint.
    expect(placed[0].position.y).toBe(placed[1].position.y)
    expect(placed[0].position.y).toBeLessThan(waypoint.y)
    expect(placed[3].position.y).toBeLessThan(placed[0].position.y)
  })
})

// ── leadWithElite (Stage 3 elite-lead formation) ─────────────────────────────

describe('leadWithElite (Stage 3 elite-lead formation)', () => {
  it('moves a mid-pack elite to the front and renumbers slots', () => {
    const ordered = leadWithElite([norm(0), elite(2), norm(1)])
    expect(ordered[0].monster.isNamedElite).toBe(true)
    expect(ordered.map(m => m.slot)).toEqual([0, 1, 2])
    // Non-elites keep their relative order.
    expect(ordered[1].monster.id).toBe('m0')
    expect(ordered[2].monster.id).toBe('m1')
  })

  it('promotes the FIRST elite when multiple elites exist (act 8 allows 2)', () => {
    const ordered = leadWithElite([norm(0), elite(1), elite(3), norm(2)])
    expect(ordered[0].monster.isNamedElite).toBe(true)
    expect(ordered[0].monster.id).toBe('e1')
    expect(ordered.filter(m => m.monster.isNamedElite).length).toBe(2)
  })

  it('returns the input untouched when there is no elite or it already leads', () => {
    const noElite = [norm(0), norm(1)]
    expect(leadWithElite(noElite)).toBe(noElite)
    const alreadyFirst = [elite(0), norm(1)]
    expect(leadWithElite(alreadyFirst)).toBe(alreadyFirst)
  })

  it('keeps slot renumbering stable for a 4-pack with a rear elite', () => {
    const ordered = leadWithElite([norm(0), norm(1), norm(2), elite(3)])
    expect(ordered[0].monster.isNamedElite).toBe(true)
    expect(ordered.map(m => m.slot)).toEqual([0, 1, 2, 3])
  })

  it('keeps placement deterministic: same input order yields same offsets', () => {
    const a = leadWithElite([norm(0), norm(1), elite(2)])
    const b = leadWithElite([norm(0), norm(1), elite(2)])
    expect(a.map(m => m.slot)).toEqual(b.map(m => m.slot))
  })
})
